<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import {
  agentPoolsApi,
  type PoolTimeline, type PoolTimelineAgent, type PoolTimelineTask, type QueueSample,
} from '@/api/agent-pools';
import { agentTasksApi, globalAgentTasksApi, type GlobalAgentTask } from '@/api/agent-tasks';
import { formatDuration } from '@/utils/duration';
import { confirmDialog } from '@/composables/useConfirmDialog';
import AppPagination from '@/components/AppPagination.vue';
import AgentTaskPreviewDialog from '@/components/AgentTaskPreviewDialog.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const poolId = computed(() => Number(route.params.id));

const data = ref<PoolTimeline | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const ACTIVE = new Set(['pending', 'dispatched', 'running', 'uploading']);

const hasActive = computed(() =>
  (data.value?.tasks ?? []).some(t => ACTIVE.has(t.status))
  || (data.value?.queueSize ?? 0) > 0
);

const totalSlots = computed(() =>
  (data.value?.agents ?? []).reduce((sum, a) => sum + (a.maxConcurrentTasks ?? 1), 0)
);

// ── Slot assignment (greedy: oldest task picks the first slot free) ─────────────
interface RenderedTask extends PoolTimelineTask {
  slotIdx: number;
  overflow: boolean;
}

const tasksBySlot = computed<Map<number, Map<number, RenderedTask[]>>>(() => {
  // agentId → slotIdx → tasks[]
  const out = new Map<number, Map<number, RenderedTask[]>>();
  if (!data.value) return out;
  const slotsEndAt = new Map<number, number[]>(); // agentId → array of "first free at" timestamps
  for (const a of data.value.agents) {
    slotsEndAt.set(a.id, new Array(Math.max(1, a.maxConcurrentTasks)).fill(0));
    out.set(a.id, new Map());
  }
  const sorted = [...data.value.tasks]
    .filter(t => t.agentId != null && t.startedAt)
    .sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());
  const nowMs = Date.now();
  for (const t of sorted) {
    const slots = slotsEndAt.get(t.agentId!);
    if (!slots) continue;
    const start = new Date(t.startedAt!).getTime();
    const end = t.completedAt ? new Date(t.completedAt).getTime() : nowMs;
    let idx = slots.findIndex(freeAt => freeAt <= start);
    let overflow = false;
    if (idx === -1) {
      // Capacity exceeded; pile onto last slot but flag visually
      idx = slots.length - 1;
      overflow = true;
    }
    slots[idx] = end;
    const m = out.get(t.agentId!)!;
    if (!m.has(idx)) m.set(idx, []);
    m.get(idx)!.push({ ...t, slotIdx: idx, overflow });
  }
  return out;
});

// ── Time math ──────────────────────────────────────────────────────────────────
function windowMs(): { startMs: number; endMs: number; nowMs: number } | null {
  if (!data.value) return null;
  return {
    startMs: new Date(data.value.windowStart).getTime(),
    endMs:   new Date(data.value.windowEnd).getTime(),
    nowMs:   new Date(data.value.nowTs).getTime(),
  };
}

/** % position of "now" within the full window (history + forecast). */
const nowPct = computed(() => {
  const w = windowMs();
  if (!w) return 75; // fallback: 18/24 = 75%
  return ((w.nowMs - w.startMs) / (w.endMs - w.startMs)) * 100;
});

function barStyle(t: RenderedTask): Record<string, string> {
  const w = windowMs();
  if (!w || !t.startedAt) return { display: 'none' };
  const startMs = new Date(t.startedAt).getTime();
  // Running tasks extend to "now", not the full window end.
  const endMs = t.completedAt ? new Date(t.completedAt).getTime() : w.nowMs;
  const left  = Math.max(0, ((startMs - w.startMs) / (w.endMs - w.startMs)) * 100);
  const right = Math.min(nowPct.value, ((endMs - w.startMs) / (w.endMs - w.startMs)) * 100);
  return {
    left:  `${left}%`,
    width: `${Math.max(0.4, right - left)}%`, // min width so a 1s task is still visible
    background: `var(${statusToken(t.status)})`,
    opacity: t.overflow ? '0.75' : '1',
    borderLeft: t.overflow ? '2px solid #fff5' : 'none',
  };
}

