<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { kbWordlistsApi, type KbWordlist, type KbWordlistFolder, type KbWordlistRepo } from '@/api/kb-wordlists';
import Button from 'primevue/button';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import AppPagination from '@/components/AppPagination.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

// ── State ──────────────────────────────────────────────────────────────────
const folders   = ref<KbWordlistFolder[]>([]);
const wordlists   = ref<KbWordlist[]>([]);
const loading     = ref(false);
const err         = ref<string | null>(null);
const page        = ref(0);
const totalPages  = ref(0);
const total       = ref(0);
const PAGE_SIZE   = 50;
const searchQ     = ref('');
const sortCol     = ref<string | null>(null);
const sortDir     = ref<'asc' | 'desc' | null>(null);

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 0; loadWordlists(); }, 300);
}

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  if (dir) { sortCol.value = col; sortDir.value = dir; }
  else     { sortCol.value = null; sortDir.value = null; }
  page.value = 0;
  loadWordlists();
}

// Selected folder: null = root, undefined = all
const selectedFolderId = ref<number | null | undefined>(undefined);

// Upload dialog — file and ZIP share one button/modal, switched via uploadMode.
const showUploadDialog  = ref(false);
const uploadMode        = ref<'file' | 'zip'>('file');
const showNewFolderDlg  = ref(false);

const uploadFile        = ref<File | null>(null);
const uploadFolderId    = ref<number | null>(null);
const uploadDescription = ref('');
const uploading         = ref(false);

const zipFile           = ref<File | null>(null);
const zipFolderId       = ref<number | null>(null);
const zipImportAll      = ref(false);
const zipping           = ref(false);

const newFolderName     = ref('');
const newFolderParent   = ref<number | null>(null);
const creatingFolder    = ref(false);

const deleting          = ref<number | null>(null);
const deletingFolder    = ref<number | null>(null);

// ── Preview ────────────────────────────────────────────────────────────────
const PREVIEW_PAGE_SIZE  = 200;
const showPreview        = ref(false);
const previewWordlist    = ref<KbWordlist | null>(null);
const previewLines       = ref<string[]>([]);
const previewPage        = ref(0);
const previewLoading     = ref(false);
const previewSearch      = ref('');

const previewFiltered = computed(() => {
  const q = previewSearch.value.trim().toLowerCase();
  return q ? previewLines.value.filter(l => l.toLowerCase().includes(q)) : previewLines.value;
});
const previewTotalPages  = computed(() => Math.max(1, Math.ceil(previewFiltered.value.length / PREVIEW_PAGE_SIZE)));
const previewPagedLines  = computed(() =>
  previewFiltered.value.slice(previewPage.value * PREVIEW_PAGE_SIZE, (previewPage.value + 1) * PREVIEW_PAGE_SIZE)
);

async function openPreview(wl: KbWordlist) {
  previewWordlist.value = wl;
  previewSearch.value = '';
  previewPage.value = 0;
  previewLines.value = [];
  showPreview.value = true;
  previewLoading.value = true;
  try {
    const text = await kbWordlistsApi.previewContent(wl.id);
    // Split on any newline style, keep non-empty lines only
    previewLines.value = text.split(/\r?\n/).filter(l => l.length > 0);
  } catch {
    previewLines.value = [];
  } finally {
    previewLoading.value = false;
  }
}
const selectedIds       = ref<Set<number>>(new Set());
const bulkDeleting      = ref(false);

const allSelected = computed(() =>
  wordlists.value.length > 0 && wordlists.value.every(w => selectedIds.value.has(w.id))
);
const someSelected = computed(() => selectedIds.value.size > 0);

function toggleSelect(id: number, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const next = new Set(selectedIds.value);
  if (checked) next.add(id); else next.delete(id);
  selectedIds.value = next;
}

function toggleSelectAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const next = new Set(selectedIds.value);
  if (checked) wordlists.value.forEach(w => next.add(w.id));
  else         wordlists.value.forEach(w => next.delete(w.id));
  selectedIds.value = next;
}

function clearSelection() { selectedIds.value = new Set(); }

async function bulkDelete() {
  const ids = [...selectedIds.value];
  const ok = await confirmDialog({ header: 'Delete wordlists', message: `Delete ${ids.length} wordlist${ids.length !== 1 ? 's' : ''}? This cannot be undone.` });
  if (!ok) return;
  bulkDeleting.value = true;
  err.value = null;
  try {
    await kbWordlistsApi.bulkDelete(ids);
    selectedIds.value = new Set();
    await loadWordlists();
  } catch {
    err.value = 'Bulk delete failed.';
  } finally {
    bulkDeleting.value = false;
  }
}

// ── Computed ───────────────────────────────────────────────────────────────

const rootFolders = computed(() => folders.value.filter(f => f.parentId == null));

function childFolders(parentId: number): KbWordlistFolder[] {
  return folders.value.filter(f => f.parentId === parentId);
}

// ── Collapsible folder tree ────────────────────────────────────────────────
interface FolderTreeItem { folder: KbWordlistFolder; depth: number }

// Set of expanded folder IDs. Top-level folders start expanded.
const expandedFolders = ref<Set<number>>(new Set());

function initExpanded() {
  // Auto-expand top-level folders on first load
  const next = new Set(expandedFolders.value);
  folders.value.filter(f => f.parentId == null).forEach(f => next.add(f.id));
  expandedFolders.value = next;
}

