<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import {
  agentTaskSchedulesApi,
  type AgentScheduleRun, type AgentTaskSchedule,
} from '@/api/agent-tasks';
import { formatDuration } from '@/utils/duration';

const props = defineProps<{
  projectId: number;
  schedule: AgentTaskSchedule | null;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const runs = ref<AgentScheduleRun[]>([]);
const loading = ref(false);
const err = ref<string | null>(null);

async function load(scheduleId: number) {
  loading.value = true;
  err.value = null;
  try {
    runs.value = await agentTaskSchedulesApi.listRuns(props.projectId, scheduleId, 20);
  } catch (e: any) {
    err.value = e?.response?.data?.message ?? e.message ?? 'Failed to load runs.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.schedule, (s) => {
  if (s) load(s.id);
  else runs.value = [];
}, { immediate: true });

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function runDuration(r: AgentScheduleRun): string {
  if (r.totalDurationMs != null) return formatDuration(r.totalDurationMs);
  if (r.completedAt == null && r.startedAt) {
    return formatDuration(Date.now() - new Date(r.startedAt).getTime()) + ' (running)';
  }
  return '—';
}

function runStatus(r: AgentScheduleRun): { label: string; cls: string } {
  if (r.completedAt == null) return { label: 'running', cls: 'run-badge run-badge--running' };
  if (r.failedCount > 0)     return { label: `${r.failedCount} failed`, cls: 'run-badge run-badge--failed' };
  return { label: 'ok', cls: 'run-badge run-badge--ok' };
}
</script>

<template>
  <Dialog
    :visible="!!schedule"
    @update:visible="(v) => { if (!v) emit('close'); }"
    :header="schedule?.name ? `Runs · ${schedule.name}` : `Runs · schedule #${schedule?.id ?? ''}`"
    modal
    :style="{ width: 'min(820px, 95vw)' }"
    :breakpoints="{ '768px': '95vw', '480px': '100vw' }"
    :draggable="false"
    :dismissable-mask="true">

    <div v-if="loading" style="padding:1rem; color:var(--ares-text-muted);">Loading…</div>
    <div v-else-if="err" style="color:var(--ares-error); padding:1rem;">{{ err }}</div>
    <div v-else>
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:170px;">Started</th>
            <th style="width:80px;">Tasks</th>
            <th style="width:90px;">Status</th>
            <th style="width:110px;">Duration</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in runs" :key="r.id">
            <td style="font-size:0.78rem;">{{ fmt(r.startedAt) }}</td>
            <td style="font-size:0.78rem;">
              {{ r.completedCount }}/{{ r.taskCount }}
              <span v-if="r.failedCount > 0"
                v-tooltip.top="`${r.failedCount} failed`"
                style="color:var(--ares-error); margin-left:0.25rem;">
                ({{ r.failedCount }} fail)
              </span>
            </td>
            <td>
              <span :class="runStatus(r).cls">{{ runStatus(r).label }}</span>
            </td>
            <td style="font-size:0.78rem; color:var(--ares-text-muted);">{{ runDuration(r) }}</td>
            <td style="font-size:0.78rem; color:var(--ares-text-muted);">{{ fmt(r.completedAt) }}</td>
          </tr>
          <tr v-if="!runs.length">
            <td colspan="5" class="ares-table-empty">No runs yet for this schedule.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Dialog>
</template>

<style scoped>
.run-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--ares-radius);
}
.run-badge--ok {
  background: color-mix(in srgb, #4ade80 12%, transparent);
  color: #4ade80;
}
.run-badge--running {
  background: color-mix(in srgb, #60a5fa 12%, transparent);
  color: #60a5fa;
}
.run-badge--failed {
  background: color-mix(in srgb, #f87171 12%, transparent);
  color: #f87171;
}
</style>
