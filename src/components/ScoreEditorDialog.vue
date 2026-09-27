<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import AresBadge from '@/components/AresBadge.vue';
import {
  buildCvss31Vector, defaultCvss31, cvss31Scores, type Cvss31Metrics,
  buildCvss20Vector, defaultCvss20, cvss20Scores, type Cvss20Metrics,
  buildCvss40Vector, defaultCvss40, cvss40Score, cvss40Classification, cvss40ClassificationFromVector, type Cvss40Metrics,
  scoreToSeverity, PRIORITY_SCALE, type ScoreSeverity,
} from '@/utils/cvss';
import {
  cvss40Metrics, cvss40ThreatMetrics, cvss40EnvironmentalMetrics, cvss40SupplementalMetrics,
  cvss31Metrics, cvss31TemporalMetrics, cvss31EnvironmentalMetrics,
  cvss20Metrics, cvss20TemporalMetrics, cvss20EnvironmentalMetrics,
} from '@/utils/scoreMetrics';
import CvssMetricGrid from '@/components/CvssMetricGrid.vue';
import { ssvcMethodologiesApi, type SsvcRoleDetail } from '@/api/ssvcMethodologies';
import { resolveSsvcMethodologyNames } from '@/utils/ssvcTree';
import SsvcTreeWizard, { type SsvcResolution } from '@/components/ssvc/SsvcTreeWizard.vue';
import type { FindingScoreType } from '@/api/findings';

export interface ScoreRow {
  id?: number;
  typeId: number;
  typeName: string;
  score: number;
  vector: string;
  isDefault: boolean;
  comment?: string;
  ssvcLeafNodeId?: number | null;
  /** False for SSVC rows scored under an informational-only role (e.g. Coordinator
   *  Triage/Publish) — such rows can never become the default (priority-setting)
   *  score. Undefined/true for every other row. */
  ssvcPriorityEligible?: boolean;
}