function toggleFolder(id: number, event: Event) {
  event.stopPropagation();
  const next = new Set(expandedFolders.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  expandedFolders.value = next;
}

function hasChildren(id: number): boolean {
  return folders.value.some(f => f.parentId === id);
}

// All folders in depth-first order (full tree, for folderOptions etc.)
const flatFolderTree = computed<FolderTreeItem[]>(() => {
  const result: FolderTreeItem[] = [];
  function walk(parentId: number | null, depth: number) {
    folders.value
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(f => {
        result.push({ folder: f, depth });
        walk(f.id, depth + 1);
      });
  }
  walk(null, 0);
  return result;
});

// Visible items respecting expand/collapse state
const visibleFolderTree = computed<FolderTreeItem[]>(() => {
  return flatFolderTree.value.filter(item => {
    if (item.folder.parentId == null) return true;
    // All ancestors must be expanded
    let pid: number | null = item.folder.parentId;
    while (pid != null) {
      if (!expandedFolders.value.has(pid)) return false;
      pid = folders.value.find(f => f.id === pid)?.parentId ?? null;
    }
    return true;
  });
});

const folderOptions = computed(() => {
  const opts: { label: string; value: number | null }[] = [{ label: '/ (root)', value: null }];
  function walk(folder: KbWordlistFolder, depth: number) {
    opts.push({ label: '  '.repeat(depth) + folder.name, value: folder.id });
    childFolders(folder.id).forEach(c => walk(c, depth + 1));
  }
  rootFolders.value.forEach(f => walk(f, 0));
  return opts;
});

// ── Data loading ───────────────────────────────────────────────────────────

async function loadFolders() {
  try {
    folders.value = await kbWordlistsApi.listFolders();
    initExpanded();
  } catch {
    err.value = 'Failed to load folders.';
  }
}

async function loadWordlists() {
  loading.value = true;
  err.value = null;
  try {
    const res = await kbWordlistsApi.list(
      selectedFolderId.value, page.value, PAGE_SIZE,
      searchQ.value || undefined,
      sortCol.value || undefined,
      sortDir.value || undefined,
    );
    wordlists.value = res.items;
    totalPages.value = res.totalPages;
    total.value = res.total;
  } catch {
    err.value = 'Failed to load wordlists.';
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await loadFolders();
  await loadWordlists();
}

function selectFolder(id: number | null | undefined) {
  selectedFolderId.value = id;
  page.value = 0;
  sortCol.value = null;
  sortDir.value = null;
  searchQ.value = '';
  clearSelection();
  loadWordlists();
}

// ── Upload ─────────────────────────────────────────────────────────────────

function openUpload() {
  uploadMode.value = 'file';
  uploadFile.value = null;
  uploadFolderId.value = null;
  uploadDescription.value = '';
  zipFile.value = null;
  zipFolderId.value = null;
  zipImportAll.value = false;
  showUploadDialog.value = true;
}

function onUploadFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  uploadFile.value = input.files?.[0] ?? null;
}

function onZipFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  zipFile.value = input.files?.[0] ?? null;
}

function submitUpload() {
  if (uploadMode.value === 'zip') doUploadZip();
  else doUpload();
}

async function doUpload() {
  if (!uploadFile.value) return;
  uploading.value = true;
  err.value = null;
  try {
    await kbWordlistsApi.upload(uploadFile.value, uploadFolderId.value, uploadDescription.value || undefined);
    await loadWordlists();
    showUploadDialog.value = false;
    uploadFile.value = null;
    uploadDescription.value = '';
  } catch {
    err.value = 'Upload failed.';
  } finally {
    uploading.value = false;
  }
}

async function doUploadZip() {
  if (!zipFile.value) return;
  zipping.value = true;
  err.value = null;
  try {
    await kbWordlistsApi.uploadZip(zipFile.value, zipFolderId.value, zipImportAll.value);
    await loadWordlists();
    showUploadDialog.value = false;
    zipFile.value = null;
  } catch {
    err.value = 'ZIP upload failed.';
  } finally {
    zipping.value = false;
  }
}

// ── Folders ────────────────────────────────────────────────────────────────

async function doCreateFolder() {
  if (!newFolderName.value.trim()) return;
  creatingFolder.value = true;
  err.value = null;
  try {
    const folder = await kbWordlistsApi.createFolder(newFolderName.value.trim(), newFolderParent.value ?? undefined);
    folders.value = [...folders.value, folder];
    showNewFolderDlg.value = false;
    newFolderName.value = '';
    newFolderParent.value = null;
  } catch {
    err.value = 'Failed to create folder.';
  } finally {
    creatingFolder.value = false;
  }
}

async function removeFolder(id: number) {
  const ok = await confirmDialog({ header: 'Delete folder', message: 'Delete this folder and all its contents? This cannot be undone.' });
  if (!ok) return;
  deletingFolder.value = id;
  err.value = null;
  try {
    await kbWordlistsApi.deleteFolder(id);
    folders.value = folders.value.filter(f => f.id !== id);
    await loadWordlists();
    if (selectedFolderId.value === id) selectFolder(undefined);
  } catch {
    err.value = 'Failed to delete folder.';
  } finally {
    deletingFolder.value = null;
  }
}

// ── Wordlist delete ────────────────────────────────────────────────────────

async function removeWordlist(id: number) {
  const ok = await confirmDialog({ header: 'Delete wordlist', message: 'Delete this wordlist?' });
  if (!ok) return;
  deleting.value = id;
  err.value = null;
  try {
    await kbWordlistsApi.delete(id);
    await loadWordlists();
  } catch {
    err.value = 'Failed to delete wordlist.';
  } finally {
    deleting.value = null;
  }
}

// ── Formatting ─────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatLines(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString();
}

function truncateSha(sha: string | null): string {
  return sha ? sha.slice(0, 12) : '—';
}

