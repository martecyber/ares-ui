<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ToggleSwitch from 'primevue/toggleswitch';
import AppPagination from '@/components/AppPagination.vue';
import AssetGraph from '@/components/AssetGraph.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import MergeAssetDialog from '@/components/MergeAssetDialog.vue';
import TagChipList from '@/components/TagChipList.vue';
import TagManagerDialog from '@/components/TagManagerDialog.vue';
import QueryBar from '@/components/QueryBar.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import {
  assetsApi,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ICONS,
  HOST_SUBTYPES,
  HOST_SUBTYPE_LABELS,
  INTERFACE_TYPES,
  INTERFACE_TYPE_LABELS,
  type Asset,
  type AssetOrphanInfo,
  type AssetRelationship,
  type ServiceVisibilityState,
  type ServiceHostInfo,
} from '@/api/assets';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';

const route  = useRoute();
const router = useRouter();
const context = useContextStore();
const auth = useAuthStore();

const orgId = computed(() => Number(route.params.orgId));

// ── View mode ──────────────────────────────────────────────────────────────
type ViewMode = 'list' | 'graph';
const viewMode = ref<ViewMode>('list');

// ── Filters ────────────────────────────────────────────────────────────────
const typeFilter   = ref<string | null>(null);
const searchState  = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });

function setType(t: string | null) {
  typeFilter.value = t;
  page.value = 0;
  if (viewMode.value === 'list') loadList();
}

function onSearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  searchState.value = payload;
  page.value = 0;
  loadList();
}

// ── List state ─────────────────────────────────────────────────────────────
const PAGE_SIZE  = 50;
const items      = ref<Asset[]>([]);
const loading    = ref(false);
const page       = ref(0);
const totalPages = ref(0);
const total      = ref(0);

// Per-type counts (for filter pills)
const typeCounts = ref<Record<string, number>>({});

// Service-only data (aggregate visibility + owning host) — fetched per page when services appear.
const aggregateVisibility = ref<Record<number, ServiceVisibilityState>>({});
const serviceHosts        = ref<Record<number, ServiceHostInfo>>({});
const isServiceFilter     = computed(() => typeFilter.value === 'service');
const showSubtypeColumn   = computed(() => SUBTYPE_TYPES.has(typeFilter.value ?? ''));

async function loadList() {
  loading.value = true;
  try {
    const res = await assetsApi.list({
      organizationId: orgId.value,
      type: typeFilter.value ?? undefined,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      protocol: filterProtocol.value.length === 1 ? filterProtocol.value[0] : undefined,
      types: filterType.value.length ? filterType.value : undefined,
      visibility: filterVisibility.value.length ? filterVisibility.value : undefined,
      sortBy: sortCol.value ?? undefined,
      sortDir: sortDir.value ?? undefined,
      page: page.value,
      size: PAGE_SIZE,
    });
    items.value = res.items;
    total.value = res.total;
    totalPages.value = res.totalPages;

    // Visibility aggregates + host info for any service-type assets in this page.
    const svcIds = res.items.filter((a) => a.type === 'service').map((a) => a.id);
    if (svcIds.length) {
      try {
        const [agg, hosts] = await Promise.all([
          assetsApi.visibilityAggregates(svcIds),
          assetsApi.serviceHosts(svcIds),
        ]);
        aggregateVisibility.value = agg;
        serviceHosts.value = hosts;
      } catch { aggregateVisibility.value = {}; serviceHosts.value = {}; }
    } else {
      aggregateVisibility.value = {};
      serviceHosts.value = {};
    }
  } finally {
    loading.value = false;
  }
}

/** Extracts the protocol from a SERVICE identifier "ip:port/proto". */
function protocolOf(identifier: string): string | null {
  const slash = identifier.lastIndexOf('/');
  if (slash < 0) return null;
  return identifier.substring(slash + 1).toUpperCase();
}
/** Extracts the IP portion. */
function ipOf(identifier: string): string | null {
  const slash = identifier.lastIndexOf('/');
  const head  = slash < 0 ? identifier : identifier.substring(0, slash);
  const colon = head.lastIndexOf(':');
  if (colon < 0) return null;
  return head.substring(0, colon);
}
/** Extracts the port. */
function portOf(identifier: string): string | null {
  const slash = identifier.lastIndexOf('/');
  const head  = slash < 0 ? identifier : identifier.substring(0, slash);
  const colon = head.lastIndexOf(':');
  if (colon < 0) return null;
  return head.substring(colon + 1);
}

const SUBTYPE_TYPES = new Set(['host', 'ip', 'interface']);

/** Type-specific subtype label: host -> hostSubtype, ip -> IPv4/IPv6, interface -> metadata.interfaceType. */
function subtypeOf(asset: Asset): string | null {
  if (asset.type === 'host') {
    return asset.hostSubtype ? (HOST_SUBTYPE_LABELS[asset.hostSubtype] ?? asset.hostSubtype) : null;
  }
  if (asset.type === 'ip') {
    return asset.identifier.includes(':') ? 'IPv6' : 'IPv4';
  }
  if (asset.type === 'interface') {
    try {
      const t = (JSON.parse(asset.metadata ?? '{}').interfaceType as string | undefined) ?? null;
      return t ? (INTERFACE_TYPE_LABELS[t] ?? t) : null;
    } catch { return null; }
  }
  return null;
}

