<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { WorkflowNodeType } from '@/api/workflows';
import type { MessagingIntegration } from '@/api/messaging';
import type { AgentPool } from '@/api/agent-pools';
import type { IntegrationActionCatalogEntry } from '@/api/workflows';
import { NODE_TYPE_COLORS } from './nodeColors';

const props = defineProps<{
  id: string;
  type: string;
  data: { label: string; config: Record<string, unknown> };
  selected?: boolean;
  integrations?: MessagingIntegration[];
  pools?: AgentPool[];
  integrationActionCatalog?: IntegrationActionCatalogEntry[];
}>();

// Vue Flow only knows `type: string` generically — narrowed here since WorkflowCanvas only ever
// mounts this component for the 5 Phase-A WorkflowNodeType slot names it registers.
const nodeType = computed(() => props.type as WorkflowNodeType);

const isTrigger = computed(() => nodeType.value?.startsWith('TRIGGER_'));
const isCondition = computed(() => nodeType.value === 'CONDITION');
const isLoop = computed(() => nodeType.value === 'LOOP');
const isEnd = computed(() => nodeType.value === 'END');

const COLORS = NODE_TYPE_COLORS;

const summary = computed(() => {
  const c = props.data.config ?? {};
  switch (nodeType.value) {
    case 'CONDITION': return (c.aql as string) || 'no condition set';
    case 'ASSIGN_VARIABLE': {
      const name = (c.variableName as string) || '?';
      if (c.sourceType === 'combine') {
        const vars = (c.sourceVariables as string[] | undefined) ?? [];
        return `${name} = combine(${vars.join(', ') || '…'})`;
      }
      return `${name} = ${(c.entityType as string) || '?'} where ${(c.aql as string) || '…'}`;
    }
    case 'TRIGGER_CRON': return (c.cronExpression as string) || 'no schedule set';
    case 'TRIGGER_WEBHOOK': return 'POST endpoint — see side panel for the URL';
    case 'TRIGGER_EVENT': return c.eventCode ? `on ${c.eventCode}` : 'no event set';
    case 'TRIGGER_CALL_TOPIC': return c.topic ? `topic "${c.topic}"` : 'no topic set';
    case 'ACTION_AGENT_TASK': {
      if (!c.tool) return 'no tool set';
      const pool = props.pools?.find((p) => p.id === c.poolId);
      const poolLabel = c.poolId ? (pool?.name ?? `pool #${c.poolId}`) : 'no pool set';
      return `${c.tool} → ${poolLabel}`;
    }
    case 'ACTION_NOTIFICATION': {
      if (!c.integrationId) return 'no integration set';
      const found = props.integrations?.find((i) => i.id === c.integrationId);
      return found?.name ?? `integration #${c.integrationId}`;
    }
    case 'ACTION_CALL_WORKFLOW':
      return c.topic ? `→ topic "${c.topic}"` : 'no topic set';
    case 'ACTION_WEBHOOK_CALL':
      return (c.url as string) || 'no URL set';
    case 'ACTION_INTEGRATION_CALL': {
      if (!c.integrationType || !c.action) return 'no action set';
      const entry = props.integrationActionCatalog?.find((e) => e.type === c.integrationType);
      const typeLabel = entry?.typeLabel ?? (c.integrationType as string);
      const actionLabel = entry?.actions.find((a) => a.code === c.action)?.label ?? (c.action as string);
      return `${typeLabel}: ${actionLabel}`;
    }
    case 'LOOP': {
      const varName = (c.variableName as string) || 'no variable set';
      return `for each in ${varName}`;
    }
    case 'END':
      return c.result === 'failure' ? 'ends run: failure' : 'ends run: success';
    default: return '';
  }
});
</script>

<template>
  <div class="wf-node" :class="{ 'wf-node--selected': selected }" :style="{ borderColor: selected ? COLORS[nodeType] : undefined }">
    <Handle v-if="!isTrigger" type="target" :position="Position.Left" />

    <div class="wf-node__header" :style="{ background: COLORS[nodeType] }">
      <span>{{ data.label }}</span>
    </div>
    <div v-if="summary" class="wf-node__summary">{{ summary }}</div>

    <template v-if="isCondition">
      <Handle id="true" type="source" :position="Position.Right" style="top:35%; background:#22c55e;" />
      <Handle id="false" type="source" :position="Position.Right" style="top:65%; background:#ef4444;" />
      <div class="wf-node__branch-label wf-node__branch-label--true">true</div>
      <div class="wf-node__branch-label wf-node__branch-label--false">false</div>
    </template>
    <template v-else-if="isLoop">
      <Handle id="loop_body" type="source" :position="Position.Right" style="top:35%; background:#eab308;" />
      <Handle id="loop_done" type="source" :position="Position.Right" style="top:65%; background:#22c55e;" />
      <div class="wf-node__branch-label wf-node__branch-label--true">loop</div>
      <div class="wf-node__branch-label wf-node__branch-label--false">done</div>
    </template>
    <template v-else-if="isEnd">
      <!-- Terminal node — no outgoing edges allowed (WorkflowGraphValidator rejects any), so no
           source handle at all rather than one that would only ever be rejected on save. -->
    </template>
    <template v-else-if="!isTrigger">
      <Handle id="success" type="source" :position="Position.Right" style="top:35%; background:#22c55e;" />
      <Handle id="error" type="source" :position="Position.Right" style="top:65%; background:#ef4444;" />
      <div class="wf-node__branch-label wf-node__branch-label--true">success</div>
      <div class="wf-node__branch-label wf-node__branch-label--false">error</div>
    </template>
    <template v-else>
      <Handle type="source" :position="Position.Right" />
    </template>
  </div>
</template>

<style scoped>
.wf-node {
  min-width: 180px;
  background: var(--ares-surface-raised);
  border: 2px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  font-size: 0.8rem;
  position: relative;
}
.wf-node--selected { box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-primary-color) 40%, transparent); }
.wf-node__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.65rem;
  color: white;
  font-weight: 600;
  border-radius: calc(var(--ares-radius) - 2px) calc(var(--ares-radius) - 2px) 0 0;
}
.wf-node__summary {
  padding: 0.45rem 0.65rem;
  background: var(--ares-surface-2);
  color: var(--ares-text-muted);
  font-family: monospace;
  font-size: 0.72rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
  border-radius: 0 0 calc(var(--ares-radius) - 2px) calc(var(--ares-radius) - 2px);
}
.wf-node__branch-label {
  position: absolute;
  right: -3.2rem;
  font-size: 0.65rem;
  color: var(--ares-text-muted);
  transform: translateY(-50%);
}
.wf-node__branch-label--true { top: 35%; }
.wf-node__branch-label--false { top: 65%; }
</style>