function fullFolderPath(folderId: number | null): string {
  if (folderId == null) return '—';
  const parts: string[] = [];
  let id: number | null = folderId;
  while (id != null) {
    const f = folders.value.find(x => x.id === id);
    if (!f) break;
    parts.unshift(f.name);
    id = f.parentId;
  }
  return parts.join(' / ') || '—';
}

// ── Repositories — managed in their own modal, opened from a header button ─
const showReposModal = ref(false);
const repos         = ref<KbWordlistRepo[]>([]);
const reposLoading  = ref(false);
const showAddRepo   = ref(false);
const editingRepo   = ref<KbWordlistRepo | null>(null);
const syncingRepo   = ref<number | null>(null);
const deletingRepo  = ref<number | null>(null);
const repoErr       = ref<string | null>(null);

const REPOS_PAGE_SIZE = 10;
const reposPage = ref(0);
const reposTotalPages = computed(() => Math.max(1, Math.ceil(repos.value.length / REPOS_PAGE_SIZE)));
const pagedRepos = computed(() =>
  repos.value.slice(reposPage.value * REPOS_PAGE_SIZE, (reposPage.value + 1) * REPOS_PAGE_SIZE)
);

const repoForm = ref({
  repoUrl: '', branch: 'main', pathFilter: '',
  githubToken: '', importAllTypes: false, autoSync: false, syncIntervalHours: 24,
});

function openRepos() {
  reposPage.value = 0;
  showReposModal.value = true;
  loadRepos();
}

async function loadRepos() {
  reposLoading.value = true;
  try { repos.value = await kbWordlistsApi.listRepos(); }
  catch { repoErr.value = 'Failed to load repositories.'; }
  finally { reposLoading.value = false; }
}

function openAddRepo() {
  editingRepo.value = null;
  repoForm.value = { repoUrl: '', branch: 'main', pathFilter: '', githubToken: '', importAllTypes: false, autoSync: false, syncIntervalHours: 24 };
  repoErr.value = null;
  showAddRepo.value = true;
}

function openEditRepo(r: KbWordlistRepo) {
  editingRepo.value = r;
  repoForm.value = {
    repoUrl: r.repoUrl, branch: r.branch,
    pathFilter: r.pathFilter ?? '', githubToken: '', importAllTypes: r.importAllTypes,
    autoSync: r.autoSync, syncIntervalHours: r.syncIntervalHours,
  };
  repoErr.value = null;
  showAddRepo.value = true;
}

async function saveRepo() {
  repoErr.value = null;
  try {
    if (editingRepo.value) {
      const updated = await kbWordlistsApi.updateRepo(editingRepo.value.id, {
        branch: repoForm.value.branch || undefined,
        pathFilter: repoForm.value.pathFilter || undefined,
        githubToken: repoForm.value.githubToken || undefined,
        importAllTypes: repoForm.value.importAllTypes,
        autoSync: repoForm.value.autoSync,
        syncIntervalHours: repoForm.value.syncIntervalHours,
      });
      repos.value = repos.value.map(r => r.id === updated.id ? updated : r);
    } else {
      const created = await kbWordlistsApi.createRepo({
        repoUrl: repoForm.value.repoUrl.trim(),
        branch: repoForm.value.branch || 'main',
        pathFilter: repoForm.value.pathFilter || undefined,
        githubToken: repoForm.value.githubToken || undefined,
        importAllTypes: repoForm.value.importAllTypes,
        autoSync: repoForm.value.autoSync,
        syncIntervalHours: repoForm.value.syncIntervalHours,
      });
      repos.value = [created, ...repos.value];
    }
    showAddRepo.value = false;
  } catch (e: any) {
    repoErr.value = e?.response?.data?.message ?? 'Failed to save repository.';
  }
}

async function triggerSync(r: KbWordlistRepo) {
  syncingRepo.value = r.id;
  repoErr.value = null;
  try {
    await kbWordlistsApi.syncRepo(r.id);
    // Poll status every 3s for up to 2min
    const poll = setInterval(async () => {
      const fresh = await kbWordlistsApi.listRepos();
      repos.value = fresh;
      const updated = fresh.find(x => x.id === r.id);
      if (!updated || updated.lastSyncStatus !== 'running') {
        clearInterval(poll);
        syncingRepo.value = null;
        // Reload folder tree so new folders from the sync appear in the sidebar
        await loadFolders();
      }
    }, 3000);
    setTimeout(() => { clearInterval(poll); syncingRepo.value = null; }, 120_000);
  } catch {
    repoErr.value = 'Failed to trigger sync.';
    syncingRepo.value = null;
  }
}

async function removeRepo(id: number) {
  const ok = await confirmDialog({ header: 'Delete repository', message: 'Delete this repository? Wordlists imported from it will remain but lose their repo link.' });
  if (!ok) return;
  deletingRepo.value = id;
  repoErr.value = null;
  try {
    await kbWordlistsApi.deleteRepo(id);
    repos.value = repos.value.filter(r => r.id !== id);
  } catch { repoErr.value = 'Failed to delete repository.'; }
  finally { deletingRepo.value = null; }
}

function formatSyncDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString();
}

function repoName(url: string): string {
  const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : url;
}

onMounted(() => { reload(); });
</script>