const subtypeFilterOptions = [
  ...HOST_SUBTYPES.map((s) => ({ label: `Host: ${HOST_SUBTYPE_LABELS[s]}`, value: HOST_SUBTYPE_LABELS[s] })),
  { label: 'IP: IPv4', value: 'IPv4' },
  { label: 'IP: IPv6', value: 'IPv6' },
  ...INTERFACE_TYPES.map((t) => ({ label: `Interface: ${INTERFACE_TYPE_LABELS[t]}`, value: INTERFACE_TYPE_LABELS[t] })),
];

function visibilitySeverity(s: ServiceVisibilityState): 'success' | 'warn' | 'secondary' {
  switch (s) {
    case 'OPEN':     return 'success';
    case 'FILTERED': return 'warn';
    case 'CLOSED':   return 'secondary';
  }
}

async function loadTypeCounts() {
  const counts: Record<string, number> = {};
  await Promise.all(
    ASSET_TYPES.map(async (t) => {
      try {
        const r = await assetsApi.list({ organizationId: orgId.value, type: t, size: 1 });
        if (r.total > 0) counts[t] = r.total;
      } catch { /* silent */ }
    })
  );
  typeCounts.value = counts;
}

watch(page, loadList);

// ── Sort / filter state ────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterType       = ref<string[]>([]);
const filterProtocol   = ref<string[]>([]);
const filterVisibility = ref<string[]>([]);
const filterSubtype    = ref<string[]>([]);
const showThirdParty = ref(true);

// Columns handled server-side (identifier, type, code, createdAt).
// Derived columns (host, ip, port, protocol, application) are sorted client-side on the current page.
const SERVER_SORT_COLS = new Set(['identifier', 'type', 'code', 'createdAt']);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
  if (SERVER_SORT_COLS.has(col) || !dir) {
    if (page.value === 0) loadList();
    else page.value = 0;
  }
}

watch(filterProtocol, () => { if (page.value === 0) loadList(); else page.value = 0; });
// filterType/filterVisibility are real server-side filters now (AQL implementation plan, Phase 5)
// — they used to only filter the currently-loaded page client-side, which silently broke
// pagination (total/totalPages stayed unfiltered while the visible rows shrank). filterSubtype
// stays client-side for now: it spans three different underlying representations (Asset.hostSubtype,
// a derived IPv4/IPv6 distinction with no backing column, and Asset.metadata->>'interfaceType'),
// each only relevant while a single matching type tab is active — a real fix needs type-tab-aware
// param selection on top of the value/label mismatch already baked into subtypeFilterOptions,
// which is more than this pass's scope.
watch(filterType, () => { if (page.value === 0) loadList(); else page.value = 0; });
watch(filterVisibility, () => { if (page.value === 0) loadList(); else page.value = 0; });

// Type filter options come from typeCounts so we only show types actually present.
const typeFilterOptions = computed(() =>
  Object.keys(typeCounts.value)
    .sort()
    .map((t) => ({ label: ASSET_TYPE_LABELS[t] ?? t, value: t }))
);

const protocolOptions = [
  { label: 'TCP', value: 'tcp' },
  { label: 'UDP', value: 'udp' },
];
const visibilityOptions = [
  { label: 'Open',     value: 'OPEN' },
  { label: 'Filtered', value: 'FILTERED' },
  { label: 'Closed',   value: 'CLOSED' },
];

function sortValue(a: Asset, col: string): string | number {
  switch (col) {
    case 'type':       return ASSET_TYPE_LABELS[a.type] ?? a.type;
    case 'identifier': return a.identifier;
    case 'application': {
      try { return new URL(a.identifier).origin; } catch { return ''; }
    }
    case 'host':      return serviceHosts.value[a.id]?.hostIdentifier ?? '';
    case 'ip':        return ipOf(a.identifier) ?? '';
    case 'port':      return parseInt(portOf(a.identifier) ?? '0', 10) || 0;
    case 'protocol':  return protocolOf(a.identifier) ?? '';
    case 'subtype':   return subtypeOf(a) ?? '';
    case 'code':      return a.code;
    case 'createdAt': return a.createdAt;
    default:          return '';
  }
}

// Protocol/type/visibility filters, identifier/type/code/createdAt sort are server-side.
// Subtype filter and derived-column sort (host, ip, port, application, subtype) are client-side —
// see the note by filterSubtype's declaration for why subtype specifically stays that way for now.
const processedAssets = computed(() => {
  let data = items.value;
  if (filterSubtype.value.length) {
    data = data.filter((a) => filterSubtype.value.includes(subtypeOf(a) ?? ''));
  }
  if (!showThirdParty.value) data = data.filter((a) => !a.thirdParty);
  if (sortCol.value && sortDir.value && !SERVER_SORT_COLS.has(sortCol.value)) {
    const dir = sortDir.value === 'asc' ? 1 : -1;
    const col = sortCol.value;
    data = [...data].sort((a, b) => {
      const va = sortValue(a, col);
      const vb = sortValue(b, col);
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb), undefined, { numeric: true });
    });
  }
  return data;
});

// Checkbox + Code + Created + delete-button are always present; the rest are conditional.
// Clients don't get the checkbox/action columns (no bulk-select, no delete).
const emptyColspan = computed(() => {
  let n = auth.isClient ? 3 : 5; // (checkbox, action -1 each), tags, code, created
  if (typeFilter.value === null) n++;
  if (!isServiceFilter.value) n++;
  if (showSubtypeColumn.value) n++;
  if (typeFilter.value === 'web_endpoint') n++;
  if (isServiceFilter.value) n += 5;
  return n;
});

