<script setup lang="ts">
// Escalation wizard — step 2a: create a new Finding (fields/scores/references only — no
// affection here, that's step 3). Extracted from FindingFormDialog.vue's sections 1-5 verbatim;
// section 6 (affection) is gone since affection handling now lives in its own wizard step
// (AffectionDialog, reused). On Next, creates the finding via findingsApi.create() with no
// affection and hands the new id forward — the wizard resolves the affection afterward.
import { computed, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Message from 'primevue/message';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useToast } from 'primevue/usetoast';
import AresBadge from '@/components/AresBadge.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import { type ScoreRow } from '@/components/ScoreEditorDialog.vue';
import ScoreDialog, { type EditingScore, type ScoreSavePayload } from '@/components/ScoreDialog.vue';
import ReferencesDialog from '@/components/ReferencesDialog.vue';
import ReferencesBlock from '@/components/ReferencesBlock.vue';
import { findingsApi, type FindingScoreType } from '@/api/findings';
import { findingTemplatesApi, type FindingTemplate } from '@/api/finding-templates';
import { findingFieldTypesApi, type FindingFieldType } from '@/api/finding-field-types';
import { referencesApi, type ReferenceCatalog, type ReferenceEntry } from '@/api/references';
import type { Detection } from '@/api/detections';
import { resolveSsvcMethodologyNames } from '@/utils/ssvcTree';
import {
  scoreToSeverity, PRIORITY_SCALE,
  cvss40ClassificationFromVector, cvss31ScoresFromVector, cvss20ScoresFromVector,
} from '@/utils/cvss';

const props = defineProps<{
  visible: boolean;
  projectId: number;
  /** Detections being escalated (direct or via a Research Board) — their default scores and
   *  references are pre-seeded here, same merge FindingFormDialog's applyDetectionData() did.
   *  Absent for the standalone "New Finding" entry point. */
  contextDetections?: Detection[];
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  back: [];
  next: [findingId: number];
}>();

const toast = useToast();

// ── option lists ──────────────────────────────────────────────────────────────
const templates = ref<FindingTemplate[]>([]);
const fieldTypes = ref<FindingFieldType[]>([]);
const scoreTypes = ref<FindingScoreType[]>([]);
const refCatalogs = ref<ReferenceCatalog[]>([]);

// ── form state ────────────────────────────────────────────────────────────────
const templateId = ref<number | null>(null);
const title = ref('');

interface MandatoryField { typeId: number; typeName: string; fieldText: string }
interface ExtraField { typeId: number | null; typeName: string; fieldText: string }

const mandatoryFields = ref<MandatoryField[]>([]);
const extraFields = ref<ExtraField[]>([]);

const scores = ref<ScoreRow[]>([]);
const selectedRefs = ref<ReferenceEntry[]>([]);

const saving = ref(false);
const error = ref('');

const showRefDialog = ref(false);

// ── Scores (via ScoreDialog: add or edit one at a time, same as FindingDetailView) ──
// Purely in-memory here — nothing is persisted until the wizard's final step, so
// add/edit/delete just mutate the local `scores` array instead of calling any API.
const showScoreDialog = ref(false);
const editingScore = ref<EditingScore | null>(null);
const editingScoreIdx = ref<number | null>(null);

function openAddScore() {
  editingScore.value = null;
  editingScoreIdx.value = null;
  showScoreDialog.value = true;
}
function openEditScore(idx: number) {
  const s = scores.value[idx];
  editingScore.value = {
    typeId: s.typeId, typeName: s.typeName, score: s.score, vector: s.vector,
    isDefault: s.isDefault, comment: s.comment ?? '', ssvcLeafNodeId: s.ssvcLeafNodeId,
  };
  editingScoreIdx.value = idx;
  showScoreDialog.value = true;
}
function saveScore(payload: ScoreSavePayload) {
  const typeName = scoreTypes.value.find((t) => t.id === payload.typeId)?.title ?? String(payload.typeId);
  const row: ScoreRow = {
    id: editingScoreIdx.value != null ? scores.value[editingScoreIdx.value].id : undefined,
    typeId: payload.typeId, typeName, score: payload.score, vector: payload.vector,
    isDefault: payload.isDefault, comment: payload.comment, ssvcLeafNodeId: payload.ssvcLeafNodeId ?? null,
  };
  if (editingScoreIdx.value != null) {
    const idx = editingScoreIdx.value;
    const updated = scores.value.map((s, i) => i === idx ? row : s);
    scores.value = row.isDefault ? updated.map((s, i) => ({ ...s, isDefault: i === idx })) : updated;
  } else {
    const isDefault = scores.value.length === 0 ? true : payload.isDefault;
    const newRow = { ...row, isDefault };
    scores.value = isDefault ? [...scores.value.map((s) => ({ ...s, isDefault: false })), newRow] : [...scores.value, newRow];
  }
  showScoreDialog.value = false;
}
function deleteScore(idx: number) {
  scores.value = scores.value.filter((_, i) => i !== idx);
}

