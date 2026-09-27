<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import {
  buildCvss31Vector, defaultCvss31, parseCvss31Vector, cvss31Scores, type Cvss31Metrics,
  buildCvss20Vector, defaultCvss20, parseCvss20Vector, cvss20Scores, type Cvss20Metrics,
  buildCvss40Vector, defaultCvss40, parseCvss40Vector, cvss40Score, cvss40Classification, type Cvss40Metrics,
  scoreToSeverity, PRIORITY_SCALE,
} from '@/utils/cvss';
import {
  cvss40Metrics, cvss40ThreatMetrics, cvss40EnvironmentalMetrics, cvss40SupplementalMetrics,
  cvss31Metrics, cvss31TemporalMetrics, cvss31EnvironmentalMetrics,
  cvss20Metrics, cvss20TemporalMetrics, cvss20EnvironmentalMetrics,
} from '@/utils/scoreMetrics';
import CvssMetricGrid from '@/components/CvssMetricGrid.vue';
import { ssvcMethodologiesApi, type SsvcRoleDetail } from '@/api/ssvcMethodologies';
import SsvcTreeWizard, { type SsvcResolution } from '@/components/ssvc/SsvcTreeWizard.vue';
import type { FindingScoreType } from '@/api/findings';

export interface EditingScore {
  typeId: number;
  typeName: string;
  score: number;
  vector: string;
  isDefault: boolean;
  comment?: string;
  ssvcLeafNodeId?: number | null;
}

export interface ScoreSavePayload {
  typeId: number;
  score: number;
  vector: string;
  isDefault: boolean;
  comment?: string;
  ssvcLeafNodeId?: number | null;
}

const props = defineProps<{
  visible: boolean;
  scoreTypes: FindingScoreType[];
  editing?: EditingScore | null;
  showDefaultOption?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [payload: ScoreSavePayload];
}>();

// Top-level tabs: 0=CVSS (nested sub-tabs), 1=SSVC, 2=DREAD (disabled), 3=Manual.
const OUTER_TAB_INDEX_BY_TITLE: Record<string, number> = {
  'CVSS 4.0': 0, 'CVSS 3.1': 0, 'CVSS 2.0': 0, 'SSVC': 1, 'Manual': 3,
};
const CVSS_SUB_INDEX_BY_TITLE: Record<string, number> = {
  'CVSS 4.0': 0, 'CVSS 3.1': 1, 'CVSS 2.0': 2,
};

const cvssVersionOptions: { value: number; label: string }[] = [
  { value: 0, label: '4.0' }, { value: 1, label: '3.1' }, { value: 2, label: '2.0' },
];

const activeTabIndex = ref(0);
const activeCvssSubIndex = ref(0);
const isDefaultChecked = ref(false);
const comment = ref('');

// Each CVSS version's own Base/Temporal(-or-Threat)/Environmental sub-section — reset to
// 'base' whenever the dialog opens (see the props.visible watch below).
const c40Section = ref<'base' | 'threat' | 'environmental' | 'supplemental'>('base');
const c31Section = ref<'base' | 'temporal' | 'environmental'>('base');
const c20Section = ref<'base' | 'temporal' | 'environmental'>('base');

const c40 = reactive<Cvss40Metrics>({ ...defaultCvss40 });
const c40Vector = computed(() => buildCvss40Vector(c40 as Cvss40Metrics));
const c40Score = computed(() => cvss40Score(c40 as Cvss40Metrics));
const c40Classification = computed(() => cvss40Classification(c40 as Cvss40Metrics));
const c40TypeId = computed(() => props.scoreTypes.find((t) => t.title === 'CVSS 4.0')?.id ?? 0);

const c31 = reactive<Cvss31Metrics>({ ...defaultCvss31 });
const c31Vector = computed(() => buildCvss31Vector(c31 as Cvss31Metrics));
const c31Breakdown = computed(() => cvss31Scores(c31 as Cvss31Metrics));
const c31Score = computed(() => c31Breakdown.value.environmental ?? c31Breakdown.value.temporal ?? c31Breakdown.value.base);
const c31TypeId = computed(() => props.scoreTypes.find((t) => t.title === 'CVSS 3.1')?.id ?? 0);

const c20 = reactive<Cvss20Metrics>({ ...defaultCvss20 });
const c20Vector = computed(() => buildCvss20Vector(c20 as Cvss20Metrics));
const c20Breakdown = computed(() => cvss20Scores(c20 as Cvss20Metrics));
const c20Score = computed(() => c20Breakdown.value.environmental ?? c20Breakdown.value.temporal ?? c20Breakdown.value.base);
const c20TypeId = computed(() => props.scoreTypes.find((t) => t.title === 'CVSS 2.0')?.id ?? 0);

