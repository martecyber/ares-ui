<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Message from 'primevue/message';
import AresBadge from '@/components/AresBadge.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import MarkdownView from '@/components/MarkdownView.vue';
import Select from 'primevue/select';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import SeverityTag from '@/components/SeverityTag.vue';
import ScoreDialog, { type EditingScore, type ScoreSavePayload } from '@/components/ScoreDialog.vue';
import ReferencesDialog from '@/components/ReferencesDialog.vue';
import AffectionDialog from '@/components/AffectionDialog.vue';
import AddFieldDialog from '@/components/AddFieldDialog.vue';
import { findingsApi, statusLabel, statusSeverity, affectStatusLabel, AFFECT_STATUSES, type Finding, type FindingAffection, type AffectStatus } from '@/api/findings';
import ReferencesBlock from '@/components/ReferencesBlock.vue';
import { findingTemplatesApi } from '@/api/finding-templates';
import { saveAsTemplate as saveAsTemplateFlow } from '@/composables/useSaveAsTemplate';
import type { ReferenceEntry } from '@/api/references';
import { ASSET_TYPE_LABELS } from '@/api/assets';
import { affectionsApi } from '@/api/affections';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { projectsApi, isRetest, type Project } from '@/api/projects';
import { findingStatusesApi } from '@/api/finding-statuses';
import { useAuthStore } from '@/stores/auth';
import { scoreToSeverity, PRIORITY_SCALE, cvss40ClassificationFromVector, cvss31ScoresFromVector, cvss20ScoresFromVector, type ScoreSeverity } from '@/utils/cvss';
import { resolveSsvcMethodologyNames } from '@/utils/ssvcTree';
import DatePicker from 'primevue/datepicker';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { findingFieldTypesApi, type FindingFieldType } from '@/api/finding-field-types';
import { confirmDialog } from '@/composables/useConfirmDialog';
import TagChipList from '@/components/TagChipList.vue';
import EntityTagEditDialog from '@/components/EntityTagEditDialog.vue';
import ReportFindingByEmailDialog from '@/components/ReportFindingByEmailDialog.vue';

const { isMobile } = useBreakpoint();

const route = useRoute();
const router = useRouter();
const toast = useToast();
const auth = useAuthStore();

// `org-project-finding-detail` has no `readonly` route meta (only the org-level
// `org-finding-detail` does) — CLIENT_USER accounts must be read-only from either entry
// point, regardless of which route led here, since they can never edit findings.
const readonly = computed(() => !!route.meta?.readonly || auth.isClient);

// ── Project access (only relevant when readonly=true) ─────────────────────
const projectRole = ref<'admin' | 'lead' | 'operator' | null>(null);
const canEditInProject = computed(() => readonly.value && projectRole.value !== null);
const project = ref<Project | null>(null);

// ── RETEST context: viewing this finding through a RETEST project's route.
// The finding always belongs to its own (non-RETEST) project — only its content
// is read-only here; affected-asset status changes (below) stay fully live.
const isRetestContext = ref(false);
const coreReadonly = computed(() => readonly.value || isRetestContext.value);

// ── Title (inline edit) ──────────────────────────────────────────────
const editingTitle = ref(false);
const titleDraft = ref('');
const savingTitle = ref(false);

function openTitleEditor() {
  if (!finding.value) return;
  titleDraft.value = finding.value.title;
  editingTitle.value = true;
}

async function saveTitle() {
  if (!finding.value) return;
  const next = titleDraft.value.trim();
  if (!next) { editingTitle.value = false; return; }
  if (next === finding.value.title) { editingTitle.value = false; return; }
  savingTitle.value = true;
  try {
    finding.value = await findingsApi.update(finding.value.id, finding.value.projectId, { title: next });
    editingTitle.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Update failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    savingTitle.value = false;
  }
}

// ── Deadline ─────────────────────────────────────────────────────────
const editingDue = ref(false);
const duePickerVal = ref<Date | null>(null);

function openDuePicker() {
  duePickerVal.value = finding.value?.dueDate ? new Date(finding.value.dueDate) : null;
  editingDue.value = true;
}
async function saveDueDate() {
  if (!finding.value) return;
  try {
    finding.value = await findingsApi.update(finding.value.id, finding.value.projectId, {
      dueDate: duePickerVal.value ? duePickerVal.value.toISOString().slice(0, 10) : undefined,
      clearDueDate: !duePickerVal.value,
    });
    editingDue.value = false;
  } catch { /* silent */ }
}

// ── References (via ReferencesDialog: add-only, not preloaded) ───────
const showRefDialog = ref(false);
const tempRefs = ref<ReferenceEntry[]>([]);

function openRefDialog() {
  if (!finding.value) return;
  tempRefs.value = [];
  showRefDialog.value = true;
}

