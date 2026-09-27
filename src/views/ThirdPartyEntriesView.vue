<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  kbThirdPartyApi, KB_TP_KINDS, KB_TP_CATEGORIES,
  type KbThirdPartyEntry, type KbThirdPartyEntryForm,
} from '@/api/third-party';
import { SCOPE_KIND_META } from '@/api/projects';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import AppPagination from '@/components/AppPagination.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import { useToast } from 'primevue/usetoast';
import { confirmDialog } from '@/composables/useConfirmDialog';

const toast = useToast();

const entries    = ref<KbThirdPartyEntry[]>([]);
const loading    = ref(false);
const err        = ref<string | null>(null);
const page       = ref(0);
const totalPages = ref(0);
const total      = ref(0);
const PAGE_SIZE  = 50;

// ── Filters (column-header multi-select, value is string[]) ────────────────
const filterKind     = ref<string[]>([]);
const filterCategory = ref<string[]>([]);
const filterEnabled  = ref<string[]>([]);

const sortCol = ref<string>('value');
const sortDir = ref<'asc' | 'desc' | null>('asc');
const searchQ = ref('');

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function resolvedEnabled(): boolean | undefined {
  if (filterEnabled.value.length === 1) return filterEnabled.value[0] === 'true';
  return undefined;
}

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const res = await kbThirdPartyApi.list({
      kind:     filterKind.value[0]     ?? undefined,
      category: filterCategory.value[0] ?? undefined,
      enabled:  resolvedEnabled(),
      q:        searchQ.value.trim()    || undefined,
      page:     page.value,
      size:     PAGE_SIZE,
      sortBy:   sortCol.value,
      sortDir:  sortDir.value?.toUpperCase() ?? 'ASC',
    });
    entries.value    = res.items;
    totalPages.value = res.totalPages;
    total.value      = res.total;
  } catch {
    err.value = 'Failed to load entries.';
  } finally {
    loading.value = false;
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 0; load(); }, 300);
}

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : 'value';
  sortDir.value = dir;
  page.value = 0;
  load();
}

function onFilterKind(vals: string[])     { filterKind.value = vals;     page.value = 0; load(); }
function onFilterCategory(vals: string[]) { filterCategory.value = vals; page.value = 0; load(); }
function onFilterEnabled(vals: string[])  { filterEnabled.value = vals;  page.value = 0; load(); }

// ── Type badge (reuse same style as ProjectScopeView) ──────────────────────
function kindTagStyle(kind: string) {
  const color = SCOPE_KIND_META[kind]?.color ?? '#4B5563';
  return {
    background: color, color: '#fff', border: 'none',
    borderRadius: '4px', padding: '0.15rem 0.5rem',
    fontSize: '0.73rem', fontWeight: '600',
    letterSpacing: '0.02em', whiteSpace: 'nowrap' as const,
    display: 'inline-block',
  };
}
function kindLabel(kind: string): string {
  return SCOPE_KIND_META[kind]?.label ?? kind.replace(/_/g, ' ');
}
// The badge/select styling relies on CSS `text-transform: capitalize`, which only
// capitalizes the first letter of each word — fine for "social_media" -> "Social
// media", but turns the "cdn" category into "Cdn" instead of the acronym "CDN".
// Special-case it here rather than fighting CSS text-transform per-word.
function categoryLabel(category: string): string {
  if (category === 'cdn') return 'CDN';
  return category.replace(/_/g, ' ');
}

// ── Filter option lists ────────────────────────────────────────────────────
const kindFilterOptions = KB_TP_KINDS.map(k => ({ label: kindLabel(k), value: k }));
const categoryFilterOptions = KB_TP_CATEGORIES.map(c => ({ label: categoryLabel(c), value: c }));
const enabledFilterOptions = [
  { label: 'Enabled',  value: 'true' },
  { label: 'Disabled', value: 'false' },
];

// ── Edit / Create dialog ───────────────────────────────────────────────────
const editing   = ref<KbThirdPartyEntry | null>(null);
const showForm  = ref(false);
const saving    = ref(false);
const formErr   = ref<string | null>(null);

const form = ref<KbThirdPartyEntryForm>({ kind: 'domain', value: '', category: 'other', notes: null });

const categoryOptions = KB_TP_CATEGORIES.map(c => ({ label: categoryLabel(c), value: c }));
const kindOptions     = KB_TP_KINDS.map(k => ({ label: kindLabel(k), value: k }));

function openCreate() {
  editing.value  = null;
  form.value     = { kind: 'domain', value: '', category: 'other', notes: null };
  formErr.value  = null;
  showForm.value = true;
}

function openEdit(entry: KbThirdPartyEntry) {
  editing.value  = entry;
  form.value     = { kind: entry.kind, value: entry.value, category: entry.category, notes: entry.notes };
  formErr.value  = null;
  showForm.value = true;
}

function cancelForm() { showForm.value = false; }

