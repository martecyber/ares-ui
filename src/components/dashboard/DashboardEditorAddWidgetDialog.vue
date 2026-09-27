<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import type { DashboardLevel, DashboardWidgetType, WidgetInput } from '@/api/dashboards';
import InputNumber from 'primevue/inputnumber';
import AqlFilterInput from '@/components/AqlFilterInput.vue';
import { widgetCatalogFor, widgetCatalogEntry, DASHBOARD_AQL_ENTITIES_BY_LEVEL, DASHBOARD_LIST_SORT_FIELDS_BY_ENTITY } from '@/constants/dashboardWidgets';
import { aqlApi, type AqlFieldInfo } from '@/api/aql';

/** Widget being reconfigured, or null when the dialog is in "add a new widget" mode instead. */
export interface EditingWidgetInfo {
  type: DashboardWidgetType;
  title: string | null;
  config: Record<string, any>;
}

const props = defineProps<{
  visible: boolean;
  level: DashboardLevel;
  editingWidget?: EditingWidgetInfo | null;
  /** Dashboard's own scope — needed only to resolve {{...}} AQL context-variable availability
   *  (AQL context-variables initiative) for the AQL filter/group-by fields below. */
  scopeId?: number | null;
  orgId?: number | null;
}>();

// {{...}} variable scope derived from the dashboard's own level/scopeId/orgId — mirrors how
// DashboardWidgetDataService resolves projectId/orgId from the same two inputs server-side.
const variableProjectId = computed(() => props.level === 'PROJECT' ? (props.scopeId ?? null) : null);
const variableOrgId = computed(() => {
  if (props.level === 'ORGANIZATION') return props.scopeId ?? null;
  if (props.level === 'PROJECT') return props.orgId ?? null;
  return null;
});
const emit = defineEmits<{
  'update:visible': [value: boolean];
  add: [input: Pick<WidgetInput, 'type' | 'title' | 'config'>];
  update: [input: Pick<WidgetInput, 'title' | 'config'>];
}>();

const isEditing = computed(() => !!props.editingWidget);
const catalog = computed(() => widgetCatalogFor(props.level));
const entityOptions = computed(() => DASHBOARD_AQL_ENTITIES_BY_LEVEL[props.level]);

const selectedType = ref<DashboardWidgetType | null>(null);
const title = ref('');
const entity = ref('');
const aql = ref('');
const groupByField = ref('');
const chartType = ref<'bar' | 'bar_grouped' | 'bar_stacked' | 'line' | 'pie' | 'donut'>('bar');
const dateBucket = ref('');
const seriesField = ref('');
const sortMode = ref('');
const topN = ref<number | null>(null);
const sortField = ref('');
const sortDir = ref<'asc' | 'desc'>('desc');
const limit = ref(8);
const groupableFields = ref<AqlFieldInfo[]>([]);
const validationError = ref<string | null>(null);
const validating = ref(false);

const selectedEntry = computed(() => selectedType.value ? widgetCatalogEntry(selectedType.value) : null);
const sortFieldOptions = computed(() => DASHBOARD_LIST_SORT_FIELDS_BY_ENTITY[entity.value] ?? []);

watch(() => props.visible, (open) => {
  if (!open) return;
  validationError.value = null;
  if (props.editingWidget) {
    selectedType.value = props.editingWidget.type;
    title.value = props.editingWidget.title ?? '';
    entity.value = props.editingWidget.config?.entity ?? entityOptions.value[0]?.value ?? '';
    aql.value = props.editingWidget.config?.aql ?? '';
    groupByField.value = props.editingWidget.config?.groupByField ?? '';
    chartType.value = props.editingWidget.config?.chartType ?? 'bar';
    dateBucket.value = props.editingWidget.config?.dateBucket ?? '';
    seriesField.value = props.editingWidget.config?.seriesField ?? '';
    sortMode.value = props.editingWidget.config?.sortMode ?? '';
    topN.value = props.editingWidget.config?.topN ?? null;
    sortField.value = props.editingWidget.config?.sortField ?? '';
    sortDir.value = props.editingWidget.config?.sortDir ?? 'desc';
    limit.value = props.editingWidget.config?.limit ?? 8;
  } else {
    selectedType.value = catalog.value[0]?.type ?? null;
    title.value = '';
    entity.value = entityOptions.value[0]?.value ?? '';
    aql.value = '';
    groupByField.value = '';
    chartType.value = 'bar';
    dateBucket.value = '';
    seriesField.value = '';
    sortMode.value = '';
    topN.value = null;
    sortField.value = '';
    sortDir.value = 'desc';
    limit.value = 8;
  }
});

watch(entity, async (e) => {
  if (!e) { groupableFields.value = []; return; }
  groupableFields.value = await aqlApi.fields(e).catch(() => []);
  const stillValid = groupableFields.value.some((f) => f.name === groupByField.value);
  if (!stillValid) groupByField.value = '';
  if (!sortFieldOptions.value.some((f) => f.value === sortField.value)) sortField.value = '';
}, { immediate: true });