<template>
  <div class="wl-layout">
    <!-- Header -->
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Wordlists</h2>
        <p class="ares-page-subtitle">Centralized wordlist repository for ffuf and other tools.</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <Button icon="pi pi-code-branch" text size="small" severity="secondary"
          v-tooltip.top="'Repositories'" @click="openRepos" />
        <Button icon="pi pi-folder-plus" text size="small" severity="secondary"
          v-tooltip.top="'New Folder'" @click="showNewFolderDlg = true" />
        <Button icon="pi pi-upload" text size="small"
          v-tooltip.top="'Upload'" @click="openUpload" />
      </div>
    </div>

    <div v-if="err" class="ares-alert ares-alert--error" style="margin-bottom:0.75rem;">{{ err }}</div>

    <!-- ── Wordlists ──────────────────────────────────────────────────────── -->
    <div class="wl-body">
      <!-- Folder sidebar -->
      <aside class="wl-sidebar">
        <div class="wl-sidebar-title">Folders</div>
        <ul class="wl-folder-list">
          <li class="wl-folder-item"
              :class="{ 'wl-folder-item--active': selectedFolderId === undefined }"
              @click="selectFolder(undefined)">
            <i class="pi pi-inbox" />
            <span>All wordlists</span>
          </li>
          <li class="wl-folder-item"
              :class="{ 'wl-folder-item--active': selectedFolderId === null }"
              @click="selectFolder(null)">
            <i class="pi pi-folder" />
            <span>Root</span>
          </li>
          <li v-for="item in visibleFolderTree" :key="item.folder.id"
              class="wl-folder-item"
              :class="{ 'wl-folder-item--active': selectedFolderId === item.folder.id }"
              :style="{ paddingLeft: (0.6 + item.depth * 1.2) + 'rem' }"
              @click="selectFolder(item.folder.id)">
            <button v-if="hasChildren(item.folder.id)" class="wl-folder-icon-btn"
                    @click.stop="toggleFolder(item.folder.id, $event)">
              <i :class="['pi', expandedFolders.has(item.folder.id) ? 'pi-folder-open' : 'pi-folder']" />
            </button>
            <i v-else class="pi pi-folder" />
            <span>{{ item.folder.name }}</span>
            <button class="wl-folder-del" @click.stop="removeFolder(item.folder.id)"
                    :disabled="deletingFolder === item.folder.id" title="Delete folder">
              <i class="pi pi-trash" />
            </button>
          </li>
        </ul>
      </aside>

      <!-- Wordlist table -->
      <div class="wl-main">
        <!-- Search bar -->
        <div class="wl-search-bar">
          <i class="pi pi-search" style="font-size:0.75rem; color:var(--ares-text-muted);" />
          <input
            v-model="searchQ"
            @input="onSearchInput"
            placeholder="Filter by name…"
            class="wl-search-input"
          />
          <button v-if="searchQ" class="wl-search-clear" @click="searchQ = ''; page = 0; loadWordlists()">
            <i class="pi pi-times" />
          </button>
        </div>

        <template v-if="loading">
          <AresLoadingState />
        </template>
        <template v-else>
          <div class="ares-table-wrap wl-table-wrap">
            <table class="ares-table">
              <thead>
                <tr>
                  <th style="width:36px; padding-right:0;">
                    <input type="checkbox" class="row-check"
                      :checked="allSelected" :indeterminate="someSelected && !allSelected"
                      @change="toggleSelectAll" />
                  </th>
                  <th>
                    <ColumnHeader label="Name" :sortable="true"
                      :sort-dir="sortCol === 'name' ? sortDir : null"
                      @update:sort-dir="onSort('name', $event)" />
                  </th>
                  <th v-if="selectedFolderId === undefined" style="width:200px;">Path</th>
                  <th style="width:90px; text-align:right;">
                    <ColumnHeader label="Size" :sortable="true"
                      :sort-dir="sortCol === 'sizeBytes' ? sortDir : null"
                      @update:sort-dir="onSort('sizeBytes', $event)" />
                  </th>
                  <th style="width:100px; text-align:right;">
                    <ColumnHeader label="Lines" :sortable="true"
                      :sort-dir="sortCol === 'lineCount' ? sortDir : null"
                      @update:sort-dir="onSort('lineCount', $event)" />
                  </th>
                  <th style="width:140px;">SHA-256</th>
                  <th style="width:100px;">
                    <ColumnHeader label="Created" :sortable="true"
                      :sort-dir="sortCol === 'createdAt' ? sortDir : null"
                      @update:sort-dir="onSort('createdAt', $event)" />
                  </th>
                  <th class="wl-actions-th"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="wl in wordlists" :key="wl.id"
                    :class="{ 'row--selected': selectedIds.has(wl.id) }">
                  <td style="width:36px; padding-right:0;">
                    <input type="checkbox" class="row-check"
                      :checked="selectedIds.has(wl.id)"
                      @change="toggleSelect(wl.id, $event)" />
                  </td>
                  <td class="wl-name-cell">
                    <span :title="wl.name">{{ wl.name }}</span>
                    <span v-if="wl.description" class="wl-desc" :title="wl.description">
                      — {{ wl.description }}
                    </span>
                  </td>
                  <td v-if="selectedFolderId === undefined" class="wl-path-cell"
                      :title="fullFolderPath(wl.folderId)">
                    {{ fullFolderPath(wl.folderId) }}
                  </td>
                  <td style="text-align:right; color:var(--ares-text-muted);">{{ formatSize(wl.sizeBytes) }}</td>
                  <td style="text-align:right; color:var(--ares-text-muted);">{{ formatLines(wl.lineCount) }}</td>
                  <td>
                    <code v-if="wl.sha256" class="wl-sha" :title="wl.sha256">{{ truncateSha(wl.sha256) }}</code>
                    <span v-else style="color:var(--ares-text-muted);">—</span>
                  </td>
                  <td style="color:var(--ares-text-muted); font-size:0.8rem;">{{ formatDate(wl.createdAt) }}</td>
                  <td class="wl-actions-td">
                    <div style="display:flex;gap:0.2rem;justify-content:flex-end;">
                      <Button icon="pi pi-eye" text size="small" title="Preview contents"
                        @click.stop="openPreview(wl)" />
                      <a :href="kbWordlistsApi.downloadUrl(wl.id)" download :title="'Download ' + wl.name">
                        <Button icon="pi pi-download" text size="small" />
                      </a>
                      <Button icon="pi pi-trash" text severity="danger" size="small"
                        :loading="deleting === wl.id"
                        @click="removeWordlist(wl.id)" />
                    </div>
                  </td>
                </tr>
                <tr v-if="!wordlists.length">
                  <td :colspan="selectedFolderId === undefined ? 8 : 7" class="ares-table-empty">
                    No wordlists here yet. Upload a file or a ZIP archive to get started.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <AppPagination
            v-if="totalPages > 1"
            :page="page"
            :total-pages="totalPages"
            :total="total"
            style="margin-top:0.75rem;"
            @prev="page--; loadWordlists()"
            @next="page++; loadWordlists()"
          />
        </template>
      </div>
    </div>

    <!-- ── Bulk action bar ──────────────────────────────────────────── -->
    <Transition name="bulk-bar">
      <div v-if="someSelected" class="wl-bulk-bar">
        <span class="wl-bulk-count">
          {{ selectedIds.size }} wordlist{{ selectedIds.size !== 1 ? 's' : '' }} selected
        </span>
        <Button label="Clear" severity="secondary" size="small" text @click="clearSelection" />
        <Button label="Delete selected" icon="pi pi-trash" severity="danger" size="small"
          :loading="bulkDeleting" @click="bulkDelete" />
      </div>
    </Transition>

    <!-- Upload dialog — file and ZIP share this one modal, switched via mode toggle -->
    <div v-if="showUploadDialog" class="wl-dialog-overlay" @click.self="showUploadDialog = false">
      <div class="wl-dialog">
        <div class="wl-dialog-header">
          <h3>Upload Wordlist</h3>
          <button class="wl-dialog-close" @click="showUploadDialog = false"><i class="pi pi-times" /></button>
        </div>
        <div class="wl-dialog-body">
          <div class="ares-field-row">
            <div style="display:flex; gap:0.4rem;">
              <button type="button" :class="['wl-mode-btn', { 'wl-mode-btn--active': uploadMode === 'file' }]"
                @click="uploadMode = 'file'">File</button>
              <button type="button" :class="['wl-mode-btn', { 'wl-mode-btn--active': uploadMode === 'zip' }]"
                @click="uploadMode = 'zip'">ZIP Archive</button>
            </div>
          </div>

          <template v-if="uploadMode === 'file'">
            <div class="ares-field-row">
              <label class="ares-field-label">File <span style="color:var(--p-red-400);">*</span></label>
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <input ref="uploadFileInput" type="file" accept=".txt,text/*"
                  @change="onUploadFileChange" style="display:none;" />
                <Button icon="pi pi-paperclip" label="Choose file" size="small" severity="secondary"
                  @click="($refs.uploadFileInput as HTMLInputElement).click()" />
                <span style="font-size:0.82rem; color:var(--ares-text-muted);">
                  {{ uploadFile ? uploadFile.name : 'No file selected' }}
                </span>
              </div>
            </div>
            <div class="ares-field-row">
              <label class="ares-field-label">Folder</label>
              <Select v-model="uploadFolderId"
                :options="folderOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Root"
                style="width:100%;" />
            </div>
            <div class="ares-field-row">
              <label class="ares-field-label">Description</label>
              <InputText v-model="uploadDescription" placeholder="Optional description" style="width:100%;" />
            </div>
          </template>

          <template v-else>
            <p style="font-size:0.8rem;color:var(--ares-text-muted);margin-bottom:0.75rem;">
              All <code>.txt</code> files (and files without an extension) inside the ZIP will be
              imported as separate wordlists.
            </p>
            <div class="ares-field-row">
              <label class="ares-field-label">ZIP File <span style="color:var(--p-red-400);">*</span></label>
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <input ref="zipFileInput" type="file" accept=".zip,application/zip"
                  @change="onZipFileChange" style="display:none;" />
                <Button icon="pi pi-paperclip" label="Choose file" size="small" severity="secondary"
                  @click="($refs.zipFileInput as HTMLInputElement).click()" />
                <span style="font-size:0.82rem; color:var(--ares-text-muted);">
                  {{ zipFile ? zipFile.name : 'No file selected' }}
                </span>
              </div>
            </div>
            <div class="ares-field-row">
              <label class="ares-field-label">Folder</label>
              <Select v-model="zipFolderId"
                :options="folderOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Root"
                style="width:100%;" />
            </div>
            <label style="display:flex; align-items:center; gap:0.6rem; font-size:0.82rem; cursor:pointer;">
              <input type="checkbox" v-model="zipImportAll" />
              Import all file types <span style="color:var(--ares-text-muted);">(not just .txt)</span>
            </label>
          </template>
        </div>
        <div class="wl-dialog-footer">
          <Button label="Cancel" severity="secondary" size="small" @click="showUploadDialog = false" />
          <Button :label="uploadMode === 'zip' ? 'Import ZIP' : 'Upload'" icon="pi pi-upload" size="small"
            :disabled="uploadMode === 'zip' ? !zipFile : !uploadFile"
            :loading="uploadMode === 'zip' ? zipping : uploading"
            @click="submitUpload" />
        </div>
      </div>
    </div>

    <!-- New folder dialog -->
    <div v-if="showNewFolderDlg" class="wl-dialog-overlay" @click.self="showNewFolderDlg = false">
      <div class="wl-dialog">
        <div class="wl-dialog-header">
          <h3>New Folder</h3>
          <button class="wl-dialog-close" @click="showNewFolderDlg = false"><i class="pi pi-times" /></button>
        </div>
        <div class="wl-dialog-body">
          <div class="ares-field-row">
            <label class="ares-field-label">Folder name <span style="color:var(--p-red-400);">*</span></label>
            <InputText v-model="newFolderName" placeholder="e.g. SecLists" style="width:100%;"
              @keydown.enter="doCreateFolder" />
          </div>
          <div class="ares-field-row">
            <label class="ares-field-label">Parent folder</label>
            <Select v-model="newFolderParent"
              :options="folderOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Root"
              style="width:100%;" />
          </div>
        </div>
        <div class="wl-dialog-footer">
          <Button label="Cancel" severity="secondary" size="small" @click="showNewFolderDlg = false" />
          <Button label="Create" icon="pi pi-folder-plus" size="small"
            :disabled="!newFolderName.trim()" :loading="creatingFolder" @click="doCreateFolder" />
        </div>
      </div>
    </div>

    <!-- Repositories management modal — the "table" the header button opens -->
    <div v-if="showReposModal" class="wl-dialog-overlay" @click.self="showReposModal = false">
      <div class="wl-dialog" style="width:min(900px, 96vw);">
        <div class="wl-dialog-header">
          <h3>Repositories</h3>
          <button class="wl-dialog-close" @click="showReposModal = false"><i class="pi pi-times" /></button>
        </div>
        <div class="wl-dialog-body">
          <div style="display:flex; justify-content:flex-end; margin-bottom:0.75rem;">
            <Button icon="pi pi-code-branch" label="Add Repository" size="small" @click="openAddRepo" />
          </div>
          <div v-if="repoErr" class="ares-alert ares-alert--error" style="margin-bottom:0.75rem;">{{ repoErr }}</div>
          <AresLoadingState v-if="reposLoading" />
          <template v-else>
            <div class="ares-table-wrap">
              <table class="ares-table">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th>Branch</th>
                    <th>Filter</th>
                    <th style="width:90px;">Files</th>
                    <th style="width:110px;">Auto-sync</th>
                    <th style="width:130px;">Last sync</th>
                    <th style="width:80px;">Status</th>
                    <th style="width:90px;"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in pagedRepos" :key="r.id">
                    <td>
                      <div style="font-family:monospace; font-size:0.82rem;">{{ repoName(r.repoUrl) }}</div>
                      <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ r.repoUrl }}</div>
                    </td>
                    <td style="font-family:monospace; font-size:0.8rem;">{{ r.branch }}</td>
                    <td>
                      <code v-if="r.pathFilter" style="font-size:0.75rem; color:var(--ares-text-muted);">{{ r.pathFilter }}</code>
                      <span v-else style="color:var(--ares-text-muted); font-size:0.8rem;">all</span>
                    </td>
                    <td style="text-align:right; color:var(--ares-text-muted);">{{ r.fileCount }}</td>
                    <td>
                      <span v-if="r.autoSync" style="font-size:0.78rem; color:var(--ares-text-2);">
                        every {{ r.syncIntervalHours }}h
                      </span>
                      <span v-else style="font-size:0.78rem; color:var(--ares-text-muted);">manual</span>
                    </td>
                    <td style="font-size:0.78rem; color:var(--ares-text-muted);">{{ formatSyncDate(r.lastSyncAt) }}</td>
                    <td>
                      <span :class="['repo-status', 'repo-status--' + (r.lastSyncStatus || 'idle')]">
                        <i v-if="r.lastSyncStatus === 'running'" class="pi pi-spin pi-spinner" style="font-size:0.7rem;" />
                        {{ r.lastSyncStatus || 'idle' }}
                      </span>
                    </td>
                    <td>
                      <div style="display:flex; gap:0.2rem; justify-content:flex-end;">
                        <Button v-if="auth.isAdmin" icon="pi pi-refresh" text size="small"
                          v-tooltip.top="r.lastSyncError || 'Sync now'"
                          :loading="syncingRepo === r.id || r.lastSyncStatus === 'running'"
                          @click="triggerSync(r)" />
                        <Button icon="pi pi-pencil" text size="small" @click="openEditRepo(r)" />
                        <Button icon="pi pi-trash" text severity="danger" size="small"
                          :loading="deletingRepo === r.id" @click="removeRepo(r.id)" />
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!repos.length">
                    <td colspan="8" class="ares-table-empty">
                      No repositories connected yet. Click <strong>Add Repository</strong> to import wordlists from a public or private repo.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AppPagination
              v-if="reposTotalPages > 1"
              :page="reposPage"
              :total-pages="reposTotalPages"
              :total="repos.length"
              style="margin-top:0.75rem;"
              @prev="reposPage--"
              @next="reposPage++"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Add / Edit repo dialog -->
    <div v-if="showAddRepo" class="wl-dialog-overlay" @click.self="showAddRepo = false">
      <div class="wl-dialog" style="width:520px;">
        <div class="wl-dialog-header">
          <h3>{{ editingRepo ? 'Edit Repository' : 'Add Repository' }}</h3>
          <button class="wl-dialog-close" @click="showAddRepo = false"><i class="pi pi-times" /></button>
        </div>
        <div class="wl-dialog-body">
          <div v-if="repoErr" class="ares-alert ares-alert--error">{{ repoErr }}</div>

          <div v-if="!editingRepo" class="ares-field-row">
            <label class="ares-field-label">GitHub URL <span style="color:var(--p-red-400);">*</span></label>
            <InputText v-model="repoForm.repoUrl"
              placeholder="https://github.com/danielmiessler/SecLists"
              style="width:100%;" />
          </div>

          <div class="ares-field-row">
            <label class="ares-field-label">Branch</label>
            <InputText v-model="repoForm.branch" placeholder="main" style="width:100%;" />
          </div>

          <div class="ares-field-row">
            <label class="ares-field-label">Path filter <span class="dim">(glob pattern, e.g. Discovery/Web-Content/*.txt)</span></label>
            <InputText v-model="repoForm.pathFilter"
              placeholder="Leave empty to import all .txt files"
              style="width:100%;" />
            <small style="color:var(--ares-text-muted); font-size:0.72rem;">
              Supports glob patterns: <code>**/*.txt</code>, <code>Discovery/**</code>, etc.
              Paths are relative to the repo root.
            </small>
          </div>

          <div class="ares-field-row">
            <label class="ares-field-label">
              GitHub Token <span class="dim">(optional — for private repos or higher rate limits)</span>
            </label>
            <InputText v-model="repoForm.githubToken" type="password"
              :placeholder="editingRepo?.hasToken ? '••••••••  (leave blank to keep current)' : 'ghp_…'"
              style="width:100%;" />
          </div>

          <div style="display:flex; align-items:center; gap:0.75rem;">
            <ToggleSwitch v-model="repoForm.importAllTypes" />
            <span style="font-size:0.85rem;">Import all file types <span style="color:var(--ares-text-muted); font-size:0.78rem;">(not just .txt — ignores path filter restriction)</span></span>
          </div>

          <div style="display:flex; align-items:center; gap:0.75rem;">
            <ToggleSwitch v-model="repoForm.autoSync" />
            <span style="font-size:0.85rem;">Auto-sync enabled</span>
          </div>

          <div v-if="repoForm.autoSync" class="ares-field-row">
            <label class="ares-field-label">Sync interval (hours)</label>
            <input type="number" v-model.number="repoForm.syncIntervalHours"
              min="1" max="720" class="wl-number-input" />
          </div>
        </div>
        <div class="wl-dialog-footer">
          <Button label="Cancel" severity="secondary" size="small" @click="showAddRepo = false" />
          <Button :label="editingRepo ? 'Save' : 'Add Repository'" icon="pi pi-check" size="small"
            :disabled="!editingRepo && !repoForm.repoUrl.trim()"
            @click="saveRepo" />
        </div>
      </div>
    </div>
  </div>

  <!-- ── Wordlist preview dialog ─────────────────────────────────────────── -->
  <Dialog
    v-model:visible="showPreview"
    :header="previewWordlist ? previewWordlist.name : 'Preview'"
    modal
    :style="{ width: 'min(800px, 96vw)', maxHeight: '90vh' }"
    :pt="{ content: { style: 'padding:1rem; display:flex; flex-direction:column; gap:0.75rem; overflow:hidden;' } }"
  >
    <template v-if="previewWordlist">
      <!-- Meta + search -->
      <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
        <span style="font-size:0.78rem; color:var(--ares-text-muted);">
          {{ previewLines.length.toLocaleString() }} entries
          <template v-if="previewSearch && previewFiltered.length !== previewLines.length">
            · {{ previewFiltered.length.toLocaleString() }} matching
          </template>
        </span>
        <InputText
          v-model="previewSearch"
          placeholder="Filter lines…"
          style="flex:1; max-width:280px;"
          size="small"
          @input="previewPage = 0"
        />
      </div>

      <!-- Loading -->
      <AresLoadingState v-if="previewLoading" />

      <!-- Table: each line as plain text, never interpreted as HTML -->
      <template v-else>
        <div class="ares-table-wrap" style="flex:1; overflow-y:auto; max-height:480px;">
          <table class="ares-table">
            <thead>
              <tr>
                <th style="width:60px; text-align:right; padding-right:1rem;">#</th>
                <th>Entry</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in previewPagedLines" :key="previewPage * PREVIEW_PAGE_SIZE + i">
                <td style="text-align:right; color:var(--ares-text-muted); font-size:0.75rem;
                           padding-right:1rem; font-variant-numeric:tabular-nums; user-select:none;">
                  {{ previewPage * PREVIEW_PAGE_SIZE + i + 1 }}
                </td>
                <!-- textContent binding via :text-content is not a thing; we use a span
                     with v-text which sets textContent — never innerHTML — guaranteeing
                     that even '<script>alert(1)</script>' appears as literal text. -->
                <td><span v-text="line" class="preview-entry" /></td>
              </tr>
              <tr v-if="!previewPagedLines.length">
                <td colspan="2" class="ares-table-empty">
                  {{ previewSearch ? 'No entries match the filter.' : 'Empty wordlist.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="previewTotalPages > 1"
          style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-shrink:0;">
          <span style="font-size:0.78rem; color:var(--ares-text-muted);">
            Page {{ previewPage + 1 }} / {{ previewTotalPages }}
            · entries {{ previewPage * PREVIEW_PAGE_SIZE + 1 }}–{{ Math.min((previewPage + 1) * PREVIEW_PAGE_SIZE, previewFiltered.length) }}
          </span>
          <div style="display:flex; gap:0.35rem;">
            <Button label="Previous" icon="pi pi-chevron-left" size="small" severity="secondary"
              :disabled="previewPage === 0" @click="previewPage--" />
            <Button label="Next" icon="pi pi-chevron-right" icon-pos="right" size="small" severity="secondary"
              :disabled="previewPage >= previewTotalPages - 1" @click="previewPage++" />
          </div>
        </div>
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.wl-layout { display: flex; flex-direction: column; height: 100%; }

.wl-body {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
  margin-top: 0.75rem;
}

/* ── Sidebar ────────────────────────────────────── */
.wl-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.5rem 0;
  overflow-y: auto;
}

