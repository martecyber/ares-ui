<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresLoadingState from '@/components/AresLoadingState.vue';
import InputText from 'primevue/inputtext';
import AresBadge from '@/components/AresBadge.vue';
import AppPagination from '@/components/AppPagination.vue';
import KbImportDialog from '@/components/KbImportDialog.vue';
import { kbTestingProceduresApi, type TestingProcedure } from '@/api/kb-testing-procedures';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router = useRouter();

const procedures   = ref<TestingProcedure[]>([]);
const loading      = ref(true);
const err          = ref<string | null>(null);

const q            = ref('');
const page         = ref(0);
const totalPages   = ref(0);
const total        = ref(0);
const pageSize     = 50;

const deleting      = ref<number | null>(null);
const bulkDeleting  = ref(false);
const creating      = ref(false);
const exportingId   = ref<number | null>(null);
const bulkExporting = ref(false);
const showImport    = ref(false);

// ── Multi-select ──────────────────────────────────────────────────────────────
const selected     = ref<Set<number>>(new Set());
const allChecked   = computed(() =>
  procedures.value.length > 0 && procedures.value.every(p => selected.value.has(p.id))
);

function toggleAll() {
  if (allChecked.value) {
    selected.value = new Set();
  } else {
    selected.value = new Set(procedures.value.map(p => p.id));
  }
}

function toggleOne(id: number) {
  const s = new Set(selected.value);
  s.has(id) ? s.delete(id) : s.add(id);
  selected.value = s;
}

const hasSelection = computed(() => selected.value.size > 0);

// ── Load ──────────────────────────────────────────────────────────────────────
let debounce: ReturnType<typeof setTimeout> | null = null;

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const r = await kbTestingProceduresApi.list({ q: q.value.trim() || undefined, page: page.value, size: pageSize });
    procedures.value = r.items ?? [];
    totalPages.value = r.totalPages;
    total.value = r.total;
    // Clear selection of items no longer on this page
    selected.value = new Set([...selected.value].filter(id => procedures.value.some(p => p.id === id)));
  } catch {
    err.value = 'Failed to load testing procedures.';
  } finally {
    loading.value = false;
  }
}

watch(q, () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => { page.value = 0; load(); }, 300);
});

// ── Export / import ──────────────────────────────────────────────────────────
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function exportOne(p: TestingProcedure, e: Event) {
  e.stopPropagation();
  exportingId.value = p.id;
  try {
    const blob = await kbTestingProceduresApi.exportOne(p.id);
    triggerBlobDownload(blob, `testing-procedure-${p.id}.json`);
  } catch {
    err.value = 'Failed to export procedure.';
  } finally {
    exportingId.value = null;
  }
}

async function exportSelected() {
  const ids = [...selected.value];
  bulkExporting.value = true;
  try {
    const blob = await kbTestingProceduresApi.exportZip(ids);
    triggerBlobDownload(blob, 'testing-procedures.zip');
  } catch {
    err.value = 'Failed to export procedures.';
  } finally {
    bulkExporting.value = false;
  }
}

function onImported() { page.value = 0; load(); }

// ── Delete ────────────────────────────────────────────────────────────────────
async function remove(e: Event, id: number) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete procedure', message: 'Delete this procedure?' });
  if (!ok) return;
  deleting.value = id;
  try {
    await kbTestingProceduresApi.delete(id);
    procedures.value = procedures.value.filter(p => p.id !== id);
    total.value = Math.max(0, total.value - 1);
    selected.value = new Set([...selected.value].filter(x => x !== id));
  } catch { err.value = 'Failed to delete.'; }
  finally { deleting.value = null; }
}

async function deleteSelected() {
  const ok = await confirmDialog({ header: 'Delete procedures', message: `Delete ${selected.value.size} procedure(s)?` });
  if (!ok) return;
  bulkDeleting.value = true;
  try {
    await kbTestingProceduresApi.deleteBatch([...selected.value]);
    const deleted = selected.value;
    procedures.value = procedures.value.filter(p => !deleted.has(p.id));
    total.value = Math.max(0, total.value - deleted.size);
    selected.value = new Set();
  } catch { err.value = 'Failed to delete selected.'; }
  finally { bulkDeleting.value = false; }
}

