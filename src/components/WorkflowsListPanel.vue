<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import ProgressSpinner from 'primevue/progressspinner';
import StatusCheckIcon from '@/components/StatusCheckIcon.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import { workflowsApi, type Workflow, type WorkflowScopeKind } from '@/api/workflows';
import { workflowTemplatesApi, parseTemplateGraph, type WorkflowTemplate } from '@/api/workflow-templates';
import { confirmDialog } from '@/composables/useConfirmDialog';

const props = defineProps<{
  scopeKind: WorkflowScopeKind;
  scopeId: number;
  title: string;
  subtitle: string;
  /** Needed to build the editor route for org/project scope — unused for platform. */
  orgId?: number;
  engId?: number;
}>();

const router = useRouter();
const toast = useToast();

const items = ref<Workflow[]>([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    if (props.scopeKind === 'platform') items.value = await workflowsApi.listPlatform();
    else if (props.scopeKind === 'organization') items.value = await workflowsApi.listForOrg(props.scopeId);
    else items.value = await workflowsApi.listForProject(props.scopeId);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to load workflows', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    loading.value = false;
  }
}

function editorRoute(workflowId: number) {
  if (props.scopeKind === 'platform') return { name: 'workflow-editor', params: { workflowId } };
  if (props.scopeKind === 'organization') return { name: 'org-workflow-editor', params: { orgId: props.orgId, workflowId } };
  return { name: 'org-project-workflow-editor', params: { orgId: props.orgId, engId: props.engId, workflowId } };
}

// ── Create dialog ────────────────────────────────────────────────
const showCreate = ref(false);
const form = ref({ name: '', description: '' });
const saving = ref(false);

function openCreate() {
  form.value = { name: '', description: '' };
  showCreate.value = true;
}

function seedGraph() {
  return {
    nodes: [
      { id: 'trigger-1', type: 'TRIGGER_MANUAL' as const, position: { x: 80, y: 120 }, data: { label: 'Manual start', config: {} } },
    ],
    edges: [],
  };
}

async function createWorkflow() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const req = { name: form.value.name, description: form.value.description || undefined, graphDefinition: seedGraph() };
    const created = props.scopeKind === 'platform' ? await workflowsApi.createPlatform(req)
      : props.scopeKind === 'organization' ? await workflowsApi.createForOrg(props.scopeId, req)
      : await workflowsApi.createForProject(props.scopeId, req);
    showCreate.value = false;
    router.push(editorRoute(created.id));
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Create failed', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}

// ── New from template ────────────────────────────────────────────
const showFromTemplate = ref(false);
const loadingTemplates = ref(false);
const templates = ref<WorkflowTemplate[]>([]);
const templateForm = ref({ templateId: null as number | null, name: '' });
const creatingFromTemplate = ref(false);

const selectedTemplate = computed(() =>
  templates.value.find((t) => t.id === templateForm.value.templateId) ?? null
);