const props = defineProps<{
  visible: boolean;
  scoreTypes: FindingScoreType[];
  modelValue: ScoreRow[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:modelValue': [scores: ScoreRow[]];
}>();

// ── local editable copy ───────────────────────────────────────────────────────
const scores = ref<ScoreRow[]>([]);
/** leafNodeId -> methodology + role display names (e.g. "CISAv1"/"CISA"), for annotating
 *  the bare "SSVC" type label in the Added-scores list — see resolveSsvcMethodologyNames. */
const ssvcMethodologyNames = ref<Map<number, { methodologyName: string; roleName: string }>>(new Map());

async function resolveAddedSsvcNames() {
  const ids = scores.value.filter((s) => s.typeName === 'SSVC').map((s) => s.ssvcLeafNodeId);
  const resolved = await resolveSsvcMethodologyNames(ids);
  ssvcMethodologyNames.value = new Map([...ssvcMethodologyNames.value, ...resolved]);
}

watch(() => props.visible, (open) => {
  if (!open) return;
  scores.value = props.modelValue.map((s) => ({ ...s }));
  loadSsvcMethodologies();
  resolveAddedSsvcNames();
});

const cvssVersionOptions: { value: 'cvss40' | 'cvss31' | 'cvss20'; label: string }[] = [
  { value: 'cvss40', label: '4.0' }, { value: 'cvss31', label: '3.1' }, { value: 'cvss20', label: '2.0' },
];
const activeCvssVersion = ref<'cvss40' | 'cvss31' | 'cvss20'>('cvss40');

// Each CVSS version's own Base/Temporal(-or-Threat)/Environmental sub-section.
const c40Section = ref<'base' | 'threat' | 'environmental' | 'supplemental'>('base');
const c31Section = ref<'base' | 'temporal' | 'environmental'>('base');
const c20Section = ref<'base' | 'temporal' | 'environmental'>('base');

// ── CVSS 4.0 state ────────────────────────────────────────────────────────────
const c40 = reactive<Cvss40Metrics>({ ...defaultCvss40 });
const c40Vector = computed(() => buildCvss40Vector(c40 as Cvss40Metrics));
const c40Score = computed(() => cvss40Score(c40 as Cvss40Metrics));
const c40Classification = computed(() => cvss40Classification(c40 as Cvss40Metrics));
const c40TypeId = computed(() => props.scoreTypes.find((t) => t.title === 'CVSS 4.0')?.id ?? 0);

// ── CVSS 3.1 state ────────────────────────────────────────────────────────────
const c31 = reactive<Cvss31Metrics>({ ...defaultCvss31 });
const c31Vector = computed(() => buildCvss31Vector(c31 as Cvss31Metrics));
const c31Breakdown = computed(() => cvss31Scores(c31 as Cvss31Metrics));
const c31Score = computed(() => c31Breakdown.value.environmental ?? c31Breakdown.value.temporal ?? c31Breakdown.value.base);
const c31TypeId = computed(() => props.scoreTypes.find((t) => t.title === 'CVSS 3.1')?.id ?? 0);

// ── CVSS 2.0 state ────────────────────────────────────────────────────────────
const c20 = reactive<Cvss20Metrics>({ ...defaultCvss20 });
const c20Vector = computed(() => buildCvss20Vector(c20 as Cvss20Metrics));
const c20Breakdown = computed(() => cvss20Scores(c20 as Cvss20Metrics));
const c20Score = computed(() => c20Breakdown.value.environmental ?? c20Breakdown.value.temporal ?? c20Breakdown.value.base);
const c20TypeId = computed(() => props.scoreTypes.find((t) => t.title === 'CVSS 2.0')?.id ?? 0);

// ── Manual state — a direct P0-P4 pick rather than a free-form 0-10 slider ─────
const textScore = ref<number>(PRIORITY_SCALE[2].score); // defaults to P2/medium
const manualPriorityLabel = computed(() =>
  PRIORITY_SCALE.find((p) => p.score === textScore.value)?.label ?? textScore.value.toFixed(1)
);
const textTypeId = computed(() => props.scoreTypes.find((t) => t.title === 'Manual')?.id ?? 0);

// ── SSVC: methodology+role picked dynamically from the backend-managed decision-tree
// engine (com.martecyber.ares.ssvc) rather than a hardcoded role list. ─────────────
interface SsvcRoleOption { value: number; label: string; usesPriorityMapping: boolean; }
const ssvcRoleOptions = ref<SsvcRoleOption[]>([]);
const ssvcSelectedRoleId = ref<number | null>(null);
const ssvcRoleDetail = ref<SsvcRoleDetail | null>(null);
const ssvcResolution = ref<SsvcResolution | null>(null);
const ssvcLoading = ref(false);
const ssvcWizardResetKey = ref(0);

const ssvcSelectedRoleUsesPriorityMapping = computed(() =>
  ssvcRoleOptions.value.find((r) => r.value === ssvcSelectedRoleId.value)?.usesPriorityMapping ?? true
);
const ssvcTypeId = computed(() => props.scoreTypes.find((t) => t.title === 'SSVC')?.id ?? 0);

async function loadSsvcMethodologies() {
  const methodologies = await ssvcMethodologiesApi.list();
  ssvcRoleOptions.value = methodologies.flatMap((m) =>
    m.roles.filter((r) => r.hasTree).map((r) => ({
      value: r.id, label: `${m.name} — ${r.name}`, usesPriorityMapping: r.usesPriorityMapping,
    }))
  );
  if (ssvcSelectedRoleId.value == null) ssvcSelectedRoleId.value = ssvcRoleOptions.value[0]?.value ?? null;
}

async function loadSsvcRole(roleId: number) {
  ssvcLoading.value = true;
  try {
    ssvcRoleDetail.value = await ssvcMethodologiesApi.getRoleDetail(roleId);
  } finally {
    ssvcLoading.value = false;
  }
}

watch(ssvcSelectedRoleId, (roleId) => {
  if (roleId != null) loadSsvcRole(roleId);
});

function onSsvcResolved(resolution: SsvcResolution | null) {
  ssvcResolution.value = resolution;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreSeverity(s: number): ScoreSeverity {
  return scoreToSeverity(s); // AresBadge natively supports 'critical'|'high'|'medium'|'low'|'info'
}

/** SSVC shows its outcome word (e.g. "Out-of-Cycle") and Manual shows its P0-P4 label
 *  — neither is the underlying synthetic numeric score. Everything else keeps the
 *  plain "9.8"-style numeric display. */
function scoreDisplay(s: ScoreRow): string {
  if (s.typeName === 'SSVC') {
    const i = s.vector.lastIndexOf('->');
    return i === -1 ? s.score.toFixed(1) : s.vector.slice(i + 2).trim();
  }
  if (s.typeName === 'Manual') return PRIORITY_SCALE.find((p) => p.score === s.score)?.label ?? s.score.toFixed(1);
  return s.score.toFixed(1);
}

/** "SSVC" alone doesn't say which methodology+role (SSVCv2/Deployer, CISAv1/CISA, a
 *  custom one...) produced the outcome — annotate it, e.g. "SSVC - CISAv1 (CISA)".
 *  Likewise "CVSS 4.0" alone doesn't say which metric groups were actually filled in —
 *  annotate it with its CVSS-B/BT/BE/BTE classification, e.g. "CVSS 4.0 - CVSS-BTE". */
function scoreTypeLabel(s: ScoreRow): string {
  if (s.typeName === 'SSVC' && s.ssvcLeafNodeId != null) {
    const entry = ssvcMethodologyNames.value.get(s.ssvcLeafNodeId);
    if (entry) return `SSVC - ${entry.methodologyName} (${entry.roleName})`;
  }
  if (s.typeName === 'CVSS 4.0' && s.vector) {
    return `${s.typeName} - ${cvss40ClassificationFromVector(s.vector)}`;
  }
  return s.typeName;
}

/** Coordinator Triage/Publish-style rows can never be default — see ScoreRow.ssvcPriorityEligible. */
function isDefaultEligible(s: ScoreRow): boolean {
  return s.ssvcPriorityEligible !== false;
}

function ensureOneDefault() {
  const eligible = scores.value.filter(isDefaultEligible);
  if (eligible.length > 0 && !eligible.some((s) => s.isDefault)) {
    eligible[0].isDefault = true;
  }
}

function setDefault(idx: number) {
  if (!isDefaultEligible(scores.value[idx])) return;
  scores.value.forEach((s, i) => { s.isDefault = i === idx; });
}

function removeScore(idx: number) {
  scores.value.splice(idx, 1);
  ensureOneDefault();
}

function addScore(typeId: number, typeName: string, score: number, vector: string, comment = '') {
  const hasDefault = scores.value.some((s) => s.isDefault);
  scores.value.push({ typeId, typeName, score, vector, isDefault: !hasDefault, comment });
}

function addCvss40() {
  const typeName = props.scoreTypes.find((t) => t.id === c40TypeId.value)?.title ?? 'CVSS 4.0';
  addScore(c40TypeId.value, typeName, c40Score.value, c40Vector.value);
  Object.assign(c40, defaultCvss40);
}

function addCvss31() {
  const typeName = props.scoreTypes.find((t) => t.id === c31TypeId.value)?.title ?? 'CVSS 3.1';
  addScore(c31TypeId.value, typeName, c31Score.value, c31Vector.value);
  Object.assign(c31, defaultCvss31);
}

function addCvss20() {
  const typeName = props.scoreTypes.find((t) => t.id === c20TypeId.value)?.title ?? 'CVSS 2.0';
  addScore(c20TypeId.value, typeName, c20Score.value, c20Vector.value);
  Object.assign(c20, defaultCvss20);
}

function addManual() {
  const typeName = props.scoreTypes.find((t) => t.id === textTypeId.value)?.title ?? 'Manual';
  addScore(textTypeId.value, typeName, textScore.value, '');
  textScore.value = PRIORITY_SCALE[2].score;
}

function addSsvc() {
  const r = ssvcResolution.value;
  if (!r) return;
  const typeName = props.scoreTypes.find((t) => t.id === ssvcTypeId.value)?.title ?? 'SSVC';
  const eligible = ssvcSelectedRoleUsesPriorityMapping.value;
  const hasDefault = scores.value.some((s) => s.isDefault);
  scores.value.push({
    typeId: ssvcTypeId.value, typeName, score: r.score, vector: r.breadcrumb,
    isDefault: eligible && !hasDefault, comment: '',
    ssvcLeafNodeId: r.leafNodeId, ssvcPriorityEligible: eligible,
  });
  ssvcResolution.value = null;
  ssvcWizardResetKey.value += 1;
  resolveAddedSsvcNames();
}

function save() {
  ensureOneDefault();
  emit('update:modelValue', [...scores.value]);
  emit('update:visible', false);
}

function close() { emit('update:visible', false); }
</script>

<template>
  <Dialog
    :visible="visible"
    header="Score editor"
    modal
    :style="{ width: 'min(780px, 96vw)' }"
    :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem' } }"
    @update:visible="close"
  >
    <!-- ── Current scores list ────────────────────────────────────────────── -->
    <div v-if="scores.length" style="margin-bottom:1.25rem;">
      <p class="section-label">Added scores</p>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <div v-for="(s, idx) in scores" :key="idx" class="score-item">
          <div style="display:flex; align-items:flex-start; gap:0.6rem; flex:1; min-width:0;">
            <AresBadge :value="scoreDisplay(s)" :severity="scoreSeverity(s.score)" style="font-weight:700; font-size:1rem; padding:0.2rem 0.7rem; flex-shrink:0; margin-top:0.1rem; white-space:nowrap;" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:0.82rem; font-weight:600;">{{ scoreTypeLabel(s) }}</div>
              <div v-if="s.vector" style="font-family:monospace; font-size:0.7rem; color:var(--ares-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:0.3rem;">{{ s.vector }}</div>
              <input
                v-model="s.comment"
                type="text"
                class="score-comment-input"
                placeholder="Add a note… (optional)"
              />
            </div>
          </div>
          <div style="display:flex; align-items:flex-start; gap:0.4rem; flex-shrink:0; padding-top:0.1rem;">
            <span v-if="s.ssvcPriorityEligible === false" class="ref-badge" title="For reference">R</span>
            <button v-else-if="!s.isDefault" type="button" class="default-btn" @click="setDefault(idx)">Set default</button>
            <span v-else class="default-badge">Default</span>
            <Button icon="pi pi-trash" severity="secondary" text size="small" @click="removeScore(idx)" />
          </div>
        </div>
      </div>
    </div>
    <p v-else style="font-size:0.82rem; color:var(--ares-text-muted); margin-bottom:1rem;">No scores yet. Use the calculators below to add one.</p>

    <!-- ── Calculator tabs ────────────────────────────────────────────────── -->
    <TabView
      :pt="{
        root:           { style: 'background:transparent;' },
        nav:            { style: 'background:transparent; border-color:var(--ares-border);' },
        inkbar:         { style: 'background:var(--p-primary-500);' },
        panelContainer: { class: 'tab-panel-container', style: 'background:transparent;' },
      }"
    >

      <!-- CVSS (version picked via buttons, same pattern as the SSVC role selector) -->
      <TabPanel header="CVSS" value="cvss">
        <div class="priority-btns" style="margin-bottom:0.85rem;">
          <button
            v-for="opt in cvssVersionOptions"
            :key="opt.value"
            type="button"
            :class="['metric-btn', { 'metric-btn--active': activeCvssVersion === opt.value }]"
            style="flex:1; padding:0.4rem 0;"
            @click="activeCvssVersion = opt.value"
          >{{ opt.label }}</button>
        </div>

        <template v-if="activeCvssVersion === 'cvss40'">
          <div class="score-display">
            <span class="score-value" :class="'sev-' + scoreToSeverity(c40Score)">{{ c40Score.toFixed(1) }}</span>
            <span class="score-classification">{{ c40Classification }}</span>
            <span class="score-vector">{{ c40Vector }}</span>
          </div>
          <div class="priority-btns" style="margin-bottom:0.85rem;">
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c40Section === 'base' }]" style="flex:1;" @click="c40Section = 'base'">Base</button>
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c40Section === 'threat' }]" style="flex:1;" @click="c40Section = 'threat'">Threat</button>
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c40Section === 'environmental' }]" style="flex:1;" @click="c40Section = 'environmental'">Environmental</button>
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c40Section === 'supplemental' }]" style="flex:1;" @click="c40Section = 'supplemental'">Supplemental</button>
          </div>
          <CvssMetricGrid v-if="c40Section === 'base'" :metrics="cvss40Metrics" :state="c40" />
          <CvssMetricGrid v-else-if="c40Section === 'threat'" :metrics="cvss40ThreatMetrics" :state="c40" />
          <CvssMetricGrid v-else-if="c40Section === 'environmental'" :metrics="cvss40EnvironmentalMetrics" :state="c40" />
          <CvssMetricGrid v-else :metrics="cvss40SupplementalMetrics" :state="c40" />
          <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
            <Button type="button" icon="pi pi-plus" :label="'Add CVSS 4.0 — ' + c40Score.toFixed(1)" size="small" :disabled="!c40TypeId" @click="addCvss40" />
          </div>
        </template>

        <template v-else-if="activeCvssVersion === 'cvss31'">
          <div class="score-display">
            <span class="score-value" :class="'sev-' + scoreToSeverity(c31Score)">{{ c31Score.toFixed(1) }}</span>
            <span class="score-breakdown">
              Base {{ c31Breakdown.base.toFixed(1) }}
              <template v-if="c31Breakdown.temporal !== null"> · Temporal {{ c31Breakdown.temporal.toFixed(1) }}</template>
              <template v-if="c31Breakdown.environmental !== null"> · Environmental {{ c31Breakdown.environmental.toFixed(1) }}</template>
            </span>
            <span class="score-vector">{{ c31Vector }}</span>
          </div>
          <div class="priority-btns" style="margin-bottom:0.85rem;">
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c31Section === 'base' }]" style="flex:1;" @click="c31Section = 'base'">Base</button>
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c31Section === 'temporal' }]" style="flex:1;" @click="c31Section = 'temporal'">Temporal</button>
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c31Section === 'environmental' }]" style="flex:1;" @click="c31Section = 'environmental'">Environmental</button>
          </div>
          <CvssMetricGrid v-if="c31Section === 'base'" :metrics="cvss31Metrics" :state="c31" />
          <CvssMetricGrid v-else-if="c31Section === 'temporal'" :metrics="cvss31TemporalMetrics" :state="c31" />
          <CvssMetricGrid v-else :metrics="cvss31EnvironmentalMetrics" :state="c31" />
          <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
            <Button type="button" icon="pi pi-plus" :label="'Add CVSS 3.1 — ' + c31Score.toFixed(1)" size="small" :disabled="!c31TypeId" @click="addCvss31" />
          </div>
        </template>

        <template v-else>
          <div class="score-display">
            <span class="score-value" :class="'sev-' + scoreToSeverity(c20Score)">{{ c20Score.toFixed(1) }}</span>
            <span class="score-breakdown">
              Base {{ c20Breakdown.base.toFixed(1) }}
              <template v-if="c20Breakdown.temporal !== null"> · Temporal {{ c20Breakdown.temporal.toFixed(1) }}</template>
              <template v-if="c20Breakdown.environmental !== null"> · Environmental {{ c20Breakdown.environmental.toFixed(1) }}</template>
            </span>
            <span class="score-vector">{{ c20Vector }}</span>
          </div>
          <div class="priority-btns" style="margin-bottom:0.85rem;">
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c20Section === 'base' }]" style="flex:1;" @click="c20Section = 'base'">Base</button>
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c20Section === 'temporal' }]" style="flex:1;" @click="c20Section = 'temporal'">Temporal</button>
            <button type="button" :class="['metric-btn', { 'metric-btn--active': c20Section === 'environmental' }]" style="flex:1;" @click="c20Section = 'environmental'">Environmental</button>
          </div>
          <CvssMetricGrid v-if="c20Section === 'base'" :metrics="cvss20Metrics" :state="c20" />
          <CvssMetricGrid v-else-if="c20Section === 'temporal'" :metrics="cvss20TemporalMetrics" :state="c20" />
          <CvssMetricGrid v-else :metrics="cvss20EnvironmentalMetrics" :state="c20" />
          <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
            <Button type="button" icon="pi pi-plus" :label="'Add CVSS 2.0 — ' + c20Score.toFixed(1)" size="small" :disabled="!c20TypeId" @click="addCvss20" />
          </div>
        </template>
      </TabPanel>

      <!-- SSVC -->
      <TabPanel header="SSVC" value="ssvc">
        <div style="margin-bottom:0.85rem;">
          <select v-model.number="ssvcSelectedRoleId" class="ssvc-role-select">
            <option v-for="opt in ssvcRoleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <p v-if="ssvcLoading" style="font-size:0.82rem; color:var(--ares-text-muted);">Loading…</p>
        <p v-else-if="!ssvcRoleOptions.length" style="font-size:0.82rem; color:var(--ares-text-muted);">
          No SSVC methodologies available yet — create one from the Knowledge Base.
        </p>
        <SsvcTreeWizard
          v-else
          :key="ssvcWizardResetKey"
          :tree="ssvcRoleDetail?.tree ?? null"
          @resolved="onSsvcResolved"
        />
        <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
          <Button type="button" icon="pi pi-plus" label="Add SSVC score" size="small" :disabled="!ssvcResolution" @click="addSsvc" />
        </div>
      </TabPanel>

      <!-- DREAD (reserved for future) -->
      <TabPanel header="DREAD" value="dread" :disabled="true">
        <p style="font-size:0.82rem; color:var(--ares-text-muted); margin:0;">DREAD scoring is coming soon.</p>
      </TabPanel>

      <!-- Manual -->
      <TabPanel header="Manual" value="manual">
        <!-- Current score display -->
        <div class="score-display" style="margin-bottom:1.25rem;">
          <span class="score-value" :class="'sev-' + scoreToSeverity(textScore)">{{ manualPriorityLabel }}</span>
          <span class="score-sev">{{ scoreToSeverity(textScore).toUpperCase() }}</span>
          <span class="score-vector" style="font-family:inherit; font-size:0.8rem;">Manual priority assessment</span>
        </div>

        <div class="priority-btns">
          <button
            v-for="p in PRIORITY_SCALE"
            :key="p.label"
            type="button"
            :class="['priority-btn', { 'priority-btn--active': textScore === p.score }]"
            :style="{ '--priority-color': p.color }"
            @click="textScore = p.score"
          >{{ p.label }}</button>
        </div>

        <div style="display:flex; justify-content:flex-end; margin-top:1.25rem;">
          <Button type="button" icon="pi pi-plus" :label="'Add Manual — ' + manualPriorityLabel" size="small" :disabled="!textTypeId" @click="addManual" />
        </div>
      </TabPanel>
    </TabView>

    <!-- ── Actions ────────────────────────────────────────────────────────── -->
    <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.25rem; padding-top:1rem; border-top:1px solid var(--ares-border);">
      <Button type="button" label="Cancel" severity="secondary" size="small" @click="close" />
      <Button type="button" label="Apply" icon="pi pi-check" size="small" @click="save" />
    </div>
  </Dialog>
