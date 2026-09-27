<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  attackApi,
  type AttackTactic,
  type AttackTechnique,
  type AttackMitigation,
  type AttackMatrix,
  type AttackSyncStats,
} from '@/api/kb';
import KbSingleSyncDialog from '@/components/KbSingleSyncDialog.vue';
import QueryBar from '@/components/QueryBar.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Button from 'primevue/button';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const showSyncManager = ref(false);

type Tab = 'matrix' | 'techniques' | 'mitigations';

// ── State ─────────────────────────────────────────────────────────────────

const stats       = ref<AttackSyncStats | null>(null);
const mitigations = ref<AttackMitigation[]>([]);
const loadingMatrix     = ref(false);
const loadingMitigations = ref(false);
const syncing  = ref(false);
const errMatrix = ref<string | null>(null);
const errMit    = ref<string | null>(null);
const syncMsg   = ref<string | null>(null);

const tab    = ref<Tab>('matrix');
const matrix = ref<AttackMatrix>('enterprise-attack');

const mitSearch = ref('');

// ── Techniques search tab (flat, paginated, AQL-searchable — the matrix tab above loads
// everything at once and can't reasonably host a QueryBar; this is the "list view" this initiative's
// AQL search bar rollout otherwise gives every KB catalog) ────────────────────────────────────────
const techniques         = ref<AttackTechnique[]>([]);
const loadingTechniques  = ref(false);
const errTechniques      = ref<string | null>(null);
const techSearchState    = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });
const techPage           = ref(0);
const techTotalPages     = ref(0);
const techTotalElements  = ref(0);
const TECH_PAGE_SIZE     = 50;

const matrices: { value: AttackMatrix; label: string }[] = [
  { value: 'enterprise-attack', label: 'Enterprise' },
  { value: 'mobile-attack',     label: 'Mobile'     },
  { value: 'ics-attack',        label: 'ICS'        },
];

// ── Matrix structure (reactive ref, never computed) ───────────────────────

interface TechGroup {
  parent: AttackTechnique;
  subs: AttackTechnique[];
  expanded: boolean;
}
interface TacticCol {
  tactic: AttackTactic;
  groups: TechGroup[];
}

const columns = ref<TacticCol[]>([]);

function buildColumns(tactics: AttackTactic[], techniques: AttackTechnique[]) {
  const parents = techniques.filter(t => !t.subtechnique);
  const subs    = techniques.filter(t =>  t.subtechnique);

  const subsByParent = new Map<string, AttackTechnique[]>();
  for (const s of subs) {
    const pid = s.attackId?.split('.')[0];
    if (!pid) continue;
    if (!subsByParent.has(pid)) subsByParent.set(pid, []);
    subsByParent.get(pid)!.push(s);
  }

  columns.value = tactics.map(tactic => {
    const tacticParents = parents
      .filter(t => (t.tactics ?? []).includes(tactic.shortName))
      .sort((a, b) => (a.attackId ?? '').localeCompare(b.attackId ?? ''));
    return {
      tactic,
      groups: tacticParents.map(p => ({
        parent: p,
        subs: (subsByParent.get(p.attackId) ?? [])
          .sort((a, b) => (a.attackId ?? '').localeCompare(b.attackId ?? '')),
        expanded: false,
      })),
    };
  });
}

// ── Mitigations filter ────────────────────────────────────────────────────

const filteredMitigations = computed(() => {
  const q = mitSearch.value.trim().toLowerCase();
  if (!q) return mitigations.value;
  return mitigations.value.filter(m =>
    (m.attackId ?? '').toLowerCase().includes(q) ||
    (m.name ?? '').toLowerCase().includes(q) ||
    (m.description ?? '').toLowerCase().includes(q)
  );
});

// ── Loaders ───────────────────────────────────────────────────────────────

