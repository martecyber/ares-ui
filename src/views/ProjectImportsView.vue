<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { projectsApi } from '@/api/projects';
import { importsApi, type ImportTool, type ScanImport, type ScanImportRollbackResult } from '@/api/imports';
import Message from 'primevue/message';
import { useContextStore } from '@/stores/context';
import { useThemeStore } from '@/stores/theme';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import ColumnHeader from '@/components/ColumnHeader.vue';
import { useToast } from 'primevue/usetoast';
import { toolIconSrc, whiteBackingSrc } from '@/utils/tool-icons';

const route = useRoute();
const context = useContextStore();
const themeStore = useThemeStore();
const toast = useToast();

const engId = computed(() => Number(route.params.engId));

const imports = ref<ScanImport[]>([]);
const tools = ref<ImportTool[]>([]);
const loading = ref(true);
const showDialog = ref(false);

// Dialog state — 3 steps: tool → format → files (+ optional scanner source IP)
const selectedToolId = ref<string | null>(null);
const selectedFormat = ref<ImportTool | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const sourceIp   = ref<string>('');
const nacProfile = ref<string>('');

interface FileEntry {
  /** Stable identity for pollEntry to find this entry by, independent of its position in
   *  fileEntries — removeFile()/re-adds shift indices, and every status update replaces the
   *  array with new object instances (see the .map() calls below), so neither the array index
   *  nor object identity survives across those. */
  key: number;
  file: File;
  // 'running' covers both "uploading" and "processing in the background" (see ImportService
  // #startImport on the server — imports no longer finish within the upload request itself) —
  // 'done' only once a poll confirms status === 'completed'.
  status: 'pending' | 'running' | 'done' | 'error';
  result: ScanImport | null;
  error: string | null;
}
const fileEntries = ref<FileEntry[]>([]);
let fileEntryKeySeq = 0;

// Strict IPv4 + permissive IPv6 literal regex. Empty value is allowed (field is optional).
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+(:(\d{1,3}\.){3}\d{1,3})?$/;
const sourceIpValid = computed(() => {
  const v = sourceIp.value.trim();
  if (!v) return true;
  return IPV4_RE.test(v) || (v.includes(':') && IPV6_RE.test(v));
});

// NAC profile is a free-text tag (max 64 chars). Requires sourceIp to be filled —
// "NAC profile without an IP" makes no sense as a vantage point.
const hasSourceIp = computed(() => !!sourceIp.value.trim());
const nacProfileValid = computed(() => {
  const v = nacProfile.value.trim();
  if (!v) return true;
  if (v.length > 64) return false;
  return hasSourceIp.value;
});

// Prefers the icon this project's own /imports/tools response already carries for a
// plugin-owned toolId (see ImportService.listAvailableTools) over the global static/dynamic
// fallback map — no need to touch tool-icons.ts's own cache for this project-scoped data.
function iconSrcFor(toolId: string): string | undefined {
  const t = tools.value.find((x) => x.toolId === toolId);
  const local = themeStore.theme === 'light' ? (t?.iconLight ?? t?.icon) : t?.icon;
  return local ?? toolIconSrc(toolId);
}

// Unique tools (grouped by toolId), deduplicated for step 1
const uniqueTools = computed(() => {
  const seen = new Set<string>();
  const result: { toolId: string; label: string }[] = [];
  for (const t of tools.value) {
    if (!seen.has(t.toolId)) {
      seen.add(t.toolId);
      // Use the base name without the format suffix as label
      const label = t.displayName.replace(/\s+(JSON|XML|HTML|CSV|JSONL|JSON\/JSONL)$/i, '');
      result.push({ toolId: t.toolId, label });
    }
  }
  return result;
});

// Formats available for the selected tool
const formatsForTool = computed(() => {
  if (!selectedToolId.value) return [];
  return tools.value.filter((t) => t.toolId === selectedToolId.value);
});

const hasMultipleFormats = computed(() => formatsForTool.value.length > 1);

