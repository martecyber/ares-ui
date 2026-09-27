<script setup lang="ts">
import { computed } from 'vue';
import { VueFlow, type Connection, type Edge as VFEdge, type Node as VFNode } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import WorkflowNode from './WorkflowNode.vue';
import { NODE_TYPE_COLORS } from './nodeColors';
import type { WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeType, WorkflowScopeKind, IntegrationActionCatalogEntry } from '@/api/workflows';
import type { MessagingIntegration } from '@/api/messaging';
import type { AgentPool } from '@/api/agent-pools';
import { confirmDialog } from '@/composables/useConfirmDialog';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{
  scopeKind: WorkflowScopeKind; integrations: MessagingIntegration[]; pools?: AgentPool[];
  integrationActionCatalog?: IntegrationActionCatalogEntry[];
  /** True for a locked (managed-by-legacy-scheduler) workflow — nodes/edges still render and are
   *  still clickable to inspect (see NodeConfigPanel's own readonly mode), but the palette is
   *  hidden and dragging/connecting/deleting are disabled. */
  readonly?: boolean;
}>();

const nodes = defineModel<WorkflowGraphNode[]>('nodes', { required: true });
const edges = defineModel<WorkflowGraphEdge[]>('edges', { required: true });

const emit = defineEmits<{ 'node-select': [nodeId: string]; 'pane-click': [] }>();

// Vue Flow's own Node/Edge shapes are structurally compatible with our domain ones (id/type/
// position/data for nodes; id/source/target/sourceHandle for edges) — no real transform needed,
// just type-widening through VFNode/VFEdge so <VueFlow> accepts them.
const vfNodes = computed<VFNode[]>(() => nodes.value as unknown as VFNode[]);
const vfEdges = computed<VFEdge[]>(() => edges.value as unknown as VFEdge[]);

const TRIGGER_TYPES: WorkflowNodeType[] = ['TRIGGER_MANUAL', 'TRIGGER_CRON', 'TRIGGER_WEBHOOK', 'TRIGGER_EVENT', 'TRIGGER_CALL_TOPIC'];
const OPERATION_TYPES: WorkflowNodeType[] = ['CONDITION', 'ASSIGN_VARIABLE', 'LOOP'];
const ACTION_TYPES: WorkflowNodeType[] = ['ACTION_AGENT_TASK', 'ACTION_NOTIFICATION', 'ACTION_CALL_WORKFLOW', 'ACTION_WEBHOOK_CALL', 'ACTION_INTEGRATION_CALL', 'ACTION_MANAGE_TAGS', 'ACTION_UPDATE_DETECTION_STATUS'];
const END_TYPES: WorkflowNodeType[] = ['END'];
const PHASE_A_TYPES: WorkflowNodeType[] = [...TRIGGER_TYPES, ...OPERATION_TYPES, ...ACTION_TYPES, ...END_TYPES];

// Agent tasks always operate on a project's own data (pools/grants are resolved per-project) —
// only offer that node type in the palette when it could actually be saved. The backend
// (WorkflowGraphValidator) still rejects it server-side too; this just avoids letting someone
// build a graph that's doomed to fail validation at save time.
const PROJECT_ONLY_ACTIONS = new Set<WorkflowNodeType>(['ACTION_AGENT_TASK']);
const availableActionTypes = computed(() =>
  ACTION_TYPES.filter((t) => !PROJECT_ONLY_ACTIONS.has(t) || props.scopeKind === 'project'));

// Vue Flow's key handling (restricted to just Delete via delete-key-code below — its own default
// is Backspace+Delete, but Backspace also fires while editing text elsewhere on the page) already
// produces 'remove' changes for whatever's currently selected — pressing Supr with a node selected
// reaches here, same as clicking NodeConfigPanel's own trash button
// (WorkflowEditorView.deleteSelectedNode). Both paths go through this one confirmation so neither
// can silently delete without asking.
async function onNodesChange(changes: any[]) {
  if (props.readonly) return;
  for (const c of changes) {
    if (c.type === 'position' && c.position) {
      const n = nodes.value.find((x) => x.id === c.id);
      if (n) n.position = c.position;
    }
  }
  const removals = changes.filter((c) => c.type === 'remove');
  if (!removals.length) return;
  const ok = await confirmDialog({
    header: removals.length > 1 ? 'Delete nodes' : 'Delete node',
    message: removals.length > 1
      ? `Delete these ${removals.length} nodes? This can't be undone.`
      : "Delete this node? This can't be undone.",
  });
  if (!ok) return;
  const removeIds = new Set(removals.map((c) => c.id));
  nodes.value = nodes.value.filter((x) => !removeIds.has(x.id));
  edges.value = edges.value.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target));
}

function onEdgesChange(changes: any[]) {
  if (props.readonly) return;
  for (const c of changes) {
    if (c.type === 'remove') {
      edges.value = edges.value.filter((e) => e.id !== c.id);
    }
  }
}

