<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { findingTemplatesApi } from '@/api/finding-templates';
import { findingFieldTypesApi, type FindingFieldType } from '@/api/finding-field-types';
import { findingsApi, type FindingScoreType } from '@/api/findings';
import { referencesApi, type ReferenceCatalog, type ReferenceEntry } from '@/api/references';
import SeverityTag from '@/components/SeverityTag.vue';
import AresBadge from '@/components/AresBadge.vue';
import ScoreDialog, { type EditingScore, type ScoreSavePayload } from '@/components/ScoreDialog.vue';
import ReferencesDialog from '@/components/ReferencesDialog.vue';
import ReferencesBlock from '@/components/ReferencesBlock.vue';
import AddFieldDialog from '@/components/AddFieldDialog.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import MarkdownView from '@/components/MarkdownView.vue';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import { scoreToSeverity, PRIORITY_SCALE, cvss40ClassificationFromVector, cvss31ScoresFromVector, cvss20ScoresFromVector } from '@/utils/cvss';
import { resolveSsvcMethodologyNames } from '@/utils/ssvcTree';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { confirmDialog } from '@/composables/useConfirmDialog';
import TagChipList from '@/components/TagChipList.vue';
import EntityTagEditDialog from '@/components/EntityTagEditDialog.vue';

const { isMobile } = useBreakpoint();

const route  = useRoute();
const router = useRouter();
const toast  = useToast();
const id     = Number(route.params.id);

const template   = ref<Awaited<ReturnType<typeof findingTemplatesApi.get>> | null>(null);
const fieldTypes = ref<FindingFieldType[]>([]);
const scoreTypes = ref<FindingScoreType[]>([]);
const refCatalogs = ref<ReferenceCatalog[]>([]);
const loading    = ref(true);
const err        = ref<string | null>(null);

// ── Tags — platform tags only, FindingTemplate has no organization of its own ──
const showTagEditor = ref(false);
async function assignTag(tagId: number) {
  if (!template.value) return;
  template.value = await findingTemplatesApi.assignTag(template.value.id, tagId);
}
async function unassignTag(tagId: number) {
  if (!template.value) return;
  template.value = await findingTemplatesApi.unassignTag(template.value.id, tagId);
}
/** leafNodeId -> methodology + role display names (e.g. "CISAv1"/"CISA"), for annotating the
 *  bare "SSVC" type label with which methodology AND role produced that score — see
 *  resolveSsvcMethodologyNames. */
const ssvcMethodologyNames = ref<Map<number, { methodologyName: string; roleName: string }>>(new Map());

// ── Title editing ──────────────────────────────────────────────────
const editingTitle  = ref(false);
const editTitleVal  = ref('');
const savingTitle   = ref(false);

function startEditTitle() {
  editTitleVal.value = template.value?.title ?? '';
  editingTitle.value = true;
}
async function saveTitle() {
  if (!editTitleVal.value.trim()) return;
  savingTitle.value = true;
  try {
    template.value = await findingTemplatesApi.updateMeta(id, { title: editTitleVal.value.trim() });
    editingTitle.value = false;
  } catch { toast.add({ severity: 'error', summary: 'Failed to save title', life: 3000 }); }
  finally { savingTitle.value = false; }
}

// ── Field editing ──────────────────────────────────────────────────
const editingFieldId   = ref<number | null>(null);
const editingFieldText = ref('');
const savingField      = ref(false);

function startEditField(field: { id: number; fieldText: string | null }) {
  editingFieldId.value   = field.id;
  editingFieldText.value = field.fieldText ?? '';
}
async function saveField(fieldId: number) {
  savingField.value = true;
  try {
    template.value = await findingTemplatesApi.updateField(id, fieldId, editingFieldText.value);
    editingFieldId.value = null;
  } catch { toast.add({ severity: 'error', summary: 'Failed to save field', life: 3000 }); }
  finally { savingField.value = false; }
}

// ── Add field (via AddFieldDialog) ─────────────────────────────────
const showAddField = ref(false);
function openAddField() { showAddField.value = true; }
async function addField(typeId: number) {
  try {
    template.value = await findingTemplatesApi.addField(id, typeId);
    showAddField.value = false;
  } catch { toast.add({ severity: 'error', summary: 'Failed to add field', life: 4000 }); }
}

function isFieldRequired(typeId: number): boolean {
  return fieldTypes.value.find((t) => t.id === typeId)?.isRequired ?? false;
}