// ── Sort / filter / pagination state ──────────────────────────────────────
const PAGE_SIZE = 25;
const page = ref(0);

const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterTool = ref<string[]>([]);
const filterStatus = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
  page.value = 0;
}

watch([filterTool, filterStatus], () => { page.value = 0; }, { deep: true });

const toolOptions = computed(() => {
  const seen = new Set<string>();
  const opts: { label: string; value: string }[] = [];
  for (const imp of imports.value) {
    if (!seen.has(imp.tool)) {
      seen.add(imp.tool);
      opts.push({ label: imp.tool, value: imp.tool });
    }
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label));
});

const importStatusOptions = [
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Running', value: 'running' },
  { label: 'Pending', value: 'pending' },
];

const processedImports = computed(() => {
  let data = [...imports.value];
  if (filterTool.value.length) data = data.filter((i) => filterTool.value.includes(i.tool));
  if (filterStatus.value.length) data = data.filter((i) => filterStatus.value.includes(i.status));
  if (sortCol.value && sortDir.value) {
    const dir = sortDir.value === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      const va = String((a as any)[sortCol.value!] ?? '');
      const vb = String((b as any)[sortCol.value!] ?? '');
      return dir * va.localeCompare(vb, undefined, { numeric: true });
    });
  }
  return data;
});

const pageCount = computed(() => Math.max(1, Math.ceil(processedImports.value.length / PAGE_SIZE)));
const pagedImports = computed(() =>
  processedImports.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE)
);

// Auto-select format when tool only has one
watch(selectedToolId, () => {
  selectedFormat.value = null;
  fileEntries.value = [];
  if (formatsForTool.value.length === 1) {
    selectedFormat.value = formatsForTool.value[0];
  }
});

watch(selectedFormat, () => {
  fileEntries.value = [];
});

const acceptExtensions = computed(() => {
  if (!selectedFormat.value) return '*';
  return selectedFormat.value.extensions.join(',');
});

const canImport = computed(() =>
  !!selectedFormat.value &&
  fileEntries.value.some((e) => e.status === 'pending') &&
  sourceIpValid.value && nacProfileValid.value);

// This view's own tool/status filters and column sort (below) run client-side over whatever
// this fetch returns — so unlike Detection/Affection history (no pre-existing UI, fully
// server-paginated), this one instead bounds the fetch to the most recent MAX_ROWS imports
// (the backend's own paginated-endpoint cap) rather than converting filter/sort to query params
// too. A long-lived MONITOR project's full scan history can still exceed this, in which case
// filtering/sorting only searches the most recent MAX_ROWS — an acceptable tradeoff for the
// overwhelmingly common case (recent imports) versus fetching an unbounded response.
const MAX_ROWS = 100;

async function load() {
  loading.value = true;
  try {
    const [eng, imps, tls] = await Promise.all([
      projectsApi.get(engId.value),
      importsApi.list(engId.value, 0, MAX_ROWS),
      importsApi.tools(engId.value),
    ]);
    if (eng) context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
    imports.value = imps.items;
    tools.value = tls;
  } catch {
    toast.add({ severity: 'error', summary: 'Failed to load imports', life: 4000 });
  } finally {
    loading.value = false;
  }
}

// ── Rollback ─────────────────────────────────────────────────────────────
const showRollbackDialog = ref(false);
const rollbackTarget = ref<ScanImport | null>(null);
const rollbackPreview = ref<ScanImportRollbackResult | null>(null);
const rollbackPreviewLoading = ref(false);
const rollbackRunning = ref(false);
const rollbackError = ref('');

async function openRollbackDialog(imp: ScanImport) {
  rollbackTarget.value = imp;
  rollbackPreview.value = null;
  rollbackError.value = '';
  showRollbackDialog.value = true;
  rollbackPreviewLoading.value = true;
  try {
    rollbackPreview.value = await importsApi.rollbackPreview(engId.value, imp.id);
  } catch (e: any) {
    rollbackError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to preview rollback';
  } finally {
    rollbackPreviewLoading.value = false;
  }
}

