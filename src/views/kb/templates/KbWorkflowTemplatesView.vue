<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import AresLoadingState from '@/components/AresLoadingState.vue';
import AresBadge from '@/components/AresBadge.vue';
import { workflowTemplatesApi, type WorkflowTemplate } from '@/api/workflow-templates';
import type { WorkflowScopeKind } from '@/api/workflows';
import AppPagination from '@/components/AppPagination.vue';
import WorkflowTemplateRenameDialog from '@/components/WorkflowTemplateRenameDialog.vue';
import KbImportDialog from '@/components/KbImportDialog.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router = useRouter();

const SCOPE_OPTIONS: { label: string; value: WorkflowScopeKind }[] = [
  { label: 'Platform', value: 'platform' },
  { label: 'Organization', value: 'organization' },
  { label: 'Project', value: 'project' },
];
const SCOPE_BADGE: Record<WorkflowScopeKind, { label: string; severity: 'contrast' | 'info' | 'success' }> = {
  platform: { label: 'Platform', severity: 'contrast' },
  organization: { label: 'Organization', severity: 'info' },
  project: { label: 'Project', severity: 'success' },
};

const templates = ref<WorkflowTemplate[]>([]);
const loading   = ref(true);
const err       = ref<string | null>(null);

const page       = ref(0);
const totalPages = ref(0);
const total      = ref(0);
const pageSize   = 50;

const deleting    = ref<number | null>(null);
const exportingId = ref<number | null>(null);

const showRename = ref(false);
const editTarget = ref<WorkflowTemplate | null>(null);
const showImport = ref(false);

const showCreate = ref(false);
const createForm = ref<{ name: string; scopeKind: WorkflowScopeKind }>({ name: '', scopeKind: 'platform' });
const creating = ref(false);

function openCreate() {
  createForm.value = { name: '', scopeKind: 'platform' };
  showCreate.value = true;
}

/** Same starter graph WorkflowsListPanel seeds a brand-new workflow with — a lone manual trigger,
 *  the rest is built in the editor. */
function seedGraph() {
  return JSON.stringify({
    nodes: [
      { id: 'trigger-1', type: 'TRIGGER_MANUAL', position: { x: 80, y: 120 }, data: { label: 'Manual start', config: {} } },
    ],
    edges: [],
  });
}

async function createTemplate() {
  if (!createForm.value.name.trim()) return;
  creating.value = true;
  try {
    const created = await workflowTemplatesApi.create({
      name: createForm.value.name.trim(),
      scopeKind: createForm.value.scopeKind,
      graphDefinition: seedGraph(),
    });
    showCreate.value = false;
    router.push({ name: 'kb-workflow-template-editor', params: { templateId: created.id } });
  } catch {
    err.value = 'Failed to create template.';
  } finally {
    creating.value = false;
  }
}

function openEditor(t: WorkflowTemplate) {
  router.push({ name: 'kb-workflow-template-editor', params: { templateId: t.id } });
}

const selectedIds   = ref<Set<number>>(new Set());
const bulkExporting = ref(false);

const someSelected = computed(() => selectedIds.value.size > 0);
const allSelected = computed(() =>
  templates.value.length > 0 && templates.value.every(t => selectedIds.value.has(t.id))
);

function toggleSelect(id: number, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const next = new Set(selectedIds.value);
  if (checked) next.add(id); else next.delete(id);
  selectedIds.value = next;
}

function toggleSelectAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const next = new Set(selectedIds.value);
  if (checked) templates.value.forEach(t => next.add(t.id));
  else         templates.value.forEach(t => next.delete(t.id));
  selectedIds.value = next;
}

function clearSelection() { selectedIds.value = new Set(); }

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const r = await workflowTemplatesApi.list({ page: page.value, size: pageSize });
    templates.value = r.items ?? [];
    totalPages.value = r.totalPages;
    total.value = r.total;
    selectedIds.value = new Set();
  } catch {
    err.value = 'Failed to load workflow templates.';
  } finally {
    loading.value = false;
  }
}

async function remove(e: Event, id: number) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete workflow template', message: 'Delete this workflow template?' });
  if (!ok) return;
  deleting.value = id;
  try {
    await workflowTemplatesApi.delete(id);
    templates.value = templates.value.filter((t) => t.id !== id);
    total.value = Math.max(0, total.value - 1);
  } catch {
    err.value = 'Failed to delete template.';
  } finally {
    deleting.value = null;
  }
}

async function exportOne(e: Event, t: WorkflowTemplate) {
  e.stopPropagation();
  exportingId.value = t.id;
  try {
    const blob = await workflowTemplatesApi.exportOne(t.id);
    triggerBlobDownload(blob, `workflow-template-${t.id}.json`);
  } catch {
    err.value = 'Failed to export template.';
  } finally {
    exportingId.value = null;
  }
}

async function bulkExport() {
  const ids = [...selectedIds.value];
  bulkExporting.value = true;
  err.value = null;
  try {
    const blob = await workflowTemplatesApi.exportZip(ids);
    triggerBlobDownload(blob, 'workflow-templates.zip');
  } catch {
    err.value = 'Failed to export templates.';
  } finally {
    bulkExporting.value = false;
  }
}

function onImported() { page.value = 0; load(); }

function openRename(t: WorkflowTemplate) {
  editTarget.value = t;
  showRename.value = true;
}

function onSaved(saved: WorkflowTemplate) {
  const idx = templates.value.findIndex((t) => t.id === saved.id);
  if (idx !== -1) templates.value[idx] = saved;
}