// ── Graph state ────────────────────────────────────────────────────────────
const graphAssets = ref<Asset[]>([]);
const graphRelationships = ref<AssetRelationship[]>([]);
const graphLoading       = ref(false);
const graphLoadCount     = ref(0);
const graphLoadTotal     = ref(0);

async function loadGraph() {
  graphLoading.value   = true;
  graphLoadCount.value = 0;
  graphLoadTotal.value = 0;
  graphAssets.value    = [];

  try {
    graphRelationships.value = await assetsApi.listOrgRelationships(orgId.value);

    let firstPage = true;
    await assetsApi.listAll({ organizationId: orgId.value }, (items, loaded, total) => {
      graphLoadTotal.value = total;
      graphLoadCount.value = loaded;
      graphAssets.value    = [...graphAssets.value, ...items];
      if (firstPage) { firstPage = false; graphLoading.value = false; }
    });
  } finally {
    graphLoading.value = false;
  }
}

async function switchMode(mode: ViewMode) {
  viewMode.value = mode;
  if (mode === 'graph' && graphAssets.value.length === 0) await loadGraph();
}

// ── Merge (graph flow: pick the target directly in the graph, see AssetGraph's merge mode) ──
const showMergeDialog = ref(false);
const mergeSource = ref<Asset | null>(null);
const mergeTarget = ref<Asset | null>(null);

function onGraphMerge(source: Asset, target: Asset) {
  mergeSource.value = source;
  mergeTarget.value = target;
  showMergeDialog.value = true;
}

function onMerged(_surviving: Asset) {
  showMergeDialog.value = false;
  mergeSource.value = null;
  mergeTarget.value = null;
  loadList();
  loadTypeCounts();
  if (viewMode.value === 'graph') loadGraph();
}


// ── Add asset ──────────────────────────────────────────────────────────────
const showAddDialog  = ref(false);
const showTagManager = ref(false);
const addSaving      = ref(false);
const addError       = ref('');
const typeOptions    = ASSET_TYPES.map((t) => ({ label: ASSET_TYPE_LABELS[t] ?? t, value: t }));
const PROTOCOL_OPTIONS = ['tcp', 'udp'];
const subtypeOptions = HOST_SUBTYPES.map((s) => ({ label: HOST_SUBTYPE_LABELS[s], value: s }));
const form = ref({
  type: 'host', identifier: '', networkName: '',
  hostHostname: '', hostSubtype: 'unknown',
  svcHost: '', svcPort: '', svcProtocol: 'tcp',
});
const isNetworkType  = computed(() => form.value.type === 'network');
const isHostType     = computed(() => form.value.type === 'host');
const isServiceType  = computed(() => form.value.type === 'service');
const canSubmitAsset = computed(() => {
  if (!form.value.type) return false;
  if (isServiceType.value) return !!form.value.svcHost.trim() && !!form.value.svcPort.trim();
  return !!form.value.identifier.trim();
});

function closeAddDialog() {
  showAddDialog.value = false;
  addError.value = '';
  form.value = {
    type: 'host', identifier: '', networkName: '',
    hostHostname: '', hostSubtype: 'unknown',
    svcHost: '', svcPort: '', svcProtocol: 'tcp',
  };
}

async function addAsset() {
  if (!canSubmitAsset.value) return;
  addSaving.value = true;
  addError.value = '';
  try {
    let identifier = form.value.identifier.trim();
    let metadataObj: Record<string, unknown> | undefined;
    if (isNetworkType.value && form.value.networkName.trim()) {
      metadataObj = { name: form.value.networkName.trim() };
    } else if (isServiceType.value) {
      const port = form.value.svcPort.trim();
      identifier = `${form.value.svcHost.trim()}:${port}/${form.value.svcProtocol}`;
      metadataObj = { port: Number(port), protocol: form.value.svcProtocol };
    }
    const created = await assetsApi.create({
      organizationId: orgId.value,
      type: form.value.type,
      identifier,
      metadata: metadataObj ? JSON.stringify(metadataObj) : undefined,
      hostSubtype: isHostType.value ? form.value.hostSubtype : undefined,
      hostnames: isHostType.value && form.value.hostHostname.trim() ? [form.value.hostHostname.trim()] : undefined,
    });
    items.value.unshift(created);
    total.value++;
    if (typeCounts.value[created.type]) typeCounts.value[created.type]++;
    else typeCounts.value[created.type] = 1;
    closeAddDialog();
    if (viewMode.value === 'graph') graphAssets.value.unshift(created);
  } catch (e: any) {
    addError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create asset';
  } finally {
    addSaving.value = false;
  }
}

// ── Multi-select ───────────────────────────────────────────────────────────
const selectedIds = ref<Set<number>>(new Set());

function toggleSelect(id: number, event: Event) {
  event.stopPropagation();
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selectedIds.value = next;
}

const allVisibleSelected = computed(() =>
  processedAssets.value.length > 0 &&
  processedAssets.value.every((a) => selectedIds.value.has(a.id))
);
const someSelected = computed(() => selectedIds.value.size > 0);

function toggleSelectAll(event: Event) {
  event.stopPropagation();
  if (allVisibleSelected.value) {
    const next = new Set(selectedIds.value);
    processedAssets.value.forEach((a) => next.delete(a.id));
    selectedIds.value = next;
  } else {
    const next = new Set(selectedIds.value);
    processedAssets.value.forEach((a) => next.add(a.id));
    selectedIds.value = next;
  }
}

