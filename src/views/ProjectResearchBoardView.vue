<script setup lang="ts">
// The Research Board workspace — its own page (not a modal; only the escalate-to-finding step
// stays a dialog, per the feature design). Main column = notes; right = a detection panel that
// ALWAYS renders the active detection (tabbed: Info/Description/References/Raw data), with a
// search+browse drawer (AQL/Basic, via the same QueryBar every other list view uses) that slides
// in from the left over it to pick a different one — the panel itself is never hidden. Both
// columns share the exact same height (bounded to the viewport, see .rbp-page below), each
// scrolling its own content internally.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Popover from 'primevue/popover';
import { useToast } from 'primevue/usetoast';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { researchBoardsApi, type ResearchBoardDetail, type ResearchBoardSummary } from '@/api/researchBoards';
import { detectionsApi } from '@/api/detections';
import { usersApi, type UserSummary } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import MarkdownView from '@/components/MarkdownView.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import AresBadge from '@/components/AresBadge.vue';
import QueryBar from '@/components/QueryBar.vue';
import DetectionPickerDialog from '@/components/DetectionPickerDialog.vue';
import MergeResearchBoardsDialog from '@/components/MergeResearchBoardsDialog.vue';
import EscalationWizard from '@/components/EscalationWizard.vue';
import DetectionPreviewPanel from '@/components/DetectionPreviewPanel.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const projectId = computed(() => Number(route.params.engId));
const orgId = computed(() => Number(route.params.orgId));
const boardId = computed(() => Number(route.params.boardId));

const board = ref<ResearchBoardDetail | null>(null);
const loading = ref(true);
const notesSaving = ref(false);
const titleDraft = ref('');
const editingTitle = ref(false);
const activeDetectionId = ref<number | null>(null);
const showAddPicker = ref(false);
const showMergeDialog = ref(false);
const showEscalateDialog = ref(false);
const resolving = ref(false);
const showBrowseOverlay = ref(false);

const activeDetection = computed(() => board.value?.detections.find((d) => d.id === activeDetectionId.value) ?? null);
const isLeadOrAdmin = computed(() => !!board.value && (auth.isAdmin || board.value.leadUserId === auth.user?.id));
const isArchived = computed(() => board.value?.status === 'archived');
const isSelfMember = (userId: number) => userId === auth.user?.id;

// Basic mode filters the board's own (already-loaded) detections client-side; AQL mode runs the
// real query against the backend (same as every other detection list) and intersects the matches
// with this board's detections — there's no client-side AQL evaluator, and this board's detection
// set is the thing being browsed either way, never a wider one.
const basicQuery = ref('');
const aqlMatchIds = ref<Set<number> | null>(null);
const aqlSearching = ref(false);

async function onDetSearch({ mode, value }: { mode: 'basic' | 'aql'; value: string }) {
  if (mode === 'basic') {
    basicQuery.value = value;
    aqlMatchIds.value = null;
    return;
  }
  basicQuery.value = '';
  if (!value.trim()) { aqlMatchIds.value = null; return; }
  aqlSearching.value = true;
  try {
    const res = await detectionsApi.list({ projectId: projectId.value, aql: value, size: 500 });
    aqlMatchIds.value = new Set(res.items.map((d) => d.id));
  } catch {
    aqlMatchIds.value = new Set();
  } finally {
    aqlSearching.value = false;
  }
}

const filteredDetections = computed(() => {
  const all = board.value?.detections ?? [];
  if (aqlMatchIds.value) return all.filter((d) => aqlMatchIds.value!.has(d.id));
  const q = basicQuery.value.trim().toLowerCase();
  if (!q) return all;
  return all.filter((d) =>
    d.title.toLowerCase().includes(q)
    || (d.sourceTemplateId ?? '').toLowerCase().includes(q)
    || (d.assetIdentifier ?? '').toLowerCase().includes(q)
    || String(d.id).includes(q));
});

function pickDetection(id: number) {
  activeDetectionId.value = id;
  showBrowseOverlay.value = false;
}