async function loadMatrix() {
  loadingMatrix.value = true;
  errMatrix.value = null;
  columns.value = [];
  try {
    const [tactics, techniques] = await Promise.all([
      attackApi.tactics(matrix.value),
      attackApi.allTechniques(matrix.value),
    ]);
    buildColumns(tactics, techniques);
  } catch (e: any) {
    errMatrix.value = e?.response?.data?.detail ?? 'Failed to load ATT&CK matrix.';
  } finally {
    loadingMatrix.value = false;
  }
}

async function loadTechniquesSearch() {
  loadingTechniques.value = true;
  errTechniques.value = null;
  try {
    const result = await attackApi.techniques({
      matrix: matrix.value,
      q:   techSearchState.value.mode === 'basic' && techSearchState.value.value ? techSearchState.value.value : undefined,
      aql: techSearchState.value.mode === 'aql' && techSearchState.value.value ? techSearchState.value.value : undefined,
      page: techPage.value,
      size: TECH_PAGE_SIZE,
    });
    techniques.value = result.content;
    techTotalPages.value = result.totalPages;
    techTotalElements.value = result.totalElements;
  } catch (e: any) {
    errTechniques.value = e?.response?.data?.detail ?? 'Failed to load techniques.';
  } finally {
    loadingTechniques.value = false;
  }
}

function onTechQuerySearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  techSearchState.value = payload;
  techPage.value = 0;
  loadTechniquesSearch();
}
function techPrevPage() { if (techPage.value > 0) { techPage.value--; loadTechniquesSearch(); } }
function techNextPage() { if (techPage.value < techTotalPages.value - 1) { techPage.value++; loadTechniquesSearch(); } }

async function loadMitigations() {
  loadingMitigations.value = true;
  errMit.value = null;
  mitigations.value = [];
  try {
    mitigations.value = await attackApi.allMitigations(matrix.value);
  } catch (e: any) {
    errMit.value = e?.response?.data?.detail ?? 'Failed to load mitigations.';
  } finally {
    loadingMitigations.value = false;
  }
}

async function loadStats() {
  try { stats.value = await attackApi.stats(); } catch { /* ignore */ }
}

const statsText = computed(() => {
  if (!stats.value) return null;
  const parts = [
    `${stats.value.tactics.toLocaleString()} tactics`,
    `${stats.value.techniques.toLocaleString()} techniques`,
    `${stats.value.mitigations.toLocaleString()} mitigations`,
  ];
  if (stats.value.lastSync) parts.push(`Last sync ${new Date(stats.value.lastSync).toLocaleString()}`);
  return parts.join(' · ');
});

async function triggerSync() {
  syncing.value = true;
  syncMsg.value = null;
  try {
    const r = await attackApi.sync();
    syncMsg.value = `Sync queued (job #${r.jobId}). This may take several minutes.`;
    setTimeout(loadStats, 10000);
  } catch {
    syncMsg.value = 'Failed to trigger sync.';
  } finally {
    syncing.value = false;
  }
}

// ── Actions ───────────────────────────────────────────────────────────────

function goTechnique(t: AttackTechnique) {
  router.push({ name: 'kb-attack-technique-detail', params: { id: t.attackId }, query: { matrix: t.matrix } });
}

function handleParentClick(grp: TechGroup) {
  if (grp.subs.length === 0) {
    goTechnique(grp.parent);
  } else {
    grp.expanded = !grp.expanded;
  }
}

// ── Watchers ──────────────────────────────────────────────────────────────

watch(matrix, () => {
  columns.value = [];
  mitigations.value = [];
  if (tab.value === 'matrix') loadMatrix();
  else if (tab.value === 'techniques') { techPage.value = 0; loadTechniquesSearch(); }
  else loadMitigations();
});

watch(tab, (newTab) => {
  if (newTab === 'matrix') {
    if (!columns.value.length) loadMatrix();
  } else if (newTab === 'techniques') {
    if (!techniques.value.length) loadTechniquesSearch();
  } else {
    if (!mitigations.value.length) loadMitigations();
  }
});