function statusToken(status: string): string {
  switch (status) {
    case 'completed': return '--ares-success';
    case 'failed':    return '--ares-error';
    case 'cancelled': return '--ares-text-muted';
    case 'pending':   return '--ares-warning';
    case 'dispatched':
    case 'running':
    case 'uploading': return '--ares-info';
    default:          return '--ares-text-muted';
  }
}

/** Labels along the X axis: 25 ticks (one per hour across the 24h window). */
const hourLabels = computed<{ pct: number; label: string; forecast: boolean }[]>(() => {
  const w = windowMs(); if (!w) return [];
  const out: { pct: number; label: string; forecast: boolean }[] = [];
  const totalMs = w.endMs - w.startMs;
  for (let i = 0; i <= 24; i++) {
    const ts = w.startMs + (i / 24) * totalMs;
    const d = new Date(ts);
    out.push({
      pct: (i / 24) * 100,
      label: `${String(d.getHours()).padStart(2, '0')}:00`,
      forecast: ts > w.nowMs,
    });
  }
  return out;
});

function taskTooltip(t: RenderedTask): string {
  const dur = t.startedAt && t.completedAt
    ? formatDuration(new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime())
    : t.startedAt ? formatDuration(Date.now() - new Date(t.startedAt).getTime()) + ' (running)' : '—';
  const tail = t.overflow ? ' · over capacity' : '';
  return `${t.name || ('#' + t.id)} · ${t.tool} · ${t.status} · ${dur}${tail}`;
}

function agentRowLabel(a: PoolTimelineAgent, slotIdx: number): string {
  if ((a.maxConcurrentTasks ?? 1) <= 1) return a.name;
  return `${a.name} · slot ${slotIdx + 1}/${a.maxConcurrentTasks}`;
}

// The old "open it in Jobs" navigation is gone along with that page — a bar/marker click now
// opens the same read-only preview modal the queue table below uses.
const previewTaskId = ref<number | null>(null);
const showPreview = ref(false);
function openTaskPreview(t: PoolTimelineTask) {
  previewTaskId.value = t.id;
  showPreview.value = true;
}

const queuePeak = computed(() => {
  const samples = data.value?.queueSamples ?? [];
  return samples.reduce((m, s) => Math.max(m, s.count), 0);
});

function queueBarStyle(s: QueueSample, i: number, samples: QueueSample[]) {
  const w = windowMs();
  // The last sample is just the right boundary — no bar to draw for it.
  if (!w || i >= samples.length - 1) return { display: 'none' };
  const next = samples[i + 1];
  const totalMs = w.endMs - w.startMs;
  const sMs = new Date(s.ts).getTime();
  const nMs = new Date(next.ts).getTime();
  const leftPct  = Math.max(0, ((sMs - w.startMs) / totalMs) * 100);
  const widthPct = ((nMs - sMs) / totalMs) * 100;
  const peak = queuePeak.value;
  const heightPct = peak > 0 ? Math.max(4, (s.count / peak) * 100) : 0;
  return {
    left:   `${leftPct}%`,
    width:  `${widthPct}%`,
    height: `${heightPct}%`,
  };
}

/** Tasks that are pending and have scheduledFor in the forecast zone. */
const scheduledFutureTasks = computed(() =>
  (data.value?.tasks ?? []).filter(t => t.scheduledFor && !t.startedAt
    && new Date(t.scheduledFor) > new Date(data.value!.nowTs))
);

function scheduledMarkerStyle(t: PoolTimelineTask): Record<string, string> {
  const w = windowMs();
  if (!w || !t.scheduledFor) return { display: 'none' };
  const pct = ((new Date(t.scheduledFor).getTime() - w.startMs) / (w.endMs - w.startMs)) * 100;
  return { left: `${pct}%` };
}

function scheduledMarkerTooltip(t: PoolTimelineTask): string {
  const d = new Date(t.scheduledFor!);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `Scheduled · ${t.name || ('#' + t.id)} · ${t.tool} · ${hm}`;
}

function queueBarTooltip(s: QueueSample, i: number, samples: QueueSample[]): string {
  const d = new Date(s.ts);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const from = fmt(d);
  const to = i < samples.length - 1 ? fmt(new Date(samples[i + 1].ts)) : '—';
  return `${from}–${to} · ${s.count} task${s.count === 1 ? '' : 's'} queued`;
}