async function deleteField(field: { id: number; typeId: number }) {
  const ok = await confirmDialog({
    header: 'Delete field',
    message: `Delete the "${fieldTypeName(field.typeId)}" field?`,
  });
  if (!ok) return;
  try {
    template.value = await findingTemplatesApi.removeField(id, field.id);
  } catch { toast.add({ severity: 'error', summary: 'Failed to delete field', life: 4000 }); }
}

// ── Score editing (via ScoreDialog: add or edit a single score) ─────
const showScoreDialog = ref(false);
const editingScore    = ref<EditingScore | null>(null);
const editingScoreId  = ref<number | null>(null);

function openAddScore() {
  editingScore.value = null;
  editingScoreId.value = null;
  showScoreDialog.value = true;
}

function openEditScore(s: { id: number; typeId: number; score: number | string; metadata?: string | null; isDefault: boolean; ssvcLeafNodeId?: number | null }) {
  editingScore.value = {
    typeId: s.typeId,
    typeName: scoreTypeName(s.typeId),
    score: Number(s.score),
    vector: s.metadata ?? '',
    isDefault: s.isDefault,
    ssvcLeafNodeId: s.ssvcLeafNodeId,
  };
  editingScoreId.value = s.id;
  showScoreDialog.value = true;
}

// Severity is derived server-side from whichever row is default (see
// FindingTemplateService.replaceScores) — no client-side computation needed here
// anymore. Submitting zero default-flagged rows lets the backend auto-promote the
// first one, same fallback Finding scores already rely on.
async function saveScore(payload: ScoreSavePayload) {
  const current = template.value?.scores ?? [];
  const rows = editingScoreId.value
    ? current.map(s => s.id === editingScoreId.value
        ? { typeId: payload.typeId, score: payload.score, metadata: payload.vector || undefined, isDefault: payload.isDefault, ssvcLeafNodeId: payload.ssvcLeafNodeId ?? undefined }
        : { typeId: s.typeId, score: Number(s.score), metadata: s.metadata ?? undefined, isDefault: payload.isDefault ? false : s.isDefault, ssvcLeafNodeId: s.ssvcLeafNodeId ?? undefined })
    : [
        ...current.map(s => ({ typeId: s.typeId, score: Number(s.score), metadata: s.metadata ?? undefined, isDefault: payload.isDefault ? false : s.isDefault, ssvcLeafNodeId: s.ssvcLeafNodeId ?? undefined })),
        { typeId: payload.typeId, score: payload.score, metadata: payload.vector || undefined, isDefault: payload.isDefault, ssvcLeafNodeId: payload.ssvcLeafNodeId ?? undefined },
      ];
  try {
    template.value = await findingTemplatesApi.replaceScores(id, rows);
    showScoreDialog.value = false;
    toast.add({ severity: 'success', summary: 'Score saved', life: 2000 });
  } catch { toast.add({ severity: 'error', summary: 'Failed to save score', life: 3000 }); }
}

async function deleteScore(s: { id: number; typeId: number }) {
  const ok = await confirmDialog({
    header: 'Delete score',
    message: `Delete the ${scoreTypeName(s.typeId)} score?`,
  });
  if (!ok) return;
  const rows = (template.value?.scores ?? [])
    .filter(sc => sc.id !== s.id)
    .map(sc => ({ typeId: sc.typeId, score: Number(sc.score), metadata: sc.metadata ?? undefined, isDefault: sc.isDefault, ssvcLeafNodeId: sc.ssvcLeafNodeId ?? undefined }));
  try {
    template.value = await findingTemplatesApi.replaceScores(id, rows);
    toast.add({ severity: 'success', summary: 'Score deleted', life: 2000 });
  } catch { toast.add({ severity: 'error', summary: 'Failed to delete score', life: 3000 }); }
}

// ── Reference editing (add-only dialog, not preloaded) ──────────────
const showRefDialog = ref(false);
const tempRefs      = ref<ReferenceEntry[]>([]);

function openRefDialog() {
  tempRefs.value = [];
  showRefDialog.value = true;
}
async function applyRefs(newRefs: ReferenceEntry[]) {
  const existingIds = (template.value?.references ?? []).map(r => r.id);
  const unionIds = [...existingIds, ...newRefs.map(r => r.id).filter(rid => !existingIds.includes(rid))];
  try {
    template.value = await findingTemplatesApi.replaceReferences(id, unionIds);
    showRefDialog.value = false;
    toast.add({ severity: 'success', summary: 'References updated', life: 2000 });
  } catch { toast.add({ severity: 'error', summary: 'Failed to update references', life: 3000 }); }
}

