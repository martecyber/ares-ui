<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AresBadge from '@/components/AresBadge.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import QueryBar from '@/components/QueryBar.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import { findingsApi, statusLabel, statusSeverity, SEVERITIES, type Finding } from '@/api/findings';
import { severityToPriorityLabel } from '@/utils/cvss';
import { findingStatusesApi } from '@/api/finding-statuses';
import { projectsApi, type Project } from '@/api/projects';
import { useContextStore } from '@/stores/context';
import SeverityTag from '@/components/SeverityTag.vue';
import AppPagination from '@/components/AppPagination.vue';
import Message from 'primevue/message';
import AffectedAssetsPanel from '@/components/AffectedAssetsPanel.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';

const route = useRoute();
const router = useRouter();
const context = useContextStore();
const { isMobile } = useBreakpoint();

const orgId = computed(() => Number(route.params.orgId));

const PAGE_SIZE = 50;
const items = ref<Finding[]>([]);
const loading = ref(false);
const err = ref<string | null>(null);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);

const statusOptions = ref<{ label: string; value: string }[]>([]);
const projectOptions = ref<{ label: string; value: string }[]>([]);
const projectNameById = ref<Record<number, string>>({});

const severityOptions = SEVERITIES.map((s) => ({ label: severityToPriorityLabel(s), value: s }));

const projectFilter  = ref<string[]>([]);
const severityFilter = ref<string[]>([]);
const statusFilter   = ref<string[]>([]);
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const searchState = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });

function onSearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  searchState.value = payload;
  page.value = 0;
  load();
}

// Mirrors Ares's canonical P0-P4 priority scale (PriorityThresholds on the backend) — 0=critical
// (P0, most urgent) .. 4=info (P4, least urgent). Ascending sort on this value therefore shows
// the most urgent items first, same convention as every other sortable numeric-ish column.
const priorityWeight: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const sortedItems = computed(() => {
  if (!sortCol.value || !sortDir.value) return items.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...items.value].sort((a, b) => {
    if (sortCol.value === 'severity') {
      return dir * ((priorityWeight[a.severity ?? ''] ?? 5) - (priorityWeight[b.severity ?? ''] ?? 5));
    }
    if (sortCol.value === 'title') {
      return dir * a.title.localeCompare(b.title);
    }
    if (sortCol.value === 'dueDate') {
      const ta = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const tb = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return dir * (ta - tb);
    }
    return 0;
  });
});

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const res = await findingsApi.list({
      organizationId: orgId.value,
      projectIds: projectFilter.value.length ? projectFilter.value.map(Number) : undefined,
      includeDrafts: false,
      severity: severityFilter.value.length ? severityFilter.value : undefined,
      statusId: statusFilter.value.length ? statusFilter.value.map(Number) : undefined,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      page: page.value,
      size: PAGE_SIZE,
    });
    items.value = res.items;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message ?? 'Failed to load findings';
    items.value = [];
    total.value = 0;
    totalPages.value = 0;
  } finally {
    loading.value = false;
  }
}

function onFilter() { page.value = 0; load(); }

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortDir.value = dir;
  sortCol.value = dir === null ? null : col;
}

watch(page, load);

