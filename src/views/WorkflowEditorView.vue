<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import StatusCheckIcon from '@/components/StatusCheckIcon.vue';
import WorkflowCanvas from '@/components/workflow-editor/WorkflowCanvas.vue';
import NodeConfigPanel from '@/components/workflow-editor/NodeConfigPanel.vue';
import WorkflowRunsPanel from '@/components/workflow-editor/WorkflowRunsPanel.vue';
import { workflowsApi, type Workflow, type WorkflowGraphNode, type WorkflowGraphEdge, type IntegrationActionCatalogEntry } from '@/api/workflows';
import { workflowTemplatesApi } from '@/api/workflow-templates';
import { saveAsTemplate as saveAsTemplateFlow } from '@/composables/useSaveAsTemplate';
import { messagingApi, type MessagingIntegration } from '@/api/messaging';
import { agentPoolsApi, type AgentPool } from '@/api/agent-pools';
import { confirmDialog } from '@/composables/useConfirmDialog';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const workflowId = computed(() => Number(route.params.workflowId));

const workflow = ref<Workflow | null>(null);
const loading = ref(true);
const saving = ref(false);
const integrations = ref<MessagingIntegration[]>([]);
const pools = ref<AgentPool[]>([]);
const integrationActionCatalog = ref<IntegrationActionCatalogEntry[]>([]);
// Only project-scoped workflows can hold ACTION_AGENT_TASK nodes (see WorkflowCanvas's
// availableActionTypes gating) — scopeId is that project's id in that case.
const projectId = computed(() => workflow.value?.scopeKind === 'project' ? workflow.value.scopeId : undefined);

const nodes = ref<WorkflowGraphNode[]>([]);
const edges = ref<WorkflowGraphEdge[]>([]);
const selectedNodeId = ref<string | null>(null);
const selectedNode = computed(() => nodes.value.find((n) => n.id === selectedNodeId.value) ?? null);

const activeTab = ref<'canvas' | 'runs'>('canvas');
const running = ref(false);
const readonly = computed(() => workflow.value?.locked ?? false);

// ── Title (inline edit) — mirrors FindingDetailView's title editor exactly, for a
// consistent editing pattern across the app (pencil button -> input + check/cancel).
const editingTitle = ref(false);
const titleDraft = ref('');
const savingTitle = ref(false);

function openTitleEditor() {
  if (!workflow.value) return;
  titleDraft.value = workflow.value.name;
  editingTitle.value = true;
}