// SSVC rows show their methodology/role name (e.g. "SSVC - CISAv1 (Coordinator)")
// instead of the bare "SSVC" type label — same resolution FindingDetailView does.
const ssvcMethodologyNames = ref<Map<number, { methodologyName: string; roleName: string }>>(new Map());
watch(scores, async (list) => {
  const ssvcLeafIds = list.filter((s) => s.typeName === 'SSVC').map((s) => s.ssvcLeafNodeId);
  ssvcMethodologyNames.value = await resolveSsvcMethodologyNames(ssvcLeafIds);
}, { deep: true, immediate: true });

function scoreSev(score: number): string {
  return scoreToSeverity(score);
}
/** SSVC shows its outcome word off the tail of its breadcrumb vector; Manual shows its
 *  P0-P4 label; everything else is the plain numeric score. */
function scoreDisplay(s: ScoreRow): string {
  if (s.typeName === 'SSVC') {
    const v = s.vector ?? '';
    const i = v.lastIndexOf('->');
    return i === -1 ? s.score.toFixed(1) : v.slice(i + 2).trim();
  }
  if (s.typeName === 'Manual') return PRIORITY_SCALE.find((p) => p.score === s.score)?.label ?? s.score.toFixed(1);
  return s.score.toFixed(1);
}
function scoreTypeLabel(s: ScoreRow): string {
  if (s.typeName === 'SSVC' && s.ssvcLeafNodeId != null) {
    const entry = ssvcMethodologyNames.value.get(s.ssvcLeafNodeId);
    if (entry) return `SSVC - ${entry.methodologyName} (${entry.roleName})`;
  }
  if (s.typeName === 'CVSS 4.0' && s.vector) return `${s.typeName} - ${cvss40ClassificationFromVector(s.vector)}`;
  return s.typeName;
}
function vectorDisplay(s: ScoreRow): string {
  const v = s.vector ?? '';
  if (s.typeName !== 'SSVC') return v;
  const i = v.lastIndexOf('->');
  return i === -1 ? v : v.slice(0, i).trim();
}
function scoreBreakdown(s: ScoreRow): string | null {
  if (!s.vector) return null;
  if (s.typeName !== 'CVSS 3.1' && s.typeName !== 'CVSS 2.0') return null;
  const b = s.typeName === 'CVSS 3.1' ? cvss31ScoresFromVector(s.vector) : cvss20ScoresFromVector(s.vector);
  const parts = [`Base ${b.base.toFixed(1)}`];
  if (b.temporal !== null) parts.push(`Temporal ${b.temporal.toFixed(1)}`);
  if (b.environmental !== null) parts.push(`Environmental ${b.environmental.toFixed(1)}`);
  return parts.length > 1 ? parts.join(' · ') : null;
}

// ── computed ──────────────────────────────────────────────────────────────────
const selectedTemplate = computed(() => templates.value.find((t) => t.id === templateId.value) ?? null);
const nonMandatoryFieldTypes = computed(() => {
  const mandatory = new Set(mandatoryFields.value.map((f) => f.typeId));
  return fieldTypes.value.filter((ft) => !mandatory.has(ft.id));
});
const defaultScore = computed(() => scores.value.find((s) => s.isDefault) ?? scores.value[0] ?? null);
const computedSeverity = computed(() => defaultScore.value ? scoreToSeverity(defaultScore.value.score) : null);
const canNext = computed(() => title.value.trim().length > 0);
const selectedRefIds = computed(() => selectedRefs.value.map((r) => r.id));