function onConnect(conn: Connection) {
  if (props.readonly) return;
  const id = `e${conn.source}-${conn.target}-${conn.sourceHandle ?? 'default'}-${Date.now()}`;
  edges.value = [...edges.value, {
    id, source: conn.source, target: conn.target,
    sourceHandle: (conn.sourceHandle as WorkflowGraphEdge['sourceHandle']) ?? null,
  }];
}

let nextNodeSeq = 1;
function addNode(type: WorkflowNodeType) {
  const id = `${type.toLowerCase()}-${Date.now()}-${nextNodeSeq++}`;
  const label = NODE_LABELS[type];
  nodes.value = [...nodes.value, {
    id, type,
    position: { x: 120 + Math.random() * 60, y: 120 + Math.random() * 200 },
    data: { label, config: {} },
  }];
}

const NODE_LABELS: Record<WorkflowNodeType, string> = {
  TRIGGER_MANUAL: 'Manual trigger',
  TRIGGER_CRON: 'Scheduled trigger',
  TRIGGER_WEBHOOK: 'Webhook trigger',
  TRIGGER_EVENT: 'Event trigger',
  TRIGGER_CALL_TOPIC: 'Topic subscriber',
  CONDITION: 'Condition',
  ASSIGN_VARIABLE: 'Assign variable',
  ACTION_AGENT_TASK: 'Agent task',
  ACTION_NOTIFICATION: 'Notification',
  ACTION_CALL_WORKFLOW: 'Call workflow',
  ACTION_WEBHOOK_CALL: 'Webhook call',
  ACTION_INTEGRATION_CALL: 'Integration action',
  ACTION_MANAGE_TAGS: 'Manage tags',
  ACTION_REPORT_FINDING: 'Report finding',
  ACTION_UPDATE_DETECTION_STATUS: 'Update detection status',
  LOOP: 'Loop',
  END: 'End',
};
</script>

<template>
  <div class="wf-canvas-wrap">
    <div v-if="!readonly" class="wf-palette">
      <div class="wf-palette__label">Start</div>
      <button v-for="t in TRIGGER_TYPES" :key="t" type="button" class="wf-palette__btn" :style="{ borderLeftColor: NODE_TYPE_COLORS[t] }" @click="addNode(t)">
        <span>{{ NODE_LABELS[t] }}</span>
      </button>

      <div class="wf-palette__label wf-palette__label--group">Operations</div>
      <button v-for="t in OPERATION_TYPES" :key="t" type="button" class="wf-palette__btn" :style="{ borderLeftColor: NODE_TYPE_COLORS[t] }" @click="addNode(t)">
        <span>{{ NODE_LABELS[t] }}</span>
      </button>

      <div class="wf-palette__label wf-palette__label--group">Actions</div>
      <button v-for="t in availableActionTypes" :key="t" type="button" class="wf-palette__btn" :style="{ borderLeftColor: NODE_TYPE_COLORS[t] }" @click="addNode(t)">
        <span>{{ NODE_LABELS[t] }}</span>
      </button>

      <div class="wf-palette__label wf-palette__label--group">End</div>
      <button v-for="t in END_TYPES" :key="t" type="button" class="wf-palette__btn" :style="{ borderLeftColor: NODE_TYPE_COLORS[t] }" @click="addNode(t)">
        <span>{{ NODE_LABELS[t] }}</span>
      </button>
    </div>

    <VueFlow
      :nodes="vfNodes"
      :edges="vfEdges"
      :default-viewport="{ zoom: 1 }"
      :min-zoom="0.3"
      :delete-key-code="readonly ? null : 'Delete'"
      :nodes-draggable="!readonly"
      :nodes-connectable="!readonly"
      :edges-updatable="!readonly"
      fit-view-on-init
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
      @connect="onConnect"
      @node-click="(e: any) => emit('node-select', e.node.id)"
      @pane-click="emit('pane-click')"
    >
      <Background pattern-color="var(--ares-border)" :gap="16" />
      <Controls />

      <template v-for="t in PHASE_A_TYPES" :key="t" #[`node-${t}`]="slotProps">
        <WorkflowNode v-bind="slotProps" :integrations="integrations" :pools="pools"
          :integration-action-catalog="integrationActionCatalog" />
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.wf-canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
}
.wf-palette {
  width: 190px;
  flex-shrink: 0;
  border-right: 1px solid var(--ares-border);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--ares-surface-raised);
  overflow-y: auto;
}
.wf-palette__label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ares-text-muted);
  margin-bottom: 0.25rem;
}
.wf-palette__label--group { margin-top: 0.9rem; }
.wf-palette__btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--ares-border);
  border-left-width: 3px;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  color: var(--ares-text-1);
  font-size: 0.78rem;
  cursor: pointer;
  text-align: left;
}
.wf-palette__btn:hover {
  background: color-mix(in srgb, var(--p-primary-color) 10%, var(--ares-surface-2));
}
</style>