function agentStatusDot(a: PoolTimelineAgent): string {
  switch (a.status) {
    case 'online':   return '--ares-success';
    case 'stale':    return '--ares-warning';
    case 'offline':  return '--ares-error';
    case 'disabled':
    case 'pending':  return '--ares-text-muted';
  }
  return '--ares-text-muted';
}

// ── Load + polling ─────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await agentPoolsApi.getTimeline(poolId.value, 18);
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e.message ?? 'Failed to load timeline.';
  } finally {
    loading.value = false;
  }
  if (pollTimer) clearTimeout(pollTimer);
  if (hasActive.value) pollTimer = setTimeout(load, 30_000);
}

// ── Queue table: paginated list of this pool's pending tasks ────────────────────
const QUEUE_PAGE_SIZE = 20;
const queueTasks = ref<GlobalAgentTask[]>([]);
const queuePage = ref(0);
const queueTotalPages = ref(0);
const queueTotal = ref(0);
const queueLoading = ref(false);
const queueError = ref<string | null>(null);

async function loadQueue() {
  queueLoading.value = true;
  queueError.value = null;
  try {
    const res = await globalAgentTasksApi.list({
      poolId: poolId.value,
      status: ['pending'],
      sortBy: 'createdAt',
      sortDir: 'ASC',
      page: queuePage.value,
      size: QUEUE_PAGE_SIZE,
    });
    queueTasks.value = res.items;
    queueTotalPages.value = res.totalPages;
    queueTotal.value = res.total;
  } catch (e: any) {
    queueError.value = e?.response?.data?.message ?? e.message ?? 'Failed to load the queue.';
  } finally {
    queueLoading.value = false;
  }
}
function queuePrevPage() { if (queuePage.value > 0) { queuePage.value--; loadQueue(); } }
function queueNextPage() { if (queuePage.value < queueTotalPages.value - 1) { queuePage.value++; loadQueue(); } }

const cancellingId = ref<number | null>(null);
async function cancelTask(t: GlobalAgentTask) {
  const ok = await confirmDialog({
    message: `Cancel task "${t.name || '#' + t.id}"?`,
    header: 'Cancel task',
    acceptLabel: 'Cancel task',
    acceptSeverity: 'danger',
  });
  if (!ok) return;
  cancellingId.value = t.id;
  try {
    await agentTasksApi.cancel(t.projectId, t.id);
    toast.add({ severity: 'success', summary: 'Task cancelled', life: 2500 });
    await Promise.all([loadQueue(), load()]); // queueSize/histogram above also shift
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to cancel task', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    cancellingId.value = null;
  }
}