// ReferencesBlock (same rendering FindingDetailView uses) needs catalogCode, which
// ReferenceEntry doesn't carry — resolve it from the loaded catalog list.
const referencesForBlock = computed(() => selectedRefs.value.map((r) => ({
  ...r,
  catalogCode: refCatalogs.value.find((c) => c.id === r.catalogId)?.code ?? '?',
})));

function initMandatoryFields(tpl?: FindingTemplate) {
  const required = fieldTypes.value.filter((ft) => ft.isRequired).sort((a, b) => a.sortOrder - b.sortOrder);
  const tplMap = new Map(tpl?.fields.map((f) => [f.typeId, f.fieldText ?? '']) ?? []);
  mandatoryFields.value = required.map((ft) => ({
    typeId: ft.id,
    typeName: ft.title,
    fieldText: tplMap.get(ft.id) ?? '',
  }));
}

// The metadata column stores CVSS vectors as a JSON string ("CVSS:3.1/...").
function parseMetadataVector(metadata: string | null): string {
  if (!metadata) return '';
  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed === 'string' ? parsed : metadata;
  } catch {
    return metadata;
  }
}

// Union scores/references across every escalating detection — same shape
// FindingFormDialog's applyDetectionData() produced for a single detection, extended to a
// batch: when two+ detections carry a default score of the same type, the highest wins (the
// analyst can still edit/remove it below before submitting).
function seedFromContextDetections() {
  const dets = props.contextDetections ?? [];
  if (!dets.length) return;

  const byType = new Map<number, { typeId: number; typeTitle: string; score: number; metadata: string | null; isDefault: boolean }>();
  for (const det of dets) {
    for (const ds of det.scores) {
      const existing = byType.get(ds.typeId);
      if (!existing || Number(ds.score) > existing.score) {
        byType.set(ds.typeId, { typeId: ds.typeId, typeTitle: ds.typeTitle, score: Number(ds.score), metadata: ds.metadata, isDefault: ds.isDefault });
      }
    }
  }
  scores.value = [...byType.values()].map((ds) => ({
    id: undefined,
    typeId: ds.typeId,
    typeName: ds.typeTitle,
    score: ds.score,
    vector: parseMetadataVector(ds.metadata),
    isDefault: ds.isDefault,
    comment: '',
  }));

  const refMap = new Map<number, ReferenceEntry>();
  for (const det of dets) {
    for (const dr of det.references ?? []) {
      if (!refMap.has(dr.id)) refMap.set(dr.id, { id: dr.id, catalogId: dr.catalogId, title: dr.title, description: '' });
    }
  }
  selectedRefs.value = [...refMap.values()];
}

// ── reset when dialog opens ───────────────────────────────────────────────────
watch(() => props.visible, (open) => {
  if (!open) return;
  templateId.value = null;
  title.value = '';
  scores.value = [];
  selectedRefs.value = [];
  error.value = '';
  initMandatoryFields();
  extraFields.value = [];
  seedFromContextDetections();
});

// ── template watcher ──────────────────────────────────────────────────────────
watch(templateId, async (id) => {
  if (!id) { initMandatoryFields(); extraFields.value = []; return; }
  const tpl = await findingTemplatesApi.get(id).catch(() => null);
  if (!tpl) return;
  title.value = tpl.title;
  initMandatoryFields(tpl);
  const mandatoryTypeIds = new Set(mandatoryFields.value.map((f) => f.typeId));
  extraFields.value = tpl.fields
    .filter((f) => !mandatoryTypeIds.has(f.typeId))
    .map((f) => ({
      typeId: f.typeId,
      typeName: fieldTypes.value.find((ft) => ft.id === f.typeId)?.title ?? 'Field',
      fieldText: f.fieldText ?? '',
    }));
  scores.value = tpl.scores.map((s, i) => ({
    id: undefined,
    typeId: s.typeId,
    typeName: scoreTypes.value.find((st) => st.id === s.typeId)?.title ?? String(s.typeId),
    score: Number(s.score),
    vector: parseMetadataVector(s.metadata),
    isDefault: i === 0,
    comment: '',
  }));
  const existingRefIds = new Set(selectedRefs.value.map((r) => r.id));
  const newTplRefs = tpl.references
    .filter((r) => !existingRefIds.has(r.id))
    .map((r) => ({ id: r.id, catalogId: r.catalogId, title: r.title, description: r.description }));
  selectedRefs.value = [...selectedRefs.value, ...newTplRefs];
  // Re-apply context detection data so it merges back in rather than being lost under the template.
  seedFromContextDetections();
});