// ── Create ────────────────────────────────────────────────────────────────────
async function createNew() {
  creating.value = true;
  try {
    const created = await kbTestingProceduresApi.create({ title: 'Untitled procedure' });
    router.push({ name: 'kb-testing-procedure-detail', params: { id: created.id } });
  } catch { err.value = 'Failed to create procedure.'; }
  finally { creating.value = false; }
}

function prevPage() { page.value--; load(); }
function nextPage() { page.value++; load(); }

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Testing Procedures</h2>
        <p class="ares-page-subtitle">
          How-to articles for security tests. Link them to testing-guide points and external databases.
        </p>
      </div>
      <div style="display:flex; gap:0.4rem;">
        <Button icon="pi pi-upload" text size="small" severity="secondary" v-tooltip.top="'Import'" @click="showImport = true" />
        <Button icon="pi pi-plus" text size="small" :loading="creating" v-tooltip.top="'New procedure'" @click="createNew" />
      </div>
    </div>

    <KbImportDialog v-model:visible="showImport" header="Import testing procedures"
      item-noun-singular="procedure" item-noun-plural="procedures"
      :import-fn="kbTestingProceduresApi.importFiles" @imported="onImported">
      Upload one or more <code>.json</code> files (one procedure each) or <code>.zip</code> files
      (a batch of procedures, as produced by "Export selected").
    </KbImportDialog>

    <!-- Search + bulk actions -->
    <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.85rem; flex-wrap:wrap;">
      <InputText v-model="q" placeholder="Search procedures…" style="max-width:300px; flex:1;" />
      <template v-if="hasSelection">
        <Button icon="pi pi-download" :label="`Export (${selected.size})`" size="small" severity="secondary"
          :loading="bulkExporting" @click="exportSelected" />
        <Button icon="pi pi-trash" :label="`Delete (${selected.size})`" size="small" severity="danger"
          :loading="bulkDeleting" @click="deleteSelected" />
      </template>
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
              <th class="check-cell">
                <input type="checkbox" class="row-check" :checked="allChecked" @change="toggleAll" />
              </th>
              <th>Title</th>
              <th style="min-width:160px;">Tags</th>
              <th style="width:120px;">Updated</th>
              <th style="width:90px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in procedures" :key="p.id"
              :class="{ 'row--selected': selected.has(p.id) }"
              @click="router.push({ name: 'kb-testing-procedure-detail', params: { id: p.id } })">
              <td class="check-cell" @click.stop>
                <input type="checkbox" class="row-check" :checked="selected.has(p.id)"
                  @change="toggleOne(p.id)" />
              </td>
              <td data-label="Title" style="font-weight:500;">{{ p.title }}</td>
              <td data-label="Tags">
                <div style="display:flex; flex-wrap:wrap; gap:0.25rem;">
                  <AresBadge v-for="t in (p.tags ?? [])" :key="t" :value="t" severity="secondary"
                    style="font-size:0.68rem;" />
                  <span v-if="!p.tags?.length" style="color:var(--ares-text-muted); font-size:0.8rem;">—</span>
                </div>
              </td>
              <td data-label="Updated" style="color:var(--ares-text-muted); font-size:0.8rem; white-space:nowrap;">
                {{ new Date(p.updatedAt).toLocaleDateString() }}
              </td>
              <td data-actions @click.stop style="text-align:right; white-space:nowrap; padding-right:0.5rem;">
                <Button icon="pi pi-download" text size="small" severity="secondary" title="Export"
                  :loading="exportingId === p.id" @click="exportOne(p, $event)" />
                <Button icon="pi pi-trash" text severity="danger" size="small"
                  :loading="deleting === p.id" @click="remove($event, p.id)" />
              </td>
            </tr>
            <tr v-if="!procedures.length">
              <td colspan="5" class="ares-table-empty">
                No testing procedures yet. Click "New procedure" to create one.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total"
        @prev="prevPage" @next="nextPage" />
    </template>
  </div>
</template>

<style scoped>
.check-cell {
  width: 40px !important;
  padding: 0 0.5rem !important;
  text-align: center;
}
.row-check {
  accent-color: var(--p-primary-400);
  cursor: pointer;
  width: 15px;
  height: 15px;
}
tr.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 9%, transparent) !important; }
</style>