// ── Delete (single + bulk) ────────────────────────────────────────────────
const showDeleteDialog  = ref(false);
const deleteSaving      = ref(false);
const orphanLoading     = ref(false);
const pendingDeleteIds  = ref<number[]>([]);
const pendingDeleteLabel = ref('');
const orphanItems       = ref<AssetOrphanInfo[]>([]);
const orphanPage        = ref(0);
const ORPHAN_PER_PAGE   = 8;
const deleteOrphans     = ref(false);

const orphanPageItems = computed(() =>
  orphanItems.value.slice(orphanPage.value * ORPHAN_PER_PAGE, (orphanPage.value + 1) * ORPHAN_PER_PAGE)
);
const orphanTotalPages = computed(() => Math.ceil(orphanItems.value.length / ORPHAN_PER_PAGE));

function openDeleteDialog(ids: number[], label: string) {
  pendingDeleteIds.value  = ids;
  pendingDeleteLabel.value = label;
  orphanItems.value  = [];
  orphanPage.value   = 0;
  deleteOrphans.value = false;
  showDeleteDialog.value = true;
  orphanLoading.value = true;
  assetsApi.previewOrphans(ids)
    .then((r) => { orphanItems.value = r; })
    .catch(() => {})
    .finally(() => { orphanLoading.value = false; });
}

function confirmDelete(asset: Asset) {
  openDeleteDialog([asset.id], asset.identifier);
}

async function confirmDeleteRelationship(rel: AssetRelationship) {
  const ok = await confirmDialog({
    header: 'Remove relationship',
    message: 'Remove this relationship? It will be deleted for every project sharing these assets.',
    acceptLabel: 'Remove',
  });
  if (!ok) return;
  await assetsApi.removeRelationship(rel.fromAssetId, rel.toAssetId, rel.type);
  graphRelationships.value = graphRelationships.value.filter(
    (r) => !(r.fromAssetId === rel.fromAssetId && r.toAssetId === rel.toAssetId && r.type === rel.type)
  );
}

function confirmBulkDelete() {
  const ids = [...selectedIds.value];
  if (!ids.length) return;
  openDeleteDialog(ids, `${ids.length} assets`);
}

async function doDelete() {
  deleteSaving.value = true;
  const idsToDelete = deleteOrphans.value
    ? [...new Set([...pendingDeleteIds.value, ...orphanItems.value.map((o) => o.id)])]
    : [...pendingDeleteIds.value];
  try {
    if (idsToDelete.length === 1) {
      await assetsApi.delete(idsToDelete[0]);
    } else {
      await assetsApi.bulkDelete(idsToDelete);
    }
    const gone = new Set(idsToDelete);
    items.value             = items.value.filter((a) => !gone.has(a.id));
    graphAssets.value       = graphAssets.value.filter((a) => !gone.has(a.id));
    graphRelationships.value = graphRelationships.value.filter(
      (r) => !gone.has(r.fromAssetId) && !gone.has(r.toAssetId)
    );
    total.value = Math.max(0, total.value - gone.size);
    selectedIds.value = new Set();
    showDeleteDialog.value = false;
    pendingDeleteIds.value = [];
    loadTypeCounts();
  } finally {
    deleteSaving.value = false;
  }
}

function endpointPath(identifier: string): string {
  try { return new URL(identifier).pathname || '/'; }
  catch { return identifier; }
}
function endpointApp(identifier: string): string {
  try { return new URL(identifier).origin; }
  catch { return ''; }
}
function webAppDisplayName(asset: Asset): string {
  if (asset.type !== 'web_application') return asset.identifier;
  try {
    const m = JSON.parse(asset.metadata ?? '{}');
    return m.name ?? asset.identifier;
  } catch { return asset.identifier; }
}

function goToDetail(asset: Asset) {
  router.push({
    name: route.params.engId ? 'org-project-asset-detail' : 'org-asset-detail',
    params: { ...route.params, id: asset.id },
  });
}

onMounted(async () => {
  await Promise.all([loadList(), loadTypeCounts()]);
});
</script>