async function save() {
  if (!form.value.value.trim()) return;
  saving.value  = true;
  formErr.value = null;
  try {
    if (editing.value) {
      await kbThirdPartyApi.update(editing.value.id, form.value);
      toast.add({ severity: 'success', summary: 'Entry updated', life: 3000 });
    } else {
      // Each line in the textarea becomes its own entry, all sharing this
      // kind/category/notes — matches the bulk-value model used by Project Scope.
      const values = form.value.value.split('\n').map((v) => v.trim()).filter(Boolean);
      for (const value of values) {
        await kbThirdPartyApi.create({ ...form.value, value });
      }
      toast.add({
        severity: 'success',
        summary: values.length === 1 ? 'Entry created' : `${values.length} entries created`,
        life: 3000,
      });
    }
    showForm.value = false;
    page.value = 0;
    await load();
  } catch (e: any) {
    formErr.value = e?.response?.data?.message ?? e.message ?? 'Save failed.';
  } finally {
    saving.value = false;
  }
}

async function toggle(entry: KbThirdPartyEntry) {
  try {
    await kbThirdPartyApi.toggle(entry.id);
    entry.enabled = !entry.enabled;
  } catch {
    toast.add({ severity: 'error', summary: 'Failed to toggle entry', life: 3000 });
  }
}

async function remove(entry: KbThirdPartyEntry) {
  const ok = await confirmDialog({ header: 'Delete entry', message: `Delete "${entry.value}"?` });
  if (!ok) return;
  try {
    await kbThirdPartyApi.delete(entry.id);
    toast.add({ severity: 'success', summary: 'Entry deleted', life: 3000 });
    await load();
  } catch {
    toast.add({ severity: 'error', summary: 'Failed to delete entry', life: 3000 });
  }
}

const reclassifying = ref(false);