watch(fieldTypes, () => { if (props.visible) initMandatoryFields(); }, { once: false });

function addExtraField() { extraFields.value.push({ typeId: null, typeName: '', fieldText: '' }); }
function removeExtraField(idx: number) { extraFields.value.splice(idx, 1); }
function onExtraFieldTypeChange(idx: number, typeId: number) {
  const ft = fieldTypes.value.find((f) => f.id === typeId);
  extraFields.value[idx].typeName = ft?.title ?? '';
  extraFields.value[idx].typeId = typeId;
}

function clearTemplate() { templateId.value = null; }
function removeRef(id: number) { selectedRefs.value = selectedRefs.value.filter((r) => r.id !== id); }

async function next() {
  if (!canNext.value) return;
  error.value = '';
  saving.value = true;
  try {
    const validFields = [
      ...mandatoryFields.value.map((f) => ({ typeId: f.typeId, fieldText: f.fieldText })),
      ...extraFields.value.filter((f) => f.typeId !== null).map((f) => ({ typeId: f.typeId!, fieldText: f.fieldText })),
    ];
    const validScores = scores.value.map((s) => ({
      typeId: s.typeId, score: s.score, vector: s.vector || undefined, isDefault: s.isDefault,
      ssvcLeafNodeId: s.ssvcLeafNodeId ?? undefined,
    }));

    const created = await findingsApi.create({
      projectId: props.projectId,
      title: title.value.trim(),
      templateId: templateId.value ?? undefined,
      isDraft: true,
      fields: validFields,
      scores: validScores.length ? validScores : undefined,
      referenceIds: selectedRefIds.value.length ? selectedRefIds.value : undefined,
      // No affection — the wizard's next step (existing AffectionDialog) creates or picks one.
    });

    emit('next', created.id);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message ?? 'Failed to create finding';
    toast.add({ severity: 'error', summary: 'Failed to create finding', detail: error.value, life: 5000 });
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const [tpls, fts, sts, cats] = await Promise.all([
    findingTemplatesApi.list({ size: 200 }),
    findingFieldTypesApi.list(),
    findingsApi.listScoreTypes(),
    referencesApi.listCatalogs(),
  ]);
  templates.value = tpls.items;
  fieldTypes.value = fts;
  scoreTypes.value = sts;
  refCatalogs.value = cats.items;
  initMandatoryFields();
});
</script>

