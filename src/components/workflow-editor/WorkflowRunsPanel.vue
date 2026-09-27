<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AresBadge from '@/components/AresBadge.vue';
import AppPagination from '@/components/AppPagination.vue';
import WorkflowRunGraph from './WorkflowRunGraph.vue';
import { workflowsApi, type WorkflowRun, type WorkflowRunDetail, type WorkflowGraphDefinition } from '@/api/workflows';

const props = defineProps<{ workflowId: number }>();

const PAGE_SIZE = 10;
const runs = ref<WorkflowRun[]>([]);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);
const loadingList = ref(false);

const selectedRunId = ref<number | null>(null);
const selected = ref<WorkflowRunDetail | null>(null);
const loadingDetail = ref(false);

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadRuns() {
  loadingList.value = true;
  try {
    const res = await workflowsApi.listRuns(props.workflowId, page.value, PAGE_SIZE);
    runs.value = res.items;
    totalPages.value = res.totalPages;
    total.value = res.total;
    if (!selectedRunId.value && res.items.length) await openRun(res.items[0].id);
  } finally {
    loadingList.value = false;
  }
}

// Live updates while a run is in progress — the backend has no push/SSE mechanism, so this
// polls GET run on an interval and re-renders the graph via `selected`, same data path a manual
// reselect already used. Stops itself once the run reaches a terminal status, on unmount (the
// Runs tab is v-if'd out in WorkflowEditorView.vue, so switching to "Editor" already unmounts
// this component), or when the user opens a different run.
const POLL_INTERVAL_MS = 2000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function isInProgress(status: string | undefined): boolean {
  return status === 'pending' || status === 'running';
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function maybeStartPolling() {
  stopPolling();
  if (!isInProgress(selected.value?.status)) return;
  pollTimer = setInterval(async () => {
    if (selectedRunId.value == null) return;
    try {
      selected.value = await workflowsApi.getRun(props.workflowId, selectedRunId.value);
    } catch {
      return; // transient network hiccup — leave the timer running, try again next tick
    }
    if (!isInProgress(selected.value?.status)) {
      stopPolling();
      loadRuns(); // pick up the now-final status in the run list's own badge too
    }
  }, POLL_INTERVAL_MS);
}

onUnmounted(stopPolling);

async function openRun(runId: number) {
  selectedRunId.value = runId;
  loadingDetail.value = true;
  try {
    selected.value = await workflowsApi.getRun(props.workflowId, runId);
  } finally {
    loadingDetail.value = false;
  }
  maybeStartPolling();
}

const graph = computed<WorkflowGraphDefinition | null>(() => {
  if (!selected.value) return null;
  try {
    return JSON.parse(selected.value.graphSnapshot) as WorkflowGraphDefinition;
  } catch {
    return null;
  }
});

function statusSeverity(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'skipped') return 'secondary';
  if (status === 'running' || status === 'waiting') return 'info';
  return 'warn';
}

onMounted(loadRuns);
</script>

<template>
  <div class="runs-view">
    <div class="runs-view__layout">
      <div class="runs-view__list">
        <div class="runs-view__list-header">Runs</div>
        <div v-if="loadingList" class="runs-view__empty">Loading…</div>
        <template v-else>
          <table class="ares-table runs-view__table">
            <tbody>
              <tr v-for="r in runs" :key="r.id" :class="{ selected: r.id === selectedRunId }" @click="openRun(r.id)">
                <td><AresBadge :value="r.status" :severity="statusSeverity(r.status)" /></td>
                <td class="runs-view__table-date">{{ shortDate(r.startedAt) }}</td>
              </tr>
              <tr v-if="!runs.length">
                <td colspan="2" class="ares-table-empty">No runs yet.</td>
              </tr>
            </tbody>
          </table>
          <AppPagination :page="page" :total-pages="totalPages" :total="total"
            @prev="page--; loadRuns()" @next="page++; loadRuns()" />
        </template>
      </div>

      <div class="runs-view__main">
        <div class="runs-view__toolbar">
          <AresBadge v-if="selected" :value="selected.status" :severity="statusSeverity(selected.status)" />
          <span v-if="selected?.triggeredBy" style="font-size:0.78rem; color:var(--ares-text-muted);">
            triggered by {{ selected.triggeredBy }}
          </span>
          <div style="flex:1;"></div>
          <span style="font-size:0.72rem; color:var(--ares-text-muted);">Hover a node for step details</span>
        </div>

        <div v-if="selected?.error" class="runs-view__error">{{ selected.error }}</div>

        <div class="runs-view__graph">
          <div v-if="loadingDetail" class="runs-view__empty">Loading…</div>
          <div v-else-if="!runs.length" class="runs-view__empty">No runs yet — use "Run now" to fire a manual trigger.</div>
          <WorkflowRunGraph v-else-if="graph && selected" :graph="graph" :steps="selected.steps" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.runs-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.runs-view__layout {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: 1rem;
  min-height: 0;
}
.runs-view__list {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.6rem;
  background: var(--ares-surface-raised);
}
.runs-view__list-header {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ares-text-muted);
  margin-bottom: 0.5rem;
}
.runs-view__table { font-size: 0.78rem; }
.runs-view__table tr { cursor: pointer; }
.runs-view__table tr.selected { background: var(--ares-surface-2); }
.runs-view__table-date { color: var(--ares-text-muted); white-space: nowrap; }

.runs-view__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.runs-view__toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 0.9rem;
  flex-shrink: 0;
}
.runs-view__error {
  font-size: 0.78rem;
  color: var(--ares-error);
  background: color-mix(in srgb, var(--ares-error) 10%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.5rem 0.7rem;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}
.runs-view__graph {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
  /* No explicit background — matches the editor's own .wf-canvas-wrap (WorkflowCanvas.vue),
   * which also leaves this transparent and lets the page's dark base show through instead of a
   * lighter "raised card" tone. Was the actual cause of the runs graph looking washed out next
   * to the editor despite both using the identical VueFlow <Background> dot-grid pattern. */
}
.runs-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ares-text-muted);
  font-size: 0.85rem;
}

/* Mobile: table moves below the graph (DOM order is list-then-main; column-reverse flips the
   visual stack without changing DOM/tab order). */
@media (max-width: 767px) {
  .runs-view__layout { flex-direction: column-reverse; }
  .runs-view__list { width: 100%; max-height: 220px; }
}
</style>