const groupableFieldOptions = computed(() =>
  groupableFields.value.filter((f) => ['STRING', 'BOOLEAN', 'ENUM', 'PRIORITY', 'DATE'].includes(f.type)));

// Drives the "Bucket by" granularity selector — only DATE-typed fields (plain columns like
// createdAt, or a status.<name> transition date) support date_trunc bucketing server-side; every
// other bucket count is grouped on the field's exact value already, no bucketing needed.
const groupByFieldIsDate = computed(() =>
  groupableFields.value.find((f) => f.name === groupByField.value)?.type === 'DATE');

// Only Finding carries a real iterationLabel column; Detection has no iteration field of its own
// but DetectionService.countGroupedByAql joins DetectionIterationStat when dateBucket ===
// 'iteration' is requested for it (project-scope only — 'detection' isn't even offered as an
// entity at ORGANIZATION level, see DASHBOARD_AQL_ENTITIES_BY_LEVEL, so no extra level check is
// needed here). Asset has no iteration concept at all.
const entitySupportsIteration = computed(() => entity.value === 'finding' || entity.value === 'detection');
const isIterationBucket = computed(() => dateBucket.value === 'iteration');

// The "Bucket by" selector's own option list is built from whichever bucketing modes actually
// apply right now — calendar granularities only make sense once a DATE field is picked as
// "Group by", "Iteration" only for entities that have one. When neither applies there's nothing
// to pick and the whole control hides (see the template).
const bucketByOptions = computed(() => {
  const opts: { label: string; value: string }[] = [];
  if (groupByFieldIsDate.value) {
    opts.push({ label: 'Day', value: 'day' }, { label: 'Week', value: 'week' }, { label: 'Month', value: 'month' },
      { label: 'Quarter', value: 'quarter' }, { label: 'Year', value: 'year' });
  }
  if (entitySupportsIteration.value) opts.push({ label: 'Iteration', value: 'iteration' });
  return opts;
});

// Keeps a stale selection (e.g. "Month" after switching "Group by" to a non-date field) from
// silently surviving as an invalid value the Select control can no longer display.
watch(bucketByOptions, (opts) => {
  if (dateBucket.value && !opts.some((o) => o.value === dateBucket.value)) dateBucket.value = '';
});

// A field already used as the primary axis can't also be the series — and once bucketing by
// iteration, there's no "primary field" at all so nothing to exclude.
const seriesFieldOptions = computed(() =>
  groupableFieldOptions.value.filter((f) => isIterationBucket.value || f.name !== groupByField.value));

async function validate(): Promise<boolean> {
  if (!aql.value.trim()) { validationError.value = null; return true; }
  validating.value = true;
  try {
    await aqlApi.validate(entity.value, aql.value.trim(), variableProjectId.value, variableOrgId.value);
    validationError.value = null;
    return true;
  } catch (err: any) {
    validationError.value = err?.response?.data?.detail ?? 'Invalid AQL query';
    return false;
  } finally {
    validating.value = false;
  }
}

function close() { emit('update:visible', false); }

