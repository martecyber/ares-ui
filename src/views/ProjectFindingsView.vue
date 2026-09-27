<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import AppPagination from '@/components/AppPagination.vue';
import EscalationWizard from '@/components/EscalationWizard.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import RetestFindingPickerDialog from '@/components/RetestFindingPickerDialog.vue';
import QueryBar from '@/components/QueryBar.vue';
import ReportFindingByEmailDialog from '@/components/ReportFindingByEmailDialog.vue';
import { findingsApi, statusLabel, statusSeverity, type Finding, type FindingStatus } from '@/api/findings';
import { severityToPriorityLabel } from '@/utils/cvss';
import { projectsApi, isRetest, type Project } from '@/api/projects';
import { projectRetestApi } from '@/api/project-retest';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';
import { useToast } from 'primevue/usetoast';
import { confirmDialog } from '@/composables/useConfirmDialog';

const route = useRoute();
const router = useRouter();
const context = useContextStore();
const auth = useAuthStore();
const toast = useToast();

const engId = computed(() => Number(route.params.engId));
const orgId = computed(() => Number(route.params.orgId));

const PAGE_SIZE = 50;
const findings = ref<Finding[]>([]);
const statusMap = ref<Record<string, number>>({});
const loading = ref(true);
const showForm = ref(false);
const actionId = ref<number | null>(null);
const batchPublishing = ref(false);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);

// ── RETEST mode ──────────────────────────────────────────────────────
const project = ref<Project | null>(null);
const isRetestType = computed(() => isRetest(project.value?.typeCode, project.value?.supertypeCode));
const showRetestPicker = ref(false);
// ── Report by email — MSSP staff only, published findings only, no workflow needed ──
const showReportDialog = ref(false);
const reportTarget = ref<Finding | null>(null);
/** linkId + origin project, keyed by finding id — only populated in RETEST mode. */
const retestLinkByFindingId = ref<Record<number, { linkId: number; originProjectName: string | null; originProjectCode: string | null }>>({});

const severityFilter = ref<string[]>([]);
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

const severityOptions = ['critical', 'high', 'medium', 'low', 'info']
  .map((value) => ({ label: severityToPriorityLabel(value), value }));

const DRAFT_ORDER = ['drafting', 'pending_review', 'ready_to_publish'] as const;

function nextDraftStatus(currentStatus: string): string | null {
  const idx = DRAFT_ORDER.indexOf(currentStatus as typeof DRAFT_ORDER[number]);
  if (idx === -1 || idx === DRAFT_ORDER.length - 1) return null;
  return DRAFT_ORDER[idx + 1];
}

function nextDraftStatusLabel(currentStatus: string): string {
  const next = nextDraftStatus(currentStatus);
  return next ? statusLabel(next) : '';
}

function goToFinding(f: Finding) {
  router.push({ name: 'org-project-finding-detail', params: { orgId: orgId.value, engId: engId.value, id: f.id } });
}

function onFindingCreated(f: Finding) {
  findings.value.unshift(f);
  total.value++;
}

const sortedFindings = computed(() => {
  if (!sortCol.value || !sortDir.value) return findings.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...findings.value].sort((a, b) => {
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
  try {
    if (isRetestType.value) {
      const links = await projectRetestApi.list(engId.value);
      const byFinding: typeof retestLinkByFindingId.value = {};
      for (const link of links) {
        byFinding[link.finding.id] = {
          linkId: link.linkId,
          originProjectName: link.originProjectName,
          originProjectCode: link.originProjectCode,
        };
      }
      retestLinkByFindingId.value = byFinding;
      findings.value = links.map((l) => l.finding);
      totalPages.value = 1;
      total.value = links.length;
      return;
    }
    const res = await findingsApi.list({
      projectId: engId.value,
      includeDrafts: true,
      page: page.value,
      size: PAGE_SIZE,
      severity: severityFilter.value.length ? severityFilter.value : undefined,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
    });
    findings.value = res.items;
    totalPages.value = res.totalPages;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function unlinkRetestFinding(f: Finding, e: Event) {
  e.stopPropagation();
  const ok = await confirmDialog({
    header: 'Remove from retest scope',
    message: `Remove "${f.title}" from this retest? The finding itself is untouched — only the link is removed.`,
  });
  if (!ok) return;
  actionId.value = f.id;
  try {
    await projectRetestApi.unlink(engId.value, f.id);
    findings.value = findings.value.filter((x) => x.id !== f.id);
    total.value--;
  } catch (err: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: err?.response?.data?.detail ?? err.message, life: 4000 });
  } finally {
    actionId.value = null;
  }
}

function onRetestFindingsLinked() {
  showRetestPicker.value = false;
  load();
}

function onFilter() { page.value = 0; load(); }

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortDir.value = dir;
  sortCol.value = dir === null ? null : col;
}

watch(page, load);

async function advanceDraftStatus(f: Finding, e: Event) {
  e.stopPropagation();
  const next = nextDraftStatus(f.statusName);
  if (!next) return;
  const nextId = statusMap.value[next];
  if (!nextId) return;
  actionId.value = f.id;
  try {
    const updated = await findingsApi.update(f.id, f.projectId, { statusId: nextId });
    const idx = findings.value.findIndex((x) => x.id === f.id);
    if (idx !== -1) findings.value[idx] = updated;
  } catch (err: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: err?.response?.data?.detail ?? err.message, life: 4000 });
  } finally {
    actionId.value = null;
  }
}

