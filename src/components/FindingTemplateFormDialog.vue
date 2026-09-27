<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Message from 'primevue/message';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import ScoreEditorDialog, { type ScoreRow } from '@/components/ScoreEditorDialog.vue';
import ReferencesDialog from '@/components/ReferencesDialog.vue';
import { findingTemplateApi } from '@/api/kb';
import { findingFieldTypesApi, type FindingFieldType } from '@/api/finding-field-types';
import { findingsApi, type FindingScoreType } from '@/api/findings';
import { referencesApi, type ReferenceCatalog, type ReferenceEntry } from '@/api/references';
import { scoreToSeverity, PRIORITY_SCALE } from '@/utils/cvss';

const props = defineProps<{ visible: boolean }>();
const emit  = defineEmits<{
  'update:visible': [boolean];
  'created': [];
}>();

// ── Option lists ───────────────────────────────────────────────────────────
const fieldTypes  = ref<FindingFieldType[]>([]);
const scoreTypes  = ref<FindingScoreType[]>([]);
const refCatalogs = ref<ReferenceCatalog[]>([]);

// ── Form state ─────────────────────────────────────────────────────────────
const title    = ref('');
const scores   = ref<ScoreRow[]>([]);
const selectedRefs = ref<ReferenceEntry[]>([]);

interface FieldEntry { typeId: number; typeName: string; fieldText: string }
const mandatoryFields = ref<FieldEntry[]>([]);

interface ExtraField { typeId: number | null; typeName: string; fieldText: string }
const extraFields = ref<ExtraField[]>([]);

const saving = ref(false);
const error  = ref('');

const showScoreEditor = ref(false);
const showRefDialog   = ref(false);

// ── Computed ───────────────────────────────────────────────────────────────
const defaultScore = computed(() => scores.value.find((s) => s.isDefault) ?? scores.value[0] ?? null);
// null (no priority yet — shown as the "P?" placeholder) when there's no default
// score, matching FindingTemplateService's server-side derivation, which is the
// actual source of truth; this is only a live preview of that same computation.
const computedSeverity = computed(() => defaultScore.value ? scoreToSeverity(defaultScore.value.score) : null);
function defaultScoreDisplay(): string {
  const s = defaultScore.value;
  if (!s) return '';
  return scoreChipDisplay(s);
}

function scoreChipDisplay(s: { typeName: string; score: number; vector?: string }): string {
  if (s.typeName === 'SSVC') {
    const v = s.vector ?? '';
    const i = v.lastIndexOf('->');
    return i === -1 ? s.score.toFixed(1) : v.slice(i + 2).trim();
  }
  if (s.typeName === 'Manual') return PRIORITY_SCALE.find((p) => p.score === s.score)?.label ?? s.score.toFixed(1);
  return s.score.toFixed(1);
}
const nonMandatoryFieldTypes = computed(() => {
  const mandatory = new Set(mandatoryFields.value.map((f) => f.typeId));
  return fieldTypes.value.filter((ft) => !mandatory.has(ft.id));
});

function catalogLabel(catalogId: number): string {
  return refCatalogs.value.find((c) => c.id === catalogId)?.code ?? '?';
}

function removeRef(id: number) { selectedRefs.value = selectedRefs.value.filter((r) => r.id !== id); }

// ── Init mandatory fields ──────────────────────────────────────────────────
function initMandatory() {
  const required = fieldTypes.value.filter((ft) => ft.isRequired).sort((a, b) => a.sortOrder - b.sortOrder);
  mandatoryFields.value = required.map((ft) => ({ typeId: ft.id, typeName: ft.title, fieldText: '' }));
}

// ── Reset on open ──────────────────────────────────────────────────────────
watch(() => props.visible, (open) => {
  if (!open) return;
  title.value      = '';
  scores.value     = [];
  selectedRefs.value = [];
  extraFields.value = [];
  error.value      = '';
  initMandatory();
});

// ── Extra field helpers ────────────────────────────────────────────────────
function addExtra() { extraFields.value.push({ typeId: null, typeName: '', fieldText: '' }); }
function removeExtra(idx: number) { extraFields.value.splice(idx, 1); }
function onExtraTypeChange(idx: number, typeId: number) {
  const ft = fieldTypes.value.find((f) => f.id === typeId);
  extraFields.value[idx].typeName = ft?.title ?? '';
  extraFields.value[idx].typeId   = typeId;
}

