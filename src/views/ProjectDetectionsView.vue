<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { projectsApi } from '@/api/projects';
import { detectionsApi, detectionStatusSeverity, detectionStatusLabel, DETECTION_STATUS_TRANSITIONS, type Detection } from '@/api/detections';
import { useToast } from 'primevue/usetoast';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';
import SeverityTag from '@/components/SeverityTag.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import AppPagination from '@/components/AppPagination.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import EscalationWizard from '@/components/EscalationWizard.vue';
import InvestigateDialog from '@/components/InvestigateDialog.vue';
import AresBadge from '@/components/AresBadge.vue';
import TagChipList from '@/components/TagChipList.vue';
import KevBadgeCompact from '@/components/KevBadgeCompact.vue';
import ExploitBadge from '@/components/ExploitBadge.vue';
import QueryBar from '@/components/QueryBar.vue';
import { severityToPriorityLabel } from '@/utils/cvss';
import Button from 'primevue/button';

const route = useRoute();
const router = useRouter();
const context = useContextStore();
const auth = useAuthStore();
const engId = computed(() => Number(route.params.engId));
const orgId = computed(() => Number(route.params.orgId));

const PAGE_SIZE = 50;
const detections = ref<Detection[]>([]);
const loading = ref(true);
const total = ref(0);
const totalPages = ref(0);
const page = ref(0);
const severityFilter = ref<string[]>([]);
const statusFilter = ref<string[]>([]);
const sourceFilter = ref<string[]>([]);
const assetFilter = ref<string[]>([]);   // asset IDs as strings for ColumnHeader
const searchState = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });
const queryBarRef = ref<InstanceType<typeof QueryBar> | null>(null);
const availableSources = ref<string[]>([]);
const detectionAssets = ref<{ id: number; code: string | null; identifier: string | null }[]>([]);
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const selected = ref<number[]>([]);
const showBulkEscalate = ref(false);
const showInvestigate = ref(false);
const bulkApplying = ref(false);
const toast = useToast();

const selectedDetectionObjects = computed(() =>
  selected.value
    .map(id => detections.value.find(d => d.id === id))
    .filter((d): d is Detection => !!d)
);

const bulkAvailableStatuses = computed(() => {
  if (!selectedDetectionObjects.value.length) return [];
  const sets = selectedDetectionObjects.value.map(d =>
    new Set((DETECTION_STATUS_TRANSITIONS[d.status] ?? []).filter(s => s !== 'affected'))
  );
  return [...sets[0]].filter(s => sets.every(set => set.has(s)));
});

async function applyBulkStatus(status: string) {
  bulkApplying.value = true;
  let success = 0, failed = 0;
  for (const d of selectedDetectionObjects.value) {
    const allowed = DETECTION_STATUS_TRANSITIONS[d.status] ?? [];
    if (allowed.includes(status)) {
      try { await detectionsApi.updateStatus(d.id, status); success++; }
      catch { failed++; }
    }
  }
  bulkApplying.value = false;
  if (failed === 0) toast.add({ severity: 'success', summary: 'Status updated', detail: `${success} detection(s) updated.`, life: 3000 });
  else toast.add({ severity: 'warn', summary: 'Partial update', detail: `${success} updated, ${failed} failed.`, life: 4000 });
  if (success > 0) { selected.value = []; load(); }
}

const allOnPageSelected = computed(() =>
  detections.value.length > 0 && detections.value.every(d => selected.value.includes(d.id))
);

function toggleSelectAll() {
  if (allOnPageSelected.value) {
    selected.value = selected.value.filter(id => !detections.value.some(d => d.id === id));
  } else {
    const newIds = detections.value.map(d => d.id).filter(id => !selected.value.includes(id));
    selected.value = [...selected.value, ...newIds];
  }
}

function toggleSelect(id: number, e: Event) {
  e.stopPropagation();
  const idx = selected.value.indexOf(id);
  if (idx === -1) selected.value = [...selected.value, id];
  else selected.value = selected.value.filter(x => x !== id);
}

const severityOptions = ['critical', 'high', 'medium', 'low', 'info']
  .map((value) => ({ label: severityToPriorityLabel(value), value }));