async function confirmRollback() {
  if (!rollbackTarget.value) return;
  rollbackRunning.value = true;
  rollbackError.value = '';
  try {
    const result = await importsApi.rollback(engId.value, rollbackTarget.value.id);
    const parts = [];
    if (result.assetsDeleted) parts.push(`${result.assetsDeleted} asset(s) deleted`);
    if (result.detectionsDeleted) parts.push(`${result.detectionsDeleted} detection(s) deleted`);
    if (result.assetsReverted) parts.push(`${result.assetsReverted} asset update(s) reverted`);
    if (result.detectionsReverted) parts.push(`${result.detectionsReverted} detection update(s) reverted`);
    toast.add({
      severity: result.blocked.length ? 'warn' : 'success',
      summary: 'Rollback complete',
      detail: (parts.length ? parts.join(', ') : 'Nothing left to roll back')
        + (result.blocked.length ? ` — ${result.blocked.length} item(s) skipped` : ''),
      life: 6000,
    });
    showRollbackDialog.value = false;
    await load();
  } catch (e: any) {
    rollbackError.value = e?.response?.data?.detail ?? e?.message ?? 'Rollback failed';
  } finally {
    rollbackRunning.value = false;
  }
}

function openDialog() {
  selectedToolId.value = null;
  selectedFormat.value = null;
  fileEntries.value = [];
  sourceIp.value = '';
  nacProfile.value = '';
  showDialog.value = true;
}

function addFiles(list: FileList | null | undefined) {
  if (!list?.length) return;
  const incoming: FileEntry[] = [];
  for (let i = 0; i < list.length; i++) {
    incoming.push({ key: fileEntryKeySeq++, file: list[i], status: 'pending', result: null, error: null });
  }
  fileEntries.value = [...fileEntries.value, ...incoming];
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  addFiles(input.files);
  input.value = '';   // allow re-selecting the same file
}

function removeFile(index: number) {
  fileEntries.value = fileEntries.value.filter((_, i) => i !== index);
}

/** Runs in the background (fire-and-forget from runImport, never awaited) until the import
 *  this entry started settles — processing happens server-side (see ImportService#startImport),
 *  not within the upload request, so the upload response alone never carries the final
 *  assetsCreated/detectionsCreated. Gives up silently after ~20 minutes; the row still shows
 *  "running" in the main list either way (nothing here is the only source of truth). */
async function pollEntry(key: number, importId: number) {
  for (let attempt = 0; attempt < 600; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (!fileEntries.value.some((e) => e.key === key)) return; // entry removed — stop polling
    try {
      const row = await importsApi.get(engId.value, importId);
      if (row.status === 'completed' || row.status === 'failed') {
        fileEntries.value = fileEntries.value.map((e) =>
          e.key === key
            ? { ...e, status: row.status === 'completed' ? 'done' as const : 'error' as const,
                result: row, error: row.errorMessage }
            : e);
        return;
      }
    } catch { /* transient poll failure — just try again next tick */ }
  }
}

async function runImport() {
  if (!selectedFormat.value || !fileEntries.value.some((e) => e.status === 'pending')) return;
  importing.value = true;

  let queuedCount = 0;
  for (const entry of fileEntries.value) {
    if (entry.status !== 'pending') continue;
    const key = entry.key;
    fileEntries.value = fileEntries.value.map((e) =>
      e.key === key ? { ...e, status: 'running' as const } : e);
    try {
      const started = await importsApi.run(
        engId.value,
        selectedFormat.value!.toolId,
        selectedFormat.value!.formatId,
        entry.file,
        sourceIp.value,
        nacProfile.value
      );
      // Still 'running' here — the upload itself succeeded, but processing continues in the
      // background. pollEntry (not awaited) picks up 'done'/'error' once it actually finishes.
      fileEntries.value = fileEntries.value.map((e) =>
        e.key === key ? { ...e, result: started } : e);
      queuedCount++;
      pollEntry(key, started.id);
    } catch (err: any) {
      const error = err?.response?.data?.message ?? err?.message ?? 'Unknown error';
      fileEntries.value = fileEntries.value.map((e) =>
        e.key === key ? { ...e, status: 'error' as const, error } : e);
    }
  }

  importing.value = false;

  const failed = fileEntries.value.filter((e) => e.status === 'error');
  if (queuedCount > 0) {
    toast.add({ severity: 'info',
      summary: queuedCount === 1 ? 'Import queued' : `${queuedCount} imports queued`,
      detail: 'Processing in the background — this list will reflect the result once it finishes.',
      life: 5000 });
  }
  if (failed.length > 0) {
    toast.add({ severity: 'error',
      summary: failed.length === 1 ? 'An upload failed' : `${failed.length} uploads failed`, life: 6000 });
  }
  await load();
}

