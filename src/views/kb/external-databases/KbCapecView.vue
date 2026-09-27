<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { capecApi, type CapecEntry, type SyncStats } from '@/api/kb';
import KbSingleSyncDialog from '@/components/KbSingleSyncDialog.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import QueryBar from '@/components/QueryBar.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Button from 'primevue/button';
import SeverityTag from '@/components/SeverityTag.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const showSyncManager = ref(false);

const router = useRouter();

const entries = ref<CapecEntry[]>([]);
const stats = ref<SyncStats | null>(null);
const loading = ref(true);
const syncing = ref(false);
const err = ref<string | null>(null);
const syncMsg = ref<string | null>(null);

const statsText = computed(() => {
  if (!stats.value) return null;
  const parts = [`${stats.value.total.toLocaleString()} entries`];
  if (stats.value.version) parts.push(`v${stats.value.version}`);
  if (stats.value.lastSync) parts.push(`Last sync ${new Date(stats.value.lastSync).toLocaleString()}`);
  return parts.join(' · ');
});

const searchState = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });
const filterAbstraction = ref<string[]>([]);
const filterSeverity = ref<string[]>([]);
const filterLikelihood = ref<string[]>([]);
const page = ref(0);
const totalPages = ref(0);
const totalElements = ref(0);
const pageSize = 50;

function goDetail(e: CapecEntry) {
  router.push({ name: 'kb-capec-detail', params: { id: e.capecId } });
}

const abstractions = ['Meta', 'Standard', 'Detailed'];
const severities = ['Very High', 'High', 'Medium', 'Low', 'Very Low'];

const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc'>('asc');

const sortedEntries = computed(() => entries.value);

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const result = await capecApi.list({
      page: page.value,
      size: pageSize,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      abstraction: filterAbstraction.value.length ? filterAbstraction.value : undefined,
      severity: filterSeverity.value.length ? filterSeverity.value : undefined,
      likelihoodOfAttack: filterLikelihood.value.length ? filterLikelihood.value : undefined,
      sortBy: sortCol.value || undefined,
      sortDir: sortCol.value ? sortDir.value.toUpperCase() : undefined,
    });
    entries.value = result.content;
    totalPages.value = result.totalPages;
    totalElements.value = result.totalElements;
  } catch {
    err.value = 'Failed to load CAPEC entries.';
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try { stats.value = await capecApi.stats(); } catch { /* ignore */ }
}

async function triggerSync() {
  syncing.value = true;
  syncMsg.value = null;
  try {
    const r = await capecApi.sync();
    syncMsg.value = `Sync queued (job #${r.jobId}).`;
    setTimeout(loadStats, 5000);
  } catch {
    syncMsg.value = 'Failed to trigger sync.';
  } finally {
    syncing.value = false;
  }
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
        <h2 class="ares-page-title">CAPEC</h2>
        <p class="ares-page-subtitle">Common Attack Pattern Enumeration and Classification — adversarial attack patterns.</p>
      </div>
      <div v-if="auth.isAdmin" style="display:flex; gap:0.5rem; align-self:center;">
        <Button size="small" icon="pi pi-sync" text v-tooltip.top="'Sync'" @click="showSyncManager = true" />
      </div>
    </div>

    <div v-if="stats" style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
      <div class="ares-stat-chip">
        <span class="label">Total</span><span class="value">{{ stats.total.toLocaleString() }}</span>
      </div>
      <div v-if="stats.version" class="ares-stat-chip">
        <span class="label">Version</span><span class="value">{{ stats.version }}</span>
      </div>
      <div v-if="stats.lastSync" class="ares-stat-chip">
        <span class="label">Last sync</span><span class="value">{{ new Date(stats.lastSync).toLocaleString() }}</span>
      </div>
    </div>

    <div style="margin-bottom:1rem;">
      <QueryBar entity="capec" placeholder="Search CAPEC..." @search="onQuerySearch" />
    </div>

    <p v-if="err" style="color:var(--ares-error);">{{ err }}</p>
    <AresLoadingState v-if="loading" />

    <div v-else class="ares-table-wrap">
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:100px;">
              <ColumnHeader
                label="ID"
                :sortable="true"
                :sort-dir="sortCol === 'capecId' ? sortDir : null"
                @update:sort-dir="(d) => { if (d) { sortCol = 'capecId'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
              />
            </th>
            <th>
              <ColumnHeader
                label="NAME"
                :sortable="true"
                :sort-dir="sortCol === 'name' ? sortDir : null"
                @update:sort-dir="(d) => { if (d) { sortCol = 'name'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
              />
            </th>
            <th style="width:120px;">
              <ColumnHeader
                label="LEVEL"
                :sortable="true"
                :sort-dir="sortCol === 'abstraction' ? sortDir : null"
                :filter-options="abstractions.map(a => ({ label: a, value: a }))"
                :filter-value="filterAbstraction"
                @update:sort-dir="(d) => { if (d) { sortCol = 'abstraction'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterAbstraction = v; onSearch(); }"
              />
            </th>
            <th style="width:140px;">
              <ColumnHeader
                label="SEVERITY"
                :sortable="true"
                :sort-dir="sortCol === 'typicalSeverity' ? sortDir : null"
                :filter-options="severities.map(s => ({ label: s, value: s }))"
                :filter-value="filterSeverity"
                @update:sort-dir="(d) => { if (d) { sortCol = 'typicalSeverity'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterSeverity = v; onSearch(); }"
              />
            </th>
            <th style="width:140px;">
              <ColumnHeader
                label="LIKELIHOOD"
                :sortable="true"
                :sort-dir="sortCol === 'likelihoodOfAttack' ? sortDir : null"
                :filter-options="[{label:'High',value:'High'},{label:'Medium',value:'Medium'},{label:'Low',value:'Low'}]"
                :filter-value="filterLikelihood"
                @update:sort-dir="(d) => { if (d) { sortCol = 'likelihoodOfAttack'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterLikelihood = v; onSearch(); }"
              />
            </th>
            <th style="width:50px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in sortedEntries" :key="e.id" class="clickable-row" @click="goDetail(e)">
            <td><code style="font-size:0.75rem;">CAPEC-{{ e.capecId }}</code></td>
            <td style="font-size:0.82rem;">{{ e.name }}</td>
            <td><span class="ares-badge">{{ e.abstraction ?? '—' }}</span></td>
            <td>
              <SeverityTag v-if="e.typicalSeverity" :level="e.typicalSeverity" :display-label="e.typicalSeverity" />
              <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
            </td>
            <td>
              <SeverityTag v-if="e.likelihoodOfAttack" :level="e.likelihoodOfAttack" :display-label="e.likelihoodOfAttack" />
              <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
            </td>
            <td>
              <i class="pi pi-chevron-right" style="color:var(--ares-text-muted); font-size:0.75rem;" />
            </td>
          </tr>
          <tr v-if="!entries.length">
            <td colspan="6" class="ares-table-empty">
              {{ stats && !stats.synced ? 'Database not synced. Click Sync to import CAPEC data.' : 'No entries found.' }}
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

  <KbSingleSyncDialog
    v-model:visible="showSyncManager"
    title="CAPEC Sync"
    label="CAPEC"
    sync-type="capec"
    :stats-text="statsText"
    :synced="stats?.synced ?? false"
    :syncing="syncing"
    :message="syncMsg"
    @sync="triggerSync"
  />
</template>

<style scoped>
.ares-stat-chip {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
}
.ares-stat-chip .label { color: var(--ares-text-muted); }
.ares-stat-chip .value { font-weight: 600; }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: var(--ares-surface); }
</style>