// ── Submit ─────────────────────────────────────────────────────────────────
async function submit() {
  if (!title.value.trim()) { error.value = 'Title is required.'; return; }
  error.value = '';
  saving.value = true;
  try {
    const fields = [
      ...mandatoryFields.value.map((f) => ({ typeId: f.typeId, fieldText: f.fieldText })),
      ...extraFields.value.filter((f) => f.typeId !== null).map((f) => ({ typeId: f.typeId!, fieldText: f.fieldText })),
    ].filter((f) => f.fieldText.trim());

    const scorePayload = scores.value.map((s) => ({
      typeId: s.typeId,
      score: s.score,
      metadata: s.vector || undefined,
      ssvcLeafNodeId: s.ssvcLeafNodeId ?? undefined,
    }));

    await findingTemplateApi.create({
      title: title.value.trim(),
      fields: fields.length ? fields : undefined,
      scores: scorePayload.length ? scorePayload : undefined,
    });

    emit('created');
    emit('update:visible', false);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message ?? 'Failed to create template';
  } finally {
    saving.value = false;
  }
}

function close() { emit('update:visible', false); }

onMounted(async () => {
  const [fts, sts, cats] = await Promise.all([
    findingFieldTypesApi.list(),
    findingsApi.listScoreTypes(),
    referencesApi.listCatalogs(),
  ]);
  fieldTypes.value  = fts;
  scoreTypes.value  = sts;
  refCatalogs.value = cats.items;
  initMandatory();
});
</script>

<template>
  <ScoreEditorDialog v-model:visible="showScoreEditor" :score-types="scoreTypes" v-model="scores" />
  <ReferencesDialog  v-model:visible="showRefDialog"   v-model="selectedRefs" />

  <Dialog
    :visible="visible"
    header="New finding template"
    modal
    :style="{ width: 'min(860px, 95vw)' }"
    :pt="{ content: { style: 'padding:1.25rem 1.5rem 1.5rem; overflow-y:auto; max-height:82vh;' } }"
    @update:visible="close"
  >
    <form @submit.prevent="submit" style="display:flex; flex-direction:column; gap:1.1rem;">

      <!-- ── 1. Title ─────────────────────────────────────────────────── -->
      <section class="fs">
        <div class="fs-head">
          <span class="fs-num">1</span>
          <h3 class="fs-title">Title <span class="req">*</span></h3>
        </div>
        <InputText v-model="title" style="width:100%;" placeholder="e.g. SQL Injection" autofocus />
      </section>

      <!-- ── 2. Scores ────────────────────────────────────────────────── -->
      <section class="fs">
        <div class="fs-head">
          <span class="fs-num">2</span>
          <h3 class="fs-title">Priorization <span class="badge-opt">optional</span></h3>
          <Button
            type="button"
            :icon="scores.length ? 'pi pi-pencil' : 'pi pi-plus'"
            :label="scores.length ? 'Edit scores (' + scores.length + ')' : 'Add scores'"
            size="small" severity="secondary" style="margin-left:auto;"
            @click="showScoreEditor = true"
          />
        </div>

        <!-- Priority row — mirrors FindingFormDialog -->
        <div v-if="defaultScore" class="severity-row">
          <span class="fl" style="margin:0;">Priority</span>
          <SeverityTag :level="computedSeverity" scale="priority" />
          <span style="font-size:0.75rem; color:var(--ares-text-muted);">
            from {{ defaultScore.typeName }} {{ defaultScoreDisplay() }}
          </span>
        </div>
        <div v-else class="severity-row" style="opacity:0.5;">
          <span class="fl" style="margin:0;">Priority</span>
          <SeverityTag :level="null" scale="priority" />
          <span style="font-size:0.78rem; color:var(--ares-text-muted);">Computed automatically from scores</span>
        </div>

        <div v-if="scores.length" style="display:flex; flex-direction:column; gap:0.35rem; margin-top:0.65rem;">
          <div v-for="(s, idx) in scores" :key="idx" class="score-chip">
            <span class="score-chip-val" :class="'sev-' + scoreToSeverity(s.score)">{{ scoreChipDisplay(s) }}</span>
            <span class="score-chip-name">{{ s.typeName }}</span>
            <span v-if="s.vector" class="score-chip-vector">{{ s.vector }}</span>
            <span v-if="s.isDefault" class="score-chip-default">default</span>
            ordi</div>
        </div>
        <p v-else class="hint">Add CVSS 4.0, 3.1, 2.0, SSVC or a manual P0-P4 score. Priority is set automatically when scores are present.</p>
      </section>

      <!-- ── 3. References ────────────────────────────────────────────── -->
      <section class="fs">
        <div class="fs-head">
          <span class="fs-num">3</span>
          <h3 class="fs-title">References <span class="badge-opt">optional</span></h3>
          <Button
            type="button"
            :icon="selectedRefs.length ? 'pi pi-pencil' : 'pi pi-plus'"
            :label="selectedRefs.length ? 'Edit references (' + selectedRefs.length + ')' : 'Add references'"
            size="small" severity="secondary" style="margin-left:auto;"
            @click="showRefDialog = true"
          />
        </div>
        <div v-if="selectedRefs.length" style="display:flex; flex-wrap:wrap; gap:0.35rem;">
          <div v-for="ref in selectedRefs" :key="ref.id" class="ref-chip">
            <span class="ref-chip-cat">{{ catalogLabel(ref.catalogId) }}</span>
            <span>{{ ref.title }}</span>
            <button type="button" class="ref-chip-x" @click="removeRef(ref.id)">×</button>
          </div>
        </div>
        <p v-else class="hint">Link CWEs, CAPEC patterns, ATT&amp;CK techniques or OWASP entries.</p>
      </section>

      <!-- ── 4. Fields ─────────────────────────────────────────────────── -->
      <section class="fs">
        <div class="fs-head">
          <span class="fs-num">4</span>
          <h3 class="fs-title">Fields</h3>
          <Button type="button" icon="pi pi-plus" label="Add field" size="small" severity="secondary"
            style="margin-left:auto;" @click="addExtra" />
        </div>

        <div style="display:flex; flex-direction:column; gap:0.85rem;">
          <div v-for="field in mandatoryFields" :key="field.typeId" class="field-block">
            <label class="fl">{{ field.typeName }} <span class="req">*</span></label>
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
                @update:model-value="(v) => onExtraTypeChange(idx, v)"
              />
              <Button icon="pi pi-trash" severity="secondary" text size="small" @click="removeExtra(idx)" />
            </div>
            <MarkdownEditor
              v-model="field.fieldText"
              editor-style="min-height:80px; max-height:240px; overflow-y:auto;"
              placeholder="Content…"
            />
          </div>
        </div>

        <p v-if="!mandatoryFields.length && !extraFields.length" class="hint">No field types configured. Add optional fields above.</p>
      </section>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end; padding-top:0.25rem; border-top:1px solid var(--ares-border);">
        <Button type="button" label="Cancel" severity="secondary" @click="close" />
        <Button type="submit" label="Create template" icon="pi pi-check" :loading="saving" :disabled="!title.trim()" />
      </div>

    </form>
  </Dialog>