function statusSeverity(status: string) {
  switch (status) {
    case 'completed': return 'success';
    case 'failed': return 'danger';
    case 'running': return 'info';
    default: return 'secondary';
  }
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

onMounted(load);
</script>

<template>
  <div>
    <!-- Header -->
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Scanner Imports</h2>
        <p class="ares-page-subtitle">Import scan results from external security tools.</p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New import'" @click="openDialog" />
    </div>

    <!-- Import history -->
    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else class="ares-card" style="padding:0;">
      <div class="ares-card-section-header">
        <span><i class="pi pi-history" /> Import history</span>
        <div v-if="processedImports.length > PAGE_SIZE" class="imp-pager">
          <span class="imp-pager-info">
            {{ page * PAGE_SIZE + 1 }}–{{ Math.min((page + 1) * PAGE_SIZE, processedImports.length) }}
            of {{ processedImports.length }}
          </span>
          <button class="imp-pager-btn" :disabled="page === 0" @click="page--">
            <i class="pi pi-chevron-left" />
          </button>
          <button class="imp-pager-btn" :disabled="page >= pageCount - 1" @click="page++">
            <i class="pi pi-chevron-right" />
          </button>
        </div>
        <span v-else-if="processedImports.length" class="imp-pager-info">
          {{ processedImports.length }} import{{ processedImports.length !== 1 ? 's' : '' }}
        </span>
      </div>
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:160px;">
              <ColumnHeader label="Tool"
                :filter-options="toolOptions"
                :filter-value="filterTool"
                @update:filter-value="filterTool = $event" />
            </th>
            <th>File</th>
            <th style="width:110px;">
              <ColumnHeader label="Status" :sortable="true"
                :sort-dir="sortCol === 'status' ? sortDir : null"
                :filter-options="importStatusOptions"
                :filter-value="filterStatus"
                @update:sort-dir="onSort('status', $event)"
                @update:filter-value="filterStatus = $event" />
            </th>
            <th style="width:80px;">Assets</th>
            <th style="width:90px;">New det.</th>
            <th style="width:90px;">Updated</th>
            <th style="width:150px;">
              <ColumnHeader label="Date" :sortable="true"
                :sort-dir="sortCol === 'createdAt' ? sortDir : null"
                sort-asc-label="Oldest first" sort-desc-label="Newest first"
                @update:sort-dir="onSort('createdAt', $event)" />
            </th>
            <th style="width:100px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="imp in pagedImports" :key="imp.id">
            <td>
              <div class="imp-tool-cell">
                <span v-if="iconSrcFor(imp.tool)" class="imp-tool-icon-stack" v-tooltip.right="imp.tool">
                  <img v-if="whiteBackingSrc(imp.tool)" :src="whiteBackingSrc(imp.tool)" class="imp-tool-icon" alt="" aria-hidden="true" />
                  <img :src="iconSrcFor(imp.tool)" class="imp-tool-icon" :alt="imp.tool" />
                </span>
                <i v-else class="pi pi-wrench imp-tool-icon-fallback" v-tooltip.right="imp.tool" />
                <span class="imp-tool-name">{{ imp.tool }}</span>
                <span v-if="imp.format !== 'default'" class="imp-tool-format">({{ imp.format }})</span>
              </div>
            </td>
            <td style="color:var(--ares-text-muted); font-size:0.8rem;">{{ imp.filename ?? '—' }}</td>
            <td><AresBadge :value="imp.status" :severity="statusSeverity(imp.status)" /></td>
            <td style="text-align:right;">{{ imp.assetsCreated }}</td>
            <td style="text-align:right;">{{ imp.detectionsCreated }}</td>
            <td style="text-align:right;">{{ imp.detectionsUpdated }}</td>
            <td style="color:var(--ares-text-muted); font-size:0.8rem;">{{ formatDate(imp.createdAt) }}</td>
            <td style="text-align:right;">
              <Button
                v-if="imp.hasRollbackableChanges"
                label="Rollback"
                icon="pi pi-undo"
                severity="danger"
                text
                size="small"
                style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                @click="openRollbackDialog(imp)"
              />
            </td>
          </tr>
          <tr v-if="!processedImports.length">
            <td colspan="8" class="ares-table-empty">No imports yet. Click "New import" to get started.</td>
          </tr>
        </tbody>
      </table>
      <!-- Footer pagination (when many rows) -->
      <div v-if="pageCount > 1" class="imp-pager-footer">
        <button class="imp-pager-btn" :disabled="page === 0" @click="page--">
          <i class="pi pi-chevron-left" />
        </button>
        <span class="imp-pager-pages">
          <button
            v-for="p in pageCount"
            :key="p"
            :class="['imp-page-dot', { 'imp-page-dot--active': page === p - 1 }]"
            @click="page = p - 1"
          >{{ p }}</button>
        </span>
        <button class="imp-pager-btn" :disabled="page >= pageCount - 1" @click="page++">
          <i class="pi pi-chevron-right" />
        </button>
      </div>
    </div>

    <!-- Import Dialog -->
    <Dialog v-model:visible="showDialog" header="New import" modal :style="{ width: 'min(680px, 95vw)' }">
      <div style="display:flex; flex-direction:column; gap:1.25rem;">

        <!-- Step 1: Tool grid -->
        <div>
          <label class="ares-field-label">Scanner tool</label>
          <div class="tool-grid">
            <button
              v-for="t in uniqueTools"
              :key="t.toolId"
              :class="['tool-btn', { 'tool-btn--active': selectedToolId === t.toolId }]"
              @click="selectedToolId = t.toolId"
            >
              <!-- Logo (Tenable/Qualys inline SVG). A white backing layer is stacked behind
                   icons whose colored path carves inner glyphs out as transparent holes (e.g.
                   Qualys's Q) — see whiteBackingSrc — so those holes read as white, not as a
                   gap showing this button's own background through. -->
              <span v-if="iconSrcFor(t.toolId)" class="tool-icon-stack">
                <img v-if="whiteBackingSrc(t.toolId)" :src="whiteBackingSrc(t.toolId)"
                  class="tool-icon tool-icon--img" alt="" aria-hidden="true" />
                <img :src="iconSrcFor(t.toolId)" class="tool-icon tool-icon--img" :alt="t.label" />
              </span>
              <i v-else class="pi pi-wrench tool-icon tool-icon--pi" />
              <span class="tool-label">{{ t.label }}</span>
            </button>
          </div>
        </div>

        <!-- Step 2: Format (only when tool has multiple formats) -->
        <div v-if="selectedToolId && hasMultipleFormats">
          <label class="ares-field-label">Export format</label>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button
              v-for="fmt in formatsForTool"
              :key="fmt.formatId"
              :class="['ares-format-btn', { 'ares-format-btn--active': selectedFormat?.formatId === fmt.formatId }]"
              @click="selectedFormat = fmt"
            >
              <span>{{ fmt.displayName }}</span>
              <span class="ares-format-ext">{{ fmt.extensions.join(' / ') }}</span>
            </button>
          </div>
        </div>

        <!-- Step 3: File upload (once tool + format are chosen) -->
        <div v-if="selectedFormat">
          <label class="ares-field-label">
            Files
            <span style="font-weight:400; opacity:0.6; margin-left:0.25rem;">{{ selectedFormat.extensions.join(', ') }}</span>
          </label>
          <div
            class="ares-file-drop"
            :class="{ 'ares-file-drop--has-files': fileEntries.length }"
            @click="fileInputRef?.click()"
            @dragover.prevent
            @drop.prevent="(e) => addFiles(e.dataTransfer?.files)"
          >
            <template v-if="!fileEntries.length">
              <i class="pi pi-upload" style="font-size:1.4rem; color:var(--ares-text-muted);" />
              <div style="color:var(--ares-text-muted); margin-top:0.35rem; font-size:0.85rem;">
                Click or drag &amp; drop files here
              </div>
            </template>
            <template v-else>
              <div class="file-list">
                <div v-for="(entry, i) in fileEntries" :key="entry.key" class="file-entry" @click.stop>
                  <div class="file-row">
                    <i :class="['pi', entry.status === 'running' ? 'pi-spin pi-spinner' :
                                      entry.status === 'done'    ? 'pi-check-circle'    :
                                      entry.status === 'error'   ? 'pi-times-circle'    : 'pi-file']"
                       :style="entry.status === 'done'  ? 'color:var(--p-green-400)' :
                               entry.status === 'error' ? 'color:var(--p-red-400)'   : ''" />
                    <span class="file-name">{{ entry.file.name }}</span>
                    <span class="file-size">{{ (entry.file.size / 1024).toFixed(0) }} KB</span>
                    <button v-if="entry.status === 'pending' && !importing"
                      type="button" class="file-remove" title="Remove"
                      @click.stop="removeFile(i)">
                      <i class="pi pi-times" />
                    </button>
                  </div>
                  <div v-if="entry.status === 'running' && entry.result" class="file-result">
                    Queued — processing in the background…
                  </div>
                  <div v-if="entry.status === 'done' && entry.result" class="file-result">
                    {{ entry.result.assetsCreated }} assets · {{ entry.result.detectionsCreated }} new det.
                    <template v-if="entry.result.detectionsUpdated"> · {{ entry.result.detectionsUpdated }} updated</template>
                  </div>
                  <div v-if="entry.status === 'error'" class="file-error">{{ entry.error }}</div>
                </div>
              </div>
              <div v-if="!importing" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.5rem; text-align:center;">
                Click or drop to add more files
              </div>
            </template>
          </div>
          <input ref="fileInputRef" type="file" :accept="acceptExtensions" multiple style="display:none;" @change="onFileChange" />
        </div>

        <!-- Optional: scanner source IP / NAC profile — tucked away, only meaningful for
             port-scan tools and rarely needed, so it stays out of the way by default. -->
        <details v-if="selectedFormat" class="advanced">
          <summary>Advanced</summary>
          <div style="margin-top:0.5rem;">
            <label class="ares-field-label">
              Scanner source IP
              <span style="font-weight:400; opacity:0.6; margin-left:0.25rem;">(optional)</span>
            </label>
            <InputText
              v-model="sourceIp"
              placeholder="e.g. 10.0.0.50"
              style="width:100%;"
              :invalid="!sourceIpValid"
            />
            <div style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
              IP the scan was run from. Populates per-vantage visibility for service ports
              (open / filtered / closed).
            </div>
            <div v-if="!sourceIpValid" style="font-size:0.75rem; color:var(--p-red-500); margin-top:0.2rem;">
              Not a valid IPv4 or IPv6 address.
            </div>

            <!-- NAC profile (only meaningful alongside a source IP) -->
            <label class="ares-field-label" style="margin-top:0.85rem;">
              NAC profile
              <span style="font-weight:400; opacity:0.6; margin-left:0.25rem;">(optional)</span>
            </label>
            <InputText
              v-model="nacProfile"
              placeholder="e.g. corp-laptops, guest-vlan"
              style="width:100%;"
              :disabled="!hasSourceIp"
              :invalid="!nacProfileValid"
              maxlength="64"
            />
            <div style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
              Free-text tag identifying the NAC profile the scanner was authenticated under.
              Lets you track different visibility from the same source IP across NAC profiles.
            </div>
            <div v-if="nacProfile && !hasSourceIp" style="font-size:0.75rem; color:var(--p-red-500); margin-top:0.2rem;">
              NAC profile requires a source IP.
            </div>
          </div>
        </details>

        <!-- Actions -->
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showDialog = false" />
          <Button
            :label="fileEntries.filter(e => e.status === 'pending').length > 1
              ? `Import ${fileEntries.filter(e => e.status === 'pending').length} files`
              : 'Import'"
            icon="pi pi-upload"
            size="small"
            :loading="importing"
            :disabled="!canImport"
            @click="runImport"
          />
        </div>
      </div>
    </Dialog>

    <!-- Rollback confirmation -->
    <Dialog v-model:visible="showRollbackDialog" header="Roll back import" modal :style="{ width: 'min(560px, 95vw)' }">
      <div v-if="rollbackTarget" style="display:flex; flex-direction:column; gap:0.85rem;">
        <p style="margin:0; font-size:0.85rem; color:var(--ares-text-muted);">
          Undo what <strong>{{ rollbackTarget.filename ?? rollbackTarget.tool }}</strong> did on
          {{ formatDate(rollbackTarget.createdAt) }}. Assets/detections it created are deleted;
          fields it updated are restored to their previous values.
        </p>

        <div v-if="rollbackPreviewLoading" style="color:var(--ares-text-muted); font-size:0.85rem;">
          Checking what can be rolled back…
        </div>

        <template v-else-if="rollbackPreview">
          <ul style="margin:0; padding-left:1.2rem; font-size:0.85rem; display:flex; flex-direction:column; gap:0.2rem;">
            <li v-if="rollbackPreview.assetsDeleted">{{ rollbackPreview.assetsDeleted }} asset(s) will be deleted</li>
            <li v-if="rollbackPreview.detectionsDeleted">{{ rollbackPreview.detectionsDeleted }} detection(s) will be deleted</li>
            <li v-if="rollbackPreview.assetsReverted">{{ rollbackPreview.assetsReverted }} asset update(s) will be reverted</li>
            <li v-if="rollbackPreview.detectionsReverted">{{ rollbackPreview.detectionsReverted }} detection update(s) will be reverted</li>
            <li v-if="!rollbackPreview.assetsDeleted && !rollbackPreview.detectionsDeleted && !rollbackPreview.assetsReverted && !rollbackPreview.detectionsReverted">
              Nothing left to roll back.
            </li>
          </ul>

          <Message v-if="rollbackPreview.blocked.length" severity="warn" :closable="false">
            <div style="font-size:0.82rem;">
              {{ rollbackPreview.blocked.length }} item(s) will be skipped:
              <ul style="margin:0.3rem 0 0; padding-left:1.1rem;">
                <li v-for="(b, idx) in rollbackPreview.blocked.slice(0, 5)" :key="idx">
                  {{ b.entityType }} #{{ b.entityId }} — {{ b.reason }}
                </li>
              </ul>
              <div v-if="rollbackPreview.blocked.length > 5" style="margin-top:0.2rem;">
                …and {{ rollbackPreview.blocked.length - 5 }} more.
              </div>
            </div>
          </Message>
        </template>

        <Message v-if="rollbackError" severity="error" :closable="false">{{ rollbackError }}</Message>

        <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showRollbackDialog = false" />
          <Button
            label="Roll back"
            icon="pi pi-undo"
            severity="danger"
            size="small"
            :loading="rollbackRunning"
            :disabled="rollbackPreviewLoading || !rollbackPreview"
            @click="confirmRollback"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.ares-field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.45rem;
  letter-spacing: 0.02em;
}

