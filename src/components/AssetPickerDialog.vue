<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import AssetGraph from '@/components/AssetGraph.vue';
import { assetsApi, ASSET_TYPES, ASSET_TYPE_LABELS, type Asset, type AssetRelationship } from '@/api/assets';

const props = defineProps<{
  visible: boolean;
  modelValue: number[];
  assets: Asset[];
  title?: string;
  /**
   * When set, shows a List/Graph toggle. Graph mode renders a hop-limited
   * neighborhood centered on `centerAssetId` so the user can pick assets by
   * navigating the relationship graph instead of searching a flat list.
   * Selectable nodes are still restricted to `assets` (the type-filtered set);
   * other nodes render for context but aren't pickable.
   */
  graphConfig?: { orgId: number; centerAssetId: number; centerLabel?: string } | null;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  'update:modelValue': [ids: number[]];
}>();

const search = ref('');
const typeFilter = ref<string | null>(null);
const selected = ref<number[]>([]);

const mode = ref<'list' | 'graph'>('list');
const hops = ref(4);
const MIN_HOPS = 1;
const MAX_HOPS = 8;
const neighborhood = ref<{ assets: Asset[]; relationships: AssetRelationship[] }>({ assets: [], relationships: [] });
const loadingNeighborhood = ref(false);
const selectableIds = computed(() => new Set(props.assets.map((a) => a.id)));

async function loadNeighborhood() {
  if (!props.graphConfig) return;
  loadingNeighborhood.value = true;
  try {
    neighborhood.value = await assetsApi.neighborhood(
      props.graphConfig.orgId, props.graphConfig.centerAssetId, hops.value,
    );
  } catch {
    neighborhood.value = { assets: [], relationships: [] };
  } finally {
    loadingNeighborhood.value = false;
  }
}

function setMode(m: 'list' | 'graph') {
  mode.value = m;
  if (m === 'graph' && !neighborhood.value.assets.length) loadNeighborhood();
}

function adjustHops(delta: number) {
  const next = Math.min(MAX_HOPS, Math.max(MIN_HOPS, hops.value + delta));
  if (next === hops.value) return;
  hops.value = next;
  loadNeighborhood();
}

function onGraphNodeClick(asset: Asset) {
  if (!selectableIds.value.has(asset.id)) return; // not in the allowed-type set — context only
  if (props.graphConfig && asset.id === props.graphConfig.centerAssetId) return; // can't select the center itself
  toggle(asset.id);
}

watch(() => props.visible, (open) => {
  if (open) {
    selected.value = [...props.modelValue];
    search.value = '';
    typeFilter.value = null;
    mode.value = 'list';
    hops.value = 4;
    neighborhood.value = { assets: [], relationships: [] };
  }
});

// Always show the full type catalog as filter pills (not just types present in
// `assets`) so the picker stays visually consistent across different contexts —
// picking an unfilled type just shows "No assets match" rather than hiding the option.
const availableTypes = computed<readonly string[]>(() => ASSET_TYPES);

const filtered = computed(() => {
  let list = props.assets;
  if (typeFilter.value) list = list.filter((a) => a.type === typeFilter.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter((a) => a.identifier.toLowerCase().includes(q) || (a.code ?? '').toLowerCase().includes(q));
  }
  return list;
});

function isSelected(id: number) { return selected.value.includes(id); }

function toggle(id: number) {
  if (isSelected(id)) selected.value = selected.value.filter((x) => x !== id);
  else selected.value = [...selected.value, id];
}

function assetLabel(id: number): string {
  const a = props.assets.find((x) => x.id === id);
  return a ? `${ASSET_TYPE_LABELS[a.type] ?? a.type} — ${a.identifier}` : String(id);
}