</template>

<style scoped>
.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  margin-bottom: 0.5rem;
}

.score-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.18));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.55rem 0.8rem;
}

.default-btn {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--ares-text-muted);
  background: none;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.45rem;
  cursor: pointer;
  white-space: nowrap;
}
.default-btn:hover { color: var(--p-primary-400); border-color: var(--p-primary-400); }
.default-badge {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 40%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.45rem;
  white-space: nowrap;
}
.ref-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--ares-text-muted);
  border: 1px solid var(--ares-border);
  cursor: default;
  flex-shrink: 0;
}

/* ── Score comment input ─────────────────────────────── */
.score-comment-input {
  width: 100%;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.18));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: var(--ares-text-2);
  outline: none;
}
.score-comment-input::placeholder { color: var(--ares-text-muted); }
.score-comment-input:focus { border-color: var(--p-primary-500); }

/* ── SSVC methodology+role picker ──────────────────────── */
.ssvc-role-select {
  width: 100%;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
  color: var(--ares-text-2);
  outline: none;
}
.ssvc-role-select:focus { border-color: var(--p-primary-500); }

/* ── Manual priority selector ──────────────────────────── */
.priority-btns { display: flex; gap: 0.5rem; }
.priority-btn {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 700;
  padding: 0.6rem 0;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  cursor: pointer;
  color: var(--ares-text-2);
  transition: border-color 0.1s, background 0.1s, color 0.1s;
}
.priority-btn:hover { border-color: var(--priority-color); color: var(--priority-color); }
.priority-btn--active {
  border-color: var(--priority-color);
  background: color-mix(in srgb, var(--priority-color) 16%, transparent);
  color: var(--priority-color);
}