async function load() {
  loading.value = true;
  try {
    board.value = await researchBoardsApi.get(projectId.value, boardId.value);
    titleDraft.value = board.value.title;
    if (!board.value.detections.some((d) => d.id === activeDetectionId.value)) {
      activeDetectionId.value = board.value.detections[0]?.id ?? null;
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Not found', detail: 'This Research Board could not be loaded.', life: 5000 });
    router.push({ name: 'org-project-research', params: { orgId: orgId.value, engId: projectId.value } });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(boardId, load);

// ── Title ─────────────────────────────────────────────────────────
async function saveTitle() {
  editingTitle.value = false;
  if (!board.value || !titleDraft.value.trim() || titleDraft.value.trim() === board.value.title) return;
  board.value = await researchBoardsApi.update(projectId.value, boardId.value, { title: titleDraft.value.trim() });
}

// ── Notes (debounced autosave) ──────────────────────────────────────
let notesTimer: ReturnType<typeof setTimeout> | null = null;
function onNotesChange(value: string) {
  if (!board.value) return;
  board.value.notes = value;
  if (notesTimer) clearTimeout(notesTimer);
  notesTimer = setTimeout(async () => {
    notesSaving.value = true;
    try { await researchBoardsApi.update(projectId.value, boardId.value, { notes: value }); }
    finally { notesSaving.value = false; }
  }, 800);
}

// ── Detections ───────────────────────────────────────────────────────
async function onDetectionsPicked(ids: number[]) {
  showAddPicker.value = false;
  try {
    board.value = await researchBoardsApi.addDetections(projectId.value, boardId.value, ids);
    if (!activeDetectionId.value) activeDetectionId.value = board.value.detections[0]?.id ?? null;
    toast.add({ severity: 'success', summary: 'Added', detail: `${ids.length} detection(s) added.`, life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to add', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  }
}

// ── Merge ────────────────────────────────────────────────────────────
function onMerged(targetBoardId: number) {
  toast.add({ severity: 'success', summary: 'Boards merged', life: 3000 });
  router.replace({ name: 'org-project-research-board', params: { orgId: orgId.value, engId: projectId.value, boardId: targetBoardId } });
}

// ── Resolution (escalate to finding / no affection) ─────────────────
function onEscalationDone() {
  showEscalateDialog.value = false;
  load();
}

async function markNotAffected() {
  const ok = await confirmDialog({
    header: 'No affection',
    message: 'Mark every detection on this board as "Not Affected" and archive the investigation? This cannot be undone from here.',
    acceptLabel: 'No affection',
    acceptSeverity: 'warn',
  });
  if (!ok || !board.value) return;
  resolving.value = true;
  try {
    board.value = await researchBoardsApi.notAffected(projectId.value, boardId.value);
    toast.add({ severity: 'success', summary: 'Resolved', detail: 'Detections are now Not Affected.', life: 4000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    resolving.value = false;
  }
}

async function removeDetection(detId: number) {
  const ok = await confirmDialog({
    header: 'Remove detection',
    message: 'Remove this detection from the board? Its status goes back to "Reopened".',
    acceptLabel: 'Remove',
  });
  if (!ok || !board.value) return;
  board.value = await researchBoardsApi.removeDetection(projectId.value, boardId.value, detId);
  if (activeDetectionId.value === detId) activeDetectionId.value = board.value.detections[0]?.id ?? null;
}

// ── Move detection to another board ──────────────────────────────────
const movePopover = ref();
const moveDetectionId = ref<number | null>(null);
const moveTargetBoards = ref<ResearchBoardSummary[]>([]);
const moveTargetBoardId = ref<number | null>(null);
const moveNewTitle = ref('');
const moving = ref(false);

async function openMovePopover(e: Event, detId: number) {
  moveDetectionId.value = detId;
  moveTargetBoardId.value = null;
  moveNewTitle.value = '';
  movePopover.value?.toggle(e);
  moveTargetBoards.value = (await researchBoardsApi.list(projectId.value, false))
    .filter((b) => b.id !== boardId.value);
}

async function confirmMove() {
  if (!board.value || moveDetectionId.value == null) return;
  if (!moveTargetBoardId.value && !moveNewTitle.value.trim()) return;
  moving.value = true;
  try {
    board.value = await researchBoardsApi.removeDetection(projectId.value, boardId.value, moveDetectionId.value, {
      moveToBoardId: moveTargetBoardId.value ?? undefined,
      newBoardTitle: moveTargetBoardId.value ? undefined : moveNewTitle.value.trim(),
    });
    if (activeDetectionId.value === moveDetectionId.value) activeDetectionId.value = board.value.detections[0]?.id ?? null;
    movePopover.value?.hide();
    toast.add({ severity: 'success', summary: 'Moved', detail: 'Detection moved to the other board.', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to move', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    moving.value = false;
  }
}

// ── Members ──────────────────────────────────────────────────────────
const memberPopover = ref();
const allUsers = ref<UserSummary[]>([]);
const memberSearch = ref('');

async function openMemberPopover(e: Event) {
  memberSearch.value = '';
  memberPopover.value?.toggle(e);
  if (!allUsers.value.length) {
    const res = await usersApi.list({ page: 0, size: 200 });
    allUsers.value = res.items;
  }
}

const filteredCandidateUsers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase();
  const already = new Set((board.value?.members ?? []).map((m) => m.userId));
  return allUsers.value.filter((u) => {
    if (already.has(u.id) || u.status !== 'active') return false;
    if (!q) return true;
    return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
});

async function addMember(userId: number) {
  if (!board.value) return;
  board.value = await researchBoardsApi.addMember(projectId.value, boardId.value, userId);
  memberPopover.value?.hide();
}

async function removeMember(userId: number) {
  if (!board.value) return;
  if (!isSelfMember(userId)) {
    const ok = await confirmDialog({ header: 'Remove member', message: 'Remove this user from the investigation?', acceptLabel: 'Remove' });
    if (!ok) return;
  }
  board.value = await researchBoardsApi.removeMember(projectId.value, boardId.value, userId);
}

function avatarUrl(userId: number) { return `/api/v1/profile/${userId}/avatar`; }
const failedAvatars = ref(new Set<number>());
function onAvatarError(userId: number) { failedAvatars.value = new Set([...failedAvatars.value, userId]); }
function initials(displayName: string | null, email: string | null): string {
  const n = displayName || email || '?';
  return n.split(/\s+/).map((w) => w[0]?.toUpperCase()).slice(0, 2).join('');
}
</script>

<template>
  <div class="rbp-page">
    <div class="rbp-page-header">
      <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
        <Button icon="pi pi-arrow-left" severity="secondary" text @click="router.push({ name: 'org-project-research', params: { orgId, engId: projectId } })" />
        <div>
          <span v-if="!editingTitle" class="ares-page-title" style="display:flex; align-items:center; gap:0.5rem; cursor:text;" @click="!isArchived && (editingTitle = true)">
            {{ board?.title ?? 'Research Board' }}
            <i v-if="!isArchived" class="pi pi-pencil" style="font-size:0.7rem; opacity:0.5;" />
          </span>
          <InputText v-else v-model="titleDraft" autofocus class="ares-page-title" style="font-size:1.1rem;" @keyup.enter="saveTitle" @blur="saveTitle" />
          <p class="ares-page-subtitle">Research Board</p>
        </div>
      </div>
      <AresBadge
        v-if="isArchived"
        :value="board?.verdict === 'affected' ? 'Affected' : 'Not Affected'"
        :severity="board?.verdict === 'affected' ? 'warn' : 'secondary'"
      />
      <Button v-else-if="board" label="Merge with…" icon="pi pi-arrows-h" severity="secondary" text size="small" @click="showMergeDialog = true" />
    </div>

    <AresLoadingState v-if="loading" style="flex:1;" />

    <div v-else-if="board" class="rbp-body">
      <!-- Main: notes -->
      <div class="rbp-main ares-card" style="padding:0;">
        <div class="rbp-members-row">
          <div class="rb-avatar-stack">
            <div
              v-for="m in board.members" :key="m.userId"
              class="rb-avatar" :class="{ 'rb-avatar--lead': m.userId === board.leadUserId }"
              v-tooltip.top="(m.displayName ?? m.email ?? '') + (m.userId === board.leadUserId ? ' (lead)' : '')"
            >
              <img v-if="!failedAvatars.has(m.userId)" :src="avatarUrl(m.userId)" @error="onAvatarError(m.userId)" alt="" />
              <template v-else>{{ initials(m.displayName, m.email) }}</template>
              <button
                v-if="!isArchived && (isSelfMember(m.userId) || isLeadOrAdmin)"
                class="rb-avatar-remove" v-tooltip.top="'Remove'"
                @click="removeMember(m.userId)"
              ><i class="pi pi-times" /></button>
            </div>
            <button v-if="!isArchived" class="rb-avatar rb-avatar--add" v-tooltip.top="'Add member'" @click="openMemberPopover">
              <i class="pi pi-plus" />
            </button>
          </div>
          <span v-if="notesSaving" class="rb-saving">Saving…</span>
        </div>

        <div class="rbp-notes-wrap">
          <MarkdownEditor
            v-if="!isArchived"
            :model-value="board.notes ?? ''"
            :organization-id="orgId"
            :project-id="projectId"
            editor-style="height:100%; min-height:0;"
            placeholder="Investigation notes — findings, correlations, evidence…"
            @update:model-value="onNotesChange"
          />
          <MarkdownView v-else :source="board.notes" empty-text="No notes were recorded." style="padding:1rem; overflow-y:auto; flex:1; min-height:0;" />
        </div>

        <div v-if="!isArchived" class="rbp-resolve-row">
          <Button label="No affection" severity="secondary" size="small" :loading="resolving" @click="markNotAffected" />
          <Button label="Escalate to Finding" icon="pi pi-arrow-up-right" size="small" :loading="resolving" @click="showEscalateDialog = true" />
        </div>
      </div>

      <!-- Side: the active detection ALWAYS renders here; browsing/picking a different one is a
           search+list drawer that slides in from the left rather than replacing this view. -->
      <div class="rbp-side">
        <div class="rbp-side-header">
          <span v-if="activeDetection">#{{ activeDetection.id }} <span class="rbp-side-header-count">· {{ board.detections.length }} in this board</span></span>
          <span v-else>Detections ({{ board.detections.length }})</span>
          <span style="margin-left:auto; display:flex; gap:0.25rem;">
            <Button v-if="!isArchived" icon="pi pi-plus" text rounded size="small" v-tooltip.top="'Add detections'" @click="showAddPicker = true" />
            <Button icon="pi pi-search" text rounded size="small" v-tooltip.top="'Browse detections'" @click="showBrowseOverlay = !showBrowseOverlay" />
          </span>
        </div>

        <DetectionPreviewPanel v-if="activeDetection" :detection="activeDetection" />
        <p v-else class="rbp-det-empty">No detections yet — add some to start investigating.</p>

        <!-- Browse drawer: search (AQL/Basic) + list, slides in from the left over the detail
             view above rather than a centered dialog — always in the DOM so the slide
             transitions instead of popping. -->
        <div class="rbp-drawer" :class="{ 'rbp-drawer--open': showBrowseOverlay }">
          <div class="rbp-drawer-header">
            <span>Browse detections</span>
            <Button icon="pi pi-times" text rounded size="small" @click="showBrowseOverlay = false" />
          </div>
          <div class="rbp-drawer-search">
            <QueryBar
              entity="detection" :project-id="projectId" :organization-id="orgId"
              placeholder="Search title, description…" @search="onDetSearch"
            />
          </div>
          <div class="rbp-det-list">
            <button
              v-for="d in filteredDetections" :key="d.id"
              class="rbp-det-row" :class="{ 'rbp-det-row--active': d.id === activeDetectionId }"
              @click="pickDetection(d.id)"
            >
              <SeverityTag :level="d.severity" short scale="priority" style="flex-shrink:0;" />
              <div class="rbp-det-row-main">
                <span class="rbp-det-row-title">{{ d.title }}</span>
                <span class="rbp-det-row-sub">{{ d.assetIdentifier ?? 'No asset' }} · #{{ d.id }}</span>
              </div>
              <span v-if="!isArchived" class="rbp-det-row-actions">
                <i class="pi pi-arrow-right-arrow-left" v-tooltip.top="'Move to another board'" @click.stop="openMovePopover($event, d.id)" />
                <i class="pi pi-trash" v-tooltip.top="'Remove'" @click.stop="removeDetection(d.id)" />
              </span>
            </button>
            <p v-if="aqlSearching" class="rbp-det-empty">Searching…</p>
            <p v-else-if="!board.detections.length" class="rbp-det-empty">No detections yet — add some to start investigating.</p>
            <p v-else-if="!filteredDetections.length" class="rbp-det-empty">No detections match.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Move-to-board popover -->
    <Popover ref="movePopover">
      <div style="display:flex; flex-direction:column; gap:0.6rem; width:16rem;">
        <span style="font-size:0.8rem; font-weight:600;">Move to another board</span>
        <Select
          v-model="moveTargetBoardId"
          :options="moveTargetBoards"
          option-label="title" option-value="id"
          placeholder="Existing board…" show-clear
          @update:model-value="moveNewTitle = ''"
        />
        <span style="font-size:0.72rem; color:var(--ares-text-muted); text-align:center;">or</span>
        <InputText
          v-model="moveNewTitle" placeholder="New board title…"
          @update:model-value="moveTargetBoardId = null"
        />
        <Button label="Move" size="small" :loading="moving" :disabled="!moveTargetBoardId && !moveNewTitle.trim()" @click="confirmMove" />
      </div>
    </Popover>

    <!-- Add-member popover -->
    <Popover ref="memberPopover">
      <div style="display:flex; flex-direction:column; gap:0.5rem; width:16rem;">
        <InputText v-model="memberSearch" placeholder="Search users…" size="small" />
        <div style="max-height:14rem; overflow-y:auto; display:flex; flex-direction:column;">
          <button
            v-for="u in filteredCandidateUsers" :key="u.id"
            class="rb-user-row" @click="addMember(u.id)"
          >{{ u.displayName }} <span style="color:var(--ares-text-muted);">({{ u.email }})</span></button>
          <p v-if="!filteredCandidateUsers.length" style="font-size:0.78rem; color:var(--ares-text-muted); padding:0.4rem;">No matching users.</p>
        </div>
      </div>
    </Popover>

    <DetectionPickerDialog
      v-model:visible="showAddPicker"
      :project-id="projectId"
      title="Add detections to this board"
      @picked="onDetectionsPicked"
    />

    <MergeResearchBoardsDialog
      v-if="board"
      v-model:visible="showMergeDialog"
      :project-id="projectId"
      :source-board="{ id: board.id, title: board.title }"
      @merged="onMerged"
    />

    <EscalationWizard
      v-if="board"
      v-model:visible="showEscalateDialog"
      :project-id="projectId"
      :org-id="orgId"
      :detections="board.detections"
      :research-board="{ id: board.id, title: board.title, notes: board.notes }"
      @done="onEscalationDone"
    />
  </div>
</template>

<style scoped>
/* Fills exactly the viewport below the topbar — margin cancels AppShell's own 1.5rem page
   padding (see .ares-page in main.css) so this page is edge-to-edge, same trick
   WorkflowEditorView.vue uses for the same reason: notes and detections need to be genuinely
   the same height, not just visually close, which needs a real bounded container, not guesswork. */
.rbp-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--ares-topbar-height, 56px));
  margin: -1.5rem;
}

.rbp-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--ares-border);
  flex-shrink: 0;
}

.rbp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1.25rem;
  padding: 1.25rem 1.5rem;
  overflow: hidden;
}

/* No explicit height needed on the two columns below — default flex align-items:stretch makes
   both fill .rbp-body's own (now fixed) height equally; each scrolls its own content
   internally instead of growing past it. */
.rbp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }

.rbp-members-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.85rem 1rem; border-bottom: 1px solid var(--ares-border); }
.rb-saving { font-size: 0.72rem; color: var(--ares-text-muted); }

.rb-avatar-stack { display: flex; align-items: center; }
.rb-avatar {
  position: relative;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--ares-accent-bg);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.68rem; font-weight: 700;
  border: 2px solid var(--ares-surface);
  margin-left: -8px;
  overflow: hidden;
  flex-shrink: 0;
}
.rb-avatar:first-child { margin-left: 0; }
.rb-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rb-avatar--lead { box-shadow: 0 0 0 2px var(--p-primary-500); }
.rb-avatar--add {
  background: var(--ares-surface-raised);
  border: 1px dashed var(--ares-border);
  color: var(--ares-text-muted);
  cursor: pointer;
}
.rb-avatar-remove {
  position: absolute; inset: 0;
  display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55); color: #fff; border: none; cursor: pointer; font-size: 0.7rem;
}
.rb-avatar:hover .rb-avatar-remove { display: flex; }