watch(showSyncManager, (open) => {
  if (open) return;
  loadStats();
});

onMounted(() => {
  loadStats();
  loadMatrix();
});
</script>

<template>
  <div>
    <!-- Header -->
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">
          <i class="pi pi-sitemap" style="margin-right:0.4rem;" />MITRE ATT&amp;CK
        </h2>
        <p class="ares-page-subtitle">Adversarial tactics, techniques, and common knowledge framework.</p>
      </div>
      <div v-if="auth.isAdmin" style="display:flex; gap:0.5rem; align-self:center;">
        <Button size="small" icon="pi pi-sync" text v-tooltip.top="'Sync'" @click="showSyncManager = true" />
      </div>
    </div>

    <!-- Stats -->
    <div v-if="stats" class="stats-row">
      <div class="stat-chip"><span class="lbl">Tactics</span><span class="val">{{ stats.tactics.toLocaleString() }}</span></div>
      <div class="stat-chip"><span class="lbl">Techniques</span><span class="val">{{ stats.techniques.toLocaleString() }}</span></div>
      <div class="stat-chip"><span class="lbl">Mitigations</span><span class="val">{{ stats.mitigations.toLocaleString() }}</span></div>
      <div v-if="stats.lastSync" class="stat-chip">
        <span class="lbl">Last sync</span>
        <span class="val">{{ new Date(stats.lastSync).toLocaleDateString() }}</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls-row">
      <!-- Matrix selector -->
      <div class="pill-group">
        <button
          v-for="m in matrices" :key="m.value"
          type="button"
          class="pill-btn" :class="{ active: matrix === m.value }"
          @click="matrix = m.value"
        >{{ m.label }}</button>
      </div>
      <!-- Tab selector -->
      <div class="pill-group">
        <button type="button" class="pill-btn" :class="{ active: tab === 'matrix' }" @click="tab = 'matrix'">
          <i class="pi pi-table" /> Tactics &amp; Techniques
        </button>
        <button type="button" class="pill-btn" :class="{ active: tab === 'techniques' }" @click="tab = 'techniques'">
          <i class="pi pi-search" /> Search Techniques
        </button>
        <button type="button" class="pill-btn" :class="{ active: tab === 'mitigations' }" @click="tab = 'mitigations'">
          <i class="pi pi-shield" /> Mitigations
        </button>
      </div>
    </div>

    <!-- ══ MATRIX TAB ══════════════════════════════════════════════════════ -->
    <div v-if="tab === 'matrix'">
      <div v-if="errMatrix" class="err-msg">{{ errMatrix }}</div>
      <AresLoadingState v-if="loadingMatrix" label="Loading matrix…" />
      <div v-else-if="!columns.length && !errMatrix" class="ares-table-empty">
        No data. {{ !stats?.techniques ? 'Run Sync to import ATT&CK.' : 'Select a different matrix.' }}
      </div>

      <div v-else-if="columns.length" class="matrix-scroll">
        <div
          class="matrix-grid"
          :style="{ gridTemplateColumns: `repeat(${columns.length}, minmax(158px, 1fr))` }"
        >
          <!-- Tactic headers -->
          <div
            v-for="col in columns"
            :key="col.tactic.attackId"
            class="tactic-header"
          >
            <span class="tactic-id">{{ col.tactic.attackId }}</span>
            <span class="tactic-name">{{ col.tactic.name }}</span>
            <span class="tactic-count">{{ col.groups.length }} techniques</span>
          </div>

          <!-- Technique columns -->
          <div
            v-for="col in columns"
            :key="col.tactic.attackId + '-body'"
            class="tactic-body"
          >
            <div v-if="!col.groups.length" class="tech-empty">—</div>

            <template v-for="grp in col.groups" :key="grp.parent.attackId">
              <!-- Parent technique cell -->
              <div
                class="tech-cell"
                :class="{ 'has-subs': grp.subs.length > 0, 'is-expanded': grp.expanded }"
                @click="handleParentClick(grp)"
              >
                <div class="cell-main">
                  <span class="tech-id">{{ grp.parent.attackId }}</span>
                  <span class="tech-name">{{ grp.parent.name }}</span>
                </div>
                <div class="cell-actions">
                  <button
                    type="button"
                    class="act-btn nav-btn"
                    title="Open technique detail"
                    @click.stop="goTechnique(grp.parent)"
                  ><i class="pi pi-arrow-right" /></button>
                  <button
                    v-if="grp.subs.length > 0"
                    type="button"
                    class="act-btn toggle-btn"
                    :title="grp.expanded ? 'Collapse subtechniques' : `${grp.subs.length} subtechniques`"
                    @click.stop="grp.expanded = !grp.expanded"
                  >
                    {{ grp.subs.length }}<i class="pi" :class="grp.expanded ? 'pi-chevron-up' : 'pi-chevron-down'" />
                  </button>
                </div>
              </div>

              <!-- Subtechniques (expand/collapse) -->
              <template v-if="grp.expanded">
                <div
                  v-for="sub in grp.subs"
                  :key="sub.attackId"
                  class="tech-cell sub-cell"
                  @click="goTechnique(sub)"
                >
                  <div class="cell-main">
                    <span class="tech-id">{{ sub.attackId }}</span>
                    <span class="tech-name">{{ sub.name }}</span>
                  </div>
                  <div class="cell-actions">
                    <button
                      type="button"
                      class="act-btn nav-btn"
                      title="Open subtechnique detail"
                      @click.stop="goTechnique(sub)"
                    ><i class="pi pi-arrow-right" /></button>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ TECHNIQUES SEARCH TAB ═══════════════════════════════════════════ -->
    <div v-else-if="tab === 'techniques'">
      <div style="margin-bottom:1rem;">
        <QueryBar entity="attack" placeholder="Search by ID, name, description…" @search="onTechQuerySearch" />
      </div>

      <p v-if="errTechniques" class="err-msg">{{ errTechniques }}</p>
      <AresLoadingState v-if="loadingTechniques" />
      <div v-else-if="!techniques.length" class="ares-table-empty">No techniques found.</div>

      <div v-else class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:110px;">ID</th>
              <th>Name</th>
              <th style="width:130px;">Matrix</th>
              <th>Tactics</th>
              <th>Platforms</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in techniques" :key="t.id" class="clickable-row" @click="goTechnique(t)">
              <td><code style="font-size:0.72rem;">{{ t.attackId }}</code></td>
              <td style="font-size:0.82rem;">
                {{ t.name }}
                <span v-if="t.subtechnique" class="ares-badge" style="font-size:0.6rem; margin-left:0.35rem;">sub</span>
                <span v-if="t.deprecated || t.revoked" class="ares-badge" style="font-size:0.6rem; margin-left:0.35rem; opacity:0.6;">
                  {{ t.deprecated ? 'deprecated' : 'revoked' }}
                </span>
              </td>
              <td style="font-size:0.75rem; color:var(--ares-text-muted);">{{ t.matrix }}</td>
              <td>
                <span v-for="tc in t.tactics.slice(0, 2)" :key="tc" class="ares-badge" style="font-size:0.62rem; margin-right:0.25rem;">{{ tc }}</span>
                <span v-if="t.tactics.length > 2" class="ares-badge" style="font-size:0.62rem; opacity:0.6;">+{{ t.tactics.length - 2 }}</span>
              </td>
              <td>
                <span v-for="p in t.platforms.slice(0, 2)" :key="p" class="ares-badge" style="font-size:0.62rem; margin-right:0.25rem;">{{ p }}</span>
                <span v-if="t.platforms.length > 2" class="ares-badge" style="font-size:0.62rem; opacity:0.6;">+{{ t.platforms.length - 2 }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="techTotalPages > 1" style="display:flex; align-items:center; gap:0.75rem; margin-top:0.75rem; font-size:0.82rem;">
        <Button text size="small" icon="pi pi-chevron-left" :disabled="techPage === 0" @click="techPrevPage" />
        <span style="color:var(--ares-text-muted);">Page {{ techPage + 1 }} / {{ techTotalPages }} &nbsp;({{ techTotalElements.toLocaleString() }} total)</span>
        <Button text size="small" icon="pi pi-chevron-right" :disabled="techPage >= techTotalPages - 1" @click="techNextPage" />
      </div>
    </div>

    <!-- ══ MITIGATIONS TAB ═════════════════════════════════════════════════ -->
    <div v-else-if="tab === 'mitigations'">
      <div v-if="errMit" class="err-msg">{{ errMit }}</div>

      <div class="mit-toolbar">
        <input
          v-model="mitSearch"
          type="text"
          class="ares-input"
          placeholder="Search by ID, name or description…"
          style="flex:1; max-width:480px;"
        />
        <span v-if="!loadingMitigations" class="mit-count">
          {{ filteredMitigations.length.toLocaleString() }} mitigations
        </span>
      </div>

      <AresLoadingState v-if="loadingMitigations" label="Loading mitigations…" />
      <div v-else-if="!filteredMitigations.length" class="ares-table-empty">
        {{ mitigations.length ? 'No matches for your search.' : 'No mitigations found.' }}
      </div>

      <div v-else class="mit-list">
        <div
          v-for="m in filteredMitigations"
          :key="m.id"
          class="mit-card"
          :class="{ deprecated: m.deprecated }"
        >
          <div class="mit-header">
            <code class="mit-id">{{ m.attackId }}</code>
            <span class="mit-name">{{ m.name }}</span>
            <a
              :href="`https://attack.mitre.org/mitigations/${m.attackId}/`"
              target="_blank" rel="noopener"
              class="mit-ext" title="View on ATT&CK"
            ><i class="pi pi-external-link" /></a>
          </div>
          <p v-if="m.description" class="mit-desc">{{ m.description }}</p>
        </div>
      </div>
    </div>

  </div>

  <KbSingleSyncDialog
    v-model:visible="showSyncManager"
    title="ATT&CK Sync"
    label="ATT&CK"
    sync-type="attack"
    :stats-text="statsText"
    :synced="stats?.synced ?? false"
    :syncing="syncing"
    :message="syncMsg"
    sync-label="Sync All Matrices"
    @sync="triggerSync"
  />
</template>

<style scoped>
/* ── shared ── */
.stats-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.stat-chip {
  display: flex; gap: 0.4rem; align-items: center;
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.3rem 0.7rem; font-size: 0.78rem;
}
.stat-chip .lbl { color: var(--ares-text-muted); }
.stat-chip .val { font-weight: 600; }
.stat-chip.warn { color: var(--ares-warning); gap: 0.35rem; }
.err-msg  { color: var(--ares-error); font-size: 0.82rem; margin-bottom: 0.75rem;
            background: color-mix(in srgb, var(--ares-error) 8%, transparent);
            border: 1px solid color-mix(in srgb, var(--ares-error) 30%, transparent);
            padding: 0.5rem 0.75rem; border-radius: var(--ares-radius); }

.controls-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
.pill-group {
  display: flex; gap: 2px;
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 3px;
}
.pill-btn {
  background: transparent; border: none; cursor: pointer;
  color: var(--ares-text-muted); padding: 0.3rem 0.9rem; border-radius: var(--ares-radius);
  font-size: 0.8rem; display: flex; align-items: center; gap: 0.35rem;
  transition: background 0.12s, color 0.12s; white-space: nowrap;
}
.pill-btn.active { background: var(--ares-primary); color: #fff; }
.pill-btn:not(.active):hover { background: var(--ares-border); color: var(--ares-text); }

/* ── Matrix ── */
.matrix-scroll { overflow-x: auto; padding-bottom: 1.5rem; }
.matrix-grid { display: grid; gap: 3px; min-width: max-content; align-items: start; }

.tactic-header {
  background: var(--ares-primary); color: #fff;
  border-radius: var(--ares-radius) var(--ares-radius) 0 0; padding: 0.55rem 0.65rem;
  display: flex; flex-direction: column; gap: 3px;
}
.tactic-id   { font-family: monospace; font-size: 0.6rem; opacity: 0.7; }
.tactic-name { font-size: 0.72rem; font-weight: 700; line-height: 1.25; }
.tactic-count {
  font-size: 0.58rem; background: rgba(255,255,255,0.18);
  border-radius: var(--ares-radius); padding: 1px 6px; align-self: flex-start; white-space: nowrap;
}

.tactic-body { display: flex; flex-direction: column; gap: 2px; }
.tech-empty  { font-size: 0.72rem; color: var(--ares-text-muted); padding: 0.5rem; text-align: center; }

.tech-cell {
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.3rem 0.4rem;
  cursor: pointer; display: flex; align-items: flex-start; gap: 4px;
  transition: border-color 0.12s, background 0.12s;
}
.tech-cell:hover {
  border-color: var(--ares-primary);
  background: color-mix(in srgb, var(--ares-primary) 7%, var(--ares-surface));
}
.tech-cell.has-subs   { border-left: 3px solid var(--ares-primary); }
.tech-cell.is-expanded {
  background: color-mix(in srgb, var(--ares-primary) 10%, var(--ares-surface));
  border-color: var(--ares-primary);
}

.cell-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tech-id   { font-family: monospace; font-size: 0.58rem; color: var(--ares-text-muted); white-space: nowrap; }
.tech-name { font-size: 0.68rem; font-weight: 500; line-height: 1.3; word-break: break-word; }

.cell-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.act-btn {
  background: none; border: none; cursor: pointer;
  border-radius: var(--ares-radius); padding: 2px 3px; font-size: 0.6rem; line-height: 1;
  transition: background 0.1s, color 0.1s; white-space: nowrap;
}
.nav-btn { color: var(--ares-text-muted); opacity: 0; transition: opacity 0.12s, color 0.12s; }
.tech-cell:hover .nav-btn { opacity: 1; color: var(--ares-primary); }
.toggle-btn {
  color: var(--ares-primary); display: flex; align-items: center; gap: 2px; font-weight: 600;
}
.toggle-btn:hover { background: color-mix(in srgb, var(--ares-primary) 15%, transparent); }

.sub-cell {
  margin-left: 10px; border-left: 2px solid var(--ares-primary);
  background: color-mix(in srgb, var(--ares-primary) 4%, var(--ares-surface));
}
.sub-cell .tech-name { font-weight: 400; font-style: italic; }

/* ── Mitigations ── */
.mit-toolbar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.mit-count   { font-size: 0.78rem; color: var(--ares-text-muted); white-space: nowrap; }
.mit-list    { display: flex; flex-direction: column; gap: 0.5rem; }
.mit-card {
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.75rem 1rem; transition: border-color 0.12s;
}
.mit-card:hover { border-color: var(--ares-primary); }
.mit-card.deprecated { opacity: 0.5; }
.mit-header { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
.mit-id   { font-family: monospace; font-size: 0.72rem; color: var(--ares-primary); flex-shrink: 0; }
.mit-name { font-size: 0.85rem; font-weight: 600; flex: 1; }
.mit-ext  { color: var(--ares-text-muted); font-size: 0.8rem; text-decoration: none; transition: color 0.12s; }
.mit-ext:hover { color: var(--ares-primary); }
.mit-desc {
  font-size: 0.78rem; color: var(--ares-text-muted); line-height: 1.6; margin: 0;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

/* ── Techniques search tab ── */
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: var(--ares-surface); }
</style>