const statusOptions = [
  { label: 'New', value: 'new' },
  { label: 'Under investigation', value: 'under_investigation' },
  { label: 'Affected', value: 'affected' },
  { label: 'Not affected', value: 'not_affected' },
  { label: 'Ignored', value: 'ignored' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Reopened', value: 'reopened' },
];

const sourceOptions = computed(() =>
  availableSources.value.map(s => ({ label: s, value: s }))
);

const assetOptions = computed(() =>
  detectionAssets.value.map(a => ({
    label: [a.code, a.identifier].filter(Boolean).join(' · '),
    value: String(a.id),
  }))
);

function onEscalationDone() {
  showBulkEscalate.value = false;
  selected.value = [];
  load();
}

async function load() {
  loading.value = true;
  try {
    const res = await detectionsApi.list({
      projectId: engId.value,
      assetId: assetFilter.value.length ? assetFilter.value.map(Number) : undefined,
      severity: severityFilter.value.length ? severityFilter.value : undefined,
      status: statusFilter.value.length ? statusFilter.value : undefined,
      sourceType: sourceFilter.value.length ? sourceFilter.value : undefined,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      sortBy: sortCol.value ?? undefined,
      sortDir: sortDir.value ?? undefined,
      page: page.value,
      size: PAGE_SIZE,
    });
    detections.value = res.items;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch { /* silent */ } finally {
    loading.value = false;
  }
}

function onFilter() { page.value = 0; selected.value = []; load(); }

function clearAllFilters() {
  severityFilter.value = [];
  statusFilter.value = [];
  sourceFilter.value = [];
  assetFilter.value = [];
  searchState.value = { mode: 'basic', value: '' };
  queryBarRef.value?.reset();
  onFilter();
}

const hasActiveFilters = computed(() =>
  severityFilter.value.length > 0 || statusFilter.value.length > 0 ||
  sourceFilter.value.length > 0 || assetFilter.value.length > 0 ||
  searchState.value.value.trim().length > 0
);
watch(page, () => { selected.value = []; load(); });

function onSearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  searchState.value = payload;
  onFilter();
}

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortDir.value = dir;
  sortCol.value = dir === null ? null : col;
  page.value = 0;
  load();
}