</template>

<style scoped>
.fs      { display:flex; flex-direction:column; gap:0.65rem; }
.fs-head { display:flex; align-items:center; gap:0.55rem; }
.fs-num  {
  width:1.4rem; height:1.4rem; border-radius: 50%;
  background:var(--ares-surface-2); border:1px solid var(--ares-border);
  display:flex; align-items:center; justify-content:center;
  font-size:0.7rem; font-weight:700; color:var(--ares-text-muted); flex-shrink:0;
}
.fs-title   { font-size:0.82rem; font-weight:700; color:var(--ares-text); margin:0; }
.badge-opt  { font-size:0.65rem; font-weight:500; color:var(--ares-text-muted); border:1px solid var(--ares-border); border-radius: var(--ares-radius); padding:0.05rem 0.35rem; }
.req        { color:var(--ares-error); }
.hint       { font-size:0.78rem; color:var(--ares-text-muted); margin:0; font-style:italic; }
.fl         { font-size:0.78rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.3rem; display:block; }
.field-block { display:flex; flex-direction:column; }

.severity-row { display:flex; align-items:center; gap:0.5rem; }

/* Score chips */
.score-chip         { display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0.65rem; border-radius: var(--ares-radius); background:var(--ares-surface-2); border:1px solid var(--ares-border); font-size:0.78rem; }
.score-chip-val     { font-weight:700; font-family:monospace; font-size:0.82rem; }
.score-chip-name    { color:var(--ares-text-muted); }
.score-chip-vector  { font-family:monospace; font-size:0.7rem; color:var(--ares-text-muted); word-break:break-all; }.score-chip-default { font-size:0.65rem; background:var(--ares-accent-bg); color:#fff; border-radius: var(--ares-radius); padding:0.05rem 0.35rem; }
.sev-critical { color:#ef4444; }
.sev-high     { color:#f97316; }
.sev-medium   { color:#f59e0b; }
.sev-low      { color:#22c55e; }
.sev-info     { color:#3b82f6; }

/* Reference chips */
.ref-chip     { display:inline-flex; align-items:center; gap:0.35rem; background:var(--ares-surface-2); border:1px solid var(--ares-border); border-radius: var(--ares-radius); padding:0.2rem 0.55rem; font-size:0.77rem; }
.ref-chip-cat { font-size:0.65rem; font-weight:700; background:var(--ares-surface-3, rgba(255,255,255,0.06)); border-radius: var(--ares-radius); padding:0.05rem 0.3rem; color:var(--ares-text-muted); }
.ref-chip-x   { background:none; border:none; cursor:pointer; color:var(--ares-text-muted); font-size:1rem; line-height:1; padding:0 0.1rem; }
.ref-chip-x:hover { color:var(--ares-error); }
</style>