.wl-sidebar-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  padding: 0.4rem 0.85rem 0.6rem;
}

.wl-folder-list { list-style: none; margin: 0; padding: 0; }

.wl-folder-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem 0.35rem 0.6rem;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--ares-text-2);
  user-select: none;
  border-radius: 0;
  position: relative;
}
.wl-folder-item:hover { background: var(--ares-surface-2); }
.wl-folder-item--active {
  background: color-mix(in srgb, var(--p-primary-400) 12%, transparent);
  color: var(--p-primary-300);
  font-weight: 500;
}
.wl-folder-item .pi { font-size: 0.8rem; flex-shrink: 0; }
.wl-folder-item span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Folder icon button (toggle open/closed) ────────────────── */
.wl-folder-icon-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: inherit;
}
.wl-folder-icon-btn .pi { font-size: 0.8rem; }

.wl-folder-del {
  opacity: 0;
  background: none;
  border: none;
  color: var(--p-red-400);
  cursor: pointer;
  padding: 0.1rem 0.2rem;
  border-radius: var(--ares-radius);
  font-size: 0.7rem;
  line-height: 1;
  transition: opacity 0.15s;
}
.wl-folder-item:hover .wl-folder-del { opacity: 1; }
.wl-folder-del:disabled { opacity: 0.4; cursor: default; }