async function deleteReference(ref: { id: number; title: string }) {
  const ok = await confirmDialog({
    header: 'Delete reference',
    message: `Remove the "${ref.title}" reference from this template?`,
  });
  if (!ok) return;
  const remainingIds = (template.value?.references ?? []).filter(r => r.id !== ref.id).map(r => r.id);
  try {
    template.value = await findingTemplatesApi.replaceReferences(id, remainingIds);
    toast.add({ severity: 'success', summary: 'Reference removed', life: 2000 });
  } catch { toast.add({ severity: 'error', summary: 'Failed to remove reference', life: 3000 }); }
}

// ── Helpers ────────────────────────────────────────────────────────
function fieldTypeName(typeId: number) {
  return fieldTypes.value.find(f => f.id === typeId)?.title ?? `Field #${typeId}`;
}
function scoreTypeName(typeId: number) {
  return scoreTypes.value.find(s => s.id === typeId)?.title ?? `Score #${typeId}`;
}
function scoreSev(score: number): string { return scoreToSeverity(score); }

/** SSVC shows its outcome word (e.g. "Out-of-Cycle"), read off the tail of its
 *  breadcrumb vector (stored in `metadata` — templates have no dedicated vector
 *  column) — not the underlying synthetic numeric score. Everything else keeps the
 *  plain "9.8"-style numeric display. */
function scoreDisplay(s: { typeId: number; score: number | string; metadata?: string | null }): string {
  const typeName = scoreTypeName(s.typeId);
  if (typeName === 'SSVC') {
    const v = s.metadata ?? '';
    const i = v.lastIndexOf('->');
    return i === -1 ? Number(s.score).toFixed(1) : v.slice(i + 2).trim();
  }
  if (typeName === 'Manual') return PRIORITY_SCALE.find((p) => p.score === Number(s.score))?.label ?? Number(s.score).toFixed(1);
  return Number(s.score).toFixed(1);
}

/** "SSVC" alone doesn't say which methodology (SSVCv2, CISAv1, a custom one...) produced
 *  the outcome — annotate it, e.g. "SSVC - CISAv1", when resolvable. Likewise "CVSS 4.0"
 *  alone doesn't say which metric groups were actually filled in — annotate it with its
 *  CVSS-B/BT/BE/BTE classification, e.g. "CVSS 4.0 - CVSS-BTE". */
function scoreTypeLabel(s: { typeId: number; metadata?: string | null; ssvcLeafNodeId?: number | null }): string {
  const base = scoreTypeName(s.typeId);
  if (base === 'SSVC' && s.ssvcLeafNodeId != null) {
    const entry = ssvcMethodologyNames.value.get(s.ssvcLeafNodeId);
    if (entry) return `SSVC - ${entry.methodologyName} (${entry.roleName})`;
  }
  if (base === 'CVSS 4.0' && s.metadata) {
    return `${base} - ${cvss40ClassificationFromVector(s.metadata)}`;
  }
  return base;
}

/** The vector line already reads "Question: Answer / ... -> Outcome" — the outcome is
 *  redundant there since it's already the big badge to the left, so it's trimmed off. */
function vectorDisplay(s: { typeId: number; metadata?: string | null }): string {
  const v = s.metadata ?? '';
  if (scoreTypeName(s.typeId) !== 'SSVC') return v;
  const i = v.lastIndexOf('->');
  return i === -1 ? v : v.slice(0, i).trim();
}

/** CVSS 3.1/2.0 store one "most refined" score, but up to 3 (Base/Temporal/
 *  Environmental) may actually apply — show only the ones that were filled in. */
function scoreBreakdown(s: { typeId: number; metadata?: string | null }): string | null {
  if (!s.metadata) return null;
  const typeName = scoreTypeName(s.typeId);
  if (typeName !== 'CVSS 3.1' && typeName !== 'CVSS 2.0') return null;
  const scores = typeName === 'CVSS 3.1' ? cvss31ScoresFromVector(s.metadata) : cvss20ScoresFromVector(s.metadata);
  const parts = [`Base ${scores.base.toFixed(1)}`];
  if (scores.temporal !== null) parts.push(`Temporal ${scores.temporal.toFixed(1)}`);
  if (scores.environmental !== null) parts.push(`Environmental ${scores.environmental.toFixed(1)}`);
  return parts.length > 1 ? parts.join(' · ') : null;
}