// "Manual" — a direct P0-P4 pick rather than a free-form 0-10 slider.
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
const ssvcInitialLeafNodeId = ref<number | null>(null);
const ssvcLoading = ref(false);

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

watch(() => props.visible, async (open) => {
  if (!open) return;
  const editing = props.editing;
  comment.value = editing?.comment ?? '';
  isDefaultChecked.value = editing?.isDefault ?? false;
  c40Section.value = 'base';
  c31Section.value = 'base';
  c20Section.value = 'base';

  await loadSsvcMethodologies();

  if (editing) {
    activeTabIndex.value = OUTER_TAB_INDEX_BY_TITLE[editing.typeName] ?? 0;
    if (editing.typeName in CVSS_SUB_INDEX_BY_TITLE) activeCvssSubIndex.value = CVSS_SUB_INDEX_BY_TITLE[editing.typeName];
    switch (editing.typeName) {
      case 'CVSS 4.0': Object.assign(c40, parseCvss40Vector(editing.vector)); break;
      case 'CVSS 3.1': Object.assign(c31, parseCvss31Vector(editing.vector)); break;
      case 'CVSS 2.0': Object.assign(c20, parseCvss20Vector(editing.vector)); break;
      case 'Manual':   textScore.value = editing.score; break;
      case 'SSVC': {
        ssvcInitialLeafNodeId.value = editing.ssvcLeafNodeId ?? null;
        if (editing.ssvcLeafNodeId) {
          const roleId = await ssvcMethodologiesApi.getRoleIdForNode(editing.ssvcLeafNodeId);
          ssvcSelectedRoleId.value = roleId;
        }
        break;
      }
      default: break;
    }
  } else {
    activeTabIndex.value = 0;
    activeCvssSubIndex.value = 0;
    Object.assign(c40, defaultCvss40);
    Object.assign(c31, defaultCvss31);
    Object.assign(c20, defaultCvss20);
    textScore.value = PRIORITY_SCALE[2].score;
    ssvcInitialLeafNodeId.value = null;
    ssvcSelectedRoleId.value = ssvcRoleOptions.value[0]?.value ?? null;
  }
});

function scoreSeverityClass(s: number): string {
  return scoreToSeverity(s);
}

function close() { emit('update:visible', false); }

// SSVC can't be saved until the wizard reaches a leaf (and CVSS/Manual are always
// immediately resolved) — used to disable the Save/Add button.
const canSave = computed(() => activeTabIndex.value !== 1 || !!ssvcResolution.value);

function save() {
  if (!canSave.value) return;
  const payload = (() => {
    if (activeTabIndex.value === 0) {
      switch (activeCvssSubIndex.value) {
        case 0: return { typeId: c40TypeId.value, score: c40Score.value, vector: c40Vector.value };
        case 1: return { typeId: c31TypeId.value, score: c31Score.value, vector: c31Vector.value };
        default: return { typeId: c20TypeId.value, score: c20Score.value, vector: c20Vector.value };
      }
    }
    if (activeTabIndex.value === 1) {
      const r = ssvcResolution.value!;
      return { typeId: ssvcTypeId.value, score: r.score, vector: r.breadcrumb, ssvcLeafNodeId: r.leafNodeId };
    }
    return { typeId: textTypeId.value, score: textScore.value, vector: '' };
  })();
  if (!payload.typeId) return;
  const isDefault = (activeTabIndex.value === 1 && !ssvcSelectedRoleUsesPriorityMapping.value)
    ? false : isDefaultChecked.value;
  emit('save', { ...payload, isDefault, comment: comment.value || undefined });
}

</script>