.ares-format-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.5rem 0.85rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: inherit;
  color: inherit;
  transition: border-color 0.12s, background 0.12s;
}
.ares-format-btn:hover {
  border-color: var(--p-primary-400);
}
.ares-format-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 10%, transparent);
}
.ares-format-ext {
  font-size: 0.72rem;
  opacity: 0.55;
}

.advanced summary {
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--ares-text-muted);
  font-weight: 600;
}

.ares-file-drop {
  border: 2px dashed var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.ares-file-drop:hover { border-color: var(--p-primary-400); }
.ares-file-drop--has-files { padding: 0.75rem; text-align: left; }

.file-list { display: flex; flex-direction: column; gap: 0.2rem; }
.file-entry {
  background: var(--ares-surface-sunken);
  border-radius: var(--ares-radius);
  padding: 0.4rem 0.6rem;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}
.file-remove {
  background: transparent;
  border: none;
  color: var(--ares-text-muted);
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  border-radius: var(--ares-radius);
  line-height: 1;
  flex-shrink: 0;
}
.file-remove:hover { color: var(--p-red-400); }
.file-result {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  margin-top: 0.2rem;
  padding-left: 1.4rem;
}
.file-error {
  font-size: 0.72rem;
  color: var(--p-red-400);
  margin-top: 0.2rem;
  padding-left: 1.4rem;
}

/* ── Tool icon grid ───────────────────────────────────────────────── */
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.5rem;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.75rem 0.5rem 0.6rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  cursor: pointer;
  font-family: inherit;
  color: var(--ares-text-muted);
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}
.tool-btn:hover {
  border-color: var(--p-primary-400);
  color: var(--ares-text-1);
}
.tool-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 10%, transparent);
  color: var(--ares-text-1);
}

