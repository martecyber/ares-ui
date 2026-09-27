<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cveApi, cisaKevApi, vulncheckKevApi, type CveEntry, type CveSyncStats, type CisaKevStatusDto, type VulnCheckKevStatusDto } from '@/api/kb';
import KbSyncManagerDialog from '@/components/KbSyncManagerDialog.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import QueryBar from '@/components/QueryBar.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Button from 'primevue/button';
import SeverityTag from '@/components/SeverityTag.vue';
import KevBadge from '@/components/KevBadge.vue';
import ExploitBadge from '@/components/ExploitBadge.vue';
import { exploitsApi, type ExploitCountDto } from '@/api/kb-exploits';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const showSyncManager = ref(false);
const cisaKevStatus = ref<Map<string, CisaKevStatusDto>>(new Map());
const vulncheckKevStatus = ref<Map<string, VulnCheckKevStatusDto>>(new Map());
const exploitStatus = ref<Map<string, number>>(new Map());

const router = useRouter();

const entries   = ref<CveEntry[]>([]);
const stats     = ref<CveSyncStats | null>(null);
const loading   = ref(true);
const err         = ref<string | null>(null);

const searchState    = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });
const filterSeverity = ref<string[]>([]);
const filterKev      = ref<string[]>([]);
const filterPoc      = ref<string[]>([]);
const page           = ref(0);
const totalPages     = ref(0);
const totalElements  = ref(0);
const pageSize       = 50;

const SEVERITY_OPTIONS = [
  { label: 'CRITICAL', value: 'CRITICAL' },
  { label: 'HIGH',     value: 'HIGH' },
  { label: 'MEDIUM',   value: 'MEDIUM' },
  { label: 'LOW',      value: 'LOW' },
  { label: 'NONE',     value: 'NONE' },
];

const KEV_OPTIONS = [
  { label: 'CISA KEV',      value: 'cisa' },
  { label: 'VulnCheck KEV', value: 'vulncheck' },
  { label: 'Not listed',    value: 'none' },
];

const POC_OPTIONS = [
  { label: 'Has PoC',    value: 'yes' },
  { label: 'No PoC',     value: 'no' },
];

const sortCol = ref<string | null>('lastModifiedAt');
const sortDir = ref<'asc' | 'desc'>('desc');

const sortedEntries = computed(() => entries.value);

function goDetail(e: CveEntry) {
  router.push({ name: 'kb-cve-detail', params: { id: e.cveId } });
}

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const result = await cveApi.list({
      page:     page.value,
      size:     pageSize,
      q:        searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql:      searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      severity: filterSeverity.value.length ? filterSeverity.value : undefined,
      kev:      filterKev.value.length ? filterKev.value : undefined,
      poc:      filterPoc.value.length ? filterPoc.value : undefined,
      sortBy:   sortCol.value                              || undefined,
      sortDir:  sortCol.value ? sortDir.value.toUpperCase() : undefined,
    });
    entries.value       = result.items;
    totalPages.value    = result.totalPages;
    totalElements.value = result.total;
    loadKevStatus();
  } catch {
    err.value = 'Failed to load CVE entries.';
  } finally {
    loading.value = false;
  }
}

async function loadKevStatus() {
  const ids = entries.value.map(e => e.cveId);
  const [cisaStatuses, vulncheckStatuses, exploitCounts] = await Promise.all([
    cisaKevApi.status(ids).catch(() => [] as CisaKevStatusDto[]),
    vulncheckKevApi.status(ids).catch(() => [] as VulnCheckKevStatusDto[]),
    exploitsApi.status(ids).catch(() => [] as ExploitCountDto[]),
  ]);
  cisaKevStatus.value = new Map(cisaStatuses.map(s => [s.id, s]));
  vulncheckKevStatus.value = new Map(vulncheckStatuses.map(s => [s.id, s]));
  exploitStatus.value = new Map(exploitCounts.map(s => [s.cveId, s.count]));
}