async function openFromTemplate() {
  showFromTemplate.value = true;
  templateForm.value = { templateId: null, name: '' };
  loadingTemplates.value = true;
  try {
    const r = await workflowTemplatesApi.list({ size: 200 });
    // Only offer templates declared for this exact scope level — one built out of, say,
    // ACTION_AGENT_TASK nodes only makes sense as a project-scoped workflow, and instantiating it
    // anywhere else would just fail WorkflowGraphValidator's own scope-gating at creation time.
    templates.value = (r.items ?? []).filter((t) => t.scopeKind === props.scopeKind);
    if (templates.value.length) {
      templateForm.value.templateId = templates.value[0].id;
      templateForm.value.name = templates.value[0].name;
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to load templates', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    loadingTemplates.value = false;
  }
}

function onTemplatePicked(id: number) {
  templateForm.value.templateId = id;
  const t = templates.value.find((x) => x.id === id);
  if (t) templateForm.value.name = t.name;
}

async function createFromTemplate() {
  const t = selectedTemplate.value;
  if (!t || !templateForm.value.name.trim()) return;
  creatingFromTemplate.value = true;
  try {
    const req = { name: templateForm.value.name.trim(), graphDefinition: parseTemplateGraph(t) };
    const created = props.scopeKind === 'platform' ? await workflowsApi.createPlatform(req)
      : props.scopeKind === 'organization' ? await workflowsApi.createForOrg(props.scopeId, req)
      : await workflowsApi.createForProject(props.scopeId, req);
    showFromTemplate.value = false;
    router.push(editorRoute(created.id));
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Create failed', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    creatingFromTemplate.value = false;
  }
}

async function toggleStatus(wf: Workflow) {
  const next = wf.status === 'disabled' ? 'active' : 'disabled';
  try {
    await workflowsApi.update(wf.id, { status: next });
    await load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Update failed', detail: e?.response?.data?.detail ?? e.message, life: 4000 });
  }
}

async function deleteWorkflow(wf: Workflow) {
  const ok = await confirmDialog({ header: 'Delete workflow', message: `Delete workflow "${wf.name}"? Its run history will be deleted too.` });
  if (!ok) return;
  try {
    await workflowsApi.delete(wf.id);
    items.value = items.value.filter((w) => w.id !== wf.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  }
}

// Same tick/cross/unknown convention as the integration tables (StatusCheckIcon) — draft maps to
// "unknown" since it's neither on nor off yet, not a third color of its own.
function statusIcon(status: string): 'ok' | 'error' | 'unknown' {
  if (status === 'active') return 'ok';
  if (status === 'disabled') return 'error';
  return 'unknown';
}
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const statusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Disabled', value: 'disabled' },
];

// ── Sort / filter — mirrors ProjectReportsView.vue's convention ────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterStatus = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const processed = computed(() => {
  let data = [...items.value];
  if (filterStatus.value.length) data = data.filter((w) => filterStatus.value.includes(w.status));
  if (sortCol.value && sortDir.value) {
    const dir = sortDir.value === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      const va = String((a as any)[sortCol.value!] ?? '');
      const vb = String((b as any)[sortCol.value!] ?? '');
      return dir * va.localeCompare(vb, undefined, { numeric: true });
    });
  } else {
    data.sort((a, b) => a.name.localeCompare(b.name));
  }
  return data;
});

