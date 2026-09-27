<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import { assetsApi, ASSET_TYPE_ICONS, type Asset } from '@/api/assets';
import { dataFieldsFor, type DataFieldDef } from '@/api/asset-data-schemas';

const props = defineProps<{
  visible: boolean;
  source: Asset;
  target: Asset;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  merged: [surviving: Asset];
}>();

const toast  = useToast();
const saving = ref(false);

type Mode = 'source' | 'target' | 'merge' | 'custom';

interface MergeRow {
  key: string;
  label: string;
  editor: DataFieldDef['editor'];
  isList: boolean;
  options?: { label: string; value: string }[];
  validate?: (v: string) => string | null;
  sourceValue: string | string[];
  targetValue: string | string[];
  mode: Mode;
  value: string | string[];
  newItem: string;
  error: string | null;
}

const rows = ref<MergeRow[]>([]);

const FIRST_CLASS_KEYS = new Set(['identifier', 'hostnames', 'hostSubtype']);
const LIST_EDITORS = new Set(['chip-list', 'url-list', 'hostname-list']);

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function isEmptyVal(v: string | string[]): boolean {
  return Array.isArray(v) ? v.length === 0 : !v;
}

function fieldValue(key: string, asset: Asset, meta: Record<string, unknown>): string | string[] {
  if (key === 'identifier') return asset.identifier ?? '';
  if (key === 'hostnames') return asset.hostnames ?? [];
  if (key === 'hostSubtype') return asset.hostSubtype ?? '';
  const raw = meta[key];
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

/** Case-insensitive union, preserving target's order and appending source's new entries. */
function mergeLists(target: string[], source: string[]): string[] {
  const result = [...target];
  const seen = new Set(result.map((v) => v.toLowerCase()));
  for (const v of source) {
    if (!v) continue;
    const low = v.toLowerCase();
    if (!seen.has(low)) { seen.add(low); result.push(v); }
  }
  return result;
}

function buildRows(): MergeRow[] {
  const sourceMeta = parseMeta(props.source.metadata);
  const targetMeta = parseMeta(props.target.metadata);
  const combinedMeta = { ...sourceMeta, ...targetMeta };
  const isHost = props.target.type === 'host';

  const built: MergeRow[] = [];
  for (const def of dataFieldsFor(props.target.type, combinedMeta)) {
    if (def.editor === 'readonly') continue;

    const sourceValue = fieldValue(def.key, props.source, sourceMeta);
    const targetValue = fieldValue(def.key, props.target, targetMeta);
    const alwaysShow = def.key === 'identifier' || (isHost && FIRST_CLASS_KEYS.has(def.key));
    if (!alwaysShow && isEmptyVal(sourceValue) && isEmptyVal(targetValue)) continue;

    const isList = LIST_EDITORS.has(def.editor);
    let mode: Mode;
    let value: string | string[];
    if (isList) {
      mode = 'merge';
      value = mergeLists(targetValue as string[], sourceValue as string[]);
    } else {
      mode = isEmptyVal(targetValue) && !isEmptyVal(sourceValue) ? 'source' : 'target';
      value = mode === 'source' ? sourceValue : targetValue;
    }

    built.push({
      key: def.key, label: def.label, editor: def.editor, isList,
      options: def.options, validate: def.validate,
      sourceValue, targetValue, mode, value, newItem: '', error: null,
    });
  }
  return built;
}

watch(() => props.visible, (v) => { if (v) rows.value = buildRows(); });

function previewVal(v: string | string[]): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return v || '—';
}