async function confirm() {
  if (!selectedType.value) return;
  if (selectedEntry.value?.configurable) {
    if (!entity.value) { validationError.value = 'Pick an entity'; return; }
    if (!(await validate())) return;
    if (selectedType.value === 'AQL_CHART' && !isIterationBucket.value && !groupByField.value) {
      validationError.value = 'Pick a field to group by';
      return;
    }
  }
  const config: Record<string, any> = !selectedEntry.value?.configurable
    ? {}
    : selectedType.value === 'AQL_CHART'
      ? { entity: entity.value, aql: aql.value.trim(), groupByField: groupByField.value, chartType: chartType.value,
          dateBucket: (groupByFieldIsDate.value || isIterationBucket.value) ? dateBucket.value : null,
          seriesField: (chartType.value === 'pie' || chartType.value === 'donut') ? null : (seriesField.value || null),
          sortMode: sortMode.value || null,
          topN: topN.value || null }
      : selectedType.value === 'AQL_LIST'
        ? { entity: entity.value, aql: aql.value.trim(), sortField: sortField.value, sortDir: sortDir.value, limit: limit.value }
        : { entity: entity.value, aql: aql.value.trim() };
  if (isEditing.value) {
    emit('update', { title: title.value.trim() || null, config });
  } else {
    emit('add', { type: selectedType.value, title: title.value.trim() || null, config });
  }
  close();
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)" modal :header="isEditing ? 'Edit widget' : 'Add widget'" style="width: 480px;">
    <div style="display:flex; flex-direction:column; gap:0.9rem;">
      <div v-if="!isEditing">
        <label class="field-label">Widget type</label>
        <div class="type-grid">
          <button v-for="entry in catalog" :key="entry.type" type="button"
            class="type-option" :class="{ selected: selectedType === entry.type }"
            @click="selectedType = entry.type">
            <span>{{ entry.label }}</span>
          </button>
        </div>
      </div>

      <div>
        <label class="field-label">Title (optional)</label>
        <InputText v-model="title" style="width:100%;" :placeholder="selectedEntry?.label" />
      </div>

      <template v-if="selectedEntry?.configurable">
        <div>
          <label class="field-label">Entity</label>
          <Select v-model="entity" :options="entityOptions" option-label="label" option-value="value" style="width:100%;" />
        </div>
        <div>
          <label class="field-label">AQL filter (optional — blank counts everything in scope)</label>
          <AqlFilterInput v-model="aql" :entity="entity" :project-id="variableProjectId" :organization-id="variableOrgId" @blur="validate" />
          <p v-if="validationError" style="margin:0.3rem 0 0; font-size:0.75rem; color:var(--ares-error);">{{ validationError }}</p>
        </div>
        <template v-if="selectedType === 'AQL_CHART'">
          <div>
            <label class="field-label">Chart type</label>
            <Select v-model="chartType" :options="[
              {label:'Bar',value:'bar'},{label:'Grouped bar',value:'bar_grouped'},{label:'Stacked bar',value:'bar_stacked'},
              {label:'Line',value:'line'},{label:'Pie',value:'pie'},{label:'Donut',value:'donut'}]"
              option-label="label" option-value="value" style="width:100%;" />
          </div>
          <div v-if="!isIterationBucket">
            <label class="field-label">Group by</label>
            <Select v-model="groupByField" :options="groupableFieldOptions" option-label="name" option-value="name"
              placeholder="Select a field" style="width:100%;" />
          </div>
          <div v-if="bucketByOptions.length">
            <label class="field-label">Bucket by (optional)</label>
            <Select v-model="dateBucket" :options="bucketByOptions" option-label="label" option-value="value"
              placeholder="No bucketing — one bar per value" show-clear style="width:100%;" />
          </div>
          <div v-if="chartType !== 'pie' && chartType !== 'donut'">
            <label class="field-label">Series by (optional — splits each bar/point into multiple series)</label>
            <Select v-model="seriesField" :options="seriesFieldOptions" option-label="name" option-value="name"
              placeholder="No series — one value per category" show-clear style="width:100%;" />
          </div>
          <div style="display:flex; gap:0.6rem;">
            <div style="flex:1;">
              <label class="field-label">Sort (optional)</label>
              <Select v-model="sortMode" :options="[
                {label:'Value, high to low',value:'value_desc'},{label:'Value, low to high',value:'value_asc'},
                {label:'Label, A to Z',value:'label_asc'},{label:'Label, Z to A',value:'label_desc'}]"
                option-label="label" option-value="value" placeholder="Default" show-clear style="width:100%;" />
            </div>
            <div style="width:150px;">
              <label class="field-label">{{ bucketByOptions.length && dateBucket ? 'Limit periods' : 'Limit categories' }}</label>
              <InputNumber v-model="topN" :min="1" :max="50"
                :placeholder="bucketByOptions.length && dateBucket ? 'All periods' : 'No limit'" show-buttons style="width:100%;" />
              <p v-if="bucketByOptions.length && dateBucket" style="margin:0.3rem 0 0; font-size:0.72rem; color:var(--ares-text-muted);">
                Keeps only the most recent N {{ dateBucket === 'iteration' ? 'iterations' : dateBucket + 's' }}.
              </p>
            </div>
          </div>
        </template>
        <template v-if="selectedType === 'AQL_LIST'">
          <div style="display:flex; gap:0.6rem;">
            <div style="flex:1;">
              <label class="field-label">Sort by</label>
              <Select v-model="sortField" :options="sortFieldOptions" option-label="label" option-value="value"
                placeholder="Created (default)" show-clear style="width:100%;" />
            </div>
            <div style="width:120px;">
              <label class="field-label">Direction</label>
              <Select v-model="sortDir" :options="[{label:'Descending',value:'desc'},{label:'Ascending',value:'asc'}]"
                option-label="label" option-value="value" style="width:100%;" />
            </div>
          </div>
          <div>
            <label class="field-label">Row limit</label>
            <InputNumber v-model="limit" :min="1" :max="20" show-buttons style="width:100%;" />
          </div>
        </template>
      </template>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button :label="isEditing ? 'Save' : 'Add'" :disabled="!selectedType || validating" @click="confirm" />
    </template>
  </Dialog>
</template>

<style scoped>
.field-label { display:block; font-size:0.78rem; color:var(--ares-text-muted); margin-bottom:0.3rem; }
.type-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:0.5rem; }
.type-option {
  padding:0.5rem 0.65rem;
  border:1px solid var(--ares-border); border-radius:var(--ares-radius); background:var(--ares-surface);
  color:var(--ares-text); font-size:0.8rem; cursor:pointer; text-align:left; font-family:inherit;
}
.type-option:hover { border-color:var(--p-primary-400); }
.type-option.selected { border-color:var(--p-primary-400); background:color-mix(in srgb, var(--p-primary-400) 12%, var(--ares-surface)); }
</style>