<template>
  <div>
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <div class="ares-page-header" style="margin-bottom:1.25rem;">
      <div>
        <h2 class="ares-page-title">Assets</h2>
        <p class="ares-page-subtitle">{{ context.org?.name ?? '' }} — attack surface inventory.</p>
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <!-- View toggle — graph mode needs relationship endpoints not granted to clients -->
        <div v-if="!auth.isClient" class="view-toggle">
          <button
            class="view-toggle-btn"
            :class="{ active: viewMode === 'list' }"
            v-tooltip.top="'List view'"
            @click="switchMode('list')"
          >
            <i class="pi pi-list" />
          </button>
          <button
            class="view-toggle-btn"
            :class="{ active: viewMode === 'graph' }"
            v-tooltip.top="'Graph view'"
            @click="switchMode('graph')"
          >
            <i class="pi pi-share-alt" />
          </button>
        </div>
        <template v-if="!auth.isClient">
          <Button icon="pi pi-tag" text size="small" severity="secondary" v-tooltip.top="'Manage tags'" @click="showTagManager = true" />
          <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New asset'" @click="showAddDialog = true" />
        </template>
      </div>
    </div>

    <!-- ── Type filter pills (list mode only) ────────────────────────── -->
    <div v-if="viewMode === 'list'" style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.75rem; align-items:center;">
      <button
        class="type-pill"
        :class="{ 'type-pill--active': typeFilter === null }"
        @click="setType(null)"
      >
        All
        <span class="type-pill-count">{{ Object.values(typeCounts).reduce((s, n) => s + n, 0) }}</span>
      </button>
      <button
        v-for="t in ASSET_TYPES"
        v-show="typeCounts[t] != null"
        :key="t"
        class="type-pill"
        :class="{ 'type-pill--active': typeFilter === t }"
        @click="setType(t)"
      >
        {{ ASSET_TYPE_LABELS[t] }}
        <span class="type-pill-count">{{ typeCounts[t] }}</span>
      </button>
      <div style="width:1px; height:18px; background:var(--ares-border); margin:0 0.15rem;" />
      <label style="display:flex; align-items:center; gap:0.45rem; font-size:0.8rem; color:var(--ares-text-muted); cursor:pointer;">
        <ToggleSwitch v-model="showThirdParty" />
        3rd Party
      </label>
    </div>

    <!-- ── Search box (list mode only) ───────────────────────────────── -->
    <div v-if="viewMode === 'list'" style="margin-bottom:1.25rem;">
      <QueryBar entity="asset" placeholder="Search by identifier, name…" :organization-id="orgId" :initial-aql="typeof route.query.aql === 'string' ? route.query.aql : undefined" @search="onSearch" />
    </div>

    <!-- ── Graph view ──────────────────────────────────────────────────── -->
    <template v-if="viewMode === 'graph'">
      <div v-if="graphLoading" class="graph-init-loading">
        <div class="graph-init-loading__orbs">
          <span /><span /><span /><span /><span />
        </div>
        <div class="graph-init-loading__label">
          <template v-if="graphLoadTotal > 0">
            Loading assets… {{ graphLoadCount }} / {{ graphLoadTotal }}
          </template>
          <template v-else>Loading graph…</template>
        </div>
        <div v-if="graphLoadTotal > 0" class="graph-init-loading__bar">
          <div class="graph-init-loading__bar-fill" :style="{ width: Math.round(graphLoadCount / graphLoadTotal * 100) + '%' }" />
        </div>
      </div>
      <template v-else>
        <div v-if="graphLoadCount < graphLoadTotal" class="graph-load-more-bar">
          <i class="pi pi-spin pi-spinner" style="font-size:0.7rem;" />
          Loading {{ graphLoadCount }} / {{ graphLoadTotal }} assets…
          <div class="graph-load-more-bar__fill" :style="{ width: Math.round(graphLoadCount / graphLoadTotal * 100) + '%' }" />
        </div>
        <AssetGraph
          :assets="graphAssets"
          :relationships="graphRelationships"
          :org-id="orgId"
          :allow-delete="true"
          :allow-delete-relationship="true"
          @node-click="goToDetail"
          @node-delete="confirmDelete"
          @node-merge="onGraphMerge"
          @edge-delete="confirmDeleteRelationship"
        />
      </template>
    </template>

    <!-- ── List view ───────────────────────────────────────────────────── -->
    <template v-else>
      <AresLoadingState v-if="loading" />
      <template v-else>
        <div class="ares-card" style="padding:0;">
          <table class="ares-table ares-table--clickable">
            <thead>
              <tr>
                <th v-if="!auth.isClient" class="check-cell">
                  <input type="checkbox" class="row-check"
                    :checked="allVisibleSelected"
                    @change="toggleSelectAll" />
                </th>
                <th v-if="typeFilter === null" style="width:140px;">
                  <ColumnHeader label="Type" :sortable="true"
                    :sort-dir="sortCol === 'type' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    :filter-options="typeFilterOptions"
                    :filter-value="filterType"
                    @update:sort-dir="onSort('type', $event)"
                    @update:filter-value="filterType = $event" />
                </th>
                <th v-if="!isServiceFilter">
                  <ColumnHeader
                    :label="typeFilter === 'web_endpoint' ? 'Endpoint' : 'Identifier'"
                    :sortable="true"
                    :sort-dir="sortCol === 'identifier' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    @update:sort-dir="onSort('identifier', $event)" />
                </th>
                <th v-if="showSubtypeColumn" style="width:160px;">
                  <ColumnHeader label="Subtype" :sortable="true"
                    :sort-dir="sortCol === 'subtype' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    :filter-options="subtypeFilterOptions"
                    :filter-value="filterSubtype"
                    @update:sort-dir="onSort('subtype', $event)"
                    @update:filter-value="filterSubtype = $event" />
                </th>
                <th v-if="typeFilter === 'web_endpoint'" style="width:240px;">
                  <ColumnHeader label="Application" :sortable="true"
                    :sort-dir="sortCol === 'application' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    @update:sort-dir="onSort('application', $event)" />
                </th>
                <!-- Service-only columns -->
                <th v-if="isServiceFilter" style="width:140px;">
                  <ColumnHeader label="IP" :sortable="true"
                    :sort-dir="sortCol === 'ip' ? sortDir : null"
                    sort-asc-label="Low → High" sort-desc-label="High → Low"
                    @update:sort-dir="onSort('ip', $event)" />
                </th>
                <th v-if="isServiceFilter" style="width:70px;">
                  <ColumnHeader label="Port" :sortable="true"
                    :sort-dir="sortCol === 'port' ? sortDir : null"
                    sort-asc-label="Low → High" sort-desc-label="High → Low"
                    @update:sort-dir="onSort('port', $event)" />
                </th>
                <th v-if="isServiceFilter">
                  <ColumnHeader label="Host" :sortable="true"
                    :sort-dir="sortCol === 'host' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    @update:sort-dir="onSort('host', $event)" />
                </th>
                <th v-if="isServiceFilter" style="width:80px;">
                  <ColumnHeader label="Protocol" :sortable="true"
                    :sort-dir="sortCol === 'protocol' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    :filter-options="protocolOptions"
                    :filter-value="filterProtocol"
                    @update:sort-dir="onSort('protocol', $event)"
                    @update:filter-value="filterProtocol = $event" />
                </th>
                <th v-if="isServiceFilter" style="width:110px;">
                  <ColumnHeader label="Visibility"
                    :filter-options="visibilityOptions"
                    :filter-value="filterVisibility"
                    @update:filter-value="filterVisibility = $event" />
                </th>
                <th style="width:160px;">Tags</th>
                <th style="width:150px;">
                  <ColumnHeader label="Code" :sortable="true"
                    :sort-dir="sortCol === 'code' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    @update:sort-dir="onSort('code', $event)" />
                </th>
                <th style="width:100px;">
                  <ColumnHeader label="Created" :sortable="true"
                    :sort-dir="sortCol === 'createdAt' ? sortDir : null"
                    sort-asc-label="Oldest first" sort-desc-label="Newest first"
                    @update:sort-dir="onSort('createdAt', $event)" />
                </th>
                <th v-if="!auth.isClient" style="width:48px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="asset in processedAssets" :key="asset.id"
                  :class="{ 'row--selected': selectedIds.has(asset.id) }"
                  @click="goToDetail(asset)">
                <td v-if="!auth.isClient" class="check-cell" @click.stop>
                  <input type="checkbox" class="row-check"
                    :checked="selectedIds.has(asset.id)"
                    @change="toggleSelect(asset.id, $event)" />
                </td>
                <td v-if="typeFilter === null">
                  <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap;">
                    <span class="type-badge">
                      {{ ASSET_TYPE_LABELS[asset.type] ?? asset.type }}
                    </span>
                    <span v-if="asset.thirdParty" class="tp-badge">3rd party</span>
                  </div>
                </td>
                <!-- Identifier column: path-only for endpoints, name for webapps, full for rest -->
                <td v-if="!isServiceFilter" style="font-family:monospace; font-size:0.82rem;">
                  <span v-if="asset.thirdParty && typeFilter !== null" class="tp-badge" style="margin-right:0.4rem; font-family:inherit;">3rd party</span>
                  <template v-if="asset.type === 'web_endpoint'">{{ endpointPath(asset.identifier) }}</template>
                  <template v-else-if="asset.type === 'web_application'">
                    <span style="font-family:inherit;">{{ webAppDisplayName(asset) }}</span>
                    <span v-if="webAppDisplayName(asset) !== asset.identifier" style="display:block; font-size:0.72rem; color:var(--ares-text-muted);">{{ asset.identifier }}</span>
                  </template>
                  <template v-else>{{ asset.identifier }}</template>
                </td>
                <!-- Subtype column (host, ip, interface only) -->
                <td v-if="showSubtypeColumn" style="font-size:0.82rem;">
                  {{ subtypeOf(asset) ?? '—' }}
                </td>
                <!-- Application column (web_endpoint filter only) -->
                <td v-if="typeFilter === 'web_endpoint'" style="font-size:0.8rem; color:var(--ares-text-muted); font-family:monospace;">
                  {{ endpointApp(asset.identifier) }}
                </td>

                <!-- Service-only columns -->
                <td v-if="isServiceFilter" style="font-family:monospace; font-size:0.82rem;">
                  {{ ipOf(asset.identifier) ?? '—' }}
                </td>
                <td v-if="isServiceFilter" style="font-family:monospace; font-size:0.82rem; text-align:right;">
                  {{ portOf(asset.identifier) ?? '—' }}
                </td>
                <td v-if="isServiceFilter" @click.stop>
                  <a
                    v-if="serviceHosts[asset.id]"
                    href="#"
                    @click.prevent="router.push({
                      name: 'org-asset-detail',
                      params: { orgId: orgId, id: serviceHosts[asset.id].hostId },
                    })"
                    style="color:var(--p-primary-400); text-decoration:none; font-size:0.85rem;"
                  >
                    {{ serviceHosts[asset.id].hostIdentifier }}
                  </a>
                  <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
                </td>
                <td v-if="isServiceFilter">
                  <span v-if="protocolOf(asset.identifier)" class="proto-tag">
                    {{ protocolOf(asset.identifier) }}
                  </span>
                  <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
                </td>
                <td v-if="isServiceFilter" @click.stop>
                  <AresBadge
                    v-if="aggregateVisibility[asset.id]"
                    :value="aggregateVisibility[asset.id]"
                    :severity="visibilitySeverity(aggregateVisibility[asset.id])"
                  />
                  <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
                </td>
                <td @click.stop>
                  <TagChipList :tags="asset.tags" />
                </td>
                <td>
                  <code style="font-size:0.72rem; color:var(--ares-text-muted);">{{ asset.code }}</code>
                </td>
                <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ asset.createdAt.slice(0, 10) }}</td>
                <td v-if="!auth.isClient" @click.stop>
                  <Button
                    icon="pi pi-trash"
                    text
                    severity="danger"
                    size="small"
                    @click="confirmDelete(asset)"
                  />
                </td>
              </tr>
              <tr v-if="!processedAssets.length">
                <td :colspan="emptyColspan" class="ares-table-empty">
                  No assets{{ typeFilter ? ' of type ' + (ASSET_TYPE_LABELS[typeFilter] ?? typeFilter) : '' }}.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
      </template>
    </template>

    <!-- ── Bulk action bar ────────────────────────────────────────────────── -->
    <Transition name="bulk-bar">
      <div v-if="someSelected && !auth.isClient" class="bulk-action-bar">
        <span class="bulk-action-bar__count">
          {{ selectedIds.size }} asset{{ selectedIds.size !== 1 ? 's' : '' }} selected
        </span>
        <Button label="Clear" severity="secondary" size="small" text @click="selectedIds = new Set()" />
        <Button icon="pi pi-trash" label="Delete selected" severity="danger" size="small"
                @click="confirmBulkDelete" />
      </div>
    </Transition>

    <!-- ── Add asset dialog ────────────────────────────────────────────── -->
    <Dialog v-model:visible="showAddDialog" header="New asset" modal style="width:32rem;">
      <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem;">
        <div>
          <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:0.3rem; color:var(--ares-text-muted);">Type *</label>
          <Select
            v-model="form.type"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            placeholder="Asset type"
            class="w-full"
          />
        </div>
        <!-- Service: structured host/port/protocol instead of a free-text identifier -->
        <template v-if="isServiceType">
          <div>
            <label class="asset-form-label">Host / IP *</label>
            <InputText v-model="form.svcHost" placeholder="e.g. 192.168.1.1" class="w-full" />
          </div>
          <div style="display:flex; gap:0.75rem;">
            <div style="flex:1;">
              <label class="asset-form-label">Port *</label>
              <InputText v-model="form.svcPort" placeholder="e.g. 443" class="w-full" />
            </div>
            <div style="flex:1;">
              <label class="asset-form-label">Protocol</label>
              <Select v-model="form.svcProtocol" :options="PROTOCOL_OPTIONS" class="w-full" />
            </div>
          </div>
          <p v-if="form.svcHost.trim() && form.svcPort.trim()" class="asset-form-hint">
            Will be created as <code>{{ form.svcHost.trim() }}:{{ form.svcPort.trim() }}/{{ form.svcProtocol }}</code>
          </p>
        </template>

        <!-- Every other type: a single identifier field (CIDR copy for networks) -->
        <div v-else>
          <label class="asset-form-label">{{ isNetworkType ? 'CIDR *' : 'Identifier *' }}</label>
          <InputText
            v-model="form.identifier"
            required
            :placeholder="isNetworkType ? 'e.g. 192.168.1.0/24' : 'e.g. example.com / 192.168.1.1 / https://app.example.com'"
            class="w-full"
          />
          <p class="asset-form-hint">
            {{ isNetworkType ? 'CIDR notation. IPs will be auto-linked to the most specific matching network.' : 'Unique identifier for this asset within the organization.' }}
          </p>
        </div>

        <!-- Network: optional description -->
        <div v-if="isNetworkType">
          <label class="asset-form-label">
            Description <span class="asset-form-optional">(optional)</span>
          </label>
          <InputText v-model="form.networkName" placeholder="e.g. Office LAN, DMZ, Management" class="w-full" />
        </div>

        <!-- Host: optional subtype/hostname (add more hostnames later on the asset detail page) -->
        <template v-if="isHostType">
          <div>
            <label class="asset-form-label">Subtype</label>
            <Select v-model="form.hostSubtype" :options="subtypeOptions" option-label="label" option-value="value" class="w-full" />
          </div>
          <div>
            <label class="asset-form-label">Hostname <span class="asset-form-optional">(optional)</span></label>
            <InputText v-model="form.hostHostname" placeholder="e.g. web01.internal" class="w-full" />
          </div>
        </template>

        <Message v-if="addError" severity="error" :closable="false">{{ addError }}</Message>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" size="small" @click="closeAddDialog" />
          <Button label="Create" size="small" :loading="addSaving"
            :disabled="!canSubmitAsset" @click="addAsset" />
        </div>
      </div>
    </Dialog>

    <!-- ── Delete dialog ───────────────────────────────────────────────── -->
    <Dialog v-model:visible="showDeleteDialog" header="Delete asset(s)" modal style="width:30rem;">
      <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.25rem;">
        <p style="margin:0; color:var(--ares-text-2);">
          <template v-if="pendingDeleteIds.length === 1">
            Delete <strong style="font-family:monospace; color:var(--ares-accent);">{{ pendingDeleteLabel }}</strong>?
          </template>
          <template v-else>
            Delete <strong>{{ pendingDeleteLabel }}</strong>?
          </template>
          <br>
          <span style="font-size:0.78rem; color:var(--ares-text-muted);">
            Associated detections will also be deleted. This cannot be undone.
          </span>
        </p>

        <!-- Orphan preview -->
        <div v-if="orphanLoading" style="font-size:0.82rem; color:var(--ares-text-muted); display:flex; align-items:center; gap:0.4rem;">
          <i class="pi pi-spin pi-spinner" /> Checking for isolated assets…
        </div>
        <template v-else-if="orphanItems.length > 0">
          <div class="orphan-section">
            <label class="orphan-toggle">
              <input type="checkbox" v-model="deleteOrphans" />
              <span>
                Also delete <strong>{{ orphanItems.length }}</strong>
                asset{{ orphanItems.length !== 1 ? 's' : '' }} that would become isolated
              </span>
            </label>
            <div class="orphan-list">
              <div v-for="o in orphanPageItems" :key="o.id" class="orphan-item">
                <i :class="'pi ' + (ASSET_TYPE_ICONS[o.type] ?? 'pi-circle')"
                   style="font-size:0.72rem; color:var(--ares-text-muted); flex-shrink:0;" />
                <span style="font-family:monospace; font-size:0.8rem; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  {{ o.identifier }}
                </span>
                <span style="font-size:0.72rem; color:var(--ares-text-muted); flex-shrink:0;">
                  {{ ASSET_TYPE_LABELS[o.type] ?? o.type }}
                </span>
              </div>
            </div>
            <div v-if="orphanTotalPages > 1" class="orphan-pager">
              <button :disabled="orphanPage === 0" @click="orphanPage--">&#8249;</button>
              <span>{{ orphanPage + 1 }} / {{ orphanTotalPages }}</span>
              <button :disabled="orphanPage >= orphanTotalPages - 1" @click="orphanPage++">&#8250;</button>
            </div>
          </div>
        </template>

        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" size="small" @click="showDeleteDialog = false" />
          <Button label="Delete" severity="danger" size="small" :loading="deleteSaving" @click="doDelete" />
        </div>
      </div>
    </Dialog>

    <!-- ── Merge dialog ──────────────────────────────────────────────── -->
    <MergeAssetDialog
      v-if="showMergeDialog && mergeSource && mergeTarget"
      v-model:visible="showMergeDialog"
      :source="mergeSource!"
      :target="mergeTarget!"
      @merged="onMerged"
    />

    <!-- ── Manage tags ──────────────────────────────────────────────────── -->
    <TagManagerDialog
      v-model:visible="showTagManager"
      :org-id="orgId"
      @changed="loadList"
    />
  </div>