onMounted(() => { load(); loadQueue(); });
onUnmounted(() => { if (pollTimer) clearTimeout(pollTimer); });
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1rem;">
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <Button icon="pi pi-arrow-left" severity="secondary" text
          @click="router.push({ name: 'agent-pools' })" v-tooltip.right="'Back to pools'" />
        <div>
          <h2 class="ares-page-title" style="margin:0;">
            <i class="pi pi-chart-bar" style="margin-right:0.4rem;" />{{ data?.poolName ?? '…' }}
          </h2>
          <p class="ares-page-subtitle" style="margin-top:0.2rem;">
            Last 18h · +6h forecast ·
            {{ data?.agents.length ?? 0 }} agents · {{ totalSlots }} slot{{ totalSlots !== 1 ? 's' : '' }} ·
            <strong style="color:var(--ares-warning);">{{ data?.queueSize ?? 0 }}</strong> in queue
            <span v-if="hasActive" class="live-dot" v-tooltip.top="'Live — auto-refreshing every 30s'" />
          </p>
        </div>
      </div>
      <Button icon="pi pi-refresh" label="Refresh" size="small" severity="secondary"
        :loading="loading" @click="load" style="align-self:center;" />
    </div>

    <p v-if="error" style="color:var(--ares-error); margin-bottom:0.75rem;">{{ error }}</p>

    <div v-if="loading && !data" class="ares-table-empty">Loading…</div>

    <div v-else-if="data" class="timeline">
      <!-- X axis: hour ticks -->
      <div class="timeline__axis">
        <div class="timeline__label">Agent · slot</div>
        <div class="timeline__lane">
          <div class="forecast-zone" :style="{ left: `${nowPct}%` }" />
          <div class="now-line" :style="{ left: `${nowPct}%` }" v-tooltip.top="'Now'" />
          <div v-for="h in hourLabels" :key="h.pct" class="timeline__tick"
            :style="{ left: `${h.pct}%` }">
            <span class="timeline__tick-label" :class="{ 'tick-forecast': h.forecast }">
              {{ h.label }}
            </span>
          </div>
        </div>
      </div>

      <!-- Agent slot rows -->
      <template v-if="data.agents.length">
        <template v-for="a in data.agents" :key="a.id">
          <div v-for="slotIdx in a.maxConcurrentTasks" :key="`${a.id}-${slotIdx}`"
            class="timeline__row">
            <div class="timeline__label" :title="`status: ${a.status}`">
              <span class="agent-dot" :style="{ background: `var(${agentStatusDot(a)})` }" />
              <span class="agent-name">{{ agentRowLabel(a, slotIdx - 1) }}</span>
            </div>
            <div class="timeline__lane">
              <div class="forecast-zone" :style="{ left: `${nowPct}%` }" />
              <div class="now-line" :style="{ left: `${nowPct}%` }" />
              <!-- vertical hour gridlines -->
              <div v-for="h in hourLabels" :key="`g-${h.pct}`"
                class="timeline__gridline" :style="{ left: `${h.pct}%` }" />
              <div v-for="t in (tasksBySlot.get(a.id)?.get(slotIdx - 1) ?? [])" :key="t.id"
                class="timeline__bar" :style="barStyle(t)"
                v-tooltip.top="taskTooltip(t)"
                @click="openTaskPreview(t)">
                <span class="timeline__bar-text">{{ t.tool }}</span>
              </div>
              <!-- Forecast markers for tasks assigned to this agent -->
              <div v-for="t in scheduledFutureTasks.filter(t => t.agentId === a.id)" :key="`fm-${t.id}`"
                class="scheduled-marker" :style="scheduledMarkerStyle(t)"
                v-tooltip.top="scheduledMarkerTooltip(t)"
                @click="openTaskPreview(t)" />
            </div>
          </div>
        </template>
      </template>
      <div v-else class="timeline__row timeline__row--empty">
        <div class="timeline__label" style="opacity:0.7;">No agents</div>
        <div class="timeline__lane">
          <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:0.8rem; color:var(--ares-text-muted);">
            This pool has no members. Add agents from the pool list to see activity.
          </div>
        </div>
      </div>

      <!-- Queue row: histogram of queue depth over the window -->
      <div class="timeline__row timeline__row--queue">
        <div class="timeline__label">
          <span class="agent-name">Queue</span>
        </div>
        <div class="timeline__lane" :class="{ 'timeline__lane--queue-active': data.queueSize > 0 }">
          <div class="forecast-zone" :style="{ left: `${nowPct}%` }" />
          <div class="now-line" :style="{ left: `${nowPct}%` }" />
          <div v-for="h in hourLabels" :key="`gq-${h.pct}`"
            class="timeline__gridline" :style="{ left: `${h.pct}%` }" />
          <div v-for="(s, i) in (data.queueSamples ?? [])" :key="`qs-${i}`"
            class="queue-bar"
            :style="queueBarStyle(s, i, data.queueSamples)"
            v-tooltip.top="queueBarTooltip(s, i, data.queueSamples)" />
          <!-- Forecast markers: unassigned scheduled tasks -->
          <div v-for="t in scheduledFutureTasks.filter(t => !t.agentId)" :key="`qm-${t.id}`"
            class="scheduled-marker" :style="scheduledMarkerStyle(t)"
            v-tooltip.top="scheduledMarkerTooltip(t)"
            @click="openTaskPreview(t)" />
          <div class="queue-chip" :data-empty="data.queueSize === 0">
            <span class="queue-chip__num">{{ data.queueSize }}</span>
            <span class="queue-chip__txt">
              {{ data.queueSize === 1 ? 'task queued' : 'tasks queued' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="timeline__legend">
        <span><span class="lgd-swatch" style="background:var(--ares-info);" />Running / dispatched</span>
        <span><span class="lgd-swatch" style="background:var(--ares-success);" />Completed</span>
        <span><span class="lgd-swatch" style="background:var(--ares-error);" />Failed</span>
        <span><span class="lgd-swatch" style="background:var(--ares-text-muted);" />Cancelled</span>
        <span><span class="lgd-swatch lgd-swatch--marker" />Scheduled</span>
        <span class="lgd-forecast-badge">+6h forecast</span>
        <span style="color:var(--ares-text-muted);">· Click a bar to preview it</span>
      </div>
    </div>

    <!-- Queue: paginated list of this pool's pending tasks — complements the histogram above
         with an actually-browsable table. -->
    <div v-if="data" class="ares-card" style="margin-top:1rem;">
      <h3 style="font-size:0.9rem; font-weight:600; margin-bottom:0.75rem; color:var(--ares-text);">
        Queue
        <span style="font-weight:400; color:var(--ares-text-muted); font-size:0.78rem;">
          · {{ queueTotal.toLocaleString() }} pending task{{ queueTotal !== 1 ? 's' : '' }}
        </span>
      </h3>

      <p v-if="queueError" style="color:var(--ares-error); margin-bottom:0.75rem;">{{ queueError }}</p>
      <div v-if="queueLoading && !queueTasks.length" class="ares-table-empty">Loading…</div>

      <div v-else class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:60px;"><span class="col-plain">ID</span></th>
              <th><span class="col-plain">Name</span></th>
              <th style="width:100px;"><span class="col-plain">Tool</span></th>
              <th style="width:190px;"><span class="col-plain">Project</span></th>
              <th style="width:80px;"><span class="col-plain">Priority</span></th>
              <th style="width:160px;"><span class="col-plain">Scheduled for</span></th>
              <th style="width:160px;"><span class="col-plain">Created</span></th>
              <th style="width:90px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in queueTasks" :key="t.id">
              <td style="font-size:0.78rem; color:var(--ares-text-muted);">#{{ t.id }}</td>
              <td style="font-size:0.82rem;">{{ t.name || '—' }}</td>
              <td><span class="tool-chip">{{ t.tool }}</span></td>
              <td style="font-size:0.8rem;">
                {{ t.projectName ?? '—' }}
                <span v-if="t.projectCode" style="color:var(--ares-text-muted);">({{ t.projectCode }})</span>
              </td>
              <td style="font-size:0.8rem;">{{ t.priority }}</td>
              <td style="font-size:0.75rem; color:var(--ares-text-muted);">{{ t.scheduledFor ? new Date(t.scheduledFor).toLocaleString() : '—' }}</td>
              <td style="font-size:0.75rem; color:var(--ares-text-muted);">{{ new Date(t.createdAt).toLocaleString() }}</td>
              <td style="display:flex; gap:0.25rem;">
                <Button icon="pi pi-eye" severity="secondary" text size="small" v-tooltip.left="'Preview'" @click="previewTaskId = t.id; showPreview = true" />
                <Button icon="pi pi-times" severity="danger" text size="small" :loading="cancellingId === t.id" v-tooltip.left="'Cancel'" @click="cancelTask(t)" />
              </td>
            </tr>
            <tr v-if="!queueTasks.length">
              <td colspan="8" class="ares-table-empty">Nothing queued for this pool right now.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AppPagination :page="queuePage" :total-pages="queueTotalPages" :total="queueTotal" @prev="queuePrevPage" @next="queueNextPage" />
    </div>

    <AgentTaskPreviewDialog v-model:visible="showPreview" :task-id="previewTaskId" />
  </div>
</template>

<style scoped>
.col-plain {
  color: var(--ares-text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.tool-chip {
  display: inline-block;
  font-size: 0.7rem;
  font-family: monospace;
  padding: 1px 6px;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  border: 1px solid var(--ares-border);
}

.timeline {
  display: flex;
  flex-direction: column;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
}
.timeline__axis,
.timeline__row {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 32px;
  border-bottom: 1px solid var(--ares-border);
}
.timeline__axis { background: var(--ares-surface-2); height: 28px; }
.timeline__label {
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  color: var(--ares-text-2);
  border-right: 1px solid var(--ares-border);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--ares-surface);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.timeline__axis .timeline__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  background: var(--ares-surface-2);
}
.timeline__lane {
  position: relative;
  background: var(--ares-bg);
  overflow: hidden;
}
.timeline__tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--ares-border);
}
.timeline__tick-label {
  position: absolute;
  top: 6px;
  left: 4px;
  font-size: 0.62rem;
  font-family: monospace;
  color: var(--ares-text-muted);
}
.timeline__gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--ares-border) 35%, transparent);
}

