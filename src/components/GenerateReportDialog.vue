<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { useToast } from 'primevue/usetoast';
import { reportsApi, reportFieldTypesApi, type Report, type ReportFieldType } from '@/api/reports';
import { findingsApi, type Finding } from '@/api/findings';
import SeverityTag from '@/components/SeverityTag.vue';
import AqlFilterInput from '@/components/AqlFilterInput.vue';

/** Findings fetches driven by an AQL query use a higher cap than the default (ready-to-report)
 *  load — an AQL filter is expected to narrow a potentially large project down, not just show the
 *  usual small ready-to-report subset. */
const AQL_FETCH_SIZE = 1000;

const props = defineProps<{
  visible: boolean;
  projectId: number;
  orgId: number;
  /** MONITOR projects: show iteration range filter in addition to finding selection. */
  isMonitor?: boolean;
}>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  generated: [report: Report];
}>();

const toast = useToast();
const saving = ref(false);
const fieldTypes = ref<ReportFieldType[]>([]);
const findings = ref<Finding[]>([]);

// Form state
const reportTitle = ref('');
const selectedFindingIds = ref<Set<number>>(new Set());
const fieldContents = ref<Record<string, string>>({});
const includedFieldIds = ref<Set<number>>(new Set());

// Field add dropdown
const fieldToAdd = ref<number | null>(null);

// MONITOR iteration range filter
const iterationFrom = ref('');
const iterationTo = ref('');

// AQL-based findings filtering/selection
const aqlQuery = ref('');
const aqlLoading = ref(false);

const activeFields = computed(() =>
  fieldTypes.value.filter((ft) => includedFieldIds.value.has(ft.id))
);
const availableToAdd = computed(() =>
  fieldTypes.value.filter((ft) => !includedFieldIds.value.has(ft.id))
);

function addField() {
  if (fieldToAdd.value == null) return;
  includedFieldIds.value = new Set([...includedFieldIds.value, fieldToAdd.value]);
  fieldToAdd.value = null;
}

function removeField(id: number) {
  const s = new Set(includedFieldIds.value);
  s.delete(id);
  includedFieldIds.value = s;
}

// Findings helpers
const allSelected = computed(() => findings.value.length > 0 && findings.value.every((f) => selectedFindingIds.value.has(f.id)));