/* ── Fix TabView background (PrimeVue defaults to white) ──
   Class names match PrimeVue 4.5's legacy TabView (TabViewStyle): the nav wrapper is
   .p-tabview-tablist-container, the <ul> is .p-tabview-tablist, each tab is
   .p-tabview-tablist-item > .p-tabview-tab-header. */
:deep(.p-tabview),
:deep(.p-tabview-tablist-container),
:deep(.p-tabview-tablist),
:deep(.p-tabview-panels),
:deep(.tab-panel-container) {
  background: transparent !important;
  border-color: var(--ares-border) !important;
}
:deep(.p-tabview-tablist) {
  border-bottom: 1px solid var(--ares-border) !important;
}
:deep(.p-tabview-tab-header) {
  background: transparent !important;
  color: var(--ares-text-muted) !important;
}
:deep(.p-tabview-tablist-item-active .p-tabview-tab-header) {
  color: var(--p-primary-400) !important;
}
:deep(.p-tabview-tablist-item.p-disabled .p-tabview-tab-header) {
  color: var(--ares-text-muted) !important;
  opacity: 0.45;
  cursor: not-allowed;
}
:deep(.tab-panel-container) {
  padding: 0.85rem 0 0 !important;
}

/* Score display strip */
.score-display {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.25));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.75rem 1rem;
  margin-bottom: 1.1rem;
}
.score-value {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  min-width: 3.5rem;
}
.score-value--text {
  font-size: 1.3rem;
  min-width: 0;
}
.score-sev {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
}
.score-classification {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 40%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.45rem;
  white-space: nowrap;
}
.score-breakdown {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  white-space: nowrap;
}
.score-vector {
  font-family: monospace;
  font-size: 0.68rem;
  color: var(--ares-text-muted);
  word-break: break-all;
  flex: 1;
}

/* Severity colours */
.sev-critical { color: #ef4444; }
.sev-high     { color: #f97316; }
.sev-medium   { color: #ca8a04; }
.sev-low      { color: #16a34a; }
.sev-info     { color: #6b7280; }

/* Metric grid */
.metric-grid { display: flex; flex-direction: column; gap: 0.45rem; }
.metric-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.metric-label {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  width: 165px;
  flex-shrink: 0;
  text-align: right;
}
.metric-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--ares-text-muted);
  color: var(--ares-text-muted);
  font-size: 0.62rem;
  font-weight: 700;
  cursor: help;
  flex-shrink: 0;
}
.metric-help:hover { border-color: var(--p-primary-400); color: var(--p-primary-400); }
.metric-btns { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.metric-btn {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.22rem 0.65rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s, color 0.1s;
  color: var(--ares-text-2);
}
.metric-btn:hover { border-color: var(--p-primary-400); color: var(--p-primary-400); }
.metric-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 14%, transparent);
  color: var(--p-primary-300);
  font-weight: 700;
}
</style>