<template>
  <ScoreDialog v-model:visible="showScoreDialog" :score-types="scoreTypes" :editing="editingScore" @save="saveScore" />
  <ReferencesDialog v-model:visible="showRefDialog" v-model="selectedRefs" />

  <Dialog
    :visible="visible"
    header="New finding"
    modal
    :style="{ width: 'min(940px, 96vw)' }"
    :pt="{ content: { style: 'padding:0;' } }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="nfs-body">
      <form @submit.prevent="next" style="display:flex; flex-direction:column; gap:1.1rem;">

        <!-- ── Template ──────────────────────────────────────────────── -->
        <div class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Template <span class="badge-opt">optional</span></span>
          </div>
          <div class="fs-body">
            <div v-if="!templateId">
              <Select
                v-model="templateId"
                :options="templates"
                option-label="title"
                option-value="id"
                placeholder="Search finding templates…"
                filter
                show-clear
                style="width:100%;"
              />
            </div>
            <div v-else class="inset" style="display:flex; align-items:center; justify-content:space-between;">
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <i class="pi pi-file" style="color:var(--ares-accent-muted);" />
                <div>
                  <div style="font-weight:600; font-size:0.88rem;">{{ selectedTemplate?.title }}</div>
                  <div style="font-size:0.73rem; color:var(--ares-text-muted);">{{ selectedTemplate?.fields.length ?? 0 }} fields imported</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:0.4rem;">
                <SeverityTag :level="selectedTemplate?.severity" scale="priority" />
                <Button icon="pi pi-times" severity="secondary" text size="small" @click="clearTemplate" />
              </div>
            </div>
          </div>
        </div>

        <!-- ── Finding title ─────────────────────────────────────────── -->
        <div class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Finding title <span class="req">*</span></span>
          </div>
          <div class="fs-body">
            <InputText v-model="title" style="width:100%;" placeholder="e.g. SQL Injection in /api/login" autofocus />
          </div>
        </div>

        <!-- ── Scores ────────────────────────────────────────────────── -->
        <div class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">
              Priorization <span class="badge-opt">optional</span>
              <span v-if="scores.length" class="section-badge">{{ scores.length }}</span>
            </span>
            <Button icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add score'" @click="openAddScore" />
          </div>
          <div class="fs-body">
            <div v-if="defaultScore" class="severity-row">
              <span class="fl" style="margin:0;">Priority</span>
              <SeverityTag :level="computedSeverity" scale="priority" />
              <span style="font-size:0.75rem; color:var(--ares-text-muted);">
                from {{ scoreTypeLabel(defaultScore) }} {{ scoreDisplay(defaultScore) }}
              </span>
            </div>
            <div v-else class="severity-row" style="opacity:0.5;">
              <span class="fl" style="margin:0;">Priority</span>
              <SeverityTag :level="null" scale="priority" />
              <span style="font-size:0.78rem; color:var(--ares-text-muted);">Computed automatically from scores</span>
            </div>

            <div v-if="scores.length" class="score-list" style="margin-top:0.65rem;">
              <div v-for="(s, idx) in scores" :key="idx" class="score-row">
                <AresBadge :value="scoreDisplay(s)" :severity="scoreSev(s.score) as any" style="font-size:1.1rem; font-weight:800; white-space:nowrap;" />
                <div style="flex:1; min-width:0;">
                  <div class="score-type">{{ scoreTypeLabel(s) }}</div>
                  <div v-if="scoreBreakdown(s)" class="score-breakdown">{{ scoreBreakdown(s) }}</div>
                  <div v-if="s.vector" class="score-vector">{{ vectorDisplay(s) }}</div>
                  <div v-if="s.comment" class="score-comment">{{ s.comment }}</div>
                </div>
                <span v-if="s.isDefault" class="default-badge">default</span>
                <div class="score-row__actions">
                  <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEditScore(idx)" />
                  <Button icon="pi pi-trash" text size="small" severity="danger" @click="deleteScore(idx)" />
                </div>
              </div>
            </div>
            <p v-else class="hint">Add CVSS 4.0, 3.1, 2.0, SSVC or a manual P0-P4 score. Priority is set automatically.</p>
          </div>
        </div>

        <!-- ── References ────────────────────────────────────────────── -->
        <div class="ares-card" style="padding:0; overflow:hidden;">
          <div class="ares-card-section-header">
            <span class="section-header-label">
              References <span class="badge-opt">optional</span>
              <span v-if="selectedRefs.length" class="section-badge">{{ selectedRefs.length }}</span>
            </span>
            <Button icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add reference'" @click="showRefDialog = true" />
          </div>
          <div class="fs-body">
            <ReferencesBlock :references="referencesForBlock" removable @remove="(item) => removeRef(item.id)" />
          </div>
        </div>

        <!-- ── Fields ────────────────────────────────────────────────── -->
        <div class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">
              Fields
              <span v-if="mandatoryFields.length + extraFields.length" class="section-badge">{{ mandatoryFields.length + extraFields.length }}</span>
            </span>
            <Button icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add field'" @click="addExtraField" />
          </div>
          <div class="fs-body">
            <div style="display:flex; flex-direction:column; gap:0.85rem;">
              <div v-for="field in mandatoryFields" :key="field.typeId" class="field-block">
                <label class="fl">
                  {{ field.typeName }} <span class="req">*</span>
                </label>
                <MarkdownEditor
                  v-model="field.fieldText"
                  editor-style="min-height:90px; max-height:280px; overflow-y:auto;"
                  :placeholder="'Enter ' + field.typeName.toLowerCase() + '…'"
                />
              </div>
            </div>

            <div v-if="extraFields.length" style="display:flex; flex-direction:column; gap:0.85rem; margin-top:0.85rem; padding-top:0.85rem; border-top:1px solid var(--ares-border);">
              <div v-for="(field, idx) in extraFields" :key="idx" class="field-block">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
                  <Select
                    :model-value="field.typeId"
                    :options="nonMandatoryFieldTypes"
                    option-label="title"
                    option-value="id"
                    placeholder="Field type…"
                    style="width:220px;"
                    @update:model-value="(v) => onExtraFieldTypeChange(idx, v)"
                  />
                  <Button icon="pi pi-trash" severity="secondary" text size="small" @click="removeExtraField(idx)" />
                </div>
                <MarkdownEditor
                  v-model="field.fieldText"
                  editor-style="min-height:80px; max-height:240px; overflow-y:auto;"
                  placeholder="Content…"
                />
              </div>
            </div>
          </div>
        </div>

        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

        <div style="display:flex; gap:0.65rem; justify-content:flex-end;">
          <Button type="button" label="Back" severity="secondary" text @click="emit('back')" />
          <Button type="submit" label="Next" icon="pi pi-arrow-right" icon-pos="right" :loading="saving" :disabled="!canNext" />
        </div>
      </form>
    </div>
  </Dialog>