/* Forecast zone: dimmed hatched overlay from "now" to windowEnd */
.forecast-zone {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 6px,
    color-mix(in srgb, var(--ares-border) 25%, transparent) 6px,
    color-mix(in srgb, var(--ares-border) 25%, transparent) 7px
  );
  opacity: 0.65;
  pointer-events: none;
}

/* Scheduled-task forecast marker: a small diamond on a vertical line */
.scheduled-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: color-mix(in srgb, var(--ares-warning) 60%, transparent);
  transform: translateX(-50%);
  cursor: pointer;
  z-index: 4;
}
.scheduled-marker::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: var(--ares-warning);
  border: 1.5px solid var(--ares-bg);
  border-radius: var(--ares-radius);
  transform: translate(-50%, -50%) rotate(45deg);
}
.scheduled-marker:hover { background: var(--ares-warning); }

/* "Now" vertical marker */
.now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--ares-info);
  opacity: 0.7;
  pointer-events: none;
  z-index: 3;
}

.tick-forecast {
  color: color-mix(in srgb, var(--ares-text-muted) 55%, transparent) !important;
  font-style: italic;
}
.timeline__bar {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: var(--ares-radius);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 0.35rem;
  font-size: 0.65rem;
  font-family: monospace;
  color: rgba(0, 0, 0, 0.7);
  transition: filter 0.12s;
}
.timeline__bar:hover { filter: brightness(1.15); z-index: 2; }
.timeline__bar-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.agent-name {
  font-size: 0.78rem;
  color: var(--ares-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline__row--empty .timeline__lane { min-height: 60px; }
.timeline__row--queue { min-height: 56px; }
.timeline__lane--queue-active {
  background: color-mix(in srgb, var(--ares-warning) 5%, var(--ares-bg));
}
.queue-bar {
  position: absolute;
  bottom: 0;
  background: var(--ares-warning);
  border-radius: var(--ares-radius) var(--ares-radius) 0 0;
  opacity: 0.75;
  transition: opacity 0.12s, filter 0.12s;
  pointer-events: auto;
}
.queue-bar:hover {
  opacity: 1;
  filter: brightness(1.15);
}
.queue-chip {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.55rem;
  border-radius: var(--ares-radius);
  background: color-mix(in srgb, var(--ares-warning) 16%, var(--ares-surface));
  border: 1px solid color-mix(in srgb, var(--ares-warning) 45%, transparent);
  font-size: 0.72rem;
  color: var(--ares-text-1);
  pointer-events: none;
}
.queue-chip i { font-size: 0.7rem; color: var(--ares-warning); }
.queue-chip__num {
  font-weight: 700;
  font-size: 0.82rem;
  color: var(--ares-warning);
}
.queue-chip__txt { color: var(--ares-text-2); }
.queue-chip[data-empty="true"] {
  background: var(--ares-surface);
  border-color: var(--ares-border);
}
.queue-chip[data-empty="true"] i,
.queue-chip[data-empty="true"] .queue-chip__num {
  color: var(--ares-text-muted);
}
.queue-chip[data-empty="true"] .queue-chip__txt { color: var(--ares-text-muted); }

.timeline__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  padding: 0.6rem 0.8rem;
  font-size: 0.74rem;
  color: var(--ares-text-2);
  border-top: 1px solid var(--ares-border);
  background: var(--ares-surface-2);
}
.lgd-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: var(--ares-radius);
  margin-right: 0.3rem;
  vertical-align: middle;
}
.lgd-swatch--marker {
  background: var(--ares-warning);
  transform: rotate(45deg);
  border-radius: var(--ares-radius);
  width: 9px;
  height: 9px;
  display: inline-block;
  margin-right: 0.35rem;
  vertical-align: middle;
}
.lgd-forecast-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: var(--ares-radius);
  border: 1px dashed var(--ares-border);
  color: var(--ares-text-muted);
}

.live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ares-info);
  margin-left: 0.4rem;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}

@media (max-width: 767px) {
  .timeline__axis,
  .timeline__row {
    grid-template-columns: 130px 1fr;
  }
  .timeline__label { font-size: 0.7rem; padding: 0.2rem 0.4rem; }
  .timeline__bar { font-size: 0.6rem; padding: 0 0.2rem; }
}
</style>