</template>

<style scoped>
/* ── Add-asset form ─────────────────────────────────────────────────────── */
.asset-form-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
  color: var(--ares-text-muted);
}
.asset-form-optional { font-weight: 400; opacity: 0.6; }
.asset-form-hint {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  margin-top: 0.35rem;
}
.asset-form-hint code {
  background: var(--ares-surface-sunken, rgba(0,0,0,0.15));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.05em 0.4em;
  color: var(--ares-accent);
}

/* ── View toggle ────────────────────────────────────────────────────────── */
.view-toggle {
  display: flex;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
}
.view-toggle-btn {
  width: 34px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ares-surface);
  border: none;
  color: var(--ares-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  font-size: 0.85rem;
}
.view-toggle-btn:hover { background: var(--ares-surface-2); color: var(--ares-text); }
.view-toggle-btn.active {
  background: var(--ares-accent-bg);
  color: #fff;
}

/* ── Type filter pills ──────────────────────────────────────────────────── */
.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  background: var(--ares-surface);
  color: var(--ares-text-muted);
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.type-pill:hover {
  background: var(--ares-surface-2);
  color: var(--ares-text);
}
.type-pill--active {
  background: var(--ares-accent-bg);
  border-color: transparent;
  color: #fff;
}
.type-pill-count {
  background: rgba(255,255,255,0.15);
  border-radius: var(--ares-radius);
  padding: 0 0.4em;
  font-size: 0.7em;
  font-weight: 700;
}
.type-pill--active .type-pill-count { background: rgba(255,255,255,0.2); }