onMounted(async () => {
  try {
    const eng = await projectsApi.get(engId.value);
    if (eng) context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
  } catch { /* silent */ }
  // Load filter metadata in parallel with initial detections
  await Promise.all([
    load(),
    detectionsApi.sources(engId.value).then(s => { availableSources.value = s; }).catch(() => {}),
    detectionsApi.detectionAssets(engId.value).then(a => { detectionAssets.value = a; }).catch(() => {}),
  ]);
});
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Detections</h2>
        <p class="ares-page-subtitle">Scanner detections associated with this project.</p>
      </div>
      <Button v-if="!auth.isClient" icon="pi pi-upload" text size="small"
        v-tooltip.top="'Import'" @click="router.push({ name: 'org-project-imports', params: { orgId: orgId, engId: engId } })" />
    </div>

    <div style="display:flex; gap:0.6rem; margin-bottom:1rem; flex-wrap:wrap; align-items:center;">
      <div style="flex:1; min-width:260px;">
        <QueryBar ref="queryBarRef" entity="detection" placeholder="Search title, description, template ID…" :project-id="engId" :organization-id="orgId" :initial-aql="typeof route.query.aql === 'string' ? route.query.aql : undefined" @search="onSearch" />
      </div>
      <Button v-if="hasActiveFilters" label="Clear filters" size="small" severity="secondary" icon="pi pi-times" @click="clearAllFilters" />
      <span style="align-self:center; font-size:0.8rem; color:var(--ares-text-muted);">{{ total }} detection{{ total !== 1 ? 's' : '' }}</span>
    </div>

    <AresLoadingState v-if="loading" />
    <template v-else>
      <div class="ares-card" style="padding:0;">
        <table class="ares-table">
          <thead>
            <tr>
              <th v-if="!auth.isClient" style="width:36px; padding:0 0 0 12px;">
                <input type="checkbox" class="row-check" :checked="allOnPageSelected" @change="toggleSelectAll" />
              </th>
              <th style="width:80px; position:relative;">
                <ColumnHeader
                  label="Pri."
                  :sortable="true"
                  :sort-dir="sortCol === 'severity' ? sortDir : null"
                  sort-asc-label="Most urgent first"
                  sort-desc-label="Least urgent first"
                  :filter-options="severityOptions"
                  :filter-value="severityFilter"
                  popup-align="left"
                  @update:sort-dir="onSort('severity', $event)"
                  @update:filter-value="severityFilter = $event; onFilter()"
                />
              </th>
              <th style="position:relative;">
                <ColumnHeader
                  label="Title"
                  :sortable="true"
                  :sort-dir="sortCol === 'title' ? sortDir : null"
                  sort-asc-label="A → Z"
                  sort-desc-label="Z → A"
                  popup-align="left"
                  @update:sort-dir="onSort('title', $event)"
                />
              </th>
              <th style="width:160px; position:relative;">
                <ColumnHeader
                  label="Asset"
                  :filter-options="assetOptions"
                  :filter-value="assetFilter"
                  popup-align="left"
                  @update:filter-value="assetFilter = $event; onFilter()"
                />
              </th>
              <th style="width:120px; position:relative;">
                <ColumnHeader
                  label="Source"
                  :filter-options="sourceOptions"
                  :filter-value="sourceFilter"
                  popup-align="left"
                  @update:filter-value="sourceFilter = $event; onFilter()"
                />
              </th>
              <th style="width:120px; position:relative;">
                <ColumnHeader
                  label="Status"
                  :filter-options="statusOptions"
                  :filter-value="statusFilter"
                  popup-align="right"
                  @update:filter-value="statusFilter = $event; onFilter()"
                />
              </th>
              <th style="width:110px; position:relative;">
                <ColumnHeader
                  label="Last seen"
                  :sortable="true"
                  :sort-dir="sortCol === 'lastSeen' ? sortDir : null"
                  sort-asc-label="Oldest first"
                  sort-desc-label="Newest first"
                  popup-align="right"
                  @update:sort-dir="onSort('lastSeen', $event)"
                />
              </th>
              <th style="width:160px;">Tags</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in detections"
              :key="d.id"
              style="cursor:pointer;"
              :class="{ 'row--selected': selected.includes(d.id) }"
              @click="router.push({ name: 'org-project-detection-detail', params: { orgId: orgId, engId: engId, id: d.id } })"
            >
              <td v-if="!auth.isClient" style="padding:0 0 0 12px;" @click.stop>
                <input type="checkbox" class="row-check" :checked="selected.includes(d.id)" @change="toggleSelect(d.id, $event)" />
              </td>
              <td><SeverityTag :level="d.severity" short scale="priority" /></td>
              <td>
                <div>{{ d.title }}</div>
                <div v-if="d.sourceTemplateId" style="font-size:0.72rem; color:var(--ares-text-muted);">{{ d.sourceTemplateId }}</div>
                <div
                  v-if="d.references.some(r => r.catalogCode === 'CVE' && (r.kevListed || r.exploitCount))"
                  style="display:flex; flex-wrap:wrap; gap:0.3rem; margin-top:0.25rem;"
                  @click.stop
                >
                  <template v-for="r in d.references.filter(r => r.catalogCode === 'CVE')" :key="r.id">
                    <KevBadgeCompact :cve-id="r.title" :kev-listed="r.kevListed" />
                    <ExploitBadge :cve-id="r.title" :count="r.exploitCount" />
                  </template>
                </div>
              </td>
              <td style="font-size:0.8rem; color:var(--ares-text-2);">
                {{ d.assetIdentifier || d.assetCode || '—' }}
              </td>
              <td><SourceBadge :source="d.sourceType" /></td>
              <td><AresBadge :value="detectionStatusLabel(d.status)" :severity="detectionStatusSeverity(d.status)" /></td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">
                {{ d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : '—' }}
              </td>
              <td @click.stop>
                <TagChipList :tags="d.tags" />
              </td>
            </tr>
            <tr v-if="!detections.length">
              <td :colspan="auth.isClient ? 7 : 8" class="ares-table-empty">No detections match the current filters.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
    </template>
  </div>

  <!-- Bulk action bar -->
  <Transition name="bulk-bar">
    <div v-if="selected.length > 0 && !auth.isClient" class="bulk-bar">
      <span class="bulk-bar__count">{{ selected.length }} selected</span>
      <Button
        label="Escalate"
        icon="pi pi-arrow-up-right"
        size="small"
        @click="showBulkEscalate = true"
      />
      <Button
        label="Investigate"
        icon="pi pi-search"
        size="small"
        severity="secondary"
        @click="showInvestigate = true"
      />
      <Button
        v-for="status in bulkAvailableStatuses"
        :key="status"
        :label="detectionStatusLabel(status)"
        size="small"
        severity="secondary"
        :loading="bulkApplying"
        @click="applyBulkStatus(status)"
      />
      <Button
        label="Clear"
        severity="secondary"
        size="small"
        @click="selected = []"
      />
    </div>
  </Transition>

  <InvestigateDialog
    v-model:visible="showInvestigate"
    :project-id="engId"
    :detection-ids="selected"
    @done="selected = []; load()"
  />

  <EscalationWizard
    v-model:visible="showBulkEscalate"
    :project-id="engId"
    :org-id="orgId"
    :detections="selectedDetectionObjects"
    @done="onEscalationDone"
  />
</template>

<style scoped>
.row-check {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--ares-accent);
}
:deep(.row--selected) td {
  background: color-mix(in srgb, var(--ares-accent) 7%, transparent) !important;
}

.bulk-bar {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.5rem 0.9rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  z-index: 500;
}
.bulk-bar__count {
  font-size: 0.83rem;
  font-weight: 600;
  color: var(--ares-text-1);
  white-space: nowrap;
  padding-right: 0.3rem;
}

.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.18s, transform 0.18s; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }

</style>
