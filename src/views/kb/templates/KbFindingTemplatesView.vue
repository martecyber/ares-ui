<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { findingTemplateApi, type FindingTemplate } from '@/api/kb';
import FindingTemplateFormDialog from '@/components/FindingTemplateFormDialog.vue';
import KbImportDialog from '@/components/KbImportDialog.vue';
import QueryBar from '@/components/QueryBar.vue';
import AppPagination from '@/components/AppPagination.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import Button from 'primevue/button';
import AresLoadingState from '@/components/AresLoadingState.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router    = useRouter();
const templates = ref<FindingTemplate[]>([]);
const loading   = ref(true);
const err       = ref<string | null>(null);

const page       = ref(0);
const totalPages = ref(0);
const total      = ref(0);
const pageSize   = 50;

const showCreate = ref(false);
const showImport = ref(false);
const deleting   = ref<number | null>(null);
const exportingId = ref<number | null>(null);

const selectedIds  = ref<Set<number>>(new Set());
const bulkDeleting = ref(false);
const bulkExporting = ref(false);
const searchState = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });

function onSearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  searchState.value = payload;
  page.value = 0;
  load();
}

const allSelected = computed(() =>
  templates.value.length > 0 && templates.value.every(t => selectedIds.value.has(t.id))
);
const someSelected = computed(() => selectedIds.value.size > 0);

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
    const r = await findingTemplateApi.list({
      page: page.value,
      size: pageSize,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
    });
    templates.value = r.items ?? [];
    totalPages.value = r.totalPages;
    total.value = r.total;
    selectedIds.value = new Set();
  } catch {
    err.value = 'Failed to load finding templates.';
  } finally {
    loading.value = false;
  }
}

async function remove(e: Event, id: number) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete template', message: 'Delete this template?' });
  if (!ok) return;
  deleting.value = id;
  try {
    await findingTemplateApi.delete(id);
    templates.value = templates.value.filter(t => t.id !== id);
    total.value = Math.max(0, total.value - 1);
  } catch {
    err.value = 'Failed to delete template.';
  } finally {
    deleting.value = null;
  }
}

async function bulkDelete() {
  const ids = [...selectedIds.value];
  const ok = await confirmDialog({ header: 'Delete templates', message: `Delete ${ids.length} template${ids.length !== 1 ? 's' : ''}? This cannot be undone.` });
  if (!ok) return;
  bulkDeleting.value = true;
  err.value = null;
  try {
    await findingTemplateApi.bulkDelete(ids);
    await load();
  } catch {
    err.value = 'Bulk delete failed.';
  } finally {
    bulkDeleting.value = false;
  }
}

async function exportOne(e: Event, t: FindingTemplate) {
  e.stopPropagation();
  exportingId.value = t.id;
  try {
    const blob = await findingTemplateApi.exportOne(t.id);
    triggerBlobDownload(blob, `finding-template-${t.id}.json`);
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
    const blob = await findingTemplateApi.exportZip(ids);
    triggerBlobDownload(blob, 'finding-templates.zip');
  } catch {
    err.value = 'Failed to export templates.';
  } finally {
    bulkExporting.value = false;
  }
}

function onCreated() { page.value = 0; load(); }
function onImported() { page.value = 0; load(); }
function prevPage()  { page.value--; load(); }
function nextPage()  { page.value++; load(); }

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Finding Templates</h2>
        <p class="ares-page-subtitle">Reusable templates for common vulnerability types.</p>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button icon="pi pi-upload" text severity="secondary" size="small" v-tooltip.top="'Import'" @click="showImport = true" />
        <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New Template'" @click="showCreate = true" />
      </div>
    </div>

    <FindingTemplateFormDialog v-model:visible="showCreate" @created="onCreated" />
    <KbImportDialog v-model:visible="showImport" header="Import finding templates"
      item-noun-singular="template" item-noun-plural="templates"
      :import-fn="findingTemplateApi.importFiles" @imported="onImported">
      Upload one or more <code>.json</code> files (one template each) or <code>.zip</code> files
      (a batch of templates, as produced by "Export selected").
    </KbImportDialog>

    <div style="margin-bottom:1rem;">
      <QueryBar entity="finding_template" placeholder="Search title…" @search="onSearch" />
    </div>

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
              <th>Title</th>
              <th style="width:120px;">Priority</th>
              <th style="width:110px;">Created</th>
              <th style="width:72px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id"
              :class="{ 'row--selected': selectedIds.has(t.id) }"
              @click="router.push({ name: 'kb-finding-template-detail', params: { id: t.id } })">
              <td style="padding-right:0;" @click.stop>
                <input type="checkbox" class="row-check" :checked="selectedIds.has(t.id)" @change="toggleSelect(t.id, $event)" />
              </td>
              <td>{{ t.title || '—' }}</td>
              <td><SeverityTag :level="t.severity" scale="priority" /></td>
              <td style="color:var(--ares-text-muted); font-size:0.8rem; white-space:nowrap;">
                {{ new Date(t.createdAt).toLocaleDateString() }}
              </td>
              <td @click.stop style="text-align:right; padding-right:0.5rem;">
                <div style="display:flex; gap:0.2rem; justify-content:flex-end;">
                  <Button icon="pi pi-download" text size="small" title="Export"
                    :loading="exportingId === t.id" @click="exportOne($event, t)" />
                  <Button icon="pi pi-trash" text severity="danger" size="small"
                    :loading="deleting === t.id" @click="remove($event, t.id)" />
                </div>
              </td>
            </tr>
            <tr v-if="!templates.length">
              <td colspan="5" class="ares-table-empty">No templates yet. Create one to get started.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total"
        @prev="prevPage" @next="nextPage" />
    </template>

    <!-- ── Bulk action bar ──────────────────────────────────────────── -->
    <Transition name="bulk-bar">
      <div v-if="someSelected" class="ft-bulk-bar">
        <span class="ft-bulk-count">
          {{ selectedIds.size }} template{{ selectedIds.size !== 1 ? 's' : '' }} selected
        </span>
        <Button label="Clear" severity="secondary" size="small" text @click="clearSelection" />
        <Button label="Export selected" icon="pi pi-download" severity="secondary" size="small"
          :loading="bulkExporting" @click="bulkExport" />
        <Button label="Delete selected" icon="pi pi-trash" severity="danger" size="small"
          :loading="bulkDeleting" @click="bulkDelete" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.row-check { cursor: pointer; accent-color: var(--p-primary-color); }
.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 8%, transparent); }

/* ── Bulk action bar ─────────────────────────────── */
.ft-bulk-bar {
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
.ft-bulk-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ares-text);
  margin-right: 0.25rem;
}
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }
</style>