/* ── Main content ───────────────────────────────── */
.wl-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Caps the wordlist rows to the folder sidebar's height instead of growing the page —
   the pager stays pinned below, only the rows themselves scroll. */
.wl-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.wl-name-cell {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wl-folder-prefix { color: var(--ares-text-muted); font-size: 0.75rem; }
.wl-desc { color: var(--ares-text-muted); font-size: 0.78rem; }

/* ── Actions column ──────────────────────────────────────── */
.wl-actions-th,
.wl-actions-td {
  width: 72px;
  min-width: 72px;
  text-align: right;
  padding-right: 0.4rem;
  white-space: nowrap;
}
.wl-sha {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--ares-text-muted);
  background: var(--ares-surface-2);
  border-radius: var(--ares-radius);
  padding: 0.05em 0.3em;
}

/* ── Inline dialogs ─────────────────────────────── */
.wl-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wl-dialog {
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  width: 440px;
  max-width: calc(100vw - 2rem);
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}

.wl-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--ares-border);
}
.wl-dialog-header h3 { margin: 0; font-size: 0.95rem; font-weight: 600; }
.wl-dialog-close {
  background: none;
  border: none;
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.2rem;
  border-radius: var(--ares-radius);
}
.wl-dialog-close:hover { color: var(--ares-text); background: var(--ares-surface-2); }