async function loadStats() {
  try { stats.value = await cveApi.stats(); } catch { /* ignore */ }
}

function onSearch() { page.value = 0; load(); }
function onQuerySearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  searchState.value = payload;
  onSearch();
}
function prevPage() { if (page.value > 0) { page.value--; load(); } }
function nextPage() { if (page.value < totalPages.value - 1) { page.value++; load(); } }

watch(showSyncManager, (open) => {
  if (open) return;
  load();
  loadStats();
});

onMounted(() => { load(); loadStats(); });
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">CVE</h2>
        <p class="ares-page-subtitle">Common Vulnerabilities and Exposures — NVD/MITRE official CVE list.</p>
      </div>
      <div v-if="auth.isAdmin" style="display:flex; gap:0.5rem; align-self:center;">
        <Button size="small" icon="pi pi-sync" text v-tooltip.top="'Sync'" @click="showSyncManager = true" />
      </div>
    </div>

    <!-- Stats -->
    <div v-if="stats" style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
      <div class="ares-stat-chip">
        <span class="label">Total</span><span class="value">{{ stats.total.toLocaleString() }}</span>
      </div>
      <div v-if="stats.critical" class="ares-stat-chip" style="border-color:var(--ares-error);">
        <span class="label">Critical</span><span class="value" style="color:var(--ares-error);">{{ stats.critical.toLocaleString() }}</span>
      </div>
      <div v-if="stats.high" class="ares-stat-chip" style="border-color:#f97316;">
        <span class="label">High</span><span class="value" style="color:#f97316;">{{ stats.high.toLocaleString() }}</span>
      </div>
      <div v-if="stats.lastSync" class="ares-stat-chip">
        <span class="label">Last sync</span><span class="value">{{ new Date(stats.lastSync).toLocaleString() }}</span>
      </div>
      <div v-if="stats.lastCommit" class="ares-stat-chip">
        <span class="label">Commit</span><span class="value" style="font-family:monospace; font-size:0.7rem;">{{ stats.lastCommit.slice(0, 8) }}</span>
      </div>
    </div>
    <!-- Filters -->
    <div style="margin-bottom:1rem;">
      <QueryBar entity="cve" placeholder="Search by CVE ID, description, CWE…" @search="onQuerySearch" />
    </div>

    <p v-if="err" style="color:var(--ares-error);">{{ err }}</p>
    <AresLoadingState v-if="loading" />

    <div v-else class="ares-table-wrap">
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:160px;">
              <ColumnHeader
                label="CVE ID"
                :sortable="true"
                :sort-dir="sortCol === 'cveId' ? sortDir : null"
                @update:sort-dir="(d) => { if (d) { sortCol = 'cveId'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
              />
            </th>
            <th>Description</th>
            <th style="width:140px;">
              <ColumnHeader
                label="SEVERITY"
                :sortable="true"
                :sort-dir="sortCol === 'severity' ? sortDir : null"
                :filter-options="SEVERITY_OPTIONS"
                :filter-value="filterSeverity"
                @update:sort-dir="(d) => { if (d) { sortCol = 'severity'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterSeverity = v; onSearch(); }"
              />
            </th>
            <th style="width:120px;">
              <ColumnHeader
                label="KEV"
                :sortable="true"
                :sort-dir="sortCol === 'anyKevListed' ? sortDir : null"
                :filter-options="KEV_OPTIONS"
                :filter-value="filterKev"
                @update:sort-dir="(d) => { if (d) { sortCol = 'anyKevListed'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterKev = v; onSearch(); }"
              />
            </th>
            <th style="width:100px;">
              <ColumnHeader
                label="POC"
                :sortable="true"
                :sort-dir="sortCol === 'exploitCount' ? sortDir : null"
                :filter-options="POC_OPTIONS"
                :filter-value="filterPoc"
                @update:sort-dir="(d) => { if (d) { sortCol = 'exploitCount'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterPoc = v; onSearch(); }"
              />
            </th>
            <th style="width:110px;">
              <ColumnHeader
                label="PUBLISHED"
                :sortable="true"
                :sort-dir="sortCol === 'publishedAt' ? sortDir : null"
                @update:sort-dir="(d) => { if (d) { sortCol = 'publishedAt'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
              />
            </th>
            <th style="width:110px;">
              <ColumnHeader
                label="UPDATED"
                :sortable="true"
                :sort-dir="sortCol === 'lastModifiedAt' ? sortDir : null"
                @update:sort-dir="(d) => { if (d) { sortCol = 'lastModifiedAt'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
              />
            </th>
            <th style="width:50px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in sortedEntries" :key="e.id" class="clickable-row" @click="goDetail(e)">
            <td>
              <code style="font-size:0.72rem;">{{ e.cveId }}</code>
              <div v-if="e.cwes?.length" style="font-size:0.65rem; color:var(--ares-text-muted); margin-top:0.1rem;">
                {{ e.cwes.slice(0, 2).join(', ') }}<span v-if="e.cwes.length > 2"> +{{ e.cwes.length - 2 }}</span>
              </div>
            </td>
            <td style="font-size:0.8rem; max-width:400px;">
              <span style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                {{ e.description ?? '—' }}
              </span>
            </td>
            <td
              v-tooltip="e.cvssScore != null ? `CVSS ${e.cvssVersion ?? ''} · ${e.cvssScore.toFixed(1)}` : undefined"
            >
              <SeverityTag v-if="e.severity" :level="e.severity" />
              <span v-else style="color:var(--ares-text-muted); font-size:0.75rem;">—</span>
            </td>
            <td>
              <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:flex-start;">
                <KevBadge :status="cisaKevStatus.get(e.cveId)" source="cisa" />
                <KevBadge :status="vulncheckKevStatus.get(e.cveId)" source="vulncheck" />
                <span v-if="!cisaKevStatus.get(e.cveId) && !vulncheckKevStatus.get(e.cveId)" style="color:var(--ares-text-muted); font-size:0.75rem;">—</span>
              </div>
            </td>
            <td>
              <ExploitBadge :cve-id="e.cveId" :count="exploitStatus.get(e.cveId)" />
              <span v-if="!exploitStatus.get(e.cveId)" style="color:var(--ares-text-muted); font-size:0.75rem;">—</span>
            </td>
            <td style="font-size:0.72rem; color:var(--ares-text-muted);">
              {{ e.publishedAt ? new Date(e.publishedAt).toLocaleDateString() : '—' }}
            </td>
            <td style="font-size:0.72rem; color:var(--ares-text-muted);">
              {{ e.lastModifiedAt ? new Date(e.lastModifiedAt).toLocaleDateString() : '—' }}
            </td>
            <td>
              <i class="pi pi-chevron-right" style="color:var(--ares-text-muted); font-size:0.75rem;" />
            </td>
          </tr>
          <tr v-if="!entries.length">
            <td colspan="7" class="ares-table-empty">
              {{ stats && !stats.synced ? 'Not synced. Click Sync to clone CVE data from CVEProject/cvelistV5.' : 'No entries found.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" style="display:flex; align-items:center; gap:0.75rem; margin-top:0.75rem; font-size:0.82rem;">
      <Button text size="small" icon="pi pi-chevron-left" :disabled="page === 0" @click="prevPage" />
      <span style="color:var(--ares-text-muted);">Page {{ page + 1 }} / {{ totalPages }} &nbsp;({{ totalElements.toLocaleString() }} total)</span>
      <Button text size="small" icon="pi pi-chevron-right" :disabled="page >= totalPages - 1" @click="nextPage" />
    </div>
  </div>

  <KbSyncManagerDialog v-model:visible="showSyncManager" />
</template>

<style scoped>
.ares-stat-chip {
  display: flex; gap: 0.4rem; align-items: center;
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.25rem 0.6rem; font-size: 0.78rem;
}
.ares-stat-chip .label { color: var(--ares-text-muted); }
.ares-stat-chip .value { font-weight: 600; }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: var(--ares-surface); }
</style>
