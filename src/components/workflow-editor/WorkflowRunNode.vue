<script setup lang="ts">
import { computed, ref } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { WorkflowNodeType, WorkflowStepRun } from '@/api/workflows';

const props = defineProps<{
  id: string;
  type: string;
  data: { label: string; config: Record<string, unknown>; step: WorkflowStepRun | null };
}>();

const nodeType = computed(() => props.type as WorkflowNodeType);
const isTrigger = computed(() => nodeType.value?.startsWith('TRIGGER_'));
const isCondition = computed(() => nodeType.value === 'CONDITION');
const isLoop = computed(() => nodeType.value === 'LOOP');
const step = computed(() => props.data.step);
const status = computed(() => step.value?.status ?? 'not-reached');

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  failed: '#ef4444',
  skipped: '#9ca3af',
  waiting: '#3b82f6',
  running: '#3b82f6',
  pending: '#9ca3af',
  'not-reached': '#d1d5db',
};
const color = computed(() => STATUS_COLORS[status.value] ?? STATUS_COLORS['not-reached']);

const hovering = ref(false);

function fmtJson(raw: string | null | undefined) {
  if (!raw) return null;
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}
</script>

<template>
  <div class="run-node" :class="{ 'run-node--dim': status === 'not-reached' }"
    :style="{ borderColor: color }" @mouseenter="hovering = true" @mouseleave="hovering = false">
    <Handle v-if="!isTrigger" type="target" :position="Position.Left" />

    <div class="run-node__header" :style="{ background: color }">
      <span>{{ data.label }}</span>
    </div>
    <div class="run-node__status" :style="{ color }">{{ status.replace('-', ' ') }}</div>

    <template v-if="isCondition">
      <Handle id="true" type="source" :position="Position.Right" style="top:35%;" />
      <Handle id="false" type="source" :position="Position.Right" style="top:65%;" />
    </template>
    <template v-else-if="isLoop">
      <Handle id="loop_body" type="source" :position="Position.Right" style="top:35%;" />
      <Handle id="loop_done" type="source" :position="Position.Right" style="top:65%;" />
    </template>
    <template v-else-if="!isTrigger">
      <Handle id="success" type="source" :position="Position.Right" style="top:35%;" />
      <Handle id="error" type="source" :position="Position.Right" style="top:65%;" />
    </template>
    <template v-else>
      <Handle type="source" :position="Position.Right" />
    </template>

    <div v-if="hovering" class="run-node__popover">
      <template v-if="step">
        <div class="run-node__popover-row"><strong>status</strong> {{ step.status }}</div>
        <div v-if="step.startedAt" class="run-node__popover-row"><strong>started</strong> {{ new Date(step.startedAt).toLocaleString() }}</div>
        <div v-if="step.completedAt" class="run-node__popover-row"><strong>completed</strong> {{ new Date(step.completedAt).toLocaleString() }}</div>
        <div v-if="step.refType" class="run-node__popover-row"><strong>ref</strong> {{ step.refType }} #{{ step.refId }}</div>
        <div v-if="step.error" class="run-node__popover-error">{{ step.error }}</div>
        <pre v-if="fmtJson(step.output)" class="run-node__popover-json">{{ fmtJson(step.output) }}</pre>
      </template>
      <div v-else class="run-node__popover-row">Not reached in this run.</div>
    </div>
  </div>
</template>

<style scoped>
.run-node {
  min-width: 180px;
  background: var(--ares-surface-raised);
  border: 2px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  font-size: 0.8rem;
  position: relative;
}
.run-node--dim { opacity: 0.55; }
.run-node__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.65rem;
  color: white;
  font-weight: 600;
  border-radius: calc(var(--ares-radius) - 2px) calc(var(--ares-radius) - 2px) 0 0;
}
.run-node__status {
  padding: 0.35rem 0.65rem;
  background: var(--ares-surface-2);
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 0 0 calc(var(--ares-radius) - 2px) calc(var(--ares-radius) - 2px);
}
.run-node__popover {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.4rem;
  min-width: 240px;
  max-width: 340px;
  z-index: 30;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 4px 14px rgba(0,0,0,0.2);
  padding: 0.55rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--ares-text-2);
}
.run-node__popover-row { margin-bottom: 0.2rem; }
.run-node__popover-row strong { color: var(--ares-text-muted); font-weight: 600; margin-right: 0.3rem; }
.run-node__popover-error {
  margin-top: 0.3rem;
  color: var(--ares-error);
}
.run-node__popover-json {
  margin: 0.35rem 0 0;
  background: var(--ares-surface-sunken);
  border-radius: var(--ares-radius);
  padding: 0.4rem 0.5rem;
  max-height: 160px;
  overflow: auto;
  font-size: 0.68rem;
}
</style>
