<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import AresBadge from '@/components/AresBadge.vue';
import WorkflowCanvas from '@/components/workflow-editor/WorkflowCanvas.vue';
import NodeConfigPanel from '@/components/workflow-editor/NodeConfigPanel.vue';
import { workflowTemplatesApi, type WorkflowTemplate } from '@/api/workflow-templates';
import type { WorkflowGraphNode, WorkflowGraphEdge, WorkflowScopeKind } from '@/api/workflows';
import { confirmDialog } from '@/composables/useConfirmDialog';

// Mirrors WorkflowEditorView.vue's own shape, adapted for a template rather than a live,
// executable Workflow: no scopeId (a template isn't owned by any org/project — see
// WorkflowTemplate's own doc comment), so no runs/activation/pools/integrations/webhooks — those
// all need a real scope-bound resource to resolve against. WorkflowCanvas/NodeConfigPanel already
// gate/degrade gracefully with only a bare scopeKind and no scopeId (same as a freshly instantiated,
// not-yet-configured workflow), so they're reused here unchanged.

const route = useRoute();
const router = useRouter();
const toast = useToast();

const templateId = computed(() => Number(route.params.templateId));

const template = ref<WorkflowTemplate | null>(null);
const loading = ref(true);
const saving = ref(false);

const nodes = ref<WorkflowGraphNode[]>([]);
const edges = ref<WorkflowGraphEdge[]>([]);
const selectedNodeId = ref<string | null>(null);
const selectedNode = computed(() => nodes.value.find((n) => n.id === selectedNodeId.value) ?? null);

const SCOPE_OPTIONS: { label: string; value: WorkflowScopeKind }[] = [
  { label: 'Platform', value: 'platform' },
  { label: 'Organization', value: 'organization' },
  { label: 'Project', value: 'project' },
];

// ── Title (inline edit) — mirrors WorkflowEditorView's title editor exactly.
const editingTitle = ref(false);
const titleDraft = ref('');
const savingTitle = ref(false);

function openTitleEditor() {
  if (!template.value) return;
  titleDraft.value = template.value.name;
  editingTitle.value = true;
}

async function saveTitle() {
  if (!template.value) return;
  const next = titleDraft.value.trim();
  if (!next || next === template.value.name) { editingTitle.value = false; return; }
  savingTitle.value = true;
  try {
    template.value = await workflowTemplatesApi.update(template.value.id, {
      name: next,
      description: template.value.description,
      scopeKind: template.value.scopeKind,
      graphDefinition: template.value.graphDefinition,
    });
    editingTitle.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Update failed', detail: e?.response?.data?.detail ?? e.message, life: 4000 });
  } finally {
    savingTitle.value = false;
  }
}

// Changing scope live re-filters WorkflowCanvas's node palette (same availableActionTypes gating
// a real Workflow's editor uses) — doesn't touch nodes already on the canvas, so switching to a
// narrower scope can leave nodes that will fail WorkflowGraphValidator's scope-gating at save time;
// the save error surfaces that directly rather than silently stripping anything client-side.
const scopeKind = ref<WorkflowScopeKind>('platform');

async function load() {
  loading.value = true;
  try {
    const t = await workflowTemplatesApi.get(templateId.value);
    template.value = t;
    scopeKind.value = t.scopeKind;
    const graph = JSON.parse(t.graphDefinition) as { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] };
    nodes.value = graph.nodes;
    edges.value = graph.edges;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to load template', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!template.value) return;
  saving.value = true;
  try {
    const updated = await workflowTemplatesApi.update(template.value.id, {
      name: template.value.name,
      description: template.value.description,
      scopeKind: scopeKind.value,
      graphDefinition: JSON.stringify({ nodes: nodes.value, edges: edges.value }),
    });
    template.value = updated;
    toast.add({ severity: 'success', summary: 'Template saved', life: 2000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
  } finally {
    saving.value = false;
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

async function deleteSelectedNode() {
  const id = selectedNodeId.value;
  if (!id) return;
  const ok = await confirmDialog({ header: 'Delete node', message: "Delete this node? This can't be undone." });
  if (!ok) return;
  nodes.value = nodes.value.filter((n) => n.id !== id);
  edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
  selectedNodeId.value = null;
}

onMounted(load);
</script>

<template>
  <div class="wf-editor">
    <div v-if="loading" style="padding:2rem; color:var(--ares-text-muted);">Loading…</div>
    <template v-else-if="template">
      <div class="wf-editor__header">
        <Button icon="pi pi-arrow-left" severity="secondary" text @click="router.back()" style="flex-shrink:0;" />

        <div v-if="!editingTitle" class="title-row">
          <span class="wf-editor__name">{{ template.name }}</span>
          <button class="title-edit-btn" v-tooltip.right="'Edit name'" @click="openTitleEditor">
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

        <AresBadge value="Template" severity="secondary" />
        <div style="flex:1;"></div>

        <label style="font-size:0.78rem; color:var(--ares-text-muted); white-space:nowrap;">Scope</label>
        <Select v-model="scopeKind" :options="SCOPE_OPTIONS" option-label="label" option-value="value" size="small" style="width:160px;" />

        <Button icon="pi pi-save" label="Save" size="small" :loading="saving" @click="save" />
      </div>

      <div class="wf-editor__body">
        <WorkflowCanvas v-model:nodes="nodes" v-model:edges="edges" :scope-kind="scopeKind" :integrations="[]"
          @node-select="selectedNodeId = $event" @pane-click="selectedNodeId = null" />
        <NodeConfigPanel v-if="selectedNode" :node="selectedNode" :scope-kind="scopeKind" :integrations="[]" :all-nodes="nodes" :all-edges="edges"
          @update:config="updateNodeConfig" @update:label="updateNodeLabel" @close="selectedNodeId = null" @delete="deleteSelectedNode" />
      </div>
    </template>
  </div>
</template>

<style scoped>
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
.wf-editor__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.wf-editor__body > :deep(.wf-canvas-wrap) {
  flex: 1;
}
</style>
