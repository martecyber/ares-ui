<script setup lang="ts">
import { computed } from 'vue';
import { VueFlow, type Edge as VFEdge, type Node as VFNode } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import WorkflowRunNode from './WorkflowRunNode.vue';
import type { WorkflowGraphDefinition, WorkflowGraphEdge, WorkflowNodeType, WorkflowStepRun } from '@/api/workflows';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{ graph: WorkflowGraphDefinition; steps: WorkflowStepRun[] }>();

const PHASE_A_TYPES: WorkflowNodeType[] = ['TRIGGER_MANUAL', 'TRIGGER_CRON', 'TRIGGER_WEBHOOK', 'TRIGGER_EVENT', 'TRIGGER_CALL_TOPIC', 'CONDITION', 'ASSIGN_VARIABLE', 'ACTION_AGENT_TASK', 'ACTION_NOTIFICATION', 'ACTION_CALL_WORKFLOW', 'ACTION_WEBHOOK_CALL', 'ACTION_INTEGRATION_CALL', 'ACTION_MANAGE_TAGS', 'ACTION_UPDATE_DETECTION_STATUS', 'LOOP', 'END'];

const stepsByNode = computed(() => {
  const m = new Map<string, WorkflowStepRun>();
  for (const s of props.steps) m.set(s.nodeId, s);
  return m;
});

const nodeTypeById = computed(() => {
  const m = new Map<string, WorkflowNodeType>();
  for (const n of props.graph.nodes) m.set(n.id, n.type);
  return m;
});

function readConditionResult(step: WorkflowStepRun): boolean | null {
  if (!step.output) return null;
  try { return !!JSON.parse(step.output).result; } catch { return null; }
}

function readLoopHasNext(step: WorkflowStepRun): boolean {
  if (!step.output) return false;
  try { return !!JSON.parse(step.output).hasNext; } catch { return false; }
}

// Mirrors WorkflowRunService.isTaken() server-side — same AND-join-with-skip-propagation rule
// this session's design settled on, replicated here purely for display (nothing here feeds
// back into execution). A LOOP node can have several step rows sharing one nodeId (one per
// iteration attempt) — stepsByNode above keeps whichever one came last, which this display reads
// as "the loop's current/latest state" the same way every other repeated-node display in this
// view already treats "latest write wins".
function isTaken(edge: WorkflowGraphEdge): boolean {
  const step = stepsByNode.value.get(edge.source);
  if (!step) return false;
  if (step.status === 'skipped') return false;
  const sourceType = nodeTypeById.value.get(edge.source);
  if (sourceType === 'CONDITION' && step.status === 'completed') {
    const result = readConditionResult(step);
    return (result ? 'true' : 'false') === edge.sourceHandle;
  }
  if (sourceType === 'LOOP' && step.status === 'completed') {
    return (readLoopHasNext(step) ? 'loop_body' : 'loop_done') === edge.sourceHandle;
  }
  if (step.status === 'completed') return edge.sourceHandle == null || edge.sourceHandle === 'success';
  if (step.status === 'failed') return edge.sourceHandle === 'error';
  return false;
}

const vfNodes = computed<VFNode[]>(() =>
  props.graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { label: n.data.label, config: n.data.config, step: stepsByNode.value.get(n.id) ?? null },
  })) as unknown as VFNode[],
);

const vfEdges = computed<VFEdge[]>(() =>
  props.graph.edges.map((e) => {
    const taken = isTaken(e);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      animated: taken,
      style: taken
        ? { stroke: '#22c55e', strokeWidth: 2.5 }
        : { stroke: 'var(--ares-border)', strokeWidth: 1, opacity: 0.45 },
    };
  }) as unknown as VFEdge[],
);
</script>

<template>
  <div class="run-graph-wrap">
    <VueFlow
      :nodes="vfNodes" :edges="vfEdges"
      :default-viewport="{ zoom: 1 }" :min-zoom="0.3" fit-view-on-init
      :nodes-connectable="false" :elements-selectable="false"
    >
      <Background pattern-color="var(--ares-border)" :gap="16" />
      <Controls :show-interactive="false" />
      <template v-for="t in PHASE_A_TYPES" :key="t" #[`node-${t}`]="slotProps">
        <WorkflowRunNode v-bind="slotProps" />
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.run-graph-wrap {
  width: 100%;
  height: 100%;
  min-height: 480px;
}
</style>
