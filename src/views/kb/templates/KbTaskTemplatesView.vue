<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Button from 'primevue/button';
import AresLoadingState from '@/components/AresLoadingState.vue';
import { agentTaskTemplatesApi, type AgentTaskTemplate } from '@/api/agent-task-templates';
import AppPagination from '@/components/AppPagination.vue';
import TaskTemplateFormDialog from '@/components/TaskTemplateFormDialog.vue';
import KbImportDialog from '@/components/KbImportDialog.vue';
import { toolIconSrc } from '@/utils/tool-icons';
import { confirmDialog } from '@/composables/useConfirmDialog';

const templates = ref<AgentTaskTemplate[]>([]);
const loading   = ref(true);
const err       = ref<string | null>(null);

const page       = ref(0);
const totalPages = ref(0);
const total      = ref(0);
const pageSize   = 50;

const deleting   = ref<number | null>(null);
const exportingId = ref<number | null>(null);

// Full-editor dialog: null = create mode, otherwise the template being edited.
const showDialog  = ref(false);
const editTarget  = ref<AgentTaskTemplate | null>(null);
const showImport  = ref(false);

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
    const r = await agentTaskTemplatesApi.list({ page: page.value, size: pageSize });
    templates.value = r.items ?? [];
    totalPages.value = r.totalPages;
    total.value = r.total;
    selectedIds.value = new Set();
  } catch {
    err.value = 'Failed to load task templates.';
  } finally {
    loading.value = false;
  }
}

async function remove(e: Event, id: number) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete task template', message: 'Delete this task template?' });
  if (!ok) return;
  deleting.value = id;
  try {
    await agentTaskTemplatesApi.delete(id);
    templates.value = templates.value.filter((t) => t.id !== id);
    total.value = Math.max(0, total.value - 1);
  } catch {
    err.value = 'Failed to delete template.';
  } finally {
    deleting.value = null;
  }
}

async function exportOne(e: Event, t: AgentTaskTemplate) {
  e.stopPropagation();
  exportingId.value = t.id;
  try {
    const blob = await agentTaskTemplatesApi.exportOne(t.id);
    triggerBlobDownload(blob, `agent-task-template-${t.id}.json`);
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
    const blob = await agentTaskTemplatesApi.exportZip(ids);
    triggerBlobDownload(blob, 'agent-task-templates.zip');
  } catch {
    err.value = 'Failed to export templates.';
  } finally {
    bulkExporting.value = false;
  }
}

function onImported() { page.value = 0; load(); }

function openCreate() {
  editTarget.value = null;
  showDialog.value = true;
}

function openEdit(t: AgentTaskTemplate) {
  editTarget.value = t;
  showDialog.value = true;
}

function onSaved(saved: AgentTaskTemplate) {
  // Splice updated row, or prepend new one. Avoids a full reload.
  const idx = templates.value.findIndex((t) => t.id === saved.id);
  if (idx === -1) {
    templates.value = [saved, ...templates.value];
    total.value += 1;
  } else {
    templates.value[idx] = saved;
  }
}

function prevPage() { page.value--; load(); }
function nextPage() { page.value++; load(); }

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Task Templates</h2>
        <p class="ares-page-subtitle">
          Reusable agent-task configurations. Apply from any project's task creation dialog,
          or build new ones here from scratch.
        </p>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button icon="pi pi-upload" text severity="secondary" size="small" v-tooltip.top="'Import'" @click="showImport = true" />
        <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New template'" @click="openCreate" />
      </div>
    </div>

    <KbImportDialog v-model:visible="showImport" header="Import task templates"
      item-noun-singular="template" item-noun-plural="templates"
      :import-fn="agentTaskTemplatesApi.importFiles" @imported="onImported">
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
              <th style="width:110px;">Tool</th>
              <th>Description</th>
              <th style="width:120px;">Updated</th>
              <th style="width:104px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id"
              :class="{ 'row--selected': selectedIds.has(t.id) }"
              @click="openEdit(t)">
              <td style="padding-right:0;" @click.stop>
                <input type="checkbox" class="row-check" :checked="selectedIds.has(t.id)" @change="toggleSelect(t.id, $event)" />
              </td>
              <td data-label="Name">{{ t.name }}</td>
              <td data-label="Tool">
                <img v-if="toolIconSrc(t.tool)" :src="toolIconSrc(t.tool)"
                     :title="t.tool"
                     style="width:22px; height:22px; object-fit:contain; display:block;" />
                <i v-else class="pi pi-wrench" style="font-size:1.1rem; color:var(--ares-text-muted);" />
              </td>
              <td data-label="Description" style="color:var(--ares-text-muted); font-size:0.85rem;">
                {{ t.description || '—' }}
              </td>
              <td data-label="Updated" style="color:var(--ares-text-muted); font-size:0.8rem; white-space:nowrap;">
                {{ new Date(t.updatedAt).toLocaleDateString() }}
              </td>
              <td data-actions @click.stop style="text-align:right; padding-right:0.5rem;">
                <div style="display:flex; gap:0.2rem; justify-content:flex-end;">
                  <Button icon="pi pi-download" text size="small" title="Export"
                    :loading="exportingId === t.id" @click="exportOne($event, t)" />
                  <Button icon="pi pi-trash" text severity="danger" size="small"
                    :loading="deleting === t.id" @click="remove($event, t.id)" />
                </div>
              </td>
            </tr>
            <tr v-if="!templates.length">
              <td colspan="6" class="ares-table-empty">
                No task templates yet. Click "New template" or use "Save as template" from the agent-task dialog.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total"
        @prev="prevPage" @next="nextPage" />
    </template>

    <!-- ── Bulk action bar ──────────────────────────────────────────── -->
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

    <TaskTemplateFormDialog
      v-model:visible="showDialog"
      :template="editTarget"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.row-check { cursor: pointer; accent-color: var(--p-primary-color); }
.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 8%, transparent); }

/* ── Bulk action bar ─────────────────────────────── */
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