.rbp-notes-wrap { flex: 1; min-height: 0; padding: 1rem; display: flex; }
.rbp-notes-wrap :deep(.markdown-editor) { display: flex; flex-direction: column; flex: 1; min-height: 0; }

.rbp-resolve-row { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.85rem 1rem; border-top: 1px solid var(--ares-border); flex-shrink: 0; }

.rbp-side {
  width: 560px;
  flex-shrink: 0;
  position: relative; /* containing block for .rbp-drawer below */
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rbp-side-header {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid var(--ares-border);
  font-size: 0.82rem; font-weight: 600; color: var(--ares-text-2);
  font-family: var(--ares-mono-font, ui-monospace, monospace);
  flex-shrink: 0;
}
.rbp-side-header-count { font-weight: 400; font-family: inherit; color: var(--ares-text-muted); }

.rbp-det-empty { padding: 1.5rem 1rem; font-size: 0.78rem; color: var(--ares-text-muted); text-align: center; }

/* ── Browse drawer — slides in from the left over the detail view, within this panel's own
   bounds (.rbp-side is its positioned containing block) ──────────────────────────────────── */
.rbp-drawer {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 100%;
  display: flex; flex-direction: column;
  background: var(--ares-surface);
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  z-index: 2;
}
.rbp-drawer--open { transform: translateX(0); }
.rbp-drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--ares-border);
  font-size: 0.82rem; font-weight: 600; color: var(--ares-text-2);
  flex-shrink: 0;
}
.rbp-drawer-search { padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--ares-border); flex-shrink: 0; }