async function publishOne(f: Finding, e: Event) {
  e.stopPropagation();
  actionId.value = f.id;
  try {
    const updated = await findingsApi.publish(f.id, f.projectId);
    const idx = findings.value.findIndex((x) => x.id === f.id);
    if (idx !== -1) findings.value[idx] = updated;
    toast.add({ severity: 'success', summary: 'Published', detail: `${updated.code} published`, life: 3000 });
  } catch (err: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: err?.response?.data?.detail ?? err.message, life: 4000 });
  } finally {
    actionId.value = null;
  }
}

async function publishBatch() {
  batchPublishing.value = true;
  try {
    const published = await findingsApi.publishAllReady(engId.value);
    await load();
    toast.add({ severity: 'success', summary: 'Published', detail: `${published.length} findings published`, life: 3000 });
  } catch (err: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: err?.response?.data?.detail ?? err.message, life: 4000 });
  } finally {
    batchPublishing.value = false;
  }
}


const readyToPublishCount = computed(() => findings.value.filter((f) => f.isDraft && f.statusName === 'ready_to_publish').length);

onMounted(async () => {
  try {
    const eng = await projectsApi.get(engId.value);
    if (eng) {
      project.value = eng;
      context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
    }
  } catch { /* silent */ }

  // Any failure here must not prevent load() from running below — otherwise loading (which
  // starts true, for the initial spinner) never gets reset to false by load()'s own finally.
  try {
    const statuses = await findingsApi.listStatuses();
    statusMap.value = Object.fromEntries(statuses.map((s: FindingStatus) => [s.name, s.id]));
  } catch { /* silent */ }
  await load();
});
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Findings</h2>
        <p class="ares-page-subtitle">
          <template v-if="isRetestType">Findings in scope for this retest — verify whether each one still applies.</template>
          <template v-else>Security findings for this project.</template>
        </p>
      </div>
      <div v-if="!auth.isClient" style="display:flex; gap:0.5rem;">
        <template v-if="isRetestType">
          <Button icon="pi pi-plus" text size="small" v-tooltip.top="'Add findings'" @click="showRetestPicker = true" />
        </template>
        <template v-else>
          <Button
            v-if="readyToPublishCount > 0"
            icon="pi pi-send"
            :badge="String(readyToPublishCount)"
            text
            severity="success"
            size="small"
            :loading="batchPublishing"
            v-tooltip.top="`Publish ready (${readyToPublishCount})`"
            @click="publishBatch"
          />
          <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New finding'" @click="showForm = true" />
        </template>
      </div>
    </div>

    <div v-if="!isRetestType" style="margin-bottom:1rem;">
      <QueryBar entity="finding" placeholder="Search title, code…" :project-id="engId" :organization-id="orgId" :initial-aql="typeof route.query.aql === 'string' ? route.query.aql : undefined" @search="onSearch" />
    </div>

    <AresLoadingState v-if="loading" />

    <template v-else>
      <div class="ares-card" style="padding:0;">
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:130px;">Code</th>
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
              <th style="width:100px; text-align:center; position:relative;">
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
              <th style="width:140px; text-align:center;">Status</th>
              <th v-if="isRetestType" style="width:160px;">Origin project</th>
              <th style="width:140px; text-align:center;">Action</th>
              <th v-if="!isRetestType" style="width:100px; position:relative;">
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
              v-for="f in sortedFindings"
              :key="f.id"
              style="cursor:pointer;"
              @click="goToFinding(f)"
            >
              <td>
                <span style="font-family:monospace; font-size:0.8rem;" :style="f.isDraft ? { color: 'var(--ares-text-muted)' } : {}">
                  {{ f.code ?? '—' }}
                </span>
              </td>
              <td style="font-weight:500;">{{ f.title }}</td>
              <td style="text-align:center;"><SeverityTag :level="f.severity" scale="priority" /></td>
              <td style="text-align:center;">
                <AresBadge v-if="f.isDraft" :value="statusLabel(f.statusName)" :severity="statusSeverity(f.statusName)" />
                <AresBadge v-else-if="f.remediationStatus"
                  :value="f.remediationStatus === 'closed' ? 'Remediated' : 'Open'"
                  :severity="f.remediationStatus === 'closed' ? 'success' : 'danger'" />
              </td>
              <td v-if="isRetestType" style="font-size:0.8rem;">
                <span>{{ retestLinkByFindingId[f.id]?.originProjectName ?? '—' }}</span>
                <span v-if="retestLinkByFindingId[f.id]?.originProjectCode" style="color:var(--ares-text-muted); font-family:monospace; font-size:0.72rem;">
                  &nbsp;({{ retestLinkByFindingId[f.id]?.originProjectCode }})
                </span>
              </td>
              <td style="text-align:center;" @click.stop>
                <template v-if="auth.isClient">
                  <span style="color:var(--ares-text-muted); font-size:0.75rem;">—</span>
                </template>
                <Button
                  v-else-if="isRetestType"
                  label="Remove"
                  icon="pi pi-times"
                  severity="danger"
                  size="small"
                  text
                  style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                  :loading="actionId === f.id"
                  @click="unlinkRetestFinding(f, $event)"
                />
                <template v-else-if="f.isDraft">
                  <Button
                    v-if="f.statusName === 'ready_to_publish'"
                    label="Publish"
                    icon="pi pi-send"
                    severity="success"
                    size="small"
                    text
                    style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                    :loading="actionId === f.id"
                    @click="publishOne(f, $event)"
                  />
                  <Button
                    v-else-if="nextDraftStatus(f.statusName)"
                    :label="nextDraftStatusLabel(f.statusName)"
                    icon="pi pi-arrow-right"
                    severity="secondary"
                    size="small"
                    text
                    style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                    :loading="actionId === f.id"
                    @click="advanceDraftStatus(f, $event)"
                  />
                </template>
                <Button
                  v-else
                  label="Report"
                  icon="pi pi-send"
                  severity="secondary"
                  size="small"
                  text
                  style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                  v-tooltip.top="'Report this finding by email'"
                  @click="reportTarget = f; showReportDialog = true"
                />
              </td>
              <td v-if="!isRetestType" style="font-size:0.8rem;"
                :style="{ color: f.dueDate && new Date(f.dueDate) < new Date() ? 'var(--ares-error)' : 'var(--ares-text-muted)' }">
                {{ f.dueDate ? new Date(f.dueDate).toLocaleDateString() : '—' }}
              </td>
            </tr>
            <tr v-if="!findings.length">
              <td colspan="6" class="ares-table-empty">
                {{ isRetestType ? 'No findings in scope yet. Add findings to retest.' : 'No findings yet. Create the first one.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AppPagination
        v-if="!isRetestType"
        :page="page"
        :total-pages="totalPages"
        :total="total"
        @prev="page--"
        @next="page++"
      />
    </template>

    <EscalationWizard
      v-if="!isRetestType"
      v-model:visible="showForm"
      :project-id="engId"
      :org-id="orgId"
      standalone-new-finding
      @done="onFindingCreated"
    />

    <RetestFindingPickerDialog
      v-if="isRetestType"
      v-model:visible="showRetestPicker"
      :project-id="engId"
      @linked="onRetestFindingsLinked"
    />

    <ReportFindingByEmailDialog
      v-if="reportTarget"
      v-model:visible="showReportDialog"
      :finding-id="reportTarget.id"
      :project-id="engId"
    />
  </div>
</template>
