<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import AppPagination from '@/components/AppPagination.vue';
import KbImportDialog from '@/components/KbImportDialog.vue';
import { kbTestingGuidesApi, type TestingGuide } from '@/api/kb-testing-guides';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router = useRouter();

const guides     = ref<TestingGuide[]>([]);
const loading    = ref(true);
const err        = ref<string | null>(null);

const page       = ref(0);
const totalPages = ref(0);
const total      = ref(0);
const pageSize   = 50;

const deleting    = ref<number | null>(null);
const exportingId = ref<number | null>(null);
const showImport  = ref(false);

const selectedIds   = ref<Set<number>>(new Set());
const bulkExporting = ref(false);

const someSelected = computed(() => selectedIds.value.size > 0);
const allSelected = computed(() =>
  guides.value.length > 0 && guides.value.every(g => selectedIds.value.has(g.id))
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
  if (checked) guides.value.forEach(g => next.add(g.id));
  else         guides.value.forEach(g => next.delete(g.id));
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

// Create dialog
const showCreate = ref(false);
const saving     = ref(false);
const createErr  = ref('');
const form       = ref({ name: '', description: '' });

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const r = await kbTestingGuidesApi.list({ page: page.value, size: pageSize });
    guides.value = r.items ?? [];
    totalPages.value = r.totalPages;
    total.value = r.total;
    selectedIds.value = new Set();
  } catch {
    err.value = 'Failed to load testing guides.';
  } finally {
    loading.value = false;
  }
}

async function exportOne(e: Event, g: TestingGuide) {
  e.stopPropagation();
  exportingId.value = g.id;
  try {
    const blob = await kbTestingGuidesApi.exportOne(g.id);
    triggerBlobDownload(blob, `testing-guide-${g.id}.json`);
  } catch {
    err.value = 'Failed to export guide.';
  } finally {
    exportingId.value = null;
  }
}

async function bulkExport() {
  const ids = [...selectedIds.value];
  bulkExporting.value = true;
  err.value = null;
  try {
    const blob = await kbTestingGuidesApi.exportZip(ids);
    triggerBlobDownload(blob, 'testing-guides.zip');
  } catch {
    err.value = 'Failed to export guides.';
  } finally {
    bulkExporting.value = false;
  }
}

function onImported() { page.value = 0; load(); }

function openCreate() {
  form.value = { name: '', description: '' };
  createErr.value = '';
  showCreate.value = true;
}

async function create() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  createErr.value = '';
  try {
    const created = await kbTestingGuidesApi.create({
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
    });
    showCreate.value = false;
    router.push({ name: 'kb-testing-guide-detail', params: { id: created.id } });
  } catch (e: any) {
    createErr.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create guide';
  } finally {
    saving.value = false;
  }
}

async function remove(e: Event, id: number) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete testing guide', message: 'Delete this testing guide? Existing project checklists are kept.' });
  if (!ok) return;
  deleting.value = id;
  try {
    await kbTestingGuidesApi.delete(id);
    guides.value = guides.value.filter((g) => g.id !== id);
    total.value = Math.max(0, total.value - 1);
  } catch {
    err.value = 'Failed to delete guide.';
  } finally {
    deleting.value = null;
  }
}

function openDetail(g: TestingGuide) {
  router.push({ name: 'kb-testing-guide-detail', params: { id: g.id } });
}

function prevPage() { page.value--; load(); }
function nextPage() { page.value++; load(); }

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Testing Guides</h2>
        <p class="ares-page-subtitle">
          Reusable test checklists. Assign a guide to an assessment project to track coverage.
        </p>
      </div>
      <div style="display:flex; gap:0.4rem;">
        <Button icon="pi pi-upload" text size="small" severity="secondary" v-tooltip.top="'Import'" @click="showImport = true" />
        <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New guide'" @click="openCreate" />
      </div>
    </div>

    <KbImportDialog v-model:visible="showImport" header="Import testing guides"
      item-noun-singular="guide" item-noun-plural="guides"
      :import-fn="kbTestingGuidesApi.importFiles" @imported="onImported">
      Upload one or more <code>.json</code> files (one guide each) or <code>.zip</code> files
      (a batch of guides, as produced by "Export selected").
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
              <th style="width:80px; text-align:right;">Points</th>
              <th style="min-width:160px;">Description</th>
              <th style="width:120px;">Updated</th>
              <th style="width:94px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in guides" :key="g.id"
              :class="{ 'row--selected': selectedIds.has(g.id) }"
              @click="openDetail(g)">
              <td style="padding-right:0;" @click.stop>
                <input type="checkbox" class="row-check" :checked="selectedIds.has(g.id)" @change="toggleSelect(g.id, $event)" />
              </td>
              <td data-label="Name" style="font-weight:500;">{{ g.name }}</td>
              <td data-label="Points" style="text-align:right; font-variant-numeric:tabular-nums;">{{ g.pointCount }}</td>
              <td data-label="Description" style="color:var(--ares-text-muted); font-size:0.85rem; white-space:normal; word-break:break-word; max-width:340px;">
                {{ g.description || '—' }}
              </td>
              <td data-label="Updated" style="color:var(--ares-text-muted); font-size:0.8rem; white-space:nowrap;">
                {{ new Date(g.updatedAt).toLocaleDateString() }}
              </td>
              <td data-actions @click.stop style="text-align:right; padding-right:0.5rem;">
                <div style="display:flex; gap:0.2rem; justify-content:flex-end;">
                  <Button icon="pi pi-download" text size="small" title="Export"
                    :loading="exportingId === g.id" @click="exportOne($event, g)" />
                  <Button icon="pi pi-trash" text severity="danger" size="small"
                    :loading="deleting === g.id" @click="remove($event, g.id)" />
                </div>
              </td>
            </tr>
            <tr v-if="!guides.length">
              <td colspan="6" class="ares-table-empty">
                No testing guides yet. Click "New guide" to create one.
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
      <div v-if="someSelected" class="tg-bulk-bar">
        <span class="tg-bulk-count">
          {{ selectedIds.size }} guide{{ selectedIds.size !== 1 ? 's' : '' }} selected
        </span>
        <Button label="Clear" severity="secondary" size="small" text @click="clearSelection" />
        <Button label="Export selected" icon="pi pi-download" severity="secondary" size="small"
          :loading="bulkExporting" @click="bulkExport" />
      </div>
    </Transition>

    <Dialog v-model:visible="showCreate" header="New testing guide" modal :style="{ width: 'min(480px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.5rem;">
        <div class="form-field">
          <label>Name *</label>
          <InputText v-model="form.name" placeholder="e.g. OWASP Web Security Testing Guide" class="w-full" />
        </div>
        <div class="form-field">
          <label>Description</label>
          <Textarea v-model="form.description" rows="3" auto-resize class="w-full"
            placeholder="What this checklist covers…" />
        </div>
        <Message v-if="createErr" severity="error" :closable="false">{{ createErr }}</Message>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" @click="showCreate = false" />
          <Button label="Create" :loading="saving" :disabled="!form.name.trim()" @click="create" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.form-field { display: flex; flex-direction: column; gap: 0.35rem; }
.form-field label { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-muted); }

.row-check { cursor: pointer; accent-color: var(--p-primary-color); }
.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 8%, transparent); }

/* ── Bulk action bar ─────────────────────────────── */
.tg-bulk-bar {
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
.tg-bulk-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ares-text);
  margin-right: 0.25rem;
}
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }
</style>
