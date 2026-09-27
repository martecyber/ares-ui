<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { globalAgentTasksApi, type GlobalAgentTask } from '@/api/agent-tasks';
import { formatDuration } from '@/utils/duration';

/** Read-only "same fields as the create form, but not editable" preview — opened from the agent
 *  pool timeline's queue table and its load-graph bars (the old "open it in Jobs" navigation is
 *  gone along with that page; this modal is its replacement). No per-tool config panel reuse
 *  here: those 10 components have no read-only mode of their own, so the tool-specific `args`
 *  JSON is rendered generically as label:value rows instead — same field names, simpler surface. */
const props = defineProps<{ visible: boolean; taskId: number | null }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const task = ref<GlobalAgentTask | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

watch(
  [() => props.visible, () => props.taskId],
  async ([visible, id]) => {
    if (!visible || !id) { task.value = null; return; }
    loading.value = true;
    error.value = null;
    try {
      task.value = await globalAgentTasksApi.get(id);
    } catch (e: any) {
      error.value = e?.response?.data?.message ?? e.message ?? 'Failed to load task.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function close() { emit('update:visible', false); }

const ACTIVE = new Set(['pending', 'dispatched', 'running', 'uploading']);

const STATUS_CLASSES: Record<string, string> = {
  completed: 'task-badge task-badge--completed',
  running: 'task-badge task-badge--running',
  dispatched: 'task-badge task-badge--running',
  uploading: 'task-badge task-badge--running',
  failed: 'task-badge task-badge--failed',
  cancelled: 'task-badge task-badge--cancelled',
};
const statusClass = computed(() => STATUS_CLASSES[task.value?.status ?? ''] ?? 'task-badge task-badge--pending');

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

const durationLabel = computed(() => {
  const t = task.value;
  if (!t?.startedAt) return '—';
  const endIso = t.completedAt ?? (ACTIVE.has(t.status) ? new Date().toISOString() : null);
  if (!endIso) return '—';
  return formatDuration(new Date(endIso).getTime() - new Date(t.startedAt).getTime());
});

interface FieldRow { key: string; value: string; }

/** Generic read-only rendering of the tool-specific `args` JSON — same field names the create
 *  form's per-tool config panel captured, just shown as label:value rows. */
const argFields = computed<FieldRow[]>(() => {
  if (!task.value?.args) return [];
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(task.value.args); } catch { return []; }
  return Object.entries(parsed)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([key, v]) => ({ key, value: formatArgValue(v) }));
});

function formatArgValue(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** camelCase → "Camel Case" for the args field labels. */
function labelize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)" modal
    header="Task details" style="width: 560px; max-width: 95vw;">
    <div v-if="loading" style="padding:1rem 0; color:var(--ares-text-muted);">Loading…</div>
    <p v-else-if="error" style="color:var(--ares-error);">{{ error }}</p>
    <div v-else-if="task" class="preview-grid">
      <div class="preview-row"><span class="preview-label">Name</span><span class="preview-value">{{ task.name || `#${task.id}` }}</span></div>
      <div class="preview-row"><span class="preview-label">Status</span><span :class="statusClass">{{ task.status }}</span></div>
      <div class="preview-row">
        <span class="preview-label">Project</span>
        <span class="preview-value">{{ task.projectName ?? '—' }}<span v-if="task.projectCode" style="color:var(--ares-text-muted);"> ({{ task.projectCode }})</span></span>
      </div>
      <div class="preview-row"><span class="preview-label">Pool</span><span class="preview-value">{{ task.poolName ?? '—' }}</span></div>
      <div class="preview-row"><span class="preview-label">Agent</span><span class="preview-value">{{ task.agentName ?? 'Unassigned' }}</span></div>
      <div class="preview-row"><span class="preview-label">Tool</span><span class="preview-value tool-chip">{{ task.tool }}</span></div>
      <div class="preview-row"><span class="preview-label">Format</span><span class="preview-value">{{ task.format }}</span></div>
      <div class="preview-row"><span class="preview-label">Priority</span><span class="preview-value">{{ task.priority }}</span></div>
      <div v-if="task.nacProfile" class="preview-row"><span class="preview-label">NAC profile</span><span class="preview-value">{{ task.nacProfile }}</span></div>
      <div v-if="task.timeoutMinutes != null" class="preview-row"><span class="preview-label">Timeout</span><span class="preview-value">{{ task.timeoutMinutes }} min</span></div>
      <div class="preview-row"><span class="preview-label">Created</span><span class="preview-value">{{ fmt(task.createdAt) }}</span></div>
      <div v-if="task.scheduledFor" class="preview-row"><span class="preview-label">Scheduled for</span><span class="preview-value">{{ fmt(task.scheduledFor) }}</span></div>
      <div v-if="task.startedAt" class="preview-row"><span class="preview-label">Started</span><span class="preview-value">{{ fmt(task.startedAt) }}</span></div>
      <div v-if="task.completedAt" class="preview-row"><span class="preview-label">Completed</span><span class="preview-value">{{ fmt(task.completedAt) }}</span></div>
      <div v-if="task.startedAt" class="preview-row"><span class="preview-label">Duration</span><span class="preview-value">{{ durationLabel }}</span></div>
      <div v-if="task.exitCode != null" class="preview-row"><span class="preview-label">Exit code</span><span class="preview-value">{{ task.exitCode }}</span></div>
      <div v-if="task.error" class="preview-row"><span class="preview-label">Error</span><span class="preview-value" style="color:var(--ares-error);">{{ task.error }}</span></div>

      <template v-if="argFields.length">
        <div class="preview-section-label">Configuration</div>
        <div v-for="f in argFields" :key="f.key" class="preview-row">
          <span class="preview-label">{{ labelize(f.key) }}</span>
          <span class="preview-value">{{ f.value }}</span>
        </div>
      </template>
    </div>
    <template #footer>
      <Button label="Close" severity="secondary" text @click="close" />
    </template>
  </Dialog>
</template>

<style scoped>
.preview-grid { display: flex; flex-direction: column; gap: 0.5rem; }
.preview-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.75rem;
  align-items: start;
  font-size: 0.82rem;
  padding: 0.15rem 0;
}
.preview-label { color: var(--ares-text-muted); }
.preview-value { color: var(--ares-text); word-break: break-word; }
.preview-section-label {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ares-border);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
}
.tool-chip {
  display: inline-block;
  font-size: 0.7rem;
  font-family: monospace;
  padding: 1px 6px;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  border: 1px solid var(--ares-border);
  width: fit-content;
}

/* shared badge — mirrors the convention the now-removed JobsView.vue used */
.task-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--ares-radius);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.task-badge--completed { background: color-mix(in srgb, #4ade80 12%, transparent); color: #4ade80; }
.task-badge--running   { background: color-mix(in srgb, #60a5fa 12%, transparent); color: #60a5fa; }
.task-badge--failed    { background: color-mix(in srgb, #f87171 12%, transparent); color: #f87171; }
.task-badge--cancelled { background: color-mix(in srgb, var(--ares-text-muted) 10%, transparent); color: var(--ares-text-muted); }
.task-badge--pending   { background: color-mix(in srgb, var(--ares-text-muted) 10%, transparent); color: var(--ares-text-muted); }
</style>