<template>
  <Dialog
    :visible="visible"
    :header="editing ? 'Edit ' + editing.typeName + ' score' : 'Add score'"
    modal
    :style="{ width: 'min(780px, 96vw)' }"
    :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem' } }"
    @update:visible="close"
  >
    <!-- Editing an existing score locks it to its original type — switching tabs would
         silently recompute a different methodology's score against this row, which is
         never what "edit" should do. Only creation (no `editing`) lets you pick a type. -->
    <TabView
      v-model:active-index="activeTabIndex"
      :class="{ 'tabs--locked': !!editing }"
      :pt="{
        root:           { style: 'background:transparent;' },
        nav:            { style: 'background:transparent; border-color:var(--ares-border);' },
        inkbar:         { style: 'background:var(--p-primary-500);' },
        panelContainer: { class: 'tab-panel-container', style: 'background:transparent;' },
      }"
    >
      <!-- CVSS (version picked via buttons, same pattern as the SSVC role selector) -->
      <TabPanel header="CVSS" :value="0">
        <div v-if="!editing" class="priority-btns" style="margin-bottom:0.85rem;">
          <button
            v-for="opt in cvssVersionOptions"
            :key="opt.value"
            type="button"
            :class="['metric-btn', { 'metric-btn--active': activeCvssSubIndex === opt.value }]"
            style="flex:1; padding:0.4rem 0;"
            @click="activeCvssSubIndex = opt.value"
          >{{ opt.label }}</button>
        </div>

        <template v-if="activeCvssSubIndex === 0">
          <div class="score-display">
            <span class="score-value" :class="'sev-' + scoreSeverityClass(c40Score)">{{ c40Score.toFixed(1) }}</span>
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
        </template>

        <template v-else-if="activeCvssSubIndex === 1">
          <div class="score-display">
            <span class="score-value" :class="'sev-' + scoreSeverityClass(c31Score)">{{ c31Score.toFixed(1) }}</span>
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
        </template>

        <template v-else>
          <div class="score-display">
            <span class="score-value" :class="'sev-' + scoreSeverityClass(c20Score)">{{ c20Score.toFixed(1) }}</span>
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
        </template>
      </TabPanel>

      <!-- SSVC -->
      <TabPanel header="SSVC" :value="1">
        <div v-if="!editing" style="margin-bottom:0.85rem;">
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
          :tree="ssvcRoleDetail?.tree ?? null"
          :initial-leaf-node-id="ssvcInitialLeafNodeId"
          @resolved="onSsvcResolved"
        />
      </TabPanel>

      <!-- DREAD (reserved for future) -->
      <TabPanel header="DREAD" :value="2" :disabled="true">
        <p style="font-size:0.82rem; color:var(--ares-text-muted); margin:0;">DREAD scoring is coming soon.</p>
      </TabPanel>

      <!-- Manual -->
      <TabPanel header="Manual" :value="3">
        <div class="score-display" style="margin-bottom:1.25rem;">
          <span class="score-value" :class="'sev-' + scoreSeverityClass(textScore)">{{ manualPriorityLabel }}</span>
          <span class="score-sev">{{ scoreSeverityClass(textScore).toUpperCase() }}</span>
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
      </TabPanel>
    </TabView>

    <!-- ── Default + comment ─────────────────────────────────────────────── -->
    <div style="display:flex; flex-direction:column; gap:0.6rem; margin-top:1.1rem; padding-top:1rem; border-top:1px solid var(--ares-border);">
      <div v-if="showDefaultOption !== false && (activeTabIndex !== 1 || ssvcSelectedRoleUsesPriorityMapping)" style="display:flex; align-items:center; gap:0.5rem;">
        <Checkbox v-model="isDefaultChecked" input-id="score-is-default" binary />
        <label for="score-is-default" style="margin:0; font-size:0.85rem;">Set as default score</label>
      </div>
      <p v-else-if="activeTabIndex === 1" style="margin:0; font-size:0.75rem; color:var(--ares-text-muted);">
        This role is informational only — it can't set the finding's priority.
      </p>
      <input
        v-model="comment"
        type="text"
        class="score-comment-input"
        placeholder="Add a note… (optional)"
      />
    </div>

    <!-- ── Actions ────────────────────────────────────────────────────────── -->
    <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1rem;">
      <Button type="button" label="Cancel" severity="secondary" size="small" @click="close" />
      <Button type="button" :label="editing ? 'Save' : 'Add'" icon="pi pi-check" size="small" :disabled="!canSave" @click="save" />
    </div>
  </Dialog>
</template>

<style scoped>
/* ── Score comment input ─────────────────────────────── */
.score-comment-input {
  width: 100%;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.18));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
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
   .p-tabview-tablist-item > .p-tabview-tab-header. (NOT .p-tabview-nav* — those are an
   older PrimeVue 4.2 naming that no longer matches anything in the installed version.) */
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

/* Editing: hide the tab nav entirely (see comment above the TabView) so there's no
   affordance to switch score type mid-edit — only the active panel renders. */
.tabs--locked :deep(.p-tabview-tablist-container) {
  display: none;
}
.tabs--locked :deep(.tab-panel-container) {
  padding-top: 0 !important;
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
/* SSVC shows its outcome word (e.g. "Out-of-Cycle"), not a number — too wide for the
   numeric score's 2rem/fixed-min-width treatment. */
.score-value--text {
  font-size: 1.3rem;
  min-width: 0;
  text-transform: none;
  letter-spacing: normal;
}
.score-sev {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
}
/* CVSS 4.0's CVSS-B/BT/BE/BTE classification — which metric groups were actually filled in. */
.score-classification {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 40%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.45rem;
  white-space: nowrap;
}
/* CVSS 3.x/2.0's Base/Temporal/Environmental — up to 3 separate scores, shown once their
   respective metrics are actually filled in (Base is always present). */
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
