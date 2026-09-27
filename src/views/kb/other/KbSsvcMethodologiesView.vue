<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ssvcMethodologiesApi, type SsvcMethodology } from '@/api/ssvcMethodologies';
import Button from 'primevue/button';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { useAuthStore } from '@/stores/auth';
import KbImportDialog from '@/components/KbImportDialog.vue';

const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => auth.hasPermission('SSVC_WRITE'));
const methodologies = ref<SsvcMethodology[]>([]);
const loading = ref(true);
const err = ref<string | null>(null);
const deleting = ref<number | null>(null);
const exportingId = ref<number | null>(null);

const showImport = ref(false);

const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const newCode = ref('');
const newName = ref('');
const newDescription = ref('');

const selectedIds = ref<Set<number>>(new Set());
const bulkExporting = ref(false);

const allSelected = computed(() =>
  methodologies.value.length > 0 && methodologies.value.every((m) => selectedIds.value.has(m.id))
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
  if (checked) methodologies.value.forEach((m) => next.add(m.id));
  else         methodologies.value.forEach((m) => next.delete(m.id));
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
    methodologies.value = await ssvcMethodologiesApi.list();
    selectedIds.value = new Set();
  } catch {
    err.value = 'Failed to load SSVC methodologies.';
  } finally {
    loading.value = false;
  }
}

async function exportOne(e: Event, m: SsvcMethodology) {
  e.stopPropagation();
  exportingId.value = m.id;
  try {
    const blob = await ssvcMethodologiesApi.exportOne(m.id);
    triggerBlobDownload(blob, `ssvc-methodology-${m.id}.json`);
  } catch {
    err.value = 'Failed to export methodology.';
  } finally {
    exportingId.value = null;
  }
}

async function bulkExport() {
  const ids = [...selectedIds.value];
  bulkExporting.value = true;
  err.value = null;
  try {
    const blob = await ssvcMethodologiesApi.exportZip(ids);
    triggerBlobDownload(blob, 'ssvc-methodologies.zip');
  } catch {
    err.value = 'Failed to export methodologies.';
  } finally {
    bulkExporting.value = false;
  }
}

function openCreate() {
  newCode.value = '';
  newName.value = '';
  newDescription.value = '';
  createError.value = '';
  showCreate.value = true;
}

async function submitCreate() {
  if (!newCode.value.trim() || !newName.value.trim()) {
    createError.value = 'Code and name are required.';
    return;
  }
  creating.value = true;
  createError.value = '';
  try {
    const created = await ssvcMethodologiesApi.create({
      code: newCode.value.trim(), name: newName.value.trim(), description: newDescription.value.trim() || undefined,
    });
    showCreate.value = false;
    router.push({ name: 'kb-ssvc-methodology-detail', params: { id: created.id } });
  } catch (e: any) {
    createError.value = e?.response?.data?.detail ?? e.message ?? 'Failed to create methodology';
  } finally {
    creating.value = false;
  }
}

function onImported() { load(); }

async function remove(e: Event, m: SsvcMethodology) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete methodology', message: `Delete "${m.name}"?` });
  if (!ok) return;
  deleting.value = m.id;
  try {
    await ssvcMethodologiesApi.remove(m.id);
    methodologies.value = methodologies.value.filter((x) => x.id !== m.id);
  } catch {
    err.value = 'Failed to delete methodology — it may still have scores referencing it.';
  } finally {
    deleting.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">SSVC Methodologies</h2>
        <p class="ares-page-subtitle">Decision-tree methodologies for SSVC-style scoring.</p>
      </div>
      <div style="display:flex; gap:0.4rem;">
        <Button icon="pi pi-upload" text size="small" severity="secondary" v-tooltip.top="'Import'" @click="showImport = true" />
        <Button v-if="canWrite" icon="pi pi-plus" text size="small" v-tooltip.top="'New Methodology'" @click="openCreate" />
      </div>
    </div>

    <KbImportDialog v-model:visible="showImport" header="Import SSVC methodologies"
      item-noun-singular="methodology" item-noun-plural="methodologies"
      :import-fn="ssvcMethodologiesApi.importFiles" @imported="onImported">
      Upload one or more <code>.json</code> files (one methodology each) or <code>.zip</code> files
      (a batch of methodologies, as produced by "Export selected"). Imported methodologies are
      always created as new, editable custom methodologies.
    </KbImportDialog>

    <Dialog v-model:visible="showCreate" header="New SSVC methodology" modal :style="{ width: 'min(480px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <div>
          <label class="ares-field-label">Code</label>
          <InputText v-model="newCode" placeholder="e.g. my_methodology" style="width:100%;" />
        </div>
        <div>
          <label class="ares-field-label">Name</label>
          <InputText v-model="newName" placeholder="e.g. My Methodology" style="width:100%;" />
        </div>
        <div>
          <label class="ares-field-label">Description</label>
          <Textarea v-model="newDescription" rows="3" style="width:100%;" />
        </div>
        <div v-if="createError" class="ares-alert ares-alert--error">{{ createError }}</div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" size="small" @click="showCreate = false" />
        <Button label="Create" icon="pi pi-check" size="small" :loading="creating" @click="submitCreate" />
      </template>
    </Dialog>

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
              <th style="width:90px; text-align:center;">Roles</th>
              <th style="width:90px;">Type</th>
              <th style="width:72px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in methodologies" :key="m.id"
              :class="{ 'row--selected': selectedIds.has(m.id) }"
              @click="router.push({ name: 'kb-ssvc-methodology-detail', params: { id: m.id } })">
              <td style="padding-right:0;" @click.stop>
                <input type="checkbox" class="row-check" :checked="selectedIds.has(m.id)" @change="toggleSelect(m.id, $event)" />
              </td>
              <td>
                {{ m.name }}
                <div v-if="m.description" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.15rem;">{{ m.description }}</div>
              </td>
              <td style="text-align:center; color:var(--ares-text-muted);">{{ m.roles.length }}</td>
              <td>
                <span v-if="m.isSystem" class="ares-badge-system">System</span>
                <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">Custom</span>
              </td>
              <td @click.stop style="text-align:right; padding-right:0.5rem;">
                <div style="display:flex; gap:0.2rem; justify-content:flex-end;">
                  <Button icon="pi pi-download" text size="small" title="Export"
                    :loading="exportingId === m.id" @click="exportOne($event, m)" />
                  <Button v-if="!m.isSystem && canWrite" icon="pi pi-trash" text severity="danger" size="small"
                    :loading="deleting === m.id" @click="remove($event, m)" />
                </div>
              </td>
            </tr>
            <tr v-if="!methodologies.length">
              <td colspan="5" class="ares-table-empty">No methodologies yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── Bulk action bar ──────────────────────────────────────────── -->
    <Transition name="bulk-bar">
      <div v-if="someSelected" class="ssvc-bulk-bar">
        <span class="ssvc-bulk-count">
          {{ selectedIds.size }} methodolog{{ selectedIds.size !== 1 ? 'ies' : 'y' }} selected
        </span>
        <Button label="Clear" severity="secondary" size="small" text @click="clearSelection" />
        <Button label="Export selected" icon="pi pi-download" severity="secondary" size="small"
          :loading="bulkExporting" @click="bulkExport" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ares-badge-system {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 40%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.4rem;
}
.ares-field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.3rem;
}

.row-check { cursor: pointer; accent-color: var(--p-primary-color); }
.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 8%, transparent); }

/* ── Bulk action bar ─────────────────────────────── */
.ssvc-bulk-bar {
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
.ssvc-bulk-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ares-text);
  margin-right: 0.25rem;
}
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }
</style>
