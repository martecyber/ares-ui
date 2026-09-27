<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cweApi, type CweEntry, type SyncStats } from '@/api/kb';
import KbSingleSyncDialog from '@/components/KbSingleSyncDialog.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import QueryBar from '@/components/QueryBar.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Button from 'primevue/button';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const showSyncManager = ref(false);

const router = useRouter();

const entries = ref<CweEntry[]>([]);
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
const filterType = ref<string[]>([]);
const filterAbstraction = ref<string[]>([]);
const page = ref(0);
const totalPages = ref(0);
const totalElements = ref(0);
const pageSize = 50;

function goDetail(e: CweEntry) {
  router.push({ name: 'kb-cwe-detail', params: { id: e.cweId } });
}

const types = ['Weakness', 'Category', 'View'];
const abstractions = ['Pillar', 'Class', 'Base', 'Variant', 'Compound'];

const severityColor: Record<string, string> = {
  High: 'var(--ares-error)',
  Medium: 'var(--ares-warning)',
  Low: 'var(--ares-success)',
};

const filterExploitRisk = ref<string[]>([]);

const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc'>('asc');


const sortedEntries = computed(() => entries.value);

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const params = {
      page: page.value,
      size: pageSize,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      type: filterType.value.length ? filterType.value : undefined,
      abstraction: filterAbstraction.value.length ? filterAbstraction.value : undefined,
      likelihoodOfExploit: filterExploitRisk.value.length ? filterExploitRisk.value : undefined,
      sortBy: sortCol.value || undefined,
      sortDir: sortCol.value ? sortDir.value.toUpperCase() : undefined,
    };
    const result = await cweApi.list(params);
    entries.value = result.content;
    totalPages.value = result.totalPages;
    totalElements.value = result.totalElements;
  } catch {
    err.value = 'Failed to load CWE entries.';
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try { stats.value = await cweApi.stats(); } catch { /* ignore */ }
}

async function triggerSync() {
  syncing.value = true;
  syncMsg.value = null;
  try {
    const r = await cweApi.sync();
    syncMsg.value = `Sync queued (job #${r.jobId}). This may take several minutes.`;
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
        <h2 class="ares-page-title">CWE</h2>
        <p class="ares-page-subtitle">Common Weakness Enumeration — searchable database of software weaknesses.</p>
      </div>
      <div v-if="auth.isAdmin" style="display:flex; gap:0.5rem; align-self:center;">
        <Button size="small" icon="pi pi-sync" text v-tooltip.top="'Sync'" @click="showSyncManager = true" />
      </div>
    </div>

    <!-- Stats bar -->
    <div v-if="stats" style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
      <div class="ares-stat-chip">
        <span class="label">Total</span><span class="value">{{ stats.total.toLocaleString() }}</span>
      </div>
      <div v-if="stats.version" class="ares-stat-chip">
        <span class="label">Version</span><span class="value">{{ stats.version }}</span>
      </div>
      <div v-if="stats.lastSync" class="ares-stat-chip">
        <span class="label">Last sync</span>
        <span class="value">{{ new Date(stats.lastSync).toLocaleString() }}</span>
      </div>
    </div>

    <!-- Filters -->
    <div style="margin-bottom:1rem;">
      <QueryBar entity="cwe" placeholder="Search by name or description..." @search="onQuerySearch" />
    </div>

    <p v-if="err" style="color:var(--ares-error);">{{ err }}</p>
    <AresLoadingState v-if="loading" />

    <div v-else class="ares-table-wrap">
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:90px;">
              <ColumnHeader
                label="ID"
                :sortable="true"
                :sort-dir="sortCol === 'code' ? sortDir : null"
                @update:sort-dir="(d) => { if (d) { sortCol = 'code'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
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
                label="TYPE"
                :sortable="true"
                :sort-dir="sortCol === 'type' ? sortDir : null"
                :filter-options="types.map(t => ({ label: t, value: t }))"
                :filter-value="filterType"
                @update:sort-dir="(d) => { if (d) { sortCol = 'type'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterType = v; onSearch(); }"
              />
            </th>
            <th style="width:130px;">
              <ColumnHeader
                label="ABSTRACTION"
                :sortable="true"
                :sort-dir="sortCol === 'abstraction' ? sortDir : null"
                :filter-options="abstractions.map(a => ({ label: a, value: a }))"
                :filter-value="filterAbstraction"
                @update:sort-dir="(d) => { if (d) { sortCol = 'abstraction'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterAbstraction = v; onSearch(); }"
              />
            </th>
            <th style="width:130px;">
              <ColumnHeader
                label="EXPLOIT RISK"
                :sortable="true"
                :sort-dir="sortCol === 'likelihoodOfExploit' ? sortDir : null"
                :filter-options="[{label:'High',value:'High'},{label:'Medium',value:'Medium'},{label:'Low',value:'Low'}]"
                :filter-value="filterExploitRisk"
                @update:sort-dir="(d) => { if (d) { sortCol = 'likelihoodOfExploit'; sortDir = d; } else { sortCol = null; } page = 0; load(); }"
                @update:filter-value="(v) => { filterExploitRisk = v; onSearch(); }"
              />
            </th>
            <th style="width:50px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in sortedEntries" :key="e.id" class="clickable-row" @click="goDetail(e)">
            <td><code style="font-size:0.75rem;">{{ e.code }}</code></td>
            <td style="font-size:0.82rem;">{{ e.name }}</td>
            <td><span class="ares-badge">{{ e.type }}</span></td>
            <td><span class="ares-badge" style="opacity:0.7;">{{ e.abstraction ?? '—' }}</span></td>
            <td>
              <span v-if="e.likelihoodOfExploit" :style="{ color: severityColor[e.likelihoodOfExploit] ?? 'inherit', fontSize: '0.78rem' }">
                {{ e.likelihoodOfExploit }}
              </span>
              <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
            </td>
            <td>
              <i class="pi pi-chevron-right" style="color:var(--ares-text-muted); font-size:0.75rem;" />
            </td>
          </tr>
          <tr v-if="!entries.length">
            <td colspan="6" class="ares-table-empty">
              {{ stats && !stats.synced ? 'Database not synced. Click Sync to import CWE data.' : 'No entries found.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" style="display:flex; align-items:center; gap:0.75rem; margin-top:0.75rem; font-size:0.82rem;">
      <Button text size="small" icon="pi pi-chevron-left" :disabled="page === 0" @click="prevPage" />
      <span style="color:var(--ares-text-muted);">Page {{ page + 1 }} / {{ totalPages }} &nbsp;({{ totalElements.toLocaleString() }} total)</span>
      <Button text size="small" icon="pi pi-chevron-right" :disabled="page >= totalPages - 1" @click="nextPage" />
    </div>

  </div>

  <KbSingleSyncDialog
    v-model:visible="showSyncManager"
    title="CWE Sync"
    label="CWE"
    sync-type="cwe"
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