.rbp-det-list { flex: 1; min-height: 0; overflow-y: auto; }

.rbp-det-row {
  display: flex; align-items: center; gap: 0.6rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: transparent; border: none; border-bottom: 1px solid var(--ares-border);
  cursor: pointer; text-align: left; font-family: inherit; color: inherit;
}
.rbp-det-row:last-child { border-bottom: none; }
.rbp-det-row:hover { background: var(--ares-surface-2); }
.rbp-det-row--active { background: color-mix(in srgb, var(--ares-accent) 10%, transparent); }

.rbp-det-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.rbp-det-row-title { font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rbp-det-row-sub { font-size: 0.7rem; color: var(--ares-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.rbp-det-row-actions { display: flex; gap: 0.5rem; flex-shrink: 0; opacity: 0; transition: opacity 0.12s; }
.rbp-det-row:hover .rbp-det-row-actions { opacity: 1; }
.rbp-det-row-actions i { font-size: 0.72rem; color: var(--ares-text-muted); }
.rbp-det-row-actions i:hover { color: var(--ares-text-1); }

.rb-user-row {
  text-align: left; padding: 0.4rem 0.5rem; background: none; border: none;
  cursor: pointer; font-size: 0.8rem; border-radius: var(--ares-radius); font-family: inherit;
}
.rb-user-row:hover { background: var(--ares-surface-2); }

/* Mobile: the two columns stack instead of sitting side by side, so there's no more shared row
   height to stretch into — each gets its own fixed height instead (not "whatever its content
   needs"), and the page goes back to scrolling normally rather than being clipped to one screen. */
@media (max-width: 1100px) {
  .rbp-page { height: auto; margin: 0; }
  .rbp-page-header { padding: 0 0 1rem; border-bottom: none; }
  .rbp-body { flex-direction: column; padding: 0; overflow: visible; height: auto; }
  .rbp-main { width: 100%; height: 65vh; flex: none; }
  .rbp-side { width: 100%; height: 65vh; flex: none; }
}
</style>