onMounted(async () => {
  // Apply filter from query param if coming from dashboard stats
  const sev = route.query.severity as string | undefined;
  if (sev) severityFilter.value = [sev];

  const [statuses, engs] = await Promise.all([
    findingStatusesApi.list().catch(() => []),
    projectsApi.list({ organizationId: orgId.value, size: 200 }).catch(() => ({ items: [] as Project[] })),
  ]);
  statusOptions.value = statuses.map((s) => ({ label: s.name.replace(/_/g, ' '), value: String(s.id) }));
  projectOptions.value = engs.items.map((e) => ({ label: e.name, value: String(e.id) }));
  projectNameById.value = Object.fromEntries(engs.items.map((e) => [e.id, e.name]));
  await load();
});
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Findings</h2>
        <p class="ares-page-subtitle">{{ context.org?.name ?? '' }} — vulnerabilities and security findings.</p>
      </div>
      <span style="font-size:0.8rem; color:var(--ares-text-muted);">
        {{ total }} finding{{ total !== 1 ? 's' : '' }}
      </span>
    </div>

    <Message v-if="err" severity="error" :closable="false" style="margin-bottom:1rem;">{{ err }}</Message>

    <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]">
    <div class="detail-grid__data">
    <div style="margin-bottom:1rem;">
      <QueryBar entity="finding" placeholder="Search title, code…" :organization-id="orgId" :initial-aql="typeof route.query.aql === 'string' ? route.query.aql : undefined" @search="onSearch" />
    </div>

    <template v-if="loading">
      <AresLoadingState />
    </template>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table ares-table--clickable">
          <thead>
            <tr>
              <th style="width:120px;">Code</th>
              <th style="width:160px; position:relative;">
                <ColumnHeader
                  label="Project"
                  :filter-options="projectOptions"
                  :filter-value="projectFilter"
                  popup-align="left"
                  @update:filter-value="projectFilter = $event; onFilter()"
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
              <th style="width:110px; text-align:center; position:relative;">
                <ColumnHeader
                  label="Priority"
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
              <th style="width:150px; text-align:center; position:relative;">
                <ColumnHeader
                  label="Status"
                  :filter-options="statusOptions"
                  :filter-value="statusFilter"
                  popup-align="left"
                  @update:filter-value="statusFilter = $event; onFilter()"
                />
              </th>
              <th style="width:100px; position:relative;">
                <ColumnHeader
                  label="Due date"
                  :sortable="true"
                  :sort-dir="sortCol === 'dueDate' ? sortDir : null"
                  sort-asc-label="Earliest first"
                  sort-desc-label="Latest first"
                  popup-align="right"
                  @update:sort-dir="onSort('dueDate', $event)"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in sortedItems"
              :key="f.id"
              @click="router.push({ name: 'org-finding-detail', params: { orgId, id: f.id } })"
            >
              <td>
                <code v-if="f.code" style="font-size:0.72rem; color:var(--ares-accent);">{{ f.code }}</code>
                <span v-else style="color:var(--ares-text-muted);">—</span>
              </td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ projectNameById[f.projectId] ?? '—' }}</td>
              <td>{{ f.title }}</td>
              <td style="text-align:center;"><SeverityTag :level="f.severity" scale="priority" /></td>
              <td style="text-align:center;">
                <AresBadge v-if="f.isDraft" :value="statusLabel(f.statusName)" :severity="statusSeverity(f.statusName)" />
                <AresBadge v-else-if="f.remediationStatus"
                  :value="f.remediationStatus === 'closed' ? 'Remediated' : 'Open'"
                  :severity="f.remediationStatus === 'closed' ? 'success' : 'danger'" />
              </td>
              <td style="font-size:0.8rem;"
                :style="{ color: f.dueDate && new Date(f.dueDate) < new Date() ? 'var(--ares-error)' : 'var(--ares-text-muted)' }">
                {{ f.dueDate ? new Date(f.dueDate).toLocaleDateString() : '—' }}
              </td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="6" class="ares-table-empty">No findings match the selected filters.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
    </template>
    </div>

    <div class="detail-grid__meta">
      <AffectedAssetsPanel
        :org-id="orgId"
        :organization-id="orgId"
        :project-ids="projectFilter.length ? projectFilter.map(Number) : undefined"
        :severity="severityFilter.length ? severityFilter : undefined"
        :status-id="statusFilter.length ? statusFilter.map(Number) : undefined"
        :q="searchState.mode === 'basic' && searchState.value ? searchState.value : undefined"
        :aql="searchState.mode === 'aql' && searchState.value ? searchState.value : undefined"
      />
    </div>
    </div>
  </div>
</template>