/* ── Type badge in table ────────────────────────────────────────────────── */
.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--ares-text-2);
}

.proto-tag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: var(--ares-radius);
  font-family: monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-2);
}

/* ── Multi-select ───────────────────────────────────────────────────────── */
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

/* ── Bulk action bar ────────────────────────────────────────────────────── */
.bulk-action-bar {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1.25rem;
  background: var(--ares-surface-2);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  z-index: 100;
  white-space: nowrap;
}
.bulk-action-bar__count { font-size: 0.85rem; color: var(--ares-text-2); font-weight: 600; }
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }

/* ── Orphan preview in delete dialog ───────────────────────────────────── */
.orphan-section {
  border: 1px solid color-mix(in srgb, var(--p-amber-500) 30%, transparent);
  border-radius: var(--ares-radius);
  background: color-mix(in srgb, var(--p-amber-500) 5%, transparent);
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.orphan-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--ares-text-2);
  cursor: pointer;
}
.orphan-toggle input { margin-top: 0.15rem; flex-shrink: 0; accent-color: var(--p-amber-500); }
.orphan-list {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.orphan-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
}
.orphan-pager {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--ares-text-muted);
  justify-content: center;
}
.orphan-pager button {
  background: none;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.45rem;
  cursor: pointer;
  color: var(--ares-text-2);
  font-size: 1rem;
  line-height: 1;
}
.orphan-pager button:disabled { opacity: 0.35; cursor: default; }

/* ── Third-party badge ──────────────────────────────────────────────────── */
.tp-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1em 0.5em;
  border-radius: var(--ares-radius);
  white-space: nowrap;
  background: color-mix(in srgb, #38bdf8 15%, transparent);
  color: #38bdf8;
  border: 1px solid color-mix(in srgb, #38bdf8 35%, transparent);
  letter-spacing: 0.01em;
}

</style>