</template>

<style scoped>
.nfs-body { padding: 1.25rem 1.5rem 1.5rem; max-height: 82vh; overflow-y: auto; display: flex; flex-direction: column; gap: 1.1rem; }

/* Section headers use the global .ares-card-section-header (same padding everywhere) instead
   of a locally-rolled one, so every section lines up — that's what was misaligned before. */
.section-header-label { display: inline-flex; align-items: center; gap: 0.45rem; }
.section-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--ares-radius);
  background: var(--ares-surface-raised); border: 1px solid var(--ares-border);
  font-size: 0.68rem; font-weight: 600; color: var(--ares-text-muted); line-height: 1;
}
.fs-body { padding: 1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; }

.badge-opt {
  font-size: 0.65rem; font-weight: 400; color: var(--ares-text-muted);
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius); padding: 0.05em 0.4em;
}
.req { color: #ef4444; }

.fl { display: block; font-size: 0.78rem; font-weight: 600; color: var(--ares-text-muted); letter-spacing: 0.02em; margin-bottom: 0.3rem; }
.hint { font-size: 0.78rem; color: var(--ares-text-muted); margin: 0.2rem 0 0; }

.inset { background: var(--ares-surface-sunken); border: 1px solid var(--ares-border); border-radius: var(--ares-radius); padding: 0.75rem 1rem; }

.field-block { display: flex; flex-direction: column; }

.severity-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.45rem 0.75rem;
  background: var(--ares-surface-sunken); border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
}

/* ── Score list — mirrors FindingDetailView's own .score-list/.score-row ────────── */
.score-list { display: flex; flex-direction: column; }
.score-row {
  display: flex; align-items: center; gap: 0.65rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--ares-border);
  min-width: 0; max-width: 100%;
}
.score-list > .score-row:first-child { padding-top: 0; }
.score-list > .score-row:last-child { padding-bottom: 0; border-bottom: none; }
.score-row__actions { display: flex; gap: 0.15rem; flex-shrink: 0; }
.score-type { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-2); }
.score-breakdown { font-size: 0.7rem; font-weight: 600; color: var(--ares-text-muted); }
.score-vector { font-family: monospace; font-size: 0.65rem; color: var(--ares-text-muted); overflow-wrap: break-word; word-break: break-all; }
.score-comment { font-size: 0.75rem; color: var(--ares-text-muted); font-style: italic; margin-top: 0.1rem; }
.default-badge {
  font-size: 0.65rem; font-weight: 700; color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 35%, transparent);
  border-radius: var(--ares-radius); padding: 0.08em 0.4em; flex-shrink: 0;
}

@media (max-width: 767px) {
  .nfs-body { padding: 0.75rem 1rem 1rem; }
}
</style>