function adoptSource(row: MergeRow) {
  row.mode = 'source';
  row.value = Array.isArray(row.sourceValue) ? [...row.sourceValue] : row.sourceValue;
  row.error = null;
}
function adoptTarget(row: MergeRow) {
  row.mode = 'target';
  row.value = Array.isArray(row.targetValue) ? [...row.targetValue] : row.targetValue;
  row.error = null;
}
function adoptMerge(row: MergeRow) {
  row.mode = 'merge';
  row.value = mergeLists(row.targetValue as string[], row.sourceValue as string[]);
  row.error = null;
}
function onCustomInput(row: MergeRow, v: string) {
  row.mode = 'custom';
  row.value = v;
}
function addListItem(row: MergeRow) {
  const v = row.newItem.trim();
  if (!v) return;
  if (row.validate) {
    const msg = row.validate(v);
    if (msg) { row.error = msg; return; }
  }
  const arr = Array.isArray(row.value) ? row.value : [];
  if (arr.includes(v)) { row.error = 'This value is already in the list.'; return; }
  row.mode = 'custom';
  row.value = [...arr, v];
  row.newItem = '';
  row.error = null;
}
function removeListItem(row: MergeRow, idx: number) {
  const arr = Array.isArray(row.value) ? [...row.value] : [];
  arr.splice(idx, 1);
  row.mode = 'custom';
  row.value = arr;
}

function validationError(): string | null {
  for (const row of rows.value) {
    if (row.mode !== 'custom' || row.isList || !row.validate) continue;
    const msg = row.validate(String(row.value ?? ''));
    if (msg) return `${row.label}: ${msg}`;
  }
  return null;
}

async function doMerge() {
  const err = validationError();
  if (err) {
    toast.add({ severity: 'error', summary: 'Invalid field', detail: err, life: 5000 });
    return;
  }
  saving.value = true;
  try {
    const fields = rows.value.map((row) => ({
      key: row.key,
      mode: row.mode,
      customValue: row.mode === 'custom' ? row.value : undefined,
    }));
    const result = await assetsApi.merge(props.source.id, { targetId: props.target.id, fields });
    toast.add({
      severity: 'success',
      summary: 'Assets merged',
      detail: `${props.source.code} merged into ${props.target.code}. Surviving asset: ${result.identifier}`,
      life: 5000,
    });
    emit('merged', result);
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Merge failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Merge assets"
    modal
    :style="{ width: 'min(980px, 96vw)' }"
    :pt="{ content: { style: 'padding: 0; overflow: hidden;' } }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="merge-dialog">

      <div class="merge-strip">
        <div class="merge-strip-side merge-strip-source">
          <span class="merge-strip-role">Source — will be deleted</span>
          <div class="merge-strip-main"><i :class="'pi ' + ASSET_TYPE_ICONS[source.type]" /><code>{{ source.code }}</code></div>
        </div>
        <i class="pi pi-arrow-right merge-strip-arrow" />
        <div class="merge-strip-side merge-strip-target">
          <span class="merge-strip-role">Target — will survive</span>
          <div class="merge-strip-main"><i :class="'pi ' + ASSET_TYPE_ICONS[target.type]" /><code>{{ target.code }}</code></div>
        </div>
      </div>

      <div class="merge-grid-wrap">
        <table class="merge-grid">
          <thead>
            <tr>
              <th class="merge-th-label"></th>
              <th>Source</th>
              <th>Target</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.key">
              <td class="merge-td-label">{{ row.label }}</td>

              <td>
                <button class="merge-cell merge-cell--pick" :class="{ 'merge-cell--active': row.mode === 'source' }" @click="adoptSource(row)">
                  {{ previewVal(row.sourceValue) }}
                </button>
              </td>

              <td>
                <button class="merge-cell merge-cell--pick" :class="{ 'merge-cell--active': row.mode === 'target' }" @click="adoptTarget(row)">
                  {{ previewVal(row.targetValue) }}
                </button>
              </td>

              <td class="merge-td-result">
                <button
                  v-if="row.isList"
                  class="merge-merge-btn"
                  :class="{ 'merge-cell--active': row.mode === 'merge' }"
                  @click="adoptMerge(row)"
                >
                  <i class="pi pi-sitemap" /> Merge ∪
                </button>

                <InputText
                  v-if="row.editor === 'text'"
                  :model-value="String(row.value)"
                  size="small"
                  class="merge-result-input"
                  @update:model-value="onCustomInput(row, $event ?? '')"
                />

                <select
                  v-else-if="row.editor === 'select'"
                  class="merge-result-select"
                  :value="row.value"
                  @change="onCustomInput(row, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="o in row.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>

                <div v-else class="merge-list-editor">
                  <div v-for="(item, idx) in (row.value as string[])" :key="idx" class="merge-list-item">
                    <code>{{ item }}</code>
                    <span v-if="idx === 0 && (row.editor === 'url-list' || row.editor === 'hostname-list')" class="merge-list-primary">Primary</span>
                    <Button icon="pi pi-times" text rounded size="small" severity="danger" @click="removeListItem(row, idx)" />
                  </div>
                  <div class="merge-list-add">
                    <InputText v-model="row.newItem" placeholder="Add…" size="small" @keyup.enter="addListItem(row)" />
                    <Button icon="pi pi-plus" text size="small" :disabled="!row.newItem.trim()" @click="addListItem(row)" />
                  </div>
                  <p v-if="row.error" class="merge-list-error">{{ row.error }}</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="merge-warning">
        <i class="pi pi-exclamation-triangle" style="color:#f59e0b;" />
        <div>
          All relationships, detections and finding affections linked to
          <strong>{{ source.code }}</strong> will be transferred to
          <strong>{{ target.code }}</strong>. Any metadata not shown above is merged
          automatically. <strong>{{ source.code }}</strong> will be permanently deleted.
        </div>
      </div>

      <div class="merge-footer">
        <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
        <Button label="Merge" icon="pi pi-arrows-h" size="small" :loading="saving" @click="doMerge" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.merge-dialog {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

/* ── Header strip ──────────────────────────────────────────────── */
.merge-strip {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--ares-border);
  flex-shrink: 0;
}
.merge-strip-side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--ares-radius);
}
.merge-strip-source { background: color-mix(in srgb, #ef4444 6%, transparent); }
.merge-strip-target { background: color-mix(in srgb, #22c55e 6%, transparent); }
.merge-strip-role {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
}
.merge-strip-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--ares-text-1);
}
.merge-strip-arrow { color: var(--ares-text-muted); flex-shrink: 0; }

/* ── Grid ──────────────────────────────────────────────────────── */
.merge-grid-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1.25rem;
}
.merge-grid {
  width: 100%;
  border-collapse: collapse;
}
.merge-grid thead th {
  position: sticky;
  top: 0;
  background: var(--ares-surface);
  text-align: left;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--ares-border);
}
.merge-grid tbody td {
  padding: 0.4rem 0.5rem;
  vertical-align: top;
  border-bottom: 1px solid var(--ares-border);
}
.merge-td-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-2);
  white-space: nowrap;
  padding-top: 0.6rem !important;
}
.merge-td-result { min-width: 240px; }