const sortedFields = computed(() => {
  if (!template.value?.fields) return [];
  const sortOrderOf = new Map(fieldTypes.value.map((t) => [t.id, t.sortOrder]));
  return [...template.value.fields].sort(
    (a, b) => (sortOrderOf.get(a.typeId) ?? 0) - (sortOrderOf.get(b.typeId) ?? 0)
  );
});

onMounted(async () => {
  try {
    const [tpl, fts, sts, cats] = await Promise.all([
      findingTemplatesApi.get(id),
      findingFieldTypesApi.list(),
      findingsApi.listScoreTypes(),
      referencesApi.listCatalogs(),
    ]);
    template.value   = tpl;
    fieldTypes.value = fts;
    scoreTypes.value = sts;
    refCatalogs.value = cats.items;
    const ssvcLeafIds = (tpl.scores ?? [])
      .filter((s) => sts.find((t) => t.id === s.typeId)?.title === 'SSVC')
      .map((s) => s.ssvcLeafNodeId);
    ssvcMethodologyNames.value = await resolveSsvcMethodologyNames(ssvcLeafIds);
  } catch {
    err.value = 'Failed to load template.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <ScoreDialog v-model:visible="showScoreDialog" :score-types="scoreTypes"
    :editing="editingScore" @save="saveScore" />
  <ReferencesDialog v-model:visible="showRefDialog"
    v-model="tempRefs" @update:model-value="applyRefs" />
  <AddFieldDialog v-model:visible="showAddField" :field-types="fieldTypes"
    :existing-type-ids="template ? template.fields.map((f) => f.typeId) : []" @add="addField" />

  <div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:4rem;">
      <ProgressSpinner />
    </div>
    <div v-else-if="err" class="ares-alert ares-alert--error">{{ err }}</div>

    <template v-else-if="template">

      <!-- ── Header ───────────────────────────────────────────────── -->
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.25rem;">
        <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
          <Button icon="pi pi-arrow-left" severity="secondary" text
            @click="router.push({ name: 'kb-finding-templates' })"
            style="flex-shrink:0;" />
          <div style="min-width:0; flex:1;">
            <!-- Title (editable) -->
            <div v-if="!editingTitle" style="display:flex; align-items:center; gap:0.5rem;">
              <h2 class="ares-page-title" style="margin:0;">{{ template.title }}</h2>
              <Button icon="pi pi-pencil" text size="small" severity="secondary"
                style="margin-top:0.1rem;" @click="startEditTitle" />
            </div>
            <div v-else style="display:flex; align-items:center; gap:0.5rem; max-width:600px;">
              <InputText v-model="editTitleVal" style="flex:1;" autofocus
                @keyup.enter="saveTitle" @keyup.escape="editingTitle = false" />
              <Button icon="pi pi-check" size="small" severity="success" text
                :loading="savingTitle" @click="saveTitle" />
              <Button icon="pi pi-times" size="small" severity="secondary" text
                @click="editingTitle = false" />
            </div>
          </div>
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
                <span v-if="template.scores?.length" class="section-badge">{{ template.scores.length }}</span>
              </span>
              <Button icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add score'"
                @click="openAddScore" />
            </div>
            <div class="detail-grid__body">
              <div v-if="template.scores?.length" class="score-list">
                <div v-for="s in template.scores" :key="s.id" class="score-row">
                  <AresBadge :value="scoreDisplay(s)" :severity="scoreSev(Number(s.score)) as any"
                    style="font-size:1.1rem; font-weight:800; white-space:nowrap;" />
                  <div style="flex:1; min-width:0;">
                    <div class="score-type">{{ scoreTypeLabel(s) }}</div>
                    <div v-if="scoreBreakdown(s)" class="score-breakdown">{{ scoreBreakdown(s) }}</div>
                    <div v-if="s.metadata" class="score-vector">{{ vectorDisplay(s) }}</div>
                  </div>
                  <span v-if="s.isDefault" class="default-badge">default</span>
                  <div class="score-row__actions">
                    <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEditScore(s)" />
                    <Button icon="pi pi-trash" text size="small" severity="danger" @click="deleteScore(s)" />
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
                <span v-if="template.references?.length" class="section-badge">{{ template.references.length }}</span>
              </span>
              <Button icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add reference'"
                @click="openRefDialog" />
            </div>
            <div class="detail-grid__body">
              <ReferencesBlock :references="template.references ?? []" removable @remove="deleteReference" />
            </div>
          </div>
        </div>

        <!-- Metadata -->
        <div class="ares-card detail-grid__meta" style="padding:0;">
          <div class="ares-card-section-header"><span class="section-header-label">Metadata</span></div>
          <div class="detail-grid__body">
            <dl class="ares-dl">
              <dt>Code</dt>
              <dd style="font-family:monospace;">#{{ template.id }}</dd>

              <dt>Priority</dt>
              <dd><SeverityTag :level="template.severity" scale="priority" /></dd>

              <dt>Tags</dt>
              <dd>
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.4rem;">
                  <TagChipList :tags="template.tags" :limit="6" />
                  <Button
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
              <dd>{{ template.createdAt.slice(0, 10) }}</dd>

              <dt>Last modified</dt>
              <dd>{{ template.updatedAt ? template.updatedAt.slice(0, 10) : '—' }}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- ── Fields ────────────────────────────────────────────────── -->
      <div class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">
            Fields
            <span v-if="sortedFields.length" class="section-badge">{{ sortedFields.length }}</span>
          </span>
          <Button icon="pi pi-plus" size="small" severity="secondary" text v-tooltip.left="'Add field'" @click="openAddField" />
        </div>
        <div class="detail-grid__body">
          <div v-if="sortedFields.length" class="field-list">
            <div v-for="f in sortedFields" :key="f.id" class="field-block" :class="{ 'field-block--editing': editingFieldId === f.id }">
              <div class="field-block__header">
                <p class="field-label">{{ fieldTypeName(f.typeId) }}</p>
                <div>
                  <span v-if="editingFieldId !== f.id" class="field-block__edit-btn" style="display:flex; gap:0.15rem;">
                    <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="startEditField(f)" />
                    <Button v-if="!isFieldRequired(f.typeId)" icon="pi pi-trash" text size="small" severity="danger" @click="deleteField(f)" />
                  </span>
                  <span v-else style="display:flex; gap:0.25rem;">
                    <Button icon="pi pi-check" size="small" severity="success" text
                      :loading="savingField" @click="saveField(f.id)" />
                    <Button icon="pi pi-times" size="small" severity="secondary" text
                      @click="editingFieldId = null" />
                  </span>
                </div>
              </div>
              <MarkdownEditor v-if="editingFieldId === f.id"
                v-model="editingFieldText"
                editor-style="min-height:120px; max-height:400px; overflow-y:auto;" />
              <MarkdownView v-else :source="f.fieldText" />
            </div>
          </div>
          <p v-else class="empty-hint">No fields defined.</p>
        </div>
      </div>

    </template>

    <!-- Edit this template's tags -->
    <EntityTagEditDialog
      v-if="template"
      v-model:visible="showTagEditor"
      platform
      :assigned-tags="template?.tags"
      :assign="assignTag"
      :unassign="unassignTag"
    />
  </div>
</template>

<style scoped>
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
.finding-code {
  font-family: monospace; font-size: 0.78rem; font-weight: 700;
  background: var(--ares-surface-raised); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.1em 0.55em;
  color: var(--ares-text-muted); font-style: italic;
}


/* Score strip */
.score-list { display:flex; flex-direction:column; }
.score-row   { display:flex; align-items:center; gap:0.65rem; padding:0.85rem 0; border-bottom:1px solid var(--ares-border); min-width:0; max-width:100%; }
.score-list > .score-row:first-child { padding-top:0; }
.score-list > .score-row:last-child { padding-bottom:0; border-bottom:none; }
.score-row__actions { display:flex; gap:0.15rem; flex-shrink:0; }
.default-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 35%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1em 0.4em;
  flex-shrink: 0;
}
.score-type  { font-size:0.8rem; font-weight:600; color:var(--ares-text-2); }
.score-breakdown { font-size:0.7rem; font-weight:600; color:var(--ares-text-muted); }
.score-vector { font-family:monospace; font-size:0.65rem; color:var(--ares-text-muted); overflow-wrap:break-word; word-break:break-all; }


/* Field block */
.field-list { display:flex; flex-direction:column; }
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
.field-label { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--ares-text-muted); margin:0; }

/* Empty hint */
.empty-hint { font-size:0.83rem; color:var(--ares-text-muted); padding:0.75rem 0; margin:0; }
</style>