onMounted(load);
defineExpose({ reload: load });
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">{{ title }}</h2>
        <p class="ares-page-subtitle">{{ subtitle }}</p>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button icon="pi pi-copy" label="New from template" severity="secondary" @click="openFromTemplate" />
        <Button icon="pi pi-plus" label="New workflow" @click="openCreate" />
      </div>
    </div>

    <div v-if="loading" style="display:flex; justify-content:center; padding:3rem;">
      <ProgressSpinner />
    </div>

    <div v-else class="ares-card" style="padding:0; overflow:hidden;">
      <table class="ares-table">
        <thead>
          <tr>
            <th>
              <ColumnHeader label="Name" :sortable="true"
                :sort-dir="sortCol === 'name' ? sortDir : null"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                @update:sort-dir="onSort('name', $event)" />
            </th>
            <th style="width:110px;">
              <ColumnHeader label="Status" :sortable="true"
                :sort-dir="sortCol === 'status' ? sortDir : null"
                :filter-options="statusOptions"
                :filter-value="filterStatus"
                @update:sort-dir="onSort('status', $event)"
                @update:filter-value="filterStatus = $event" />
            </th>
            <th style="width:160px;">Triggers</th>
            <th style="width:110px;">
              <ColumnHeader label="Updated" :sortable="true"
                :sort-dir="sortCol === 'updatedAt' ? sortDir : null"
                sort-asc-label="Oldest first" sort-desc-label="Newest first"
                @update:sort-dir="onSort('updatedAt', $event)" />
            </th>
            <th style="width:140px; text-align:right; padding-right:0.75rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="wf in processed" :key="wf.id" style="cursor:pointer;" @click="router.push(editorRoute(wf.id))">
            <td>
              <div style="font-weight:500; display:flex; align-items:center; gap:0.4rem;">
                {{ wf.name }}
                <i v-if="wf.locked" class="pi pi-lock" style="font-size:0.75rem; color:var(--ares-text-muted);"
                  :title="`Managed automatically (${wf.managedBy}) — edit it from its origin page.`" />
              </div>
              <div v-if="wf.description" style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.1rem;">{{ wf.description }}</div>
            </td>
            <td><StatusCheckIcon :status="statusIcon(wf.status)" :tooltip="statusLabel(wf.status)" /></td>
            <td style="font-size:0.8rem; color:var(--ares-text-muted);">
              {{ wf.triggers.map(t => t.triggerType).join(', ') || 'none' }}
            </td>
            <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ wf.updatedAt.slice(0, 10) }}</td>
            <td>
              <div v-if="wf.locked" style="text-align:right; padding-right:0.75rem; font-size:0.72rem; color:var(--ares-text-muted);" @click.stop>
                System
              </div>
              <div v-else style="display:flex; align-items:center; gap:0.2rem; justify-content:flex-end; padding-right:0.5rem;" @click.stop>
                <Button icon="pi pi-pencil" size="small" severity="secondary" text
                  title="Open editor" style="padding:0.25rem;" @click="router.push(editorRoute(wf.id))" />
                <Button :icon="wf.status === 'disabled' ? 'pi pi-play' : 'pi pi-pause'" size="small" severity="secondary" text
                  :title="wf.status === 'disabled' ? 'Enable' : 'Disable'" style="padding:0.25rem;" @click="toggleStatus(wf)" />
                <Button icon="pi pi-trash" size="small" severity="danger" text
                  title="Delete" style="padding:0.25rem;" @click="deleteWorkflow(wf)" />
              </div>
            </td>
          </tr>
          <tr v-if="!processed.length">
            <td colspan="5" class="ares-table-empty">No workflows yet. Click "New workflow" to create one.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Dialog v-model:visible="showCreate" modal header="New workflow" :style="{ width: 'min(480px, 95vw)' }">
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label class="ares-field-label">Name</label>
          <InputText v-model="form.name" placeholder="e.g. Notify on P0 detections" style="width:100%;" />
        </div>
        <div>
          <label class="ares-field-label">Description (optional)</label>
          <Textarea v-model="form.description" rows="2" class="w-full" auto-resize />
        </div>
        <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0;">
          Starts with a single manual-trigger node — build the rest of the graph in the editor.
        </p>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showCreate = false" />
          <Button label="Create" size="small" :loading="saving" @click="createWorkflow" />
        </div>
      </div>
    </Dialog>

    <Dialog v-model:visible="showFromTemplate" modal header="New from template" :style="{ width: 'min(480px, 95vw)' }">
      <div v-if="loadingTemplates" style="display:flex; justify-content:center; padding:1.5rem;">
        <ProgressSpinner style="width:32px; height:32px;" />
      </div>
      <div v-else-if="!templates.length" style="font-size:0.85rem; color:var(--ares-text-muted);">
        No {{ scopeKind }}-scoped templates yet. Build a workflow, then use "Save as template" in
        its editor, or open KB → Workflow Templates to build one from scratch for this scope.
      </div>
      <div v-else style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label class="ares-field-label">Template</label>
          <Select :model-value="templateForm.templateId" @update:model-value="onTemplatePicked"
            :options="templates" option-label="name" option-value="id" style="width:100%;" />
          <p v-if="selectedTemplate?.description" style="font-size:0.78rem; color:var(--ares-text-muted); margin:0.35rem 0 0;">
            {{ selectedTemplate.description }}
          </p>
        </div>
        <div>
          <label class="ares-field-label">Name</label>
          <InputText v-model="templateForm.name" style="width:100%;" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showFromTemplate = false" />
          <Button label="Create" size="small" :loading="creatingFromTemplate"
            :disabled="!templateForm.templateId || !templateForm.name.trim()" @click="createFromTemplate" />
        </div>
      </div>
    </Dialog>
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
</style>