function nodeCount(t: WorkflowTemplate): number {
  try { return (JSON.parse(t.graphDefinition).nodes ?? []).length; }
  catch { return 0; }
}

function prevPage() { page.value--; load(); }
function nextPage() { page.value++; load(); }

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Workflow Templates</h2>
        <p class="ares-page-subtitle">
          Reusable trigger→condition→action graphs, each tagged to the scope level (platform/
          organization/project) it's meant to be instantiated at. Build one from scratch, or from
          "Save as template" in the workflow editor, then apply it via "New from template" on any
          workflow list.
        </p>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button icon="pi pi-upload" text severity="secondary" size="small" v-tooltip.top="'Import'" @click="showImport = true" />
        <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New template'" @click="openCreate" />
      </div>
    </div>

    <KbImportDialog v-model:visible="showImport" header="Import workflow templates"
      item-noun-singular="template" item-noun-plural="templates"
      :import-fn="workflowTemplatesApi.importFiles" @imported="onImported">
      Upload one or more <code>.json</code> files (one template each) or <code>.zip</code> files
      (a batch of templates, as produced by "Export selected").
    </KbImportDialog>

    <div v-if="err" class="ares-alert ares-alert--error" style="margin-bottom:0.75rem;">{{ err }}</div>

    <template v-if="loading">
      <AresLoadingState />
    </template>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table ares-table--clickable">
          <thead>
            <tr>
              <th style="width:36px;">
                <input type="checkbox" class="row-check" :checked="allSelected" @change="toggleSelectAll" />
              </th>
              <th>Name</th>
              <th style="width:110px;">Scope</th>
              <th style="width:90px;">Nodes</th>
              <th>Description</th>
              <th style="width:120px;">Updated</th>
              <th style="width:130px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id"
              :class="{ 'row--selected': selectedIds.has(t.id) }"
              @click="openEditor(t)">
              <td style="padding-right:0;" @click.stop>
                <input type="checkbox" class="row-check" :checked="selectedIds.has(t.id)" @change="toggleSelect(t.id, $event)" />
              </td>
              <td data-label="Name">{{ t.name }}</td>
              <td data-label="Scope">
                <AresBadge :value="SCOPE_BADGE[t.scopeKind].label" :severity="SCOPE_BADGE[t.scopeKind].severity" />
              </td>
              <td data-label="Nodes" style="color:var(--ares-text-muted); font-size:0.85rem;">{{ nodeCount(t) }}</td>
              <td data-label="Description" style="color:var(--ares-text-muted); font-size:0.85rem;">
                {{ t.description || '—' }}
              </td>
              <td data-label="Updated" style="color:var(--ares-text-muted); font-size:0.8rem; white-space:nowrap;">
                {{ new Date(t.updatedAt).toLocaleDateString() }}
              </td>
              <td data-actions @click.stop style="text-align:right; padding-right:0.5rem;">
                <div style="display:flex; gap:0.2rem; justify-content:flex-end;">
                  <Button icon="pi pi-pencil" text size="small" title="Rename / change scope"
                    @click="openRename(t)" />
                  <Button icon="pi pi-download" text size="small" title="Export"
                    :loading="exportingId === t.id" @click="exportOne($event, t)" />
                  <Button icon="pi pi-trash" text severity="danger" size="small"
                    :loading="deleting === t.id" @click="remove($event, t.id)" />
                </div>
              </td>
            </tr>
            <tr v-if="!templates.length">
              <td colspan="7" class="ares-table-empty">
                No workflow templates yet. Click "New template" or use "Save as template" from the workflow editor.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total"
        @prev="prevPage" @next="nextPage" />
    </template>

    <Transition name="bulk-bar">
      <div v-if="someSelected" class="tt-bulk-bar">
        <span class="tt-bulk-count">
          {{ selectedIds.size }} template{{ selectedIds.size !== 1 ? 's' : '' }} selected
        </span>
        <Button label="Clear" severity="secondary" size="small" text @click="clearSelection" />
        <Button label="Export selected" icon="pi pi-download" severity="secondary" size="small"
          :loading="bulkExporting" @click="bulkExport" />
      </div>
    </Transition>

    <WorkflowTemplateRenameDialog
      v-model:visible="showRename"
      :template="editTarget"
      @saved="onSaved"
    />

    <Dialog v-model:visible="showCreate" modal header="New workflow template" :style="{ width: 'min(480px, 95vw)' }">
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label class="ares-field-label">Name</label>
          <InputText v-model="createForm.name" style="width:100%;" autofocus />
        </div>
        <div>
          <label class="ares-field-label">Scope</label>
          <Select v-model="createForm.scopeKind" :options="SCOPE_OPTIONS" option-label="label" option-value="value" style="width:100%;" />
          <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0.35rem 0 0;">
            Which level this template is meant to be instantiated at — gates which node types the
            editor's palette offers (e.g. agent-task/sync nodes only make sense at project scope).
          </p>
        </div>
        <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0;">
          Starts with a single manual-trigger node — build the rest of the graph in the editor.
        </p>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showCreate = false" />
          <Button label="Create" size="small" :loading="creating" :disabled="!createForm.name.trim()" @click="createTemplate" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.row-check { cursor: pointer; accent-color: var(--p-primary-color); }
.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 8%, transparent); }

.tt-bulk-bar {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1.1rem;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  z-index: 50;
  white-space: nowrap;
}
.tt-bulk-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ares-text);
  margin-right: 0.25rem;
}
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }
</style>