async function forceReclassify() {
  reclassifying.value = true;
  try {
    await kbThirdPartyApi.reclassify();
    toast.add({
      severity: 'success',
      summary: 'Reclassification job started',
      detail: 'Track progress in Jobs.',
      life: 4000,
    });
  } catch {
    toast.add({ severity: 'error', summary: 'Failed to start reclassification job', life: 3000 });
  } finally {
    reclassifying.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="tp-layout">
    <!-- Header -->
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Third-Party Entries</h2>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button icon="pi pi-sync" text size="small" severity="secondary"
          :loading="reclassifying" v-tooltip.top="'Force reclassify — re-check all assets against enabled KB entries now'"
          @click="forceReclassify" />
        <Button icon="pi pi-plus" text size="small" v-tooltip.top="'Add entry'" @click="openCreate" />
      </div>
    </div>

    <!-- Search + total (filters live in column headers) -->
    <div class="tp-topbar">
      <div class="wl-search-bar">
        <i class="pi pi-search" style="font-size:0.75rem; color:var(--ares-text-muted);" />
        <input v-model="searchQ" @input="onSearchInput"
          placeholder="Search value or notes…" class="wl-search-input" />
        <button v-if="searchQ" class="wl-search-clear"
          @click="searchQ = ''; page = 0; load()">
          <i class="pi pi-times" />
        </button>
      </div>
      <span class="tp-total">{{ total }} entries</span>
    </div>

    <div v-if="err" class="ares-alert ares-alert--error">{{ err }}</div>

    <!-- Table -->
    <div class="ares-table-wrap">
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:120px;">
              <ColumnHeader label="Type" :sortable="true"
                :filter-options="kindFilterOptions"
                :filter-value="filterKind"
                :sort-dir="sortCol === 'kind' ? sortDir : null"
                @update:sort-dir="onSort('kind', $event)"
                @update:filter-value="onFilterKind" />
            </th>
            <th>
              <ColumnHeader label="Value" :sortable="true"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                :sort-dir="sortCol === 'value' ? sortDir : null"
                @update:sort-dir="onSort('value', $event)" />
            </th>
            <th style="width:140px;">
              <ColumnHeader label="Category" :sortable="true"
                :filter-options="categoryFilterOptions"
                :filter-value="filterCategory"
                :sort-dir="sortCol === 'category' ? sortDir : null"
                @update:sort-dir="onSort('category', $event)"
                @update:filter-value="onFilterCategory" />
            </th>
            <th>Notes</th>
            <th style="width:90px; text-align:center;">
              <ColumnHeader label="Enabled"
                :filter-options="enabledFilterOptions"
                :filter-value="filterEnabled"
                @update:filter-value="onFilterEnabled" />
            </th>
            <th style="width:72px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="ares-table-empty">
              <i class="pi pi-spin pi-spinner" /> Loading…
            </td>
          </tr>
          <tr v-else-if="!entries.length">
            <td colspan="6" class="ares-table-empty">
              No entries yet. Click "Add entry" to create one.
            </td>
          </tr>
          <tr v-for="entry in entries" :key="entry.id" :class="{ 'row-disabled': !entry.enabled }">
            <td><span :style="kindTagStyle(entry.kind)">{{ kindLabel(entry.kind) }}</span></td>
            <td class="mono">{{ entry.value }}</td>
            <td><span class="cat-badge">{{ categoryLabel(entry.category) }}</span></td>
            <td class="notes-cell">{{ entry.notes ?? '—' }}</td>
            <td style="text-align:center;">
              <Button :icon="entry.enabled ? 'pi pi-check-circle' : 'pi pi-times-circle'"
                text size="small"
                :severity="entry.enabled ? 'success' : 'secondary'"
                :title="entry.enabled ? 'Disable' : 'Enable'"
                @click="toggle(entry)" />
            </td>
            <td>
              <div style="display:flex; gap:0.1rem; justify-content:flex-end;">
                <Button icon="pi pi-pencil" text size="small" title="Edit" @click="openEdit(entry)" />
                <Button icon="pi pi-trash" text size="small" severity="danger" title="Delete"
                  @click="remove(entry)" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppPagination :page="page" :total-pages="totalPages" :total="total"
      style="margin-top:0.75rem;"
      @prev="page--; load()" @next="page++; load()" />

    <!-- Create / Edit dialog -->
    <div v-if="showForm" class="wl-dialog-overlay" @click.self="cancelForm">
      <div class="wl-dialog" style="width:500px;">
        <div class="wl-dialog-header">
          <h3>{{ editing ? 'Edit entry' : 'Add entry' }}</h3>
          <button class="wl-dialog-close" @click="cancelForm"><i class="pi pi-times" /></button>
        </div>
        <div class="wl-dialog-body">
          <div v-if="formErr" class="ares-alert ares-alert--error">{{ formErr }}</div>

          <div class="ares-field-row">
            <label class="ares-field-label">Type <span style="color:var(--p-red-400);">*</span></label>
            <Select v-model="form.kind" :options="kindOptions"
              option-label="label" option-value="value" style="width:100%;" />
          </div>
          <div class="ares-field-row">
            <label class="ares-field-label">Value <span style="color:var(--p-red-400);">*</span></label>
            <InputText v-if="editing" v-model="form.value" placeholder="e.g. *.twitter.com" style="width:100%;"
              @keydown.enter="save" />
            <template v-else>
              <Textarea v-model="form.value" rows="3" auto-resize
                placeholder="e.g. *.twitter.com&#10;198.51.100.10" style="width:100%; max-height:12rem; overflow-y:auto;" />
              <p class="tp-hint">One value per line to create multiple entries with the same type, category, and notes.</p>
            </template>
          </div>
          <div class="ares-field-row">
            <label class="ares-field-label">Category</label>
            <Select v-model="form.category" :options="categoryOptions"
              option-label="label" option-value="value" style="width:100%;" />
          </div>
          <div class="ares-field-row">
            <label class="ares-field-label">Notes</label>
            <InputText v-model="form.notes" placeholder="Optional description" style="width:100%;" />
          </div>
        </div>
        <div class="wl-dialog-footer">
          <Button label="Cancel" severity="secondary" size="small" @click="cancelForm" />
          <Button :label="editing ? 'Save' : 'Create'" icon="pi pi-check" size="small"
            :loading="saving" :disabled="!form.value.trim()" @click="save" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tp-layout { display: flex; flex-direction: column; gap: 0.75rem; }

/* ── Top bar: search + total ─────────────────── */
.tp-topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.tp-total { font-size: 0.78rem; color: var(--ares-text-muted); }

/* ── Search bar ──────────────────────────────── */
.wl-search-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--ares-surface-2);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.3rem 0.6rem;
  flex: 1;
  transition: border-color 0.12s;
}
.wl-search-bar:focus-within { border-color: var(--p-primary-400); }
.wl-search-input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 0.82rem; color: var(--ares-text); font-family: inherit;
}
.wl-search-input::placeholder { color: var(--ares-text-muted); }
.wl-search-clear {
  background: none; border: none; color: var(--ares-text-muted);
  cursor: pointer; font-size: 0.7rem; padding: 0; line-height: 1;
}
.wl-search-clear:hover { color: var(--ares-text); }

/* ── Table cells ─────────────────────────────── */
.row-disabled { opacity: 0.45; }
.mono { font-family: monospace; font-size: 0.85rem; }
.notes-cell {
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  max-width: 250px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cat-badge {
  display: inline-block;
  padding: 0.15rem 0.4rem;
  border-radius: var(--ares-radius);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: capitalize;
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, transparent);
}

/* ── Dialog ──────────────────────────────────── */
.wl-dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.wl-dialog {
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); max-width: calc(100vw - 2rem);
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}
.wl-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem; border-bottom: 1px solid var(--ares-border);
}
.wl-dialog-header h3 { margin: 0; font-size: 0.95rem; font-weight: 600; }
.wl-dialog-close {
  background: none; border: none; color: var(--ares-text-muted);
  cursor: pointer; font-size: 1rem; padding: 0.2rem; border-radius: var(--ares-radius);
}
.wl-dialog-close:hover { color: var(--ares-text); background: var(--ares-surface-2); }
.wl-dialog-body { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
.wl-dialog-footer {
  padding: 0.75rem 1.25rem 1rem; display: flex;
  justify-content: flex-end; gap: 0.5rem;
  border-top: 1px solid var(--ares-border);
}
.ares-field-row { display: flex; flex-direction: column; gap: 0.3rem; }
.tp-hint {
  margin: 0.3rem 0 0;
  font-size: 0.72rem;
  color: var(--ares-text-muted);
}
</style>