function apply() {
  emit('update:modelValue', [...selected.value]);
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title ?? 'Select assets'"
    modal
    :style="{ width: (graphConfig && mode === 'graph') ? 'min(960px, 96vw)' : 'min(580px, 96vw)', maxHeight: '90vh' }"
    :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem; display:flex; flex-direction:column; gap:0.75rem;' } }"
    @update:visible="$emit('update:visible', $event)"
  >
    <!-- Selected chips -->
    <div v-if="selected.length" class="chips-bar">
      <span class="chips-label">Selected</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem; flex:1;">
        <div v-for="id in selected" :key="id" class="asset-chip">
          <span>{{ assetLabel(id) }}</span>
          <button type="button" class="chip-x" @click="toggle(id)">×</button>
        </div>
      </div>
    </div>

    <!-- List/Graph mode toggle -->
    <div v-if="graphConfig" style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
      <div class="mode-toggle">
        <button type="button" :class="['mode-toggle-btn', { 'mode-toggle-btn--active': mode === 'list' }]" @click="setMode('list')">List</button>
        <button type="button" :class="['mode-toggle-btn', { 'mode-toggle-btn--active': mode === 'graph' }]" @click="setMode('graph')">Graph</button>
      </div>
      <div v-if="mode === 'graph'" class="hop-stepper">
        <span class="hop-stepper-label">Hops</span>
        <button type="button" class="hop-stepper-btn" :disabled="hops <= MIN_HOPS" @click="adjustHops(-1)">
          <i class="pi pi-minus" style="font-size:0.62rem;" />
        </button>
        <span class="hop-stepper-value">{{ hops }}</span>
        <button type="button" class="hop-stepper-btn" :disabled="hops >= MAX_HOPS" @click="adjustHops(1)">
          <i class="pi pi-plus" style="font-size:0.62rem;" />
        </button>
      </div>
    </div>

    <!-- ── List mode ─────────────────────────────────────────────────── -->
    <template v-if="mode === 'list'">
      <!-- Search -->
      <InputText v-model="search" placeholder="Search by identifier or code…" style="width:100%;" />

      <!-- Type filter pills -->
      <div v-if="availableTypes.length > 1" class="type-pills">
        <button
          type="button"
          :class="['type-pill', { 'type-pill--active': !typeFilter }]"
          @click="typeFilter = null"
        >All</button>
        <button
          v-for="t in availableTypes"
          :key="t"
          type="button"
          :class="['type-pill', { 'type-pill--active': typeFilter === t }]"
          @click="typeFilter = typeFilter === t ? null : t"
        >{{ ASSET_TYPE_LABELS[t] ?? t }}</button>
      </div>

      <!-- Asset list -->
      <div class="asset-list">
        <div v-if="!filtered.length" class="list-empty">No assets match.</div>
        <div
          v-for="a in filtered"
          :key="a.id"
          class="asset-row"
          :class="{ 'asset-row--selected': isSelected(a.id) }"
          @click="toggle(a.id)"
        >
          <div class="asset-row-body">
            <span class="asset-row-ident">{{ a.identifier }}</span>
            <span class="asset-row-type">{{ ASSET_TYPE_LABELS[a.type] ?? a.type }}</span>
            <code v-if="a.code" class="asset-row-code">{{ a.code }}</code>
          </div>
          <i v-if="isSelected(a.id)" class="pi pi-check asset-row-check" />
        </div>
      </div>
    </template>

    <!-- ── Graph mode ────────────────────────────────────────────────── -->
    <template v-else>
      <p class="empty-hint" style="margin:0;">
        Showing assets within {{ hops }} hop{{ hops > 1 ? 's' : '' }} of
        <strong>{{ graphConfig?.centerLabel ?? 'the focus asset' }}</strong>.
        Click a highlighted asset to select it.
      </p>
      <div v-if="loadingNeighborhood" class="list-empty" style="border:1px solid var(--ares-border); border-radius: var(--ares-radius);">
        Loading neighborhood…
      </div>
      <AssetGraph
        v-else
        :assets="neighborhood.assets"
        :relationships="neighborhood.relationships"
        :org-id="graphConfig!.orgId"
        :focus-asset-id="graphConfig!.centerAssetId"
        :selected-ids="selected"
        height="58vh"
        @node-click="onGraphNodeClick"
      />
    </template>

    <!-- Footer -->
    <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.75rem; border-top:1px solid var(--ares-border);">
      <Button type="button" label="Cancel" severity="secondary" size="small" @click="$emit('update:visible', false)" />
      <Button
        type="button"
        icon="pi pi-check"
        :label="selected.length ? 'Apply (' + selected.length + ')' : 'Apply'"
        size="small"
        @click="apply"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.chips-bar {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.1));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.5rem 0.75rem;
}
.chips-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  padding-top: 0.2rem;
  white-space: nowrap;
}
.asset-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.18rem 0.5rem;
  font-size: 0.77rem;
  color: var(--ares-text-2);
}
.chip-x {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); font-size: 1rem; line-height: 1; padding: 0;
}
.chip-x:hover { color: #ef4444; }

.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-muted);
  cursor: pointer;
  transition: border-color 0.1s, color 0.1s, background 0.1s;
}
.type-pill:hover { border-color: var(--p-primary-400); color: var(--p-primary-400); }
.type-pill--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 14%, transparent);
  color: var(--p-primary-300);
  font-weight: 700;
}

.asset-list {
  flex: 1;
  min-height: 160px;
  max-height: 340px;
  overflow-y: auto;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
}
.list-empty {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.82rem;
  color: var(--ares-text-muted);
}
.asset-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid var(--ares-border);
  cursor: pointer;
  transition: background 0.1s;
}
.asset-row:last-child { border-bottom: none; }
.asset-row:hover { background: color-mix(in srgb, var(--p-primary-500) 5%, transparent); }
.asset-row--selected { background: color-mix(in srgb, var(--p-primary-500) 8%, transparent); }

.asset-row-body { display: flex; align-items: baseline; gap: 0.5rem; flex: 1; min-width: 0; }
.asset-row-ident { font-size: 0.85rem; font-weight: 600; color: var(--ares-text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-row-type { font-size: 0.72rem; color: var(--ares-text-muted); flex-shrink: 0; }
.asset-row-code { font-size: 0.68rem; color: var(--ares-accent); font-family: monospace; flex-shrink: 0; }
.asset-row-check { font-size: 0.8rem; color: var(--p-primary-400); flex-shrink: 0; }

.empty-hint { font-size: 0.8rem; color: var(--ares-text-muted); }
.list-empty { padding: 1.25rem; text-align: center; font-size: 0.82rem; color: var(--ares-text-muted); }

.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
}
.mode-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 0.25rem 0.7rem;
  border: none;
  background: var(--ares-surface-raised);
  color: var(--ares-text-muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.mode-toggle-btn--active {
  background: color-mix(in srgb, var(--p-primary-500) 18%, transparent);
  color: var(--p-primary-300);
}

.hop-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--ares-text-muted);
}
.hop-stepper-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.65rem; }
.hop-stepper-btn {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-2);
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}
.hop-stepper-btn:hover:not(:disabled) { border-color: var(--p-primary-400); color: var(--p-primary-400); }
.hop-stepper-btn:disabled { opacity: 0.35; cursor: default; }
.hop-stepper-value { font-family: monospace; font-weight: 700; color: var(--ares-text-1); min-width: 1.1em; text-align: center; }
</style>