.merge-cell--pick {
  display: block;
  width: 100%;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.4rem 0.6rem;
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--ares-text-2);
  text-align: left;
  cursor: pointer;
  word-break: break-word;
  transition: border-color 0.12s, background 0.12s;
}
.merge-cell--pick:hover { border-color: var(--p-primary-400); }
.merge-cell--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 10%, transparent);
  color: var(--ares-text-1);
}

.merge-merge-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.25rem 0.55rem;
  font-size: 0.7rem;
  color: var(--ares-text-2);
  cursor: pointer;
  margin-bottom: 0.4rem;
}
.merge-merge-btn:hover { border-color: var(--p-primary-400); }

.merge-result-input { width: 100%; }
.merge-result-select {
  width: 100%;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.4rem 0.5rem;
  font-size: 0.82rem;
  color: var(--ares-text-1);
}

.merge-list-editor { display: flex; flex-direction: column; gap: 0.3rem; }
.merge-list-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
}
.merge-list-item code {
  flex: 1;
  padding: 0.2rem 0.5rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  word-break: break-all;
}
.merge-list-primary {
  font-size: 0.62rem;
  color: var(--ares-accent);
  flex-shrink: 0;
}
.merge-list-add { display: flex; align-items: center; gap: 0.3rem; }
.merge-list-error { margin: 0; font-size: 0.7rem; color: #ef4444; }

/* ── Warning + footer ──────────────────────────────────────────── */
.merge-warning {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  background: color-mix(in srgb, #f59e0b 8%, transparent);
  border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.65rem 0.9rem;
  font-size: 0.78rem;
  color: var(--ares-text-2);
  line-height: 1.5;
  margin: 0.75rem 1.25rem 0;
  flex-shrink: 0;
}
.merge-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem 1rem;
  flex-shrink: 0;
}
</style>