.tool-icon { flex-shrink: 0; }
.tool-icon--logo { width: 28px; height: 28px; display: flex; align-items: center; }
.tool-icon--logo :deep(svg) { width: 100%; height: 100%; }
.tool-icon--img  { width: 28px; height: 28px; object-fit: contain; border-radius: var(--ares-radius); }
.tool-icon-stack { position: relative; width: 28px; height: 28px; flex-shrink: 0; }
.tool-icon-stack .tool-icon--img { position: absolute; inset: 0; }
.tool-icon--svg  { width: 28px; height: 28px; color: var(--ares-text-muted); }
.tool-icon--pi   { font-size: 1.35rem; }

.tool-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
}

/* ── Tool cell in history table ──────────────────────────────────── */
.imp-tool-cell {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.imp-tool-icon-stack {
  position: relative;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.imp-tool-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: var(--ares-radius);
}
.imp-tool-icon-stack .imp-tool-icon {
  position: absolute;
  inset: 0;
}
.imp-tool-icon-fallback {
  font-size: 0.9rem;
  color: var(--ares-text-muted);
  flex-shrink: 0;
}
.imp-tool-name {
  font-weight: 600;
  font-size: 0.82rem;
}
.imp-tool-format {
  color: var(--ares-text-muted);
  font-size: 0.73rem;
}

/* ── Pagination ───────────────────────────────────────────────────── */
.imp-pager {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
}
.imp-pager-info {
  font-size: 0.75rem;
  color: var(--ares-text-muted);
  margin-left: auto;
  white-space: nowrap;
}
.imp-pager-btn {
  background: transparent;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  color: var(--ares-text-muted);
  cursor: pointer;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  transition: border-color 0.12s, color 0.12s;
}
.imp-pager-btn:hover:not(:disabled) {
  border-color: var(--p-primary-400);
  color: var(--ares-text-1);
}
.imp-pager-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.imp-pager-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  border-top: 1px solid var(--ares-border);
}
.imp-pager-pages {
  display: flex;
  gap: 0.2rem;
}
.imp-page-dot {
  background: transparent;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  color: var(--ares-text-muted);
  cursor: pointer;
  min-width: 26px;
  height: 26px;
  padding: 0 0.35rem;
  font-size: 0.72rem;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.imp-page-dot:hover {
  border-color: var(--p-primary-400);
  color: var(--ares-text-1);
}
.imp-page-dot--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 15%, transparent);
  color: var(--ares-text-1);
  font-weight: 600;
}
</style>