async function applyRefs(newRefs: ReferenceEntry[]) {
  if (!finding.value) return;
  const findingId = finding.value.id;
  const projectId = finding.value.projectId;
  const existing = finding.value.references;
  try {
    for (const n of newRefs) {
      if (!existing.some((o) => o.id === n.id)) {
        await findingsApi.addReference(findingId, projectId, n.id);
      }
    }
    finding.value = await findingsApi.get(findingId);
    showRefDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to add references', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

async function deleteReference(ref: { id: number; title: string }) {
  if (!finding.value) return;
  const ok = await confirmDialog({
    header: 'Delete reference',
    message: `Remove the "${ref.title}" reference from this finding?`,
  });
  if (!ok) return;
  try {
    finding.value = await findingsApi.removeReference(finding.value.id, finding.value.projectId, ref.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to remove reference', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

// ── Scores (via ScoreDialog: add or edit a single score) ─────────────
const showScoreDialog = ref(false);
const scoreTypes = ref<{ id: number; title: string; description: string | null }[]>([]);
const editingScore = ref<EditingScore | null>(null);
const editingScoreId = ref<number | null>(null);

function openAddScore() {
  editingScore.value = null;
  editingScoreId.value = null;
  showScoreDialog.value = true;
}

function openEditScore(score: Finding['scores'][number]) {
  editingScore.value = {
    typeId: score.typeId,
    typeName: score.typeTitle,
    score: Number(score.score),
    vector: score.vector ?? '',
    isDefault: score.isDefault,
    comment: score.comment ?? '',
    ssvcLeafNodeId: score.ssvcLeafNodeId,
  };
  editingScoreId.value = score.id;
  showScoreDialog.value = true;
}

async function saveScore(payload: ScoreSavePayload) {
  if (!finding.value) return;
  const findingId = finding.value.id;
  const projectId = finding.value.projectId;
  try {
    if (editingScoreId.value) {
      finding.value = await findingsApi.updateScore(findingId, projectId, editingScoreId.value, payload.score, payload.vector || undefined, payload.isDefault, payload.comment, payload.ssvcLeafNodeId);
    } else {
      const isDefault = finding.value.scores.length === 0 ? true : payload.isDefault;
      finding.value = await findingsApi.addScore(findingId, projectId, {
        typeId: payload.typeId,
        score: payload.score,
        vector: payload.vector || undefined,
        isDefault,
        comment: payload.comment,
        ssvcLeafNodeId: payload.ssvcLeafNodeId ?? undefined,
      });
    }
    showScoreDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to save score', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

async function deleteScore(score: Finding['scores'][number]) {
  if (!finding.value) return;
  const ok = await confirmDialog({
    header: 'Delete score',
    message: `Delete the ${score.typeTitle} score (${Number(score.score).toFixed(1)})?`,
  });
  if (!ok) return;
  try {
    finding.value = await findingsApi.removeScore(finding.value.id, finding.value.projectId, score.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to delete score', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

// ── Field editing ─────────────────────────────────────────────────
const editingFieldId  = ref<number | null>(null);
const editingFieldText = ref('');
function startEditField(field: { id: number; fieldText: string }) {
  editingFieldId.value  = field.id;
  editingFieldText.value = field.fieldText ?? '';
}
async function saveField(findingId: number, fieldId: number) {
  if (!finding.value) return;
  try {
    finding.value = await findingsApi.updateField(findingId, finding.value.projectId, fieldId, editingFieldText.value);
    editingFieldId.value = null;
  } catch { toast.add({ severity: 'error', summary: 'Failed to save field', life: 4000 }); }
}

// ── Add field (via AddFieldDialog) ───────────────────────────────
const showAddField = ref(false);
function openAddField() { showAddField.value = true; }
async function addField(typeId: number) {
  if (!finding.value) return;
  try {
    finding.value = await findingsApi.addField(finding.value.id, finding.value.projectId, typeId);
    showAddField.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to add field', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

function isFieldRequired(typeId: number): boolean {
  return fieldTypes.value.find((t) => t.id === typeId)?.isRequired ?? false;
}

async function deleteField(field: { id: number; typeTitle: string }) {
  if (!finding.value) return;
  const ok = await confirmDialog({
    header: 'Delete field',
    message: `Delete the "${field.typeTitle}" field?`,
  });
  if (!ok) return;
  try {
    finding.value = await findingsApi.removeField(finding.value.id, finding.value.projectId, field.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to delete field', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

const finding = ref<Finding | null>(null);
const loading = ref(false);
/** leafNodeId -> methodology + role display names (e.g. "CISAv1"/"CISA"), for annotating the
 *  bare "SSVC" type label with which methodology AND role produced that score — see
 *  resolveSsvcMethodologyNames. */
const ssvcMethodologyNames = ref<Map<number, { methodologyName: string; roleName: string }>>(new Map());
const publishing = ref(false);
const advancingStatus = ref(false);
const statusByName = ref<Record<string, number>>({});
const fieldTypes = ref<FindingFieldType[]>([]);

const sortedFields = computed(() => {
  if (!finding.value) return [];
  const sortOrderOf = new Map(fieldTypes.value.map((t) => [t.id, t.sortOrder]));
  return [...finding.value.fields].sort(
    (a, b) => (sortOrderOf.get(a.typeId) ?? 0) - (sortOrderOf.get(b.typeId) ?? 0)
  );
});

// ── Save-as-template prompt ──────────────────────────────────────
const showSaveTemplate = ref(false);
const templateTitleOverride = ref('');
const templateSaving = ref(false);

function openSaveTemplate() {
  if (!finding.value) return;
  templateTitleOverride.value = finding.value.title;
  showSaveTemplate.value = true;
}

async function saveAsTemplate() {
  if (!finding.value) return;
  const title = templateTitleOverride.value.trim() || finding.value.title;
  templateSaving.value = true;
  try {
    const created = await saveAsTemplateFlow(
      (overwrite) => findingTemplatesApi.fromFinding(finding.value!.id, { title: title || undefined }, overwrite),
      title, 'finding template');
    toast.add({ severity: 'success', summary: 'Template saved',
      detail: '"' + created.title + '" added to the KB', life: 4000 });
    showSaveTemplate.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to save template',
      detail: e?.response?.data?.detail ?? e?.message, life: 5000 });
  } finally {
    templateSaving.value = false;
  }
}

// ── Affection dialog (add + edit unified) ────────────────────────
const showAffectionDialog = ref(false);
const editingAffection = ref<FindingAffection | null>(null);

// ── Report by email — MSSP staff only, published findings only, no workflow needed ──
const showReportDialog = ref(false);

// ── Tags ────────────────────────────────────────────────────────
const showTagEditor = ref(false);
async function assignTag(tagId: number) {
  if (!finding.value) return;
  finding.value = await findingsApi.assignTag(finding.value.id, finding.value.projectId, tagId);
}
async function unassignTag(tagId: number) {
  if (!finding.value) return;
  finding.value = await findingsApi.unassignTag(finding.value.id, finding.value.projectId, tagId);
}

// ── Move iteration (MONITOR projects only) ─────────────────────────
const showMoveIterationDialog = ref(false);
const iterationOptions = ref<string[]>([]);
const iterationTarget = ref<string | null>(null);
const movingIteration = ref(false);
const canMoveIteration = computed(() =>
  !coreReadonly.value && !!finding.value && !finding.value.isDraft && !!project.value?.iterationCadence);

async function openMoveIterationDialog() {
  if (!finding.value || !project.value) return;
  iterationTarget.value = finding.value.iterationLabel ?? null;
  showMoveIterationDialog.value = true;
  try {
    const stats = await projectsApi.monitorStats(project.value.id);
    const labels = new Set(stats.byIteration.map((r) => r.label));
    if (stats.currentIterationLabel) labels.add(stats.currentIterationLabel);
    if (finding.value.iterationLabel) labels.add(finding.value.iterationLabel);
    iterationOptions.value = [...labels].sort();
  } catch {
    iterationOptions.value = finding.value.iterationLabel ? [finding.value.iterationLabel] : [];
  }
}

async function confirmMoveIteration() {
  if (!finding.value || !iterationTarget.value) return;
  movingIteration.value = true;
  try {
    finding.value = await findingsApi.moveIteration(finding.value.id, finding.value.projectId, iterationTarget.value);
    showMoveIterationDialog.value = false;
    toast.add({ severity: 'success', summary: 'Iteration updated', detail: `Finding moved to ${iterationTarget.value} (${finding.value.code}).`, life: 4000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to move iteration', detail: e?.response?.data?.detail ?? e?.message, life: 5000 });
  } finally {
    movingIteration.value = false;
  }
}

// ── Affect status change dialog ───────────────────────────────────
const showStatusDialog = ref(false);
const statusPending = ref<{ affectionId: number; assetId: number; current: string; label: string } | null>(null);
const newAffectStatus = ref('');
const affectNote = ref('');
const changingStatus = ref(false);

// ── Close affection dialog ─────────────────────────────────────────
const showCloseAffectionDialog = ref(false);
const closingAffection = ref<FindingAffection | null>(null);
const closeAffectionRows = ref<{ id: number; label: string; status: AffectStatus }[]>([]);
const closeAffectionNote = ref('');
const closingAffectionBusy = ref(false);

// ── Close finding dialog ────────────────────────────────────────────
const showCloseFindingDialog = ref(false);
const closeFindingRows = ref<{ affectionId: number; id: number; label: string; status: AffectStatus }[]>([]);
const closeFindingTargetStatus = ref<'resolved' | 'accepted_risk' | 'false_positive'>('resolved');
const closeFindingNote = ref('');
const closingFindingBusy = ref(false);
const reopeningFinding = ref(false);

async function load() {
  loading.value = true;
  try {
    finding.value = await findingsApi.get(Number(route.params.id));
    if (finding.value) {
      const ssvcLeafIds = (finding.value.scores ?? [])
        .filter((s) => s.typeTitle === 'SSVC')
        .map((s) => s.ssvcLeafNodeId);
      ssvcMethodologyNames.value = await resolveSsvcMethodologyNames(ssvcLeafIds);
      project.value = await projectsApi.get(finding.value.projectId).catch(() => null);
      if (readonly.value) {
        projectRole.value = await projectsApi.myRole(finding.value.projectId).catch(() => null);
      }

      const routeProjectId = route.params.engId ? Number(route.params.engId) : null;
      if (routeProjectId && routeProjectId !== finding.value.projectId) {
        // A finding's own project is never RETEST (findings can't be created there) — so
        // reaching it via a *different* project id means it's in scope via a retest link.
        const viewedProject = await projectsApi.get(routeProjectId).catch(() => null);
        isRetestContext.value = !!viewedProject && isRetest(viewedProject.typeCode, viewedProject.supertypeCode);
      } else {
        isRetestContext.value = false;
      }
    }
    } finally {
    loading.value = false;
  }
}


function scoreSev(score: number): ScoreSeverity {
  return scoreToSeverity(score); // 'critical' | 'high' | 'medium' | 'low' | 'info' → AresBadge native severities
}

/** SSVC shows its outcome word (e.g. "Out-of-Cycle"), read off the tail of its
 *  breadcrumb vector ("... -> Out-of-Cycle") — not the underlying synthetic numeric
 *  score. Everything else keeps the plain "9.8"-style numeric display. */
function scoreDisplay(score: Finding['scores'][number]): string {
  if (score.typeTitle === 'SSVC') {
    const v = score.vector ?? '';
    const i = v.lastIndexOf('->');
    return i === -1 ? score.score.toFixed(1) : v.slice(i + 2).trim();
  }
  if (score.typeTitle === 'Manual') return PRIORITY_SCALE.find((p) => p.score === score.score)?.label ?? score.score.toFixed(1);
  return score.score.toFixed(1);
}

/** "SSVC" alone doesn't say which methodology (SSVCv2, CISAv1, a custom one...) produced
 *  the outcome — annotate it, e.g. "SSVC - CISAv1", when resolvable. Likewise "CVSS 4.0"
 *  alone doesn't say which metric groups were actually filled in — annotate it with its
 *  CVSS-B/BT/BE/BTE classification, e.g. "CVSS 4.0 - CVSS-BTE". */
function scoreTypeLabel(score: Finding['scores'][number]): string {
  if (score.typeTitle === 'SSVC' && score.ssvcLeafNodeId != null) {
    const entry = ssvcMethodologyNames.value.get(score.ssvcLeafNodeId);
    if (entry) return `SSVC - ${entry.methodologyName} (${entry.roleName})`;
  }
  if (score.typeTitle === 'CVSS 4.0' && score.vector) {
    return `${score.typeTitle} - ${cvss40ClassificationFromVector(score.vector)}`;
  }
  return score.typeTitle;
}

/** The vector line already reads "Question: Answer / ... -> Outcome" — the outcome is
 *  redundant there since it's already the big badge to the left, so it's trimmed off. */
function vectorDisplay(score: Finding['scores'][number]): string {
  const v = score.vector ?? '';
  if (score.typeTitle !== 'SSVC') return v;
  const i = v.lastIndexOf('->');
  return i === -1 ? v : v.slice(0, i).trim();
}

/** CVSS 3.1/2.0 store one "most refined" score, but up to 3 (Base/Temporal/
 *  Environmental) may actually apply — show only the ones that were filled in. */
function scoreBreakdown(score: Finding['scores'][number]): string | null {
  if (!score.vector) return null;
  if (score.typeTitle !== 'CVSS 3.1' && score.typeTitle !== 'CVSS 2.0') return null;
  const s = score.typeTitle === 'CVSS 3.1' ? cvss31ScoresFromVector(score.vector) : cvss20ScoresFromVector(score.vector);
  const parts = [`Base ${s.base.toFixed(1)}`];
  if (s.temporal !== null) parts.push(`Temporal ${s.temporal.toFixed(1)}`);
  if (s.environmental !== null) parts.push(`Environmental ${s.environmental.toFixed(1)}`);
  return parts.length > 1 ? parts.join(' · ') : null;
}

const DRAFT_NEXT: Record<string, { label: string; icon: string; nextName: string }> = {
  drafting:       { label: 'Submit for review', icon: 'pi pi-arrow-right',    nextName: 'pending_review' },
  pending_review: { label: 'Mark as ready',     icon: 'pi pi-check-circle',   nextName: 'ready_to_publish' },
};

const nextDraftStep = computed(() =>
  finding.value?.statusName ? (DRAFT_NEXT[finding.value.statusName] ?? null) : null
);

// A published finding can be closed from 'open'. Reopening is only offered from
// 'resolved'/'accepted_risk' — 'false_positive' has no back-transition (see V28/V169
// migrations), so a finding closed that way is meant to stay closed.
const canCloseFinding = computed(() =>
  !!finding.value && !finding.value.isDraft && finding.value.statusName === 'open'
);
const canReopenFinding = computed(() =>
  !!finding.value && !finding.value.isDraft &&
  (finding.value.statusName === 'resolved' || finding.value.statusName === 'accepted_risk')
);

async function advanceDraftStatus() {
  if (!finding.value || !nextDraftStep.value) return;
  const nextId = statusByName.value[nextDraftStep.value.nextName];
  if (!nextId) return;
  advancingStatus.value = true;
  try {
    finding.value = await findingsApi.update(finding.value.id, finding.value.projectId, { statusId: nextId });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Status update failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    advancingStatus.value = false;
  }
}

async function publish() {
  if (!finding.value) return;
  publishing.value = true;
  try {
    finding.value = await findingsApi.publish(finding.value.id, finding.value.projectId);
    toast.add({ severity: 'success', summary: 'Finding published', detail: 'Code assigned: ' + finding.value.code, life: 4000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Publish failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    publishing.value = false;
  }
}

function openAddAffection() {
  editingAffection.value = null;
  showAffectionDialog.value = true;
}

function openEditAffection(aff: FindingAffection) {
  editingAffection.value = aff;
  showAffectionDialog.value = true;
}

function openStatusDialog(affectionId: number, assetId: number, current: string, label: string) {
  statusPending.value = { affectionId, assetId, current, label };
  newAffectStatus.value = current;
  affectNote.value = '';
  showStatusDialog.value = true;
}

async function applyStatusChange() {
  if (!statusPending.value || !finding.value) return;
  changingStatus.value = true;
  try {
    const { affectionId, assetId } = statusPending.value;
    await affectionsApi.updateAffectStatus(affectionId, assetId, newAffectStatus.value, affectNote.value || undefined);
    finding.value = await findingsApi.get(finding.value.id);
    showStatusDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    changingStatus.value = false;
  }
}

function affectLabel(a: { type: string; identifier: string }): string {
  return (ASSET_TYPE_LABELS[a.type] ?? a.type) + ' — ' + a.identifier;
}

function openCloseAffectionDialog(aff: FindingAffection) {
  closingAffection.value = aff;
  closeAffectionRows.value = aff.affects
    .filter((a) => a.status === 'open')
    .map((a) => ({ id: Number(a.id), label: affectLabel(a), status: 'resolved' as AffectStatus }));
  closeAffectionNote.value = '';
  showCloseAffectionDialog.value = true;
}

async function confirmCloseAffection() {
  if (!closingAffection.value || !finding.value) return;
  closingAffectionBusy.value = true;
  try {
    const affectionId = closingAffection.value.id;
    for (const row of closeAffectionRows.value) {
      await affectionsApi.updateAffectStatus(affectionId, row.id, row.status, closeAffectionNote.value || undefined);
    }
    finding.value = await findingsApi.get(finding.value.id);
    showCloseAffectionDialog.value = false;
    toast.add({ severity: 'success', summary: 'Affection closed', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to close affection', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    closingAffectionBusy.value = false;
  }
}

function openCloseFindingDialog() {
  if (!finding.value) return;
  closeFindingRows.value = finding.value.affections.flatMap((aff) =>
    aff.affects
      .filter((a) => a.status === 'open')
      .map((a) => ({ affectionId: aff.id, id: Number(a.id), label: affectLabel(a), status: 'resolved' as AffectStatus }))
  );
  closeFindingTargetStatus.value = 'resolved';
  closeFindingNote.value = '';
  showCloseFindingDialog.value = true;
}

async function confirmCloseFinding() {
  if (!finding.value) return;
  closingFindingBusy.value = true;
  try {
    for (const row of closeFindingRows.value) {
      await affectionsApi.updateAffectStatus(row.affectionId, row.id, row.status, closeFindingNote.value || undefined);
    }
    const targetId = statusByName.value[closeFindingTargetStatus.value];
    finding.value = await findingsApi.update(finding.value.id, finding.value.projectId, { statusId: targetId });
    showCloseFindingDialog.value = false;
    toast.add({ severity: 'success', summary: 'Finding closed', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to close finding', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    closingFindingBusy.value = false;
  }
}

async function reopenFinding() {
  if (!finding.value) return;
  reopeningFinding.value = true;
  try {
    const targetId = statusByName.value['open'];
    finding.value = await findingsApi.update(finding.value.id, finding.value.projectId, { statusId: targetId });
    toast.add({ severity: 'success', summary: 'Finding reopened', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to reopen finding', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    reopeningFinding.value = false;
  }
}

function affHeaderColor(status: string): string {
  return status === 'closed' ? '#4ade80' : '#f87171';
}

function goToDetection(detectionId: number) {
  const { orgId, engId } = route.params;
  if (orgId && engId) {
    router.push({ name: 'org-project-detection-detail', params: { orgId, engId, id: detectionId } });
  }
}

function goToAsset(assetId: number | string) {
  const { orgId, engId } = route.params;
  if (orgId && engId) {
    router.push({ name: 'org-project-asset-detail', params: { orgId, engId, id: assetId } });
  } else if (orgId) {
    router.push({ name: 'org-asset-detail', params: { orgId, id: assetId } });
  }
}

onMounted(async () => {
  const [, statuses, types, fTypes] = await Promise.all([
    load(),
    findingStatusesApi.list(),
    findingsApi.listScoreTypes(),
    findingFieldTypesApi.list(),
  ]);
  statusByName.value = Object.fromEntries(statuses.map((s) => [s.name, s.id]));
  scoreTypes.value = types;
  fieldTypes.value = fTypes;
});
</script>

<template>
  <div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:4rem;">
      <ProgressSpinner />
    </div>

    <template v-else-if="finding">

      <Message v-if="isRetestContext" severity="info" :closable="false" style="margin-bottom:1rem;">
        Viewing from a retest — this finding's own content is read-only here. You can still update
        affected-asset status below (with a note) to record what this retest verified.
      </Message>

      <!-- ── Header ──────────────────────────────────────────────── -->
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.25rem;">
        <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
          <Button icon="pi pi-arrow-left" severity="secondary" text @click="router.back()" style="flex-shrink:0;" />
          <div style="min-width:0;">
            <div v-if="!editingTitle || coreReadonly" class="title-row">
              <h2 class="ares-page-title" style="margin:0;">{{ finding.title }}</h2>
              <button v-if="!coreReadonly" class="title-edit-btn"
                v-tooltip.right="'Edit title'" @click="openTitleEditor">
                <i class="pi pi-pencil" />
              </button>
            </div>
            <div v-else class="title-row title-row--editing">
              <InputText v-model="titleDraft" class="title-input"
                @keyup.enter="saveTitle" @keyup.escape="editingTitle = false" autofocus />
              <Button icon="pi pi-check" size="small" severity="success" text
                :loading="savingTitle" @click="saveTitle" v-tooltip.top="'Save (Enter)'" />
              <Button icon="pi pi-times" size="small" severity="secondary" text
                :disabled="savingTitle" @click="editingTitle = false" v-tooltip.top="'Cancel (Esc)'" />
            </div>
          </div>
        </div>

        <!-- "Edit in project" button (readonly mode with project access, or RETEST context) -->
        <div v-if="(readonly && canEditInProject) || isRetestContext" style="flex-shrink:0;">
          <Button
            icon="pi pi-pencil"
            label="Edit in project"
            size="small"
            @click="router.push({
              name: 'org-project-finding-detail',
              params: { orgId: route.params.orgId, engId: finding!.projectId, id: finding!.id }
            })"
          />
        </div>

        <!-- Report by email — MSSP staff only, published findings only. Independent of
             coreReadonly/readonly: works from both the org-level and project-level route. -->
        <div v-if="!auth.isClient && !finding.isDraft" style="flex-shrink:0;">
          <Button
            icon="pi pi-send"
            label="Report"
            size="small"
            severity="secondary"
            v-tooltip.bottom="'Report this finding by email'"
            @click="showReportDialog = true"
          />
        </div>

        <!-- Edit controls (hidden in readonly / RETEST mode) -->
        <div v-if="!coreReadonly" style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0; flex-wrap:wrap;">
          <Button
            icon="pi pi-bookmark"
            label="Save as template"
            size="small"
            severity="secondary"
            v-tooltip.bottom="'Snapshot this finding into a reusable KB template'"
            @click="openSaveTemplate"
          />
          <!-- Advance draft state (drafting → pending_review → ready_to_publish) -->
          <Button
            v-if="finding.isDraft && nextDraftStep"
            :icon="nextDraftStep.icon"
            :label="nextDraftStep.label"
            size="small"
            severity="secondary"
            :loading="advancingStatus"
            @click="advanceDraftStatus"
          />
          <!-- Publish — only at the final draft state -->
          <Button
            v-if="finding.isDraft && finding.statusName === 'ready_to_publish'"
            icon="pi pi-send"
            label="Publish"
            size="small"
            severity="success"
            :loading="publishing"
            @click="publish"
          />
          <!-- Close / reopen — published findings only -->
          <Button
            v-if="canCloseFinding"
            icon="pi pi-check-circle"
            label="Close finding"
            size="small"
            severity="success"
            @click="openCloseFindingDialog"
          />
          <Button
            v-if="canReopenFinding"
            icon="pi pi-replay"
            label="Reopen"
            size="small"
            severity="secondary"
            :loading="reopeningFinding"
            @click="reopenFinding"
          />
        </div>
      </div>

      <!-- ── Scores + References (2/3, left) | Metadata (1/3, right) ── -->
      <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <div class="detail-grid__data" style="display:flex; flex-direction:column; gap:1.25rem;">

          <!-- Scores -->
          <div class="ares-card" style="padding:0;">
            <div class="ares-card-section-header">
              <span class="section-header-label">
                Priorization
                <span v-if="finding.scores.length" class="section-badge">{{ finding.scores.length }}</span>
              </span>
              <Button v-if="!coreReadonly" icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add score'" @click="openAddScore" />
            </div>
            <div class="detail-grid__body">
              <div v-if="finding.scores.length" class="score-list">
                <div v-for="score in finding.scores" :key="score.id" class="score-row">
                  <AresBadge :value="scoreDisplay(score)" :severity="scoreSev(score.score)" style="font-size:1.1rem; font-weight:800; white-space:nowrap;" />
                  <div style="flex:1; min-width:0;">
                    <div class="score-type">{{ scoreTypeLabel(score) }}</div>
                    <div v-if="scoreBreakdown(score)" class="score-breakdown">{{ scoreBreakdown(score) }}</div>
                    <div v-if="score.vector" class="score-vector">{{ vectorDisplay(score) }}</div>
                    <div v-if="score.comment" class="score-comment">{{ score.comment }}</div>
                  </div>
                  <span v-if="score.isDefault" class="default-badge">default</span>
                  <div v-if="!coreReadonly" class="score-row__actions">
                    <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEditScore(score)" />
                    <Button icon="pi pi-trash" text size="small" severity="danger" @click="deleteScore(score)" />
                  </div>
                </div>
              </div>
              <p v-else class="empty-hint">No scores yet.</p>
            </div>
          </div>

          <!-- References -->
          <div class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">
                References
                <span v-if="finding.references.length" class="section-badge">{{ finding.references.length }}</span>
              </span>
              <Button v-if="!coreReadonly" icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add reference'" @click="openRefDialog" />
            </div>
            <div class="detail-grid__body">
              <ReferencesBlock :references="finding.references" :removable="!coreReadonly" @remove="deleteReference" />
            </div>
          </div>
        </div>

        <!-- Metadata -->
        <div class="ares-card detail-grid__meta" style="padding:0;">
          <div class="ares-card-section-header"><span class="section-header-label">Metadata</span></div>
          <div class="detail-grid__body">
            <dl class="ares-dl">
              <dt>Code</dt>
              <dd class="finding-code" style="display:inline-block;">{{ finding.code || 'draft' }}</dd>

              <template v-if="finding.iterationLabel || project?.iterationCadence">
                <dt>Iteration</dt>
                <dd style="display:flex; align-items:center; gap:0.4rem;">
                  <span>{{ finding.iterationLabel ?? '—' }}</span>
                  <Button
                    v-if="canMoveIteration"
                    icon="pi pi-arrow-right-arrow-left"
                    text
                    size="small"
                    severity="secondary"
                    v-tooltip="'Move to a different iteration'"
                    style="width:1.6rem; height:1.6rem; padding:0;"
                    @click="openMoveIterationDialog"
                  />
                </dd>
              </template>

              <dt>Project</dt>
              <dd>{{ project?.name ?? ('#' + finding.projectId) }}</dd>

              <dt>Priority</dt>
              <dd><SeverityTag :level="finding.severity" scale="priority" /></dd>

              <dt>Status</dt>
              <dd style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                <AresBadge
                  :value="statusLabel(finding.statusName)"
                  :severity="statusSeverity(finding.statusName)"
                />
                <AresBadge v-if="!finding.isDraft && finding.remediationStatus === 'open'"
                  value="Assets open" severity="warn" style="font-size:0.68rem; padding:0.1rem 0.4rem;"
                />
              </dd>

              <dt>Tags</dt>
              <dd>
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.4rem;">
                  <TagChipList :tags="finding.tags" :limit="6" />
                  <Button
                    v-if="!coreReadonly"
                    icon="pi pi-pencil"
                    text
                    size="small"
                    severity="secondary"
                    v-tooltip="'Edit tags'"
                    style="width:1.6rem; height:1.6rem; padding:0;"
                    @click="showTagEditor = true"
                  />
                </div>
              </dd>

              <dt>Created</dt>
              <dd>{{ finding.createdAt.slice(0, 10) }}</dd>

              <dt>Published</dt>
              <dd>{{ finding.reportedAt ? finding.reportedAt.slice(0, 10) : '—' }}</dd>

              <template v-if="!finding.isDraft">
                <dt>Due date</dt>
                <dd style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                  <template v-if="!editingDue">
                    <span :style="{ color: finding.dueDate && new Date(finding.dueDate) < new Date() ? 'var(--ares-error)' : 'inherit' }">
                      {{ finding.dueDate ? new Date(finding.dueDate).toLocaleDateString() : '—' }}
                    </span>
                    <Button v-if="!coreReadonly" icon="pi pi-pencil" text size="small" severity="secondary"
                      v-tooltip.top="'Edit deadline'" @click="openDuePicker" />
                  </template>
                  <template v-else>
                    <DatePicker v-model="duePickerVal" show-button-bar date-format="yy-mm-dd" :first-day-of-week="1" style="width:160px;" />
                    <Button icon="pi pi-check" size="small" severity="success" text @click="saveDueDate" />
                    <Button icon="pi pi-times" size="small" severity="secondary" text @click="editingDue = false" />
                  </template>
                </dd>
              </template>

              <template v-if="finding.resolvedAt">
                <dt>Resolved</dt>
                <dd>{{ new Date(finding.resolvedAt).toLocaleString() }}</dd>
              </template>

              <dt>Affections</dt>
              <dd>{{ finding.affections.length }}</dd>

              <dt>Last modified</dt>
              <dd>{{ finding.updatedAt ? finding.updatedAt.slice(0, 10) : '—' }}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- ── Fields ──────────────────────────────────────────────── -->
      <div class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">
            Fields
            <span v-if="sortedFields.length" class="section-badge">{{ sortedFields.length }}</span>
          </span>
          <Button v-if="!coreReadonly" icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add field'" @click="openAddField" />
        </div>
        <div class="detail-grid__body">
          <div v-if="sortedFields.length" class="field-list">
            <div v-for="field in sortedFields" :key="field.id" class="field-block" :class="{ 'field-block--editing': editingFieldId === field.id }">
              <div class="field-block__header">
                <p class="field-label">{{ field.typeTitle }}</p>
                <div v-if="!coreReadonly">
                  <span v-if="editingFieldId !== field.id" class="field-block__edit-btn" style="display:flex; gap:0.15rem;">
                    <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="startEditField(field)" />
                    <Button v-if="!isFieldRequired(field.typeId)" icon="pi pi-trash" text size="small" severity="danger" @click="deleteField(field)" />
                  </span>
                  <span v-else style="display:flex; gap:0.25rem;">
                    <Button icon="pi pi-check" size="small" severity="success" text @click="saveField(finding.id, field.id)" />
                    <Button icon="pi pi-times" size="small" severity="secondary" text @click="editingFieldId = null" />
                  </span>
                </div>
              </div>
              <!-- Editing mode -->
              <MarkdownEditor v-if="!coreReadonly && editingFieldId === field.id"
                v-model="editingFieldText"
                :organization-id="Number(route.params.orgId)"
                :project-id="finding?.projectId"
                editor-style="min-height:120px; max-height:400px; overflow-y:auto;"
              />
              <!-- Read mode -->
              <MarkdownView v-else :source="field.fieldText" />
            </div>
          </div>
          <p v-else class="empty-hint">No fields defined yet.</p>
        </div>
      </div>

      <!-- ── Affections ──────────────────────────────────────────── -->
      <div class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">
            Affections
            <span v-if="finding.affections.length" class="section-badge">{{ finding.affections.length }}</span>
          </span>
          <Button v-if="!coreReadonly" icon="pi pi-plus" size="small" severity="secondary" text
            v-tooltip.left="'Add affection'" @click="openAddAffection" />
        </div>
        <div class="detail-grid__body">
        <div v-if="finding.affections.length" class="aff-list">
        <div v-for="aff in finding.affections" :key="aff.id" class="aff-card">
          <div class="aff-card__header" :style="{ background: affHeaderColor(aff.status) + '18', borderColor: affHeaderColor(aff.status) + '40' }">
            <code class="finding-code aff-card__code">{{ aff.code }}</code>
            <span class="aff-card__title">{{ aff.title ?? 'Untitled affection' }}</span>
            <AresBadge
              :value="aff.status === 'closed' ? 'Closed' : 'Open'"
              :severity="aff.status === 'closed' ? 'success' : 'danger'"
              style="font-size:0.65rem; padding:0.1rem 0.4rem;"
            />
            <span class="aff-card__date">{{ aff.createdAt.slice(0, 10) }}</span>
            <div v-if="!coreReadonly" style="display:flex; gap:0.15rem; margin-left:auto; flex-shrink:0;">
              <Button v-if="aff.status === 'open'" icon="pi pi-check-circle" text size="small" severity="success"
                v-tooltip.top="aff.affects.some(a => a.status === 'open') ? 'Close affection' : 'No affected assets to resolve — add one first'"
                :disabled="!aff.affects.some(a => a.status === 'open')"
                @click="openCloseAffectionDialog(aff)" />
              <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEditAffection(aff)" />
            </div>
          </div>
          <MarkdownView v-if="aff.description" :source="aff.description" class="aff-card__body" />
          <div v-if="aff.detectedAt.length" class="asset-rel">
            <div class="asset-rel-head">
              <span>Detected</span>
              <span>Affects</span>
            </div>
            <div v-for="d in aff.detectedAt" :key="d.id" class="asset-rel-row">
              <!-- Detected side -->
              <div class="asset-rel-col asset-rel-col--detected">
                <div class="asset-rel-asset">
                  <span class="asset-type-badge">{{ ASSET_TYPE_LABELS[d.type] ?? d.type }}</span>
                  <span class="asset-rel-ident">{{ d.identifier }}</span>
                  <span v-if="d.observedAt" class="asset-rel-date">
                    <i class="pi pi-calendar" style="font-size:0.65rem;" />
                    {{ new Date(d.observedAt).toLocaleDateString() }}
                  </span>
                </div>
                <div v-if="!readonly && d.detections?.length" class="det-rows">
                  <div
                    v-for="det in d.detections"
                    :key="det.id"
                    class="det-row"
                    @click="goToDetection(det.id)"
                  >
                    <i class="pi pi-search det-row-icon" />
                    <span class="det-row-code">#{{ det.id }}</span>
                    <span class="det-row-title">{{ det.title }}</span>
                    <span class="det-row-status" :class="'det-status--' + det.status">
                      {{ det.status.replace(/_/g, ' ') }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Affects side — assets consequently affected via this detected asset -->
              <div class="asset-rel-col asset-rel-col--affects">
                <template v-if="d.affects.length">
                  <div
                    v-for="af in d.affects"
                    :key="af.id"
                    class="asset-rel-asset asset-rel-asset--link"
                    @click.stop="goToAsset(af.id)"
                  >
                    <span class="asset-type-badge">{{ ASSET_TYPE_LABELS[af.type] ?? af.type }}</span>
                    <span class="asset-rel-ident">{{ af.identifier }}</span>
                    <button
                      :class="['aff-status-btn', 'aff-status-btn--' + af.status]"
                      :title="readonly ? affectStatusLabel(af.status) : 'Click to change status'"
                      @click.stop="!readonly && openStatusDialog(aff.id, Number(af.id), af.status, (ASSET_TYPE_LABELS[af.type] ?? af.type) + ' — ' + af.identifier)"
                    >
                      {{ affectStatusLabel(af.status) }}
                      <i v-if="!readonly" class="pi pi-chevron-down" style="font-size:0.55rem;" />
                    </button>
                  </div>
                </template>
                <span v-else class="asset-rel-empty">No assets affected</span>
              </div>
            </div>
          </div>
        </div>
        </div>
        <p v-else class="empty-hint">No affections recorded.</p>
        </div>
      </div>

      <!-- ── History (hidden; data is still recorded) ─────────────── -->

    </template>

    <!-- ── References dialog ──────────────────────────────────────── -->
    <ReferencesDialog
      v-model:visible="showRefDialog"
      v-model="tempRefs"
      @update:model-value="applyRefs"
    />

    <!-- ── Score dialog (add / edit single score) ─────────────────── -->
    <ScoreDialog
      v-model:visible="showScoreDialog"
      :score-types="scoreTypes"
      :editing="editingScore"
      @save="saveScore"
    />

    <!-- ── Add field dialog ───────────────────────────────────────── -->
    <AddFieldDialog
      v-model:visible="showAddField"
      :field-types="fieldTypes"
      :existing-type-ids="finding ? finding.fields.map((f) => f.typeId) : []"
      @add="addField"
    />

    <!-- ── Save-as-template dialog ─────────────────────────────────── -->
    <Dialog v-model:visible="showSaveTemplate" modal header="Save as finding template"
      :style="{ width: 'min(28rem, 95vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.25rem;">
        <div style="font-size:0.8rem; color:var(--ares-text-muted);">
          Snapshots the title, severity, fields, default scores and references into a new
          KB template. The finding itself isn't changed.
        </div>
        <div>
          <label class="occ-dlg-label">Title</label>
          <InputText v-model="templateTitleOverride" class="ares-input" style="width:100%;" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.25rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showSaveTemplate = false" />
          <Button label="Save" icon="pi pi-check" size="small"
            :loading="templateSaving" :disabled="!templateTitleOverride.trim()"
            @click="saveAsTemplate" />
        </div>
      </div>
    </Dialog>

    <!-- ── Affect status change dialog ──────────────────────────────── -->
    <Dialog v-if="statusPending" v-model:visible="showStatusDialog" header="Change status"
      modal :style="{ width: 'min(420px, 96vw)' }"
      :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem' } }">
      <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.5rem;">
        <div style="font-size:0.85rem; color:var(--ares-text-2);">{{ statusPending.label }}</div>
        <div>
          <label class="occ-dlg-label">New status</label>
          <Select v-model="newAffectStatus"
            :options="AFFECT_STATUSES.map(s => ({ label: affectStatusLabel(s), value: s }))"
            option-label="label" option-value="value" style="width:100%;" />
        </div>
        <div>
          <label class="occ-dlg-label">Note <span style="font-weight:400; color:var(--ares-text-muted);">(optional)</span></label>
          <Textarea v-model="affectNote" class="ares-textarea" style="width:100%;" rows="3"
            placeholder="Justification, evidence link, ticket reference…" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showStatusDialog = false" />
          <Button label="Apply" icon="pi pi-check" size="small" :loading="changingStatus"
            :disabled="newAffectStatus === statusPending.current"
            @click="applyStatusChange" />
        </div>
      </div>
    </Dialog>

    <!-- affect status history dialog hidden; re-enable when ready -->

    <!-- ── Close affection dialog ──────────────────────────────────── -->
    <Dialog v-if="closingAffection" v-model:visible="showCloseAffectionDialog" header="Close affection"
      modal :style="{ width: 'min(480px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.5rem;">
        <div style="font-size:0.85rem; color:var(--ares-text-2);">
          Closing <strong>{{ closingAffection.code }}</strong> requires every affected asset to leave the
          "Open" state. Choose the outcome for each one still open below.
        </div>
        <div v-if="closeAffectionRows.length" style="display:flex; flex-direction:column; gap:0.6rem;">
          <div v-for="row in closeAffectionRows" :key="row.id" style="display:flex; align-items:center; gap:0.6rem;">
            <span style="flex:1; font-size:0.82rem;">{{ row.label }}</span>
            <Select v-model="row.status"
              :options="AFFECT_STATUSES.filter(s => s !== 'open').map(s => ({ label: affectStatusLabel(s), value: s }))"
              option-label="label" option-value="value" style="width:170px;" size="small" />
          </div>
        </div>
        <p v-else style="font-size:0.82rem; color:var(--ares-text-muted); margin:0;">
          No affected assets are linked to this affection — add at least one before it can be closed.
        </p>
        <div v-if="closeAffectionRows.length">
          <label class="occ-dlg-label">Note <span style="font-weight:400; color:var(--ares-text-muted);">(optional, applied to all)</span></label>
          <Textarea v-model="closeAffectionNote" class="ares-textarea" style="width:100%;" rows="2"
            placeholder="Justification, evidence link, ticket reference…" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showCloseAffectionDialog = false" />
          <Button label="Close affection" icon="pi pi-check" size="small" severity="success"
            :loading="closingAffectionBusy" :disabled="!closeAffectionRows.length"
            @click="confirmCloseAffection" />
        </div>
      </div>
    </Dialog>

    <!-- ── Close finding dialog ─────────────────────────────────────── -->
    <Dialog v-if="finding" v-model:visible="showCloseFindingDialog" header="Close finding"
      modal :style="{ width: 'min(520px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.5rem;">
        <div v-if="closeFindingRows.length" style="font-size:0.85rem; color:var(--ares-text-2);">
          This finding still has {{ closeFindingRows.length }} affected asset{{ closeFindingRows.length === 1 ? '' : 's' }} in
          the "Open" state. Choose the outcome for each before closing.
        </div>
        <div v-if="closeFindingRows.length" style="display:flex; flex-direction:column; gap:0.6rem; max-height:260px; overflow-y:auto;">
          <div v-for="row in closeFindingRows" :key="row.affectionId + '-' + row.id" style="display:flex; align-items:center; gap:0.6rem;">
            <span style="flex:1; font-size:0.82rem;">{{ row.label }}</span>
            <Select v-model="row.status"
              :options="AFFECT_STATUSES.filter(s => s !== 'open').map(s => ({ label: affectStatusLabel(s), value: s }))"
              option-label="label" option-value="value" style="width:170px;" size="small" />
          </div>
        </div>
        <div>
          <label class="occ-dlg-label">Close as</label>
          <Select v-model="closeFindingTargetStatus"
            :options="(['resolved', 'accepted_risk', 'false_positive'] as const).map(s => ({ label: statusLabel(s), value: s }))"
            option-label="label" option-value="value" style="width:100%;" />
          <p v-if="closeFindingTargetStatus === 'false_positive'" style="font-size:0.72rem; color:var(--ares-text-muted); margin:0.35rem 0 0;">
            This status has no reopen path — use it only when the finding is confirmed to not be a real issue.
          </p>
        </div>
        <div v-if="closeFindingRows.length">
          <label class="occ-dlg-label">Note <span style="font-weight:400; color:var(--ares-text-muted);">(optional, applied to all)</span></label>
          <Textarea v-model="closeFindingNote" class="ares-textarea" style="width:100%;" rows="2"
            placeholder="Justification, evidence link, ticket reference…" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showCloseFindingDialog = false" />
          <Button label="Close finding" icon="pi pi-check" size="small" severity="success"
            :loading="closingFindingBusy" @click="confirmCloseFinding" />
        </div>
      </div>
    </Dialog>

    <!-- ── Affection dialog (add + edit) ─────────────────────────────── -->
    <AffectionDialog
      v-if="finding"
      v-model:visible="showAffectionDialog"
      :finding-id="finding.id"
      :project-id="finding.projectId"
      :org-id="Number(route.params.orgId)"
      :affection="editingAffection"
      @saved="(f) => { finding = f }"
    />

    <!-- Edit this finding's tags -->
    <EntityTagEditDialog
      v-if="finding && route.params.orgId"
      v-model:visible="showTagEditor"
      :org-id="Number(route.params.orgId)"
      :assigned-tags="finding?.tags"
      :assign="assignTag"
      :unassign="unassignTag"
    />

    <!-- Report this finding by email — manual, no workflow required -->
    <ReportFindingByEmailDialog
      v-if="finding"
      v-model:visible="showReportDialog"
      :finding-id="finding.id"
      :project-id="finding.projectId"
    />

    <!-- Move to a different iteration (MONITOR projects only) -->
    <Dialog v-model:visible="showMoveIterationDialog" modal :draggable="false" :style="{ width: 'min(420px, 96vw)' }">
      <template #header><span style="font-weight:600;">Move iteration</span></template>
      <div style="display:flex; flex-direction:column; gap:0.9rem;">
        <p style="margin:0; font-size:0.82rem; color:var(--ares-text-muted);">
          Re-codes this finding (and its affections) under the target iteration.
        </p>
        <Select
          v-model="iterationTarget"
          :options="iterationOptions"
          editable
          placeholder="Iteration label"
          style="width:100%;"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showMoveIterationDialog = false" />
        <Button label="Move" :loading="movingIteration" :disabled="!iterationTarget" @click="confirmMoveIteration" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
/* ── Title inline editor ─────────────────────────────────────────── */
.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.title-row--editing { gap: 0.4rem; flex: 1; min-width: 0; }
.title-edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ares-text-muted);
  padding: 0.2rem;
  font-size: 0.85rem;
  transition: color 0.12s;
}
.title-edit-btn:hover {
  color: var(--ares-text-1);
}
.title-input {
  flex: 1;
  min-width: 0;
  font-size: 1.25rem;
  font-weight: 600;
  padding: 0.35rem 0.6rem;
}

:deep(.ares-textarea) {
  background: var(--ares-surface-raised) !important;
  color: var(--ares-text) !important;
  border-color: var(--ares-border) !important;
}
:deep(.ares-textarea::placeholder) { color: var(--ares-text-muted) !important; }
:deep(.ares-textarea:focus) { border-color: var(--p-primary-500) !important; outline: none; }

/* ── Section headers ─────────────────────────────────────────────── */
/* ── Scores/References (left, 2/3) + Metadata (right, 1/3) row ───── */
.detail-grid {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}
.detail-grid__data {
  flex: 2;
  order: 1;
  min-width: 0;
}
.detail-grid__meta {
  flex: 1;
  order: 2;
  min-width: 0;
}
.detail-grid--stacked {
  flex-direction: column;
  align-items: stretch;
}
.detail-grid--stacked .detail-grid__meta {
  order: 1;
}
.detail-grid--stacked .detail-grid__data {
  order: 2;
}
.detail-grid__body {
  padding: 1rem 1.25rem 1.25rem;
}
.ares-dl {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.4rem 1rem;
  font-size: 0.85rem;
}
.ares-dl dt {
  color: var(--ares-text-muted);
  font-size: 0.8rem;
  padding-top: 0.1rem;
}
.ares-dl dd {
  margin: 0;
  color: var(--ares-text-2);
  line-height: 1.5;
}

.section-header-label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.section-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  line-height: 1;
}

/* ── Finding code badge ──────────────────────────────────────────── */
.finding-code {
  font-family: monospace;
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.1em 0.55em;
  color: var(--ares-text-2);
}
.finding-code.draft {
  color: var(--ares-text-muted);
  font-style: italic;
}

/* ── Score list ──────────────────────────────────────────────────── */
.score-list {
  display: flex;
  flex-direction: column;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--ares-border);
  min-width: 0;
  max-width: 100%;
}
.score-list > .score-row:first-child { padding-top: 0; }
.score-list > .score-row:last-child { padding-bottom: 0; border-bottom: none; }
.score-row__actions {
  display: flex;
  gap: 0.15rem;
  flex-shrink: 0;
}
.score-type { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-2); }
.score-breakdown { font-size: 0.7rem; font-weight: 600; color: var(--ares-text-muted); }
.score-vector {
  font-family: monospace;
  font-size: 0.65rem;
  color: var(--ares-text-muted);
  overflow-wrap: break-word;
  word-break: break-all;
}
.score-comment { font-size: 0.75rem; color: var(--ares-text-muted); font-style: italic; margin-top: 0.1rem; }
.default-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 35%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1em 0.4em;
}

/* ── Field block ─────────────────────────────────────────────────── */
.field-list {
  display: flex;
  flex-direction: column;
}
.field-block { padding-bottom: 0.85rem; }
.field-list > .field-block:last-child:not(.field-block--editing) { padding-bottom: 0; margin-bottom: -1.25rem; }
.field-list > .field-block:last-child.field-block--editing { padding-bottom: 0.85rem; margin-bottom: 0; }
.field-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -1.25rem 0.6rem;
  padding: 0.4rem 1.25rem;
  background: var(--ares-surface-2);
  border-top: 1px solid var(--ares-border);
  border-bottom: 1px solid var(--ares-border);
}
.field-list > .field-block:first-child .field-block__header { margin-top: -1rem; }
.field-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ares-text-muted);
  margin: 0;
}

/* ── Affection card (flowing row, matches Scores/Fields/References) ── */
.aff-list { display: flex; flex-direction: column; }
.aff-card { padding-bottom: 0.6rem; }
.aff-list > .aff-card:last-child { margin-bottom: -1.25rem; }
.aff-card__header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 -1.25rem 0.6rem;
  padding: 0.5rem 1.25rem;
  border-top: 1px solid transparent;
  border-bottom: 1px solid transparent;
}
.aff-list > .aff-card:first-child .aff-card__header { margin-top: -1rem; }
.aff-card__code { flex-shrink: 0; }
.aff-card__title { font-size: 0.88rem; font-weight: 600; flex: 1; }
.aff-card__date { font-size: 0.75rem; color: var(--ares-text-muted); flex-shrink: 0; }
.aff-card__body { padding: 0.5rem 0 0; }

/* ── Assets (detected / affects, two-column) ─────────────────────── */
.asset-rel {
  position: relative;
  border-top: 1px solid var(--ares-border);
  margin: 0.5rem -1.25rem 0;
  padding: 0.35rem 1.25rem 0;
}
/* Single continuous divider spanning the full height of the mini-table
   (head row through the last row), replacing the old per-row border-right
   which only ran alongside each row's own content and looked segmented. */
.asset-rel::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: -0.6rem;
  left: 50%;
  width: 1px;
  background: var(--ares-border);
}
.asset-rel-head {
  display: flex;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
  margin: 0 -1.25rem;
  padding: 0 1.25rem 0.3rem;
  border-bottom: 1px solid var(--ares-border);
}
.asset-rel-head span { flex: 1; }
.asset-rel-head span:first-child { padding-right: 0.9rem; }
.asset-rel-head span:last-child { padding-left: 0.9rem; }
.asset-rel-row {
  display: flex;
  margin: 0 -1.25rem;
  padding: 0.5rem 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);
}
.asset-rel-row:first-child { border-top: none; padding-top: 0; }
.asset-rel-row:last-child { padding-bottom: 0; }
.asset-rel-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.asset-rel-col--detected { padding-right: 0.9rem; }
.asset-rel-col--affects { padding-left: 0.9rem; }
.asset-rel-asset {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.asset-rel-asset--link { cursor: pointer; }
.asset-rel-asset--link:hover .asset-rel-ident { color: var(--p-primary-400); }
.asset-rel-ident {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ares-text-1);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-rel-date {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  flex-shrink: 0;
  margin-left: auto;
}
.asset-rel-empty { font-size: 0.78rem; color: var(--ares-text-muted); font-style: italic; }

.asset-type-badge {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15em 0.5em;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

/* Affect status button — clickable badge */
.aff-status-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: var(--ares-radius);
  border: 1px solid transparent;
  cursor: default;
  white-space: nowrap;
  transition: filter 0.15s;
}
.aff-status-btn[title*="change"] { cursor: pointer; }
.aff-status-btn:hover[title*="change"] { filter: brightness(1.15); }

.aff-status-btn--open {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 30%, transparent);
}
.aff-status-btn--resolved {
  background: color-mix(in srgb, #22c55e 12%, transparent);
  color: #22c55e;
  border-color: color-mix(in srgb, #22c55e 30%, transparent);
}
.aff-status-btn--accepted_risk {
  background: color-mix(in srgb, #f97316 12%, transparent);
  color: #f97316;
  border-color: color-mix(in srgb, #f97316 30%, transparent);
}
.aff-status-btn--false_positive {
  background: color-mix(in srgb, var(--ares-text-muted) 12%, transparent);
  color: var(--ares-text-muted);
  border-color: color-mix(in srgb, var(--ares-text-muted) 30%, transparent);
}

/* ── Detection rows (below each detected-at asset) ───────────────────────── */
.det-rows {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-left: 1.25rem;
}
.det-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0;
  cursor: pointer;
  border-radius: var(--ares-radius);
  transition: background 0.1s;
}
.det-row:hover { background: color-mix(in srgb, var(--p-primary-500) 6%, transparent); }
.det-row-icon { font-size: 0.6rem; color: var(--ares-text-muted); flex-shrink: 0; }
.det-row-code {
  font-size: 0.68rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--ares-accent);
  flex-shrink: 0;
}
.det-row-title {
  font-size: 0.75rem;
  color: var(--ares-text-2);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.det-row-status {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 0.12rem 0.4rem;
  border-radius: var(--ares-radius);
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}
.det-status--new                 { background: color-mix(in srgb, #3b82f6 12%, transparent); color: #3b82f6; border-color: color-mix(in srgb, #3b82f6 30%, transparent); }
.det-status--under_investigation { background: color-mix(in srgb, #a855f7 12%, transparent); color: #a855f7; border-color: color-mix(in srgb, #a855f7 30%, transparent); }
.det-status--affected            { background: color-mix(in srgb, #f97316 12%, transparent); color: #f97316; border-color: color-mix(in srgb, #f97316 30%, transparent); }
.det-status--reopened            { background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444; border-color: color-mix(in srgb, #ef4444 30%, transparent); }
.det-status--fixed               { background: color-mix(in srgb, #22c55e 12%, transparent); color: #22c55e; border-color: color-mix(in srgb, #22c55e 30%, transparent); }
.det-status--not_affected,
.det-status--ignored             { background: color-mix(in srgb, var(--ares-text-muted) 10%, transparent); color: var(--ares-text-muted); border-color: color-mix(in srgb, var(--ares-text-muted) 20%, transparent); }

.aff-history-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  background: none;
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.7rem;
  transition: color 0.1s, border-color 0.1s;
}
.aff-history-btn:hover { color: var(--p-primary-400); border-color: var(--p-primary-400); }


/* ── History ─────────────────────────────────────────────────────── */
.history-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--ares-border);
}
.history-row:last-child { border-bottom: none; }
.history-status { font-size: 0.85rem; font-weight: 600; flex: 1; color: var(--ares-accent); }
.history-date { font-size: 0.75rem; color: var(--ares-text-muted); }

/* ── Empty hint ──────────────────────────────────────────────────── */
.empty-hint { font-size: 0.83rem; color: var(--ares-text-muted); padding: 0.75rem 0; margin: 0; }

/* ── Occurrence dialog label ─────────────────────────────────────── */
.occ-dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  letter-spacing: 0.02em;
  margin-bottom: 0.35rem;
}
</style>