.wl-dialog-body { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }

.ares-field-row { display: flex; flex-direction: column; gap: 0.3rem; }

.wl-dialog-footer {
  padding: 0.75rem 1.25rem 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  border-top: 1px solid var(--ares-border);
}


/* ── Upload dialog mode toggle (File / ZIP) ──────── */
.wl-mode-btn {
  flex: 1;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.82rem;
  font-family: inherit;
  transition: border-color 0.1s;
}
.wl-mode-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  color: var(--p-primary-300);
  font-weight: 600;
}

.repo-status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.5rem;
  border-radius: var(--ares-radius);
}
.repo-status--idle     { color: var(--ares-text-muted); background: var(--ares-surface-2); }
.repo-status--running  { color: #60a5fa; background: rgba(96,165,250,0.12); }
.repo-status--success  { color: #4ade80; background: rgba(74,222,128,0.12); }
.repo-status--failed   { color: #f87171; background: rgba(248,113,113,0.12); }

.dim { font-weight: 400; color: var(--ares-text-muted); }

.wl-number-input {
  width: 100px;
  padding: 0.4rem 0.6rem;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  color: var(--ares-text);
  font-size: 0.85rem;
  font-family: inherit;
}

/* ── Search bar ──────────────────────────────────── */
.wl-search-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--ares-surface-2);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.3rem 0.6rem;
  margin-bottom: 0.5rem;
  width: 100%;
  transition: border-color 0.12s;
}
.wl-search-bar:focus-within { border-color: var(--p-primary-400); }
.wl-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 0.82rem;
  color: var(--ares-text);
  font-family: inherit;
}
.wl-search-input::placeholder { color: var(--ares-text-muted); }
.wl-search-clear {
  background: none;
  border: none;
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0;
  line-height: 1;
}
.wl-search-clear:hover { color: var(--ares-text); }

/* ── Path column ─────────────────────────────────── */
.wl-path-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  color: var(--ares-text-muted);
}

/* ── Row selection ───────────────────────────────── */
.row-check { cursor: pointer; accent-color: var(--p-primary-color); }
.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 8%, transparent); }

/* ── Bulk action bar ─────────────────────────────── */
.wl-bulk-bar {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1.1rem;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  z-index: 50;
  white-space: nowrap;
}
.wl-bulk-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ares-text);
  margin-right: 0.25rem;
}
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }

/* Preview: entries rendered as plain text, monospaced for readability */
.preview-entry {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.82rem;
  word-break: break-all;
  white-space: pre-wrap;
  color: var(--ares-text-2);
}
</style>
