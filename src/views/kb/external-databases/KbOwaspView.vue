<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { owaspApi, type OwaspEntry, type OwaspSyncStats } from '@/api/kb';
import KbScheduleDialog from '@/components/KbScheduleDialog.vue';
import QueryBar from '@/components/QueryBar.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Button from 'primevue/button';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const showSchedule = ref(false);

const router = useRouter();

const entries = ref<OwaspEntry[]>([]);
const stats   = ref<OwaspSyncStats | null>(null);
const loading = ref(true);
const seeding = ref(false);
const err     = ref<string | null>(null);
const seedMsg = ref<string | null>(null);
const searchState = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });
function goDetail(e: OwaspEntry) {
  router.push({ name: 'kb-owasp-detail', params: { year: e.year, owaspId: e.owaspId } });
}
const selectedYear = ref<number>(2021);
const availableYears = ref<number[]>([]);

const sortCol = ref<'rank' | 'name'>('rank');

const sortedEntries = computed(() => {
  return [...entries.value].sort((a, b) => {
    if (sortCol.value === 'rank') return a.rank - b.rank;
    return a.name.localeCompare(b.name);
  });
});

async function load() {
  loading.value = true;
  err.value = null;
  try {
    entries.value = await owaspApi.list({
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      year: selectedYear.value,
    });
  } catch {
    err.value = 'Failed to load OWASP data.';
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    stats.value = await owaspApi.stats();
    if (stats.value.years?.length) {
      availableYears.value = [...stats.value.years].sort((a, b) => b - a);
      if (!availableYears.value.includes(selectedYear.value)) {
        selectedYear.value = availableYears.value[0];
      }
    }
  } catch { /* ignore */ }
}

async function triggerSeed() {
  seeding.value = true;
  seedMsg.value = null;
  try {
    const r = await owaspApi.seed();
    seedMsg.value = `Seed queued (job #${r.jobId}).`;
    setTimeout(() => { loadStats(); load(); }, 3000);
  } catch {
    seedMsg.value = 'Failed to seed OWASP data.';
  } finally {
    seeding.value = false;
  }
}

function onSearch() { load(); }
function onQuerySearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  searchState.value = payload;
  onSearch();
}
function selectYear(y: number) { selectedYear.value = y; load(); }

const RANK_COLORS = ['#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899'];