async function saveTitle() {
  if (!workflow.value) return;
  const next = titleDraft.value.trim();
  if (!next) { editingTitle.value = false; return; }
  if (next === workflow.value.name) { editingTitle.value = false; return; }
  savingTitle.value = true;
  try {
    workflow.value = await workflowsApi.update(workflow.value.id, { name: next });
    editingTitle.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Update failed', detail: e?.response?.data?.detail ?? e.message, life: 4000 });
  } finally {
    savingTitle.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const [wf, integrationList] = await Promise.all([
      workflowsApi.get(workflowId.value),
      messagingApi.list().catch(() => []),
    ]);
    workflow.value = wf;
    integrations.value = integrationList;
    const graph = JSON.parse(wf.graphDefinition) as { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] };
    nodes.value = graph.nodes;
    edges.value = graph.edges;
    pools.value = wf.scopeKind === 'project' ? await agentPoolsApi.listForProject(wf.scopeId).catch(() => []) : [];
    // Unlike pools (always project-only), integration-action handlers can
    // be scoped to platform/organization/project each on their own — the backend catalog endpoint
    // itself filters by which handlers actually support this workflow's scope.
    integrationActionCatalog.value = await workflowsApi.integrationActionCatalog(wf.scopeKind, wf.scopeId).catch(() => []);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to load workflow', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!workflow.value) return;
  saving.value = true;
  try {
    const updated = await workflowsApi.update(workflow.value.id, {
      graphDefinition: { nodes: nodes.value, edges: edges.value },
    });
    workflow.value = updated;
    toast.add({ severity: 'success', summary: 'Workflow saved', life: 2000 });
    // Non-blocking advisories (e.g. "no agent in the selected pool currently reports this
    // tool") — the save already succeeded, this is purely a heads-up so the operator isn't
    // surprised later when the node's tasks never get claimed.
    for (const w of updated.warnings ?? []) {
      toast.add({ severity: 'warn', summary: `Node '${w.nodeId}'`, detail: w.message, life: 8000 });
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
  } finally {
    saving.value = false;
  }
}

// ── Save as template ─────────────────────────────────────────────
// Snapshots the CURRENT canvas, not whatever's last persisted — save() runs first so the
// template can't silently lag behind unsaved edits still on screen.
const showSaveAsTemplate = ref(false);
const templateForm = ref({ name: '', description: '' });
const savingTemplate = ref(false);

function openSaveAsTemplate() {
  if (!workflow.value) return;
  templateForm.value = { name: workflow.value.name, description: '' };
  showSaveAsTemplate.value = true;
}

async function saveAsTemplate() {
  if (!workflow.value || !templateForm.value.name.trim()) return;
  const name = templateForm.value.name.trim();
  savingTemplate.value = true;
  try {
    await save();
    await saveAsTemplateFlow(
      (overwrite) => workflowTemplatesApi.fromWorkflow(workflow.value!.id, {
        name, description: templateForm.value.description || undefined,
      }, overwrite),
      name, 'workflow template');
    showSaveAsTemplate.value = false;
    toast.add({ severity: 'success', summary: 'Template saved', detail: 'Available under KB → Workflow Templates.', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save as template failed', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
  } finally {
    savingTemplate.value = false;
  }
}

// Same tick/cross/unknown convention as the workflows list table (StatusCheckIcon) — draft maps
// to "unknown" since it's neither on nor off yet, not a third color of its own.
function statusIcon(status: string): 'ok' | 'error' | 'unknown' {
  if (status === 'active') return 'ok';
  if (status === 'disabled') return 'error';
  return 'unknown';
}
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function activate() {
  if (!workflow.value) return;
  try {
    workflow.value = await workflowsApi.update(workflow.value.id, { status: workflow.value.status === 'active' ? 'disabled' : 'active' });
    for (const w of workflow.value.warnings ?? []) {
      toast.add({ severity: 'warn', summary: `Node '${w.nodeId}'`, detail: w.message, life: 8000 });
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Update failed', detail: e?.response?.data?.detail ?? e.message, life: 4000 });
  }
}

function updateNodeConfig(config: Record<string, unknown>) {
  const n = selectedNode.value;
  if (!n) return;
  n.data = { ...n.data, config };
}

function updateNodeLabel(label: string) {
  const n = selectedNode.value;
  if (!n) return;
  n.data = { ...n.data, label };
}

// Same confirmation WorkflowCanvas's own Supr-key deletion shows — this is the config panel's
// trash-button path, a separate route to node removal that must ask the same way.
async function deleteSelectedNode() {
  const id = selectedNodeId.value;
  if (!id) return;
  const ok = await confirmDialog({ header: 'Delete node', message: "Delete this node? This can't be undone." });
  if (!ok) return;
  nodes.value = nodes.value.filter((n) => n.id !== id);
  edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
  selectedNodeId.value = null;
}

const manualTriggers = computed(() => workflow.value?.triggers.filter((t) => t.triggerType === 'manual') ?? []);

async function runNow() {
  if (!workflow.value) return;
  const trigger = manualTriggers.value[0];
  if (!trigger) {
    toast.add({ severity: 'warn', summary: 'No manual trigger', detail: 'Add a manual-trigger node and save first.', life: 4000 });
    return;
  }
  running.value = true;
  try {
    const run = await workflowsApi.runManualTrigger(workflow.value.id, trigger.id);
    toast.add({ severity: run.status === 'failed' ? 'error' : 'success', summary: `Run ${run.status}`, life: 3000 });
    activeTab.value = 'runs';
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Run failed', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
  } finally {
    running.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="wf-editor">
    <div v-if="loading" style="padding:2rem; color:var(--ares-text-muted);">Loading…</div>
    <template v-else-if="workflow">
      <div class="wf-editor__header">
        <Button icon="pi pi-arrow-left" severity="secondary" text @click="router.back()" style="flex-shrink:0;" />

        <div v-if="!editingTitle" class="title-row">
          <span class="wf-editor__name">{{ workflow.name }}</span>
          <i v-if="readonly" class="pi pi-lock" style="font-size:0.8rem; color:var(--ares-text-muted);"
            v-tooltip.right="`Managed automatically (${workflow.managedBy}) — edit it from its origin page.`" />
          <button v-else class="title-edit-btn" v-tooltip.right="'Edit name'" @click="openTitleEditor">
            <i class="pi pi-pencil" />
          </button>
        </div>
        <div v-else class="title-row title-row--editing">
          <InputText v-model="titleDraft" class="title-input"
            @keyup.enter="saveTitle" @keyup.escape="editingTitle = false" autofocus />
          <Button icon="pi pi-check" size="small" severity="success" text
            :loading="savingTitle" @click="saveTitle" v-tooltip.top="'Save (Enter)'" />
          <Button icon="pi pi-times" size="small" severity="secondary" text
            :disabled="savingTitle" @click="editingTitle = false" v-tooltip.top="'Cancel (Esc)'" />
        </div>

        <StatusCheckIcon :status="statusIcon(workflow.status)" :tooltip="statusLabel(workflow.status)" />
        <div style="flex:1;"></div>
        <div class="wf-editor__tabs">
          <button type="button" :class="{ active: activeTab === 'canvas' }" @click="activeTab = 'canvas'">Editor</button>
          <button type="button" :class="{ active: activeTab === 'runs' }" @click="activeTab = 'runs'">Runs</button>
        </div>
        <Button icon="pi pi-play" label="Run now" size="small" severity="secondary" :loading="running" @click="runNow" />
        <template v-if="!readonly">
          <Button :label="workflow.status === 'active' ? 'Disable' : 'Activate'" size="small" severity="secondary" @click="activate" />
          <Button icon="pi pi-copy" label="Save as template" size="small" severity="secondary" @click="openSaveAsTemplate" />
          <Button icon="pi pi-save" label="Save" size="small" :loading="saving" @click="save" />
        </template>
      </div>

      <div v-show="activeTab === 'canvas'" class="wf-editor__body">
        <WorkflowCanvas v-model:nodes="nodes" v-model:edges="edges" :scope-kind="workflow.scopeKind" :integrations="integrations" :pools="pools"
          :integration-action-catalog="integrationActionCatalog" :readonly="readonly"
          @node-select="selectedNodeId = $event" @pane-click="selectedNodeId = null" />
        <NodeConfigPanel v-if="selectedNode" :node="selectedNode" :scope-kind="workflow.scopeKind" :integrations="integrations" :all-nodes="nodes" :all-edges="edges" :project-id="projectId"
          :integration-action-catalog="integrationActionCatalog" :workflow-id="workflow.id" :scope-id="workflow.scopeId" :readonly="readonly"
          @update:config="updateNodeConfig" @update:label="updateNodeLabel" @close="selectedNodeId = null" @delete="deleteSelectedNode" />
      </div>

      <div v-if="activeTab === 'runs'" class="wf-editor__runs">
        <WorkflowRunsPanel :workflow-id="workflow.id" />
      </div>

      <Dialog v-model:visible="showSaveAsTemplate" modal header="Save as template" :style="{ width: 'min(480px, 95vw)' }">
        <div style="display:flex; flex-direction:column; gap:1rem;">
          <div>
            <label class="ares-field-label">Name</label>
            <InputText v-model="templateForm.name" style="width:100%;" />
          </div>
          <div>
            <label class="ares-field-label">Description (optional)</label>
            <Textarea v-model="templateForm.description" rows="2" class="w-full" auto-resize />
          </div>
          <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0;">
            Saves the workflow first, then snapshots its graph into a reusable KB template. Pool/
            integration selections are stripped out — the workflow built from this template starts
            in draft status with those nodes unconfigured.
          </p>
          <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
            <Button label="Cancel" severity="secondary" size="small" @click="showSaveAsTemplate = false" />
            <Button label="Save" size="small" :loading="savingTemplate" :disabled="!templateForm.name.trim()" @click="saveAsTemplate" />
          </div>
        </div>
      </Dialog>
    </template>
  </div>
</template>

<style scoped>
.ares-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}

.wf-editor {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--ares-topbar-height, 60px));
  margin: -1.5rem;
}
.wf-editor__header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--ares-border);
  background: var(--ares-surface-raised);
}
.wf-editor__name {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--ares-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

/* ── Title inline editor — mirrors FindingDetailView's title editor exactly ─── */
.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.title-row--editing { gap: 0.4rem; }
.title-edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ares-text-muted);
  padding: 0.2rem;
  font-size: 0.85rem;
  transition: color 0.12s;
}
.title-edit-btn:hover {
  color: var(--ares-text-1);
}
.title-input {
  min-width: 220px;
  font-size: 1rem;
  font-weight: 600;
  padding: 0.3rem 0.55rem;
}
.wf-editor__tabs {
  display: flex;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
}
.wf-editor__tabs button {
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  background: var(--ares-surface-2);
  border: none;
  cursor: pointer;
  color: var(--ares-text-2);
}
.wf-editor__tabs button.active {
  background: var(--p-primary-color);
  color: white;
}
.wf-editor__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.wf-editor__body > :deep(.wf-canvas-wrap) {
  flex: 1;
}
.wf-editor__runs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 1.25rem;
}
</style>