function toggleAll() {
  if (allSelected.value) {
    selectedFindingIds.value = new Set();
  } else {
    selectedFindingIds.value = new Set(findings.value.map((f) => f.id));
  }
}
function toggleFinding(id: number) {
  const s = new Set(selectedFindingIds.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  selectedFindingIds.value = s;
}

/** Re-fetches the visible findings list filtered by the current AQL query — does not touch the
 *  current selection, same as any other filter/search should behave. */
async function applyAqlFilter() {
  aqlLoading.value = true;
  try {
    findings.value = await findingsApi
      .list({ projectId: props.projectId, includeDrafts: true, size: AQL_FETCH_SIZE, aql: aqlQuery.value.trim() || undefined })
      .then((r) => r.items);
  } catch {
    toast.add({ severity: 'error', summary: 'Invalid AQL query', life: 3000 });
  } finally {
    aqlLoading.value = false;
  }
}

/** Filters by the current AQL query (same as applyAqlFilter) and additionally selects every
 *  matching finding — additive, doesn't clear an existing selection. */
async function selectAllMatchingAql() {
  aqlLoading.value = true;
  try {
    const matched = await findingsApi
      .list({ projectId: props.projectId, includeDrafts: true, size: AQL_FETCH_SIZE, aql: aqlQuery.value.trim() || undefined })
      .then((r) => r.items);
    findings.value = matched;
    selectedFindingIds.value = new Set([...selectedFindingIds.value, ...matched.map((f) => f.id)]);
  } catch {
    toast.add({ severity: 'error', summary: 'Invalid AQL query', life: 3000 });
  } finally {
    aqlLoading.value = false;
  }
}

function applyFieldTemplate(slug: string, content: string) {
  fieldContents.value = { ...fieldContents.value, [slug]: content };
}

watch(() => props.visible, async (val) => {
  if (!val) return;
  reportTitle.value = '';
  selectedFindingIds.value = new Set();
  fieldContents.value = {};
  includedFieldIds.value = new Set();
  fieldToAdd.value = null;
  aqlQuery.value = '';

  const [fts, fds] = await Promise.all([
    reportFieldTypesApi.list().catch(() => []),
    findingsApi.list({ projectId: props.projectId, includeDrafts: true, size: 200 }).then((r) => r.items).catch(() => []),
  ]);
  fieldTypes.value = fts;
  findings.value = fds;

  // Pre-select findings marked ready to report
  selectedFindingIds.value = new Set(fds.filter((f) => f.isReadyToReport).map((f) => f.id));

  // Include required fields + fields that have a default template
  const initialIds = new Set<number>();
  fts.forEach((ft) => {
    const def = ft.templates.find((t) => t.isDefault);
    if (ft.required || def) {
      initialIds.add(ft.id);
      if (def) fieldContents.value[ft.name] = def.content;
    }
  });
  includedFieldIds.value = initialIds;
});

async function submit() {
  // Only send contents for included fields
  const customFields: Record<string, string> = {};
  activeFields.value.forEach((ft) => {
    if (fieldContents.value[ft.name] != null) customFields[ft.name] = fieldContents.value[ft.name];
  });
  // Using the MONITOR iteration-range fallback instead of manual selection: only when the range
  // is actually filled in AND nothing was manually selected — otherwise send the selection
  // explicitly, even empty, so the backend treats it as authoritative (an explicit empty
  // selection means "generate a report with no findings", not "fall back to something else").
  const useIterationRange = props.isMonitor
    && (iterationFrom.value.trim() || iterationTo.value.trim())
    && selectedFindingIds.value.size === 0;

  saving.value = true;
  try {
    const report = await reportsApi.create({
      projectId: props.projectId,
      organizationId: props.orgId,
      title: reportTitle.value.trim() || undefined,
      findingIds: useIterationRange ? undefined : [...selectedFindingIds.value],
      iterationFrom: useIterationRange && iterationFrom.value.trim() ? iterationFrom.value.trim() : undefined,
      iterationTo: useIterationRange && iterationTo.value.trim() ? iterationTo.value.trim() : undefined,
      customFields,
    });
    emit('generated', report);
    emit('update:visible', false);
    toast.add({ severity: 'success', summary: 'Report generated', detail: report.title, life: 4000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Generation failed', detail: e?.response?.data?.detail ?? e?.response?.data?.message ?? e.message, life: 8000 });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="New report"
    modal
    :style="{ width: 'min(860px, 96vw)', maxHeight: '92vh' }"
    :pt="{ content: { style: 'padding: 1.25rem 1.5rem 1.5rem; display:flex; flex-direction:column; gap:1.25rem; overflow-y:auto;' } }"
  >
    <!-- Title -->
    <div>
      <label class="dlg-label">Report title</label>
      <InputText v-model="reportTitle" style="width:100%;" placeholder="Leave empty for auto-generated title" />
    </div>

    <!-- MONITOR: iteration range filter (replaces / supplements manual finding selection) -->
    <div v-if="isMonitor" style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
      <div>
        <label class="dlg-label">Iteration from</label>
        <InputText v-model="iterationFrom" placeholder="e.g. 26-W01" style="width:100%;" />
      </div>
      <div>
        <label class="dlg-label">Iteration to</label>
        <InputText v-model="iterationTo" placeholder="e.g. 26-W04" style="width:100%;" />
      </div>
      <p style="grid-column:1/-1; font-size:0.72rem; color:var(--ares-text-muted); margin:0;">
        Leave blank to use the manual finding selection below instead.
      </p>
    </div>

    <!-- Findings selection -->
    <div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
        <label class="dlg-label" style="margin:0;">
          Findings to include
          <span style="font-weight:400; color:var(--ares-text-muted);">({{ selectedFindingIds.size }} selected)</span>
        </label>
        <Button type="button" :label="allSelected ? 'Deselect all' : 'Select all'"
          size="small" severity="secondary" text @click="toggleAll" />
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
        <AqlFilterInput v-model="aqlQuery" entity="finding" :project-id="projectId" :organization-id="orgId"
          placeholder="Filter findings by AQL…" style="flex:1;" @blur="applyAqlFilter" @keyup.enter="applyAqlFilter" />
        <Button type="button" label="Select all matching" size="small" severity="secondary"
          :loading="aqlLoading" :disabled="!aqlQuery.trim()" @click="selectAllMatchingAql" />
      </div>
      <div class="findings-table-wrap">
        <table class="findings-table">
          <thead>
            <tr>
              <th style="width:36px;"></th>
              <th style="width:120px;">Code</th>
              <th>Title</th>
              <th style="width:90px;">Severity</th>
              <th style="width:70px;">Ready</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in findings" :key="f.id"
              :class="{ 'row-selected': selectedFindingIds.has(f.id) }"
              @click="toggleFinding(f.id)">
              <td style="text-align:center;">
                <input type="checkbox" :checked="selectedFindingIds.has(f.id)"
                  style="pointer-events:none; cursor:pointer;" />
              </td>
              <td><code style="font-size:0.72rem; color:var(--ares-accent);">{{ f.code ?? '—' }}</code></td>
              <td style="font-size:0.85rem;">{{ f.title }}</td>
              <td><SeverityTag :level="f.severity" scale="priority" /></td>
              <td style="text-align:center;">
                <i v-if="f.isReadyToReport" class="pi pi-check-circle" style="color:#22c55e; font-size:0.9rem;" />
              </td>
            </tr>
            <tr v-if="!findings.length">
              <td colspan="5" style="padding:1rem; text-align:center; color:var(--ares-text-muted); font-size:0.83rem;">
                No findings in this project.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Custom fields -->
    <div v-if="fieldTypes.length">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.85rem;">
        <label class="dlg-label" style="margin:0;">Report fields</label>
        <div v-if="availableToAdd.length" style="display:flex; align-items:center; gap:0.4rem;">
          <Select
            v-model="fieldToAdd"
            :options="availableToAdd"
            option-label="label"
            option-value="id"
            placeholder="Add field…"
            style="width:200px;"
            size="small"
          />
          <Button icon="pi pi-plus" size="small" severity="secondary"
            :disabled="fieldToAdd == null"
            @click="addField" />
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div v-if="!activeFields.length" style="font-size:0.83rem; color:var(--ares-text-muted); padding:0.5rem 0;">
          No fields added. Use the dropdown above to include report fields.
        </div>
        <div v-for="ft in activeFields" :key="ft.id" class="field-block">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
            <span class="field-label">
              {{ ft.label }}
              <span v-if="!ft.required" style="font-weight:400; color:var(--ares-text-muted);"> (optional)</span>
            </span>
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <Select
                :options="ft.templates.map((t) => ({ label: t.name, value: t.content }))"
                option-label="label"
                option-value="value"
                :placeholder="ft.templates.length ? 'Use template…' : 'No templates'"
                :disabled="!ft.templates.length"
                style="width:200px;"
                size="small"
                @change="(e: any) => applyFieldTemplate(ft.name, e.value)"
              />
              <Button
                v-if="!ft.required"
                icon="pi pi-times"
                size="small"
                severity="danger"
                text
                title="Remove field"
                style="padding:0.25rem;"
                @click="removeField(ft.id)"
              />
            </div>
          </div>
          <MarkdownEditor
            :model-value="fieldContents[ft.name] ?? ''"
            @update:model-value="(v: string) => fieldContents = { ...fieldContents, [ft.name]: v }"
            editor-style="min-height:100px; max-height:260px; overflow-y:auto;"
          />
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="display:flex; gap:0.5rem; justify-content:flex-end; padding-top:0.25rem; border-top:1px solid var(--ares-border);">
      <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
      <Button label="Generate" :loading="saving" @click="submit" />
    </div>
  </Dialog>
</template>

<style scoped>
.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  letter-spacing: 0.02em;
  margin-bottom: 0.35rem;
}

.findings-table-wrap {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
  max-height: 240px;
  overflow-y: auto;
}
.findings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
}
.findings-table th {
  padding: 0.45rem 0.75rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  background: var(--ares-surface-sunken);
  border-bottom: 1px solid var(--ares-border);
  text-align: left;
}
.findings-table td {
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);
}
.findings-table tbody tr { cursor: pointer; transition: background 0.1s; }
.findings-table tbody tr:hover { background: color-mix(in srgb, var(--p-primary-500) 5%, transparent); }
.findings-table tbody tr.row-selected { background: color-mix(in srgb, var(--p-primary-500) 8%, transparent); }
.findings-table tbody tr:last-child td { border-bottom: none; }

.field-block {
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.85rem 1rem;
}
.field-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