onMounted(() => { load(); loadStats(); });
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">OWASP Top 10</h2>
        <p class="ares-page-subtitle">OWASP Top 10 — the ten most critical web application security risks across all editions.</p>
      </div>
      <div v-if="auth.isAdmin" style="display:flex; gap:0.5rem; align-self:center;">
        <Button text severity="secondary" size="small" icon="pi pi-calendar" v-tooltip.top="'Schedule'" @click="showSchedule = true" />
        <Button v-if="!stats?.synced" text size="small" icon="pi pi-download" :loading="seeding" v-tooltip.top="'Load OWASP Data'" @click="triggerSeed" />
        <Button v-else text severity="secondary" size="small" icon="pi pi-refresh" :loading="seeding" v-tooltip.top="'Re-seed'" @click="triggerSeed" />
      </div>
    </div>

    <!-- Stats -->
    <div v-if="stats" style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
      <div class="ares-stat-chip">
        <span class="label">Total entries</span><span class="value">{{ stats.total }}</span>
      </div>
      <div class="ares-stat-chip">
        <span class="label">Editions</span><span class="value">{{ stats.years?.length ?? 0 }}</span>
      </div>
      <div v-if="stats.lastSync" class="ares-stat-chip">
        <span class="label">Last seeded</span><span class="value">{{ new Date(stats.lastSync).toLocaleString() }}</span>
      </div>
    </div>
    <p v-if="seedMsg" style="color:var(--ares-success); margin-bottom:0.75rem; font-size:0.82rem;">{{ seedMsg }}</p>

    <!-- Edition selector -->
    <div v-if="availableYears.length > 0" class="edition-selector" style="margin-bottom:1.25rem;">
      <button
        v-for="y in availableYears"
        :key="y"
        class="edition-btn"
        :class="{ active: y === selectedYear }"
        @click="selectYear(y)"
      >
        {{ y }}
      </button>
    </div>

    <!-- Search and sort controls -->
    <div style="display:flex; gap:0.5rem; margin-bottom:1.25rem; align-items:center; flex-wrap:wrap;">
      <div style="flex:1; max-width:420px;">
        <QueryBar entity="owasp" placeholder="Search categories…" @search="onQuerySearch" />
      </div>
      <Button
        text
        :severity="sortCol === 'rank' ? 'primary' : 'secondary'"
        size="small"
        label="Sort by rank"
        @click="sortCol = 'rank'"
      />
      <Button
        text
        :severity="sortCol === 'name' ? 'primary' : 'secondary'"
        size="small"
        label="Sort by name"
        @click="sortCol = 'name'"
      />
    </div>

    <p v-if="err" style="color:var(--ares-error);">{{ err }}</p>
    <AresLoadingState v-if="loading" />

    <div v-else-if="!entries.length" class="ares-table-empty">
      {{ stats && !stats.synced ? 'Click "Load OWASP Data" to seed all OWASP Top 10 editions.' : 'No categories found.' }}
    </div>

    <!-- Card grid -->
    <div v-else style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px,1fr)); gap:1rem;">
      <div
        v-for="e in sortedEntries"
        :key="e.id"
        class="owasp-card"
        @click="goDetail(e)"
      >
        <div style="display:flex; align-items:flex-start; gap:0.75rem;">
          <div class="owasp-rank" :style="{ background: RANK_COLORS[e.rank - 1] ?? '#64748b' }">
            {{ String(e.rank).padStart(2, '0') }}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.68rem; color:var(--ares-text-muted); margin-bottom:0.15rem;">{{ e.owaspId }} · {{ e.year }}</div>
            <div style="font-size:0.9rem; font-weight:600; line-height:1.3;">{{ e.name }}</div>
          </div>
        </div>
        <p style="font-size:0.77rem; color:var(--ares-text-muted); margin:0.65rem 0 0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; line-height:1.5;">
          {{ e.description }}
        </p>
        <div style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-top:0.6rem;">
          <span v-for="cwe in e.cwes.slice(0, 4)" :key="cwe" class="ares-badge" style="font-size:0.62rem;">{{ cwe }}</span>
          <span v-if="e.cwes.length > 4" class="ares-badge" style="font-size:0.62rem; opacity:0.6;">+{{ e.cwes.length - 4 }}</span>
        </div>
      </div>
    </div>

  </div>

  <KbScheduleDialog v-model:visible="showSchedule" sync-type="owasp" label="OWASP Top 10" />
</template>

<style scoped>
.ares-stat-chip {
  display: flex; gap: 0.4rem; align-items: center;
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.25rem 0.6rem; font-size: 0.78rem;
}
.ares-stat-chip .label { color: var(--ares-text-muted); }
.ares-stat-chip .value { font-weight: 600; }

.edition-selector {
  display: inline-flex;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 3px;
  gap: 2px;
}

.edition-btn {
  padding: 0.3rem 0.9rem;
  font-size: 0.82rem;
  font-weight: 500;
  font-family: inherit;
  border: none;
  border-radius: var(--ares-radius);
  background: transparent;
  color: var(--ares-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.edition-btn:hover:not(.active) {
  background: var(--ares-surface-2);
  color: var(--ares-text);
}

.edition-btn.active {
  background: var(--ares-accent);
  color: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.owasp-card {
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 1rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.owasp-card:hover {
  border-color: var(--ares-primary);
  box-shadow: 0 2px 12px rgba(0,0,0,0.2);
}

.owasp-rank {
  width: 36px;
  height: 36px;
  border-radius: var(--ares-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
</style>
