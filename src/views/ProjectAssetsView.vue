<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { projectsApi } from '@/api/projects';
import {
  assetsApi, ASSET_TYPES, ASSET_TYPE_LABELS, HOST_SUBTYPES, HOST_SUBTYPE_LABELS,
  INTERFACE_TYPES, INTERFACE_TYPE_LABELS,
  type Asset, type AssetRelationship, type ServiceVisibilityState, type ServiceHostInfo,
} from '@/api/assets';
import AresBadge from '@/components/AresBadge.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import QueryBar from '@/components/QueryBar.vue';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';
import AppPagination from '@/components/AppPagination.vue';
import AssetGraph from '@/components/AssetGraph.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import MergeAssetDialog from '@/components/MergeAssetDialog.vue';
import TagChipList from '@/components/TagChipList.vue';
import TagManagerDialog from '@/components/TagManagerDialog.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Toast from 'primevue/toast';
import ToggleSwitch from 'primevue/toggleswitch';
import { useToast } from 'primevue/usetoast';

const route   = useRoute();
const router  = useRouter();
const context = useContextStore();
const auth    = useAuthStore();
const toast   = useToast();
const engId   = computed(() => Number(route.params.engId));
const orgId   = computed(() => Number(route.params.orgId));

// ── View mode ──────────────────────────────────────────────────────────────
type ViewMode = 'list' | 'graph';
const viewMode = ref<ViewMode>('list');

// ── Filter ─────────────────────────────────────────────────────────────────
const typeFilter  = ref<string | null>(null);
const searchState = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });

function setType(t: string | null) {
  typeFilter.value = t;
  page.value = 0;
  if (viewMode.value === 'list') load();
}

function onSearch(payload: { mode: 'basic' | 'aql'; value: string }) {
  searchState.value = payload;
  page.value = 0;
  load();
}

// ── Scope status map ───────────────────────────────────────────────────────
type ScopeStatus = 'in_scope' | 'out_of_scope' | 'indeterminate' | 'third_party';
interface ScopeEntry { status: ScopeStatus; override: boolean }
const scopeMap = ref<Record<string, ScopeEntry>>({});

async function loadScopeStatuses() {
  try {
    scopeMap.value = await projectsApi.getScopeStatuses(engId.value) as Record<string, ScopeEntry>;
  } catch { /* silent */ }
}

function scopeOf(assetId: number): ScopeEntry {
  return scopeMap.value[String(assetId)] ?? { status: 'indeterminate', override: false };
}

// ── List ───────────────────────────────────────────────────────────────────
const PAGE_SIZE  = 50;
const assets     = ref<Asset[]>([]);
const loading    = ref(true);
const total      = ref(0);
const totalPages = ref(0);
const page       = ref(0);
const typeCounts = ref<Record<string, number>>({});

// Aggregate visibility per asset id (services only; populated after list load).
const aggregateVisibility = ref<Record<number, ServiceVisibilityState>>({});
// Host info per service id — populated after list load when filter === service.
const serviceHosts = ref<Record<number, ServiceHostInfo>>({});
// Service-only columns (visibility, protocol) — shown only when filtering by service type.
const isServiceFilter = computed(() => typeFilter.value === 'service');
const SUBTYPE_TYPES = new Set(['host', 'ip', 'interface']);
const showSubtypeColumn = computed(() => SUBTYPE_TYPES.has(typeFilter.value ?? ''));

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

function endpointPath(identifier: string): string {
  try { return new URL(identifier).pathname || '/'; }
  catch { return identifier; }
}
function endpointApp(identifier: string): string {
  try { return new URL(identifier).origin; }
  catch { return ''; }
}

/** Extracts the protocol from a SERVICE identifier like "192.168.1.1:443/tcp". */
function protocolOf(identifier: string): string | null {
  const slash = identifier.lastIndexOf('/');
  if (slash < 0) return null;
  return identifier.substring(slash + 1).toUpperCase();
}

/** Extracts the IP portion from a SERVICE identifier "ip:port/proto". */
function ipOf(identifier: string): string | null {
  const slash = identifier.lastIndexOf('/');
  const head  = slash < 0 ? identifier : identifier.substring(0, slash);
  const colon = head.lastIndexOf(':');
  if (colon < 0) return null;
  return head.substring(0, colon);
}

/** Extracts the port from a SERVICE identifier "ip:port/proto". */
function portOf(identifier: string): string | null {
  const slash = identifier.lastIndexOf('/');
  const head  = slash < 0 ? identifier : identifier.substring(0, slash);
  const colon = head.lastIndexOf(':');
  if (colon < 0) return null;
  return head.substring(colon + 1);
}

// ── Sort / filter state ────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterScope      = ref<string[]>([]);
const filterProtocol   = ref<string[]>([]);
const filterVisibility = ref<string[]>([]);
const filterSubtype    = ref<string[]>([]);

// Columns handled server-side. Derived columns (host, ip, port, application) sort client-side on current page.
const SERVER_SORT_COLS = new Set(['identifier', 'type', 'code', 'createdAt', 'scope']);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
  if (SERVER_SORT_COLS.has(col) || !dir) {
    if (page.value === 0) load();
    else page.value = 0; // watch(page) triggers load
  }
}

const scopeOptions = [
  { label: 'In scope', value: 'in_scope' },
  { label: 'Out of scope', value: 'out_of_scope' },
  { label: 'Indeterminate', value: 'indeterminate' },
  { label: 'Third party', value: 'third_party' },
];

const hideThirdParty = ref(false);

const protocolOptions = [
  { label: 'TCP', value: 'tcp' },
  { label: 'UDP', value: 'udp' },
];

const visibilityOptions = [
  { label: 'Open',     value: 'OPEN' },
  { label: 'Filtered', value: 'FILTERED' },
  { label: 'Closed',   value: 'CLOSED' },
];

/** Returns the comparable value for a given asset + sort column. */
function sortValue(a: Asset, col: string): string | number {
  switch (col) {
    case 'type':        return ASSET_TYPE_LABELS[a.type] ?? a.type;
    case 'identifier':  return a.identifier;
    case 'application': { try { return new URL(a.identifier).origin; } catch { return ''; } }
    case 'host':        return serviceHosts.value[a.id]?.hostIdentifier ?? '';
    case 'ip':          return ipOf(a.identifier) ?? '';
    case 'port':        return parseInt(portOf(a.identifier) ?? '0', 10) || 0;
    case 'protocol':    return protocolOf(a.identifier) ?? '';
    case 'subtype':     return subtypeOf(a) ?? '';
    case 'scope':       return scopeOf(a.id).status;
    case 'code':        return a.code;
    case 'createdAt':   return a.createdAt;
    default:            return '';
  }
}

// Scope filter, protocol filter, and server-sortable columns are handled server-side.
// Visibility filter, subtype filter, and derived-column sort (host, ip, port, application, subtype)
// remain client-side.
const processedAssets = computed(() => {
  let data = filterVisibility.value.length
    ? assets.value.filter((a) => {
        const v = aggregateVisibility.value[a.id];
        return v != null && filterVisibility.value.includes(v);
      })
    : assets.value;
  if (filterSubtype.value.length) {
    data = data.filter((a) => filterSubtype.value.includes(subtypeOf(a) ?? ''));
  }
  if (hideThirdParty.value) {
    data = data.filter((a) => scopeOf(a.id).status !== 'third_party');
  }
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

// Checkbox + Scope + Code + Discovered + hide-button are always present; the rest are conditional.
const emptyColspan = computed(() => {
  let n = 6; // checkbox, tags, scope, code, discovered, action
  if (typeFilter.value === null) n++;
  if (!isServiceFilter.value) n++;
  if (showSubtypeColumn.value) n++;
  if (typeFilter.value === 'web_endpoint') n++;
  if (isServiceFilter.value) n += 5;
  return n;
});

async function load() {
  loading.value = true;
  try {
    const res = await assetsApi.list({
      projectId: engId.value,
      type: typeFilter.value ?? undefined,
      q: searchState.value.mode === 'basic' && searchState.value.value ? searchState.value.value : undefined,
      aql: searchState.value.mode === 'aql' && searchState.value.value ? searchState.value.value : undefined,
      scopeStatus: filterScope.value.length ? filterScope.value : undefined,
      protocol: filterProtocol.value.length === 1 ? filterProtocol.value[0] : undefined,
      sortBy: sortCol.value ?? undefined,
      sortDir: sortDir.value ?? undefined,
      page: page.value,
      size: PAGE_SIZE,
    });
    assets.value = res.items;
    total.value = res.total;
    totalPages.value = res.totalPages;

    // Fetch aggregate visibility + owning host for any service-type asset in this page.
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
  } catch { /* silent */ } finally {
    loading.value = false;
  }
}

async function loadTypeCounts() {
  const counts: Record<string, number> = {};
  await Promise.all(
    ASSET_TYPES.map(async (t) => {
      try {
        const r = await assetsApi.list({ projectId: engId.value, type: t, size: 1 });
        if (r.total > 0) counts[t] = r.total;
      } catch { /* silent */ }
    })
  );
  typeCounts.value = counts;
}

watch(page, load);
watch(filterScope,    () => { if (page.value === 0) load(); else page.value = 0; });
watch(filterProtocol, () => { if (page.value === 0) load(); else page.value = 0; });

// ── Graph ──────────────────────────────────────────────────────────────────
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
    // Relationships first so edges are ready when the first batch of nodes appears.
    graphRelationships.value = await assetsApi.listProjectRelationships(engId.value);

    let firstPage = true;
    await assetsApi.listAll({ projectId: engId.value }, (items, loaded, total) => {
      graphLoadTotal.value  = total;
      graphLoadCount.value  = loaded;
      graphAssets.value     = [...graphAssets.value, ...items];
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

// ── Override dialog ────────────────────────────────────────────────────────
const overrideDialog = ref(false);
const overrideAsset  = ref<Asset | null>(null);   // single-asset mode
const overrideBulk   = ref<Asset[] | null>(null); // bulk mode (null when single)
const overrideStatus = ref<string>('indeterminate');
const overrideSaving = ref(false);

const SCOPE_OPTIONS = [
  { label: 'In scope',     value: 'in_scope'     },
  { label: 'Out of scope', value: 'out_of_scope'  },
  { label: 'Indeterminate', value: 'indeterminate' },
];

function openOverride(asset: Asset, event: Event) {
  event.stopPropagation();
  overrideAsset.value  = asset;
  overrideBulk.value   = null;
  overrideStatus.value = scopeOf(asset.id).status;
  overrideDialog.value = true;
}

function openBulkOverride() {
  if (!selectedAssets.value.length) return;
  overrideAsset.value  = null;
  overrideBulk.value   = [...selectedAssets.value];
  overrideStatus.value = 'in_scope';
  overrideDialog.value = true;
}

async function saveOverride() {
  overrideSaving.value = true;
  try {
    // Bulk path
    if (overrideBulk.value && overrideBulk.value.length) {
      let ok = 0;
      let fail = 0;
      for (const a of overrideBulk.value) {
        try {
          const r = await projectsApi.setScopeOverride(engId.value, a.id, overrideStatus.value);
          scopeMap.value[String(a.id)] = r as ScopeEntry;
          ok++;
        } catch {
          fail++;
        }
      }
      overrideDialog.value = false;
      overrideBulk.value = null;
      selectedIds.value = [];
      toast.add({
        severity: fail ? 'warn' : 'success',
        summary: fail
          ? `Updated ${ok} of ${ok + fail} assets`
          : `Scope updated for ${ok} asset${ok === 1 ? '' : 's'}`,
        life: 4000,
      });
      return;
    }

    // Single-asset path
    if (!overrideAsset.value) return;
    const result = await projectsApi.setScopeOverride(engId.value, overrideAsset.value.id, overrideStatus.value);
    scopeMap.value[String(overrideAsset.value.id)] = result as ScopeEntry;
    overrideDialog.value = false;
  } finally {
    overrideSaving.value = false;
  }
}

function scopeLabel(status: string): string {
  switch (status) {
    case 'in_scope':     return 'In scope';
    case 'out_of_scope': return 'Out of scope';
    case 'third_party':  return '3rd party';
    default:             return 'Indeterminate';
  }
}

async function clearOverride(asset: Asset, event: Event) {
  event.stopPropagation();
  await projectsApi.clearScopeOverride(engId.value, asset.id);
  triggerClassify();
}

// ── Reclassify scope ───────────────────────────────────────────────────────
const reclassifying = ref(false);
let classifyPoll: ReturnType<typeof setInterval> | undefined;

function startClassifyPoll() {
  if (classifyPoll) return;
  classifyPoll = setInterval(async () => {
    try {
      const { running } = await projectsApi.classifyScopeStatus(engId.value);
      if (!running) {
        clearInterval(classifyPoll);
        classifyPoll = undefined;
        reclassifying.value = false;
        await loadScopeStatuses();
      }
    } catch {
      clearInterval(classifyPoll);
      classifyPoll = undefined;
      reclassifying.value = false;
    }
  }, 2000);
}

async function triggerClassify() {
  try {
    await projectsApi.classifyScope(engId.value);
    reclassifying.value = true;
    startClassifyPoll();
  } catch { /* silent */ }
}

async function reclassify() {
  try {
    await projectsApi.classifyScope(engId.value);
    reclassifying.value = true;
    startClassifyPoll();
    toast.add({ severity: 'info', summary: 'Reclassification started', detail: 'Running in background. Scope will update when done.', life: 3500 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

// ── Add asset manually ─────────────────────────────────────────────────────
const showAddDialog  = ref(false);
const showTagManager = ref(false);
const addType        = ref<string>(ASSET_TYPES[0]);
const addIdentifier  = ref('');
const addNetworkName = ref('');
const addHostHostname = ref('');
const addHostSubtype  = ref('unknown');
const addSvcHost      = ref('');
const addSvcPort      = ref('');
const addSvcProtocol  = ref('tcp');
const addSaving      = ref(false);

const ADD_ASSET_TYPES = ASSET_TYPES.map((t) => ({ label: ASSET_TYPE_LABELS[t], value: t }));
const ADD_PROTOCOL_OPTIONS = ['tcp', 'udp'];
const ADD_SUBTYPE_OPTIONS = HOST_SUBTYPES.map((s) => ({ label: HOST_SUBTYPE_LABELS[s], value: s }));
const isAddNetworkType = computed(() => addType.value === 'network');
const isAddHostType    = computed(() => addType.value === 'host');
const isAddServiceType = computed(() => addType.value === 'service');
const canSubmitAddAsset = computed(() => {
  if (isAddServiceType.value) return !!addSvcHost.value.trim() && !!addSvcPort.value.trim();
  return !!addIdentifier.value.trim();
});

function resetAddForm() {
  addType.value = ASSET_TYPES[0];
  addIdentifier.value = '';
  addNetworkName.value = '';
  addHostHostname.value = '';
  addHostSubtype.value = 'unknown';
  addSvcHost.value = '';
  addSvcPort.value = '';
  addSvcProtocol.value = 'tcp';
}

async function doAddAsset() {
  if (!canSubmitAddAsset.value) return;
  addSaving.value = true;
  try {
    let identifier = addIdentifier.value.trim();
    let metadata: Record<string, unknown> | undefined;
    if (isAddNetworkType.value && addNetworkName.value.trim()) {
      metadata = { name: addNetworkName.value.trim() };
    } else if (isAddServiceType.value) {
      const port = addSvcPort.value.trim();
      identifier = `${addSvcHost.value.trim()}:${port}/${addSvcProtocol.value}`;
      metadata = { port: Number(port), protocol: addSvcProtocol.value };
    }
    const result = await projectsApi.addAssetManually(
      engId.value, addType.value, identifier, metadata,
      isAddHostType.value ? addHostSubtype.value : undefined,
      isAddHostType.value && addHostHostname.value.trim() ? [addHostHostname.value.trim()] : undefined,
    );
    toast.add({
      severity: 'success',
      summary: result.created ? 'Asset created' : 'Asset linked',
      detail: result.created
        ? `New ${ASSET_TYPE_LABELS[result.type]} "${result.identifier}" added to project.`
        : `Existing ${ASSET_TYPE_LABELS[result.type]} "${result.identifier}" (${result.code}) linked from inventory.`,
      life: 5000,
    });
    showAddDialog.value = false;
    resetAddForm();
    await Promise.all([load(), loadTypeCounts()]);
    if (viewMode.value === 'graph') await loadGraph();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    addSaving.value = false;
  }
}

// ── Hide asset ─────────────────────────────────────────────────────────────
const hideDialog  = ref(false);
const pendingHide = ref<Asset | null>(null);
const hideLoading = ref(false);

function confirmHide(asset: Asset, event?: Event) {
  event?.stopPropagation();
  pendingHide.value = asset;
  hideDialog.value  = true;
}

async function doHide() {
  if (!pendingHide.value) return;
  hideLoading.value = true;
  try {
    await projectsApi.removeAsset(engId.value, pendingHide.value.id);
    const id = pendingHide.value.id;
    assets.value      = assets.value.filter((a) => a.id !== id);
    graphAssets.value = graphAssets.value.filter((a) => a.id !== id);
    total.value       = Math.max(0, total.value - 1);
    const type = pendingHide.value.type;
    if (typeCounts.value[type]) typeCounts.value[type]--;
    hideDialog.value  = false;
    pendingHide.value = null;
  } finally {
    hideLoading.value = false;
  }
}

async function confirmHideRelationship(rel: AssetRelationship) {
  const ok = await confirmDialog({
    header: 'Hide relationship',
    message: 'Hide this relationship from the project graph? It remains visible in other projects.',
    acceptLabel: 'Hide',
    acceptSeverity: 'warn',
    acceptIcon: 'pi pi-eye-slash',
  });
  if (!ok) return;
  await projectsApi.hideRelationship(engId.value, rel.fromAssetId, rel.toAssetId, rel.type);
  graphRelationships.value = graphRelationships.value.filter(
    (r) => !(r.fromAssetId === rel.fromAssetId && r.toAssetId === rel.toAssetId && r.type === rel.type)
  );
}

// ── Merge assets ───────────────────────────────────────────────────────────
const showMergeDialog = ref(false);
const mergeSource = ref<Asset | null>(null);
const mergeTarget = ref<Asset | null>(null);

// ── List flow: checkboxes ──────────────────────────────────────────────────
const selectedIds = ref<number[]>([]);

const selectedAssets = computed(() =>
  selectedIds.value.map((id) => assets.value.find((a) => a.id === id)).filter(Boolean) as Asset[]
);

const canMerge = computed(() =>
  selectedAssets.value.length === 2 &&
  selectedAssets.value[0].type === selectedAssets.value[1].type
);

function toggleSelect(id: number, e: Event) {
  e.stopPropagation();
  const idx = selectedIds.value.indexOf(id);
  if (idx === -1) selectedIds.value = [...selectedIds.value, id];
  else selectedIds.value = selectedIds.value.filter((x) => x !== id);
}

function openListMerge() {
  if (!canMerge.value) return;
  mergeSource.value = selectedAssets.value[0];
  mergeTarget.value = selectedAssets.value[1];
  showMergeDialog.value = true;
}

// ── Graph flow: pick the target directly in the graph (see AssetGraph's merge mode) ──
function onGraphMerge(source: Asset, target: Asset) {
  mergeSource.value = source;
  mergeTarget.value = target;
  showMergeDialog.value = true;
}

// ── Shared: after merge completes ─────────────────────────────────────────
function onMerged(_surviving: Asset) {
  showMergeDialog.value = false;
  mergeSource.value = null;
  mergeTarget.value = null;
  selectedIds.value = [];
  load();
  loadTypeCounts();
  if (viewMode.value === 'graph') loadGraph();
}

onMounted(async () => {
  try {
    const eng = await projectsApi.get(engId.value);
    if (eng) {
      context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
    }
  } catch { /* silent */ }
  await Promise.all([load(), loadTypeCounts(), loadScopeStatuses()]);
  try {
    const { running } = await projectsApi.classifyScopeStatus(engId.value);
    if (running) { reclassifying.value = true; startClassifyPoll(); }
  } catch { /* silent */ }
});

onUnmounted(() => {
  if (classifyPoll) { clearInterval(classifyPoll); classifyPoll = undefined; }
});
</script>

<template>
  <div>
    <Toast />

    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <div class="ares-page-header" style="margin-bottom:1.25rem;">
      <div>
        <h2 class="ares-page-title">Assets</h2>
        <p class="ares-page-subtitle">Assets discovered or linked to this project's organization.</p>
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <div v-if="!auth.isClient" class="view-toggle">
          <button class="view-toggle-btn" :class="{ active: viewMode === 'list' }" v-tooltip.top="'List'" @click="switchMode('list')">
            <i class="pi pi-list" />
          </button>
          <button class="view-toggle-btn" :class="{ active: viewMode === 'graph' }" v-tooltip.top="'Graph'" @click="switchMode('graph')">
            <i class="pi pi-share-alt" />
          </button>
        </div>
        <template v-if="!auth.isClient">
          <Button icon="pi pi-refresh" text size="small" severity="secondary"
            :loading="reclassifying" v-tooltip.top="'Recalculate scope'" @click="reclassify()" />
          <Button icon="pi pi-tag" text size="small" severity="secondary" v-tooltip.top="'Manage tags'" @click="showTagManager = true" />
          <Button icon="pi pi-plus" text size="small" severity="secondary"
            v-tooltip.top="'Add asset'" @click="showAddDialog = true" />
          <Button icon="pi pi-upload" text size="small"
            v-tooltip.top="'Import'" @click="router.push({ name: 'org-project-imports', params: { orgId: orgId, engId: engId } })" />
        </template>
      </div>
    </div>

    <!-- ── Type filter pills (list mode only) ────────────────────────── -->
    <div v-if="viewMode === 'list'" style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.75rem; align-items:center;">
      <button class="type-pill" :class="{ 'type-pill--active': typeFilter === null }" @click="setType(null)">
        All <span class="type-pill-count">{{ total }}</span>
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
        <ToggleSwitch :model-value="!hideThirdParty" @update:model-value="hideThirdParty = !$event" />
        3rd Party
      </label>
    </div>

    <!-- ── Search box (list mode only) ───────────────────────────────── -->
    <div v-if="viewMode === 'list'" style="margin-bottom:1.25rem;">
      <QueryBar entity="asset" placeholder="Search by identifier, name…" :project-id="engId" :organization-id="orgId" :initial-aql="typeof route.query.aql === 'string' ? route.query.aql : undefined" @search="onSearch" />
    </div>

    <!-- ── Graph ───────────────────────────────────────────────────────── -->
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
          :scope-statuses="scopeMap"
          :allow-hide="true"
          :allow-hide-relationship="true"
          @node-click="(a) => router.push({ name: 'org-project-asset-detail', params: { orgId: orgId, engId: engId, id: a.id } })"
          @node-hide="confirmHide"
          @node-merge="onGraphMerge"
          @edge-hide="confirmHideRelationship"
        />
      </template>
    </template>

    <!-- ── List ────────────────────────────────────────────────────────── -->
    <template v-else>
      <AresLoadingState v-if="loading" />
      <template v-else>
        <div class="ares-card" style="padding:0;">
          <table class="ares-table ares-table--clickable">
            <thead>
              <tr>
                <th v-if="!auth.isClient" style="width:36px; padding:0 0 0 12px;"></th>
                <th v-if="typeFilter === null" style="width:140px;">
                  <ColumnHeader label="Type" :sortable="true"
                    :sort-dir="sortCol === 'type' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    @update:sort-dir="onSort('type', $event)" />
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
                <th v-if="typeFilter === 'web_endpoint'" style="width:260px;">
                  <ColumnHeader label="Application" :sortable="true"
                    :sort-dir="sortCol === 'application' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    @update:sort-dir="onSort('application', $event)" />
                </th>
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
                <th style="width:110px;">
                  <ColumnHeader label="Scope" :sortable="true"
                    :sort-dir="sortCol === 'scope' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    :filter-options="scopeOptions"
                    :filter-value="filterScope"
                    @update:sort-dir="onSort('scope', $event)"
                    @update:filter-value="filterScope = $event" />
                </th>
                <th style="width:160px;">Tags</th>
                <th style="width:150px;">
                  <ColumnHeader label="Code" :sortable="true"
                    :sort-dir="sortCol === 'code' ? sortDir : null"
                    sort-asc-label="A → Z" sort-desc-label="Z → A"
                    @update:sort-dir="onSort('code', $event)" />
                </th>
                <th style="width:110px;">
                  <ColumnHeader label="Discovered" :sortable="true"
                    :sort-dir="sortCol === 'createdAt' ? sortDir : null"
                    sort-asc-label="Oldest first" sort-desc-label="Newest first"
                    @update:sort-dir="onSort('createdAt', $event)" />
                </th>
                <th v-if="!auth.isClient" style="width:48px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in processedAssets" :key="a.id"
                :class="{ 'row--selected': selectedIds.includes(a.id) }"
                @click="router.push({ name: 'org-project-asset-detail', params: { orgId: orgId, engId: engId, id: a.id } })">
                <td v-if="!auth.isClient" style="padding:0 0 0 12px;" @click.stop>
                  <input type="checkbox" class="row-check"
                    :checked="selectedIds.includes(a.id)"
                    @change="toggleSelect(a.id, $event)" />
                </td>
                <td v-if="typeFilter === null">
                  <span class="type-badge">
                    {{ ASSET_TYPE_LABELS[a.type] ?? a.type }}
                  </span>
                </td>
                <td v-if="!isServiceFilter" style="font-family:monospace; font-size:0.82rem;">
                  <template v-if="a.type === 'web_endpoint'">{{ endpointPath(a.identifier) }}</template>
                  <template v-else>{{ a.identifier }}</template>
                </td>
                <td v-if="showSubtypeColumn" style="font-size:0.82rem;">
                  {{ subtypeOf(a) ?? '—' }}
                </td>
                <td v-if="typeFilter === 'web_endpoint'" style="font-size:0.8rem; color:var(--ares-text-muted); font-family:monospace;">
                  {{ endpointApp(a.identifier) }}
                </td>

                <!-- IP (services only) -->
                <td v-if="isServiceFilter" style="font-family:monospace; font-size:0.82rem;">
                  {{ ipOf(a.identifier) ?? '—' }}
                </td>

                <!-- Port (services only) -->
                <td v-if="isServiceFilter" style="font-family:monospace; font-size:0.82rem; text-align:right;">
                  {{ portOf(a.identifier) ?? '—' }}
                </td>

                <!-- Host (services only) — links to the owning host asset -->
                <td v-if="isServiceFilter" @click.stop>
                  <a
                    v-if="serviceHosts[a.id]"
                    :href="`#/orgs/${orgId}/projects/${engId}/assets/${serviceHosts[a.id].hostId}`"
                    @click.prevent="router.push({
                      name: 'org-project-asset-detail',
                      params: { orgId: orgId, engId: engId, id: serviceHosts[a.id].hostId },
                    })"
                    style="color:var(--p-primary-400); text-decoration:none; font-size:0.85rem;"
                  >
                    {{ serviceHosts[a.id].hostIdentifier }}
                  </a>
                  <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
                </td>

                <!-- Protocol (services only) -->
                <td v-if="isServiceFilter">
                  <span v-if="protocolOf(a.identifier)" class="proto-tag">
                    {{ protocolOf(a.identifier) }}
                  </span>
                  <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
                </td>

                <!-- Aggregate visibility (services only) -->
                <td v-if="isServiceFilter" @click.stop>
                  <AresBadge
                    v-if="aggregateVisibility[a.id]"
                    :value="aggregateVisibility[a.id]"
                    :severity="visibilitySeverity(aggregateVisibility[a.id])"
                  />
                  <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
                </td>

                <!-- Scope status column -->
                <td @click.stop>
                  <div style="display:flex; align-items:center; gap:0.35rem;">
                    <span
                      :class="['scope-badge', `scope-badge--${scopeOf(a.id).status}`]"
                      v-tooltip="auth.isClient ? undefined : (scopeOf(a.id).override ? 'Manual override — click to change' : 'Auto-classified — click to override')"
                      :style="auth.isClient ? { cursor: 'default' } : undefined"
                      @click="!auth.isClient && openOverride(a, $event)"
                    >
                      <i v-if="scopeOf(a.id).override" class="pi pi-pencil" style="font-size:0.58rem; opacity:0.75;" />
                      {{ scopeLabel(scopeOf(a.id).status) }}
                    </span>
                    <button
                      v-if="scopeOf(a.id).override && !auth.isClient"
                      class="scope-clear-btn"
                      v-tooltip="'Clear override — let classifier decide'"
                      @click="clearOverride(a, $event)"
                    >
                      <i class="pi pi-times" style="font-size:0.6rem;" />
                    </button>
                  </div>
                </td>

                <td @click.stop>
                  <TagChipList :tags="a.tags" />
                </td>
                <td style="font-size:0.72rem; color:var(--ares-text-muted);">{{ a.code }}</td>
                <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ new Date(a.createdAt).toLocaleDateString() }}</td>
                <td v-if="!auth.isClient" @click.stop>
                  <Button
                    icon="pi pi-eye-slash"
                    text
                    severity="secondary"
                    size="small"
                    v-tooltip.left="'Hide from project'"
                    @click="confirmHide(a, $event)"
                  />
                </td>
              </tr>
              <tr v-if="!processedAssets.length">
                <td :colspan="emptyColspan" class="ares-table-empty">No assets yet. Import scan results to discover assets.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
      </template>
    </template>

    <!-- ── Add asset manually dialog ────────────────────────────────── -->
    <Dialog v-model:visible="showAddDialog" header="Add asset" modal style="width:min(480px,96vw);"
      :pt="{ content: { style: 'padding:1.25rem' } }">
      <form @submit.prevent="doAddAsset" style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label class="add-dlg-label">Type</label>
          <Select
            v-model="addType"
            :options="ADD_ASSET_TYPES"
            option-label="label"
            option-value="value"
            style="width:100%;"
          />
        </div>
        <!-- Service: structured host/port/protocol instead of a free-text identifier -->
        <template v-if="isAddServiceType">
          <div>
            <label class="add-dlg-label">Host / IP</label>
            <InputText v-model="addSvcHost" style="width:100%;" placeholder="e.g. 192.168.1.1" autofocus />
          </div>
          <div style="display:flex; gap:0.75rem;">
            <div style="flex:1;">
              <label class="add-dlg-label">Port</label>
              <InputText v-model="addSvcPort" style="width:100%;" placeholder="e.g. 443" />
            </div>
            <div style="flex:1;">
              <label class="add-dlg-label">Protocol</label>
              <Select v-model="addSvcProtocol" :options="ADD_PROTOCOL_OPTIONS" style="width:100%;" />
            </div>
          </div>
          <p v-if="addSvcHost.trim() && addSvcPort.trim()" class="add-dlg-hint">
            Will be created as <code>{{ addSvcHost.trim() }}:{{ addSvcPort.trim() }}/{{ addSvcProtocol }}</code>
          </p>
        </template>

        <!-- Every other type: a single identifier field (CIDR copy for networks) -->
        <div v-else>
          <label class="add-dlg-label">{{ isAddNetworkType ? 'CIDR' : 'Identifier' }}</label>
          <InputText
            v-model="addIdentifier"
            style="width:100%; font-family:monospace;"
            :placeholder="isAddNetworkType ? 'e.g. 192.168.1.0/24' : 'e.g. example.com, 192.168.1.1, https://app.example.com'"
            autofocus
          />
          <p class="add-dlg-hint">
            If an asset with this type and identifier already exists in the organization inventory,
            it will be linked directly instead of creating a duplicate.
          </p>
        </div>

        <!-- Network: optional description -->
        <div v-if="isAddNetworkType">
          <label class="add-dlg-label">Description <span class="add-dlg-optional">(optional)</span></label>
          <InputText v-model="addNetworkName" style="width:100%;" placeholder="e.g. Office LAN, DMZ, Management" />
        </div>

        <!-- Host: optional subtype/hostname (add more hostnames later on the asset detail page) -->
        <template v-if="isAddHostType">
          <div>
            <label class="add-dlg-label">Subtype</label>
            <Select v-model="addHostSubtype" :options="ADD_SUBTYPE_OPTIONS" option-label="label" option-value="value" style="width:100%;" />
          </div>
          <div>
            <label class="add-dlg-label">Hostname <span class="add-dlg-optional">(optional)</span></label>
            <InputText v-model="addHostHostname" style="width:100%;" placeholder="e.g. web01.internal" />
          </div>
        </template>

        <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
          <Button type="button" label="Cancel" severity="secondary" size="small" @click="showAddDialog = false; resetAddForm();" />
          <Button type="submit" icon="pi pi-plus" label="Add" size="small"
            :loading="addSaving" :disabled="!canSubmitAddAsset" />
        </div>
      </form>
    </Dialog>

    <!-- ── Hide confirmation dialog ──────────────────────────────────── -->
    <Dialog v-model:visible="hideDialog" header="Hide asset" modal style="width:24rem;">
      <p style="color:var(--ares-text-2); margin-bottom:1rem; font-size:0.88rem;">
        Hide <strong style="font-family:monospace; color:var(--ares-accent);">{{ pendingHide?.identifier }}</strong>
        from this project? The asset remains in the organization and can be re-added later.
      </p>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" size="small" @click="hideDialog = false" />
        <Button label="Hide" severity="warn" size="small" icon="pi pi-eye-slash" :loading="hideLoading" @click="doHide" />
      </div>
    </Dialog>

    <!-- ── Override dialog (single or bulk) ───────────────────────────── -->
    <Dialog v-model:visible="overrideDialog"
      :header="overrideBulk ? 'Set scope for ' + overrideBulk.length + ' assets' : 'Override scope status'"
      modal style="width:26rem;">
      <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem;">
        <p v-if="overrideBulk" style="font-size:0.85rem; color:var(--ares-text-muted); margin:0;">
          Apply this scope override to <strong>{{ overrideBulk.length }}</strong> selected
          asset{{ overrideBulk.length === 1 ? '' : 's' }}. The automatic classifier will not
          overwrite this until you clear the override.
        </p>
        <p v-else style="font-size:0.85rem; color:var(--ares-text-muted); margin:0;">
          Manually set scope for <strong style="color:var(--ares-text-2); font-family:monospace;">{{ overrideAsset?.identifier }}</strong>.
          The automatic classifier will not overwrite this until you clear the override.
        </p>
        <Select v-model="overrideStatus" :options="SCOPE_OPTIONS" option-label="label" option-value="value" class="w-full" />
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" size="small" @click="overrideDialog = false" />
          <Button :label="overrideBulk ? 'Apply to selected' : 'Save override'" size="small"
            :loading="overrideSaving" @click="saveOverride" />
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
      @changed="load"
    />

    <!-- ── Bulk action bar ───────────────────────────────────────────── -->
    <Transition name="bulk-bar">
      <div v-if="selectedIds.length > 0" class="bulk-bar">
        <span class="bulk-bar__count">{{ selectedIds.length }} selected</span>
        <Button
          icon="pi pi-flag"
          label="Set scope"
          size="small"
          severity="secondary"
          @click="openBulkOverride"
        />
        <Button
          v-if="canMerge"
          icon="pi pi-arrows-h"
          label="Merge"
          size="small"
          @click="openListMerge"
        />
        <span v-else-if="selectedIds.length === 2" style="font-size:0.75rem; color:var(--ares-text-muted);">
          Different types — can't merge
        </span>
        <Button label="Clear" severity="secondary" size="small" @click="selectedIds = []" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.row-check {
  width: 15px; height: 15px; cursor: pointer; accent-color: var(--ares-accent);
}
:deep(.row--selected) td { background: color-mix(in srgb, var(--ares-accent) 7%, transparent) !important; }

.bulk-bar {
  position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 0.6rem;
  background: var(--ares-surface-raised); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.5rem 0.9rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 500;
}
.bulk-bar__count {
  font-size: 0.83rem; font-weight: 600; color: var(--ares-text-1);
  white-space: nowrap; padding-right: 0.3rem;
}
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.18s, transform 0.18s; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }

.add-dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.add-dlg-optional { font-weight: 400; opacity: 0.6; }
.add-dlg-hint {
  font-size: 0.75rem;
  color: var(--ares-text-muted);
  margin: 0.35rem 0 0;
}
.add-dlg-hint code {
  background: var(--ares-surface-sunken, rgba(0,0,0,0.15));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.05em 0.4em;
  color: var(--ares-accent);
}

.view-toggle { display:flex; border:1px solid var(--ares-border); border-radius: var(--ares-radius); overflow:hidden; }
.view-toggle-btn {
  width:34px; height:32px; display:flex; align-items:center; justify-content:center;
  background:var(--ares-surface); border:none; color:var(--ares-text-muted);
  cursor:pointer; transition:background 0.15s, color 0.15s; font-size:0.85rem;
}
.view-toggle-btn:hover { background:var(--ares-surface-2); color:var(--ares-text); }
.view-toggle-btn.active { background:var(--ares-accent-bg); color:#fff; }

.type-pill {
  display:inline-flex; align-items:center; gap:0.35rem; padding:0.25rem 0.65rem;
  border-radius: var(--ares-radius); border:1px solid var(--ares-border); background:var(--ares-surface);
  color:var(--ares-text-muted); font-size:0.75rem; font-family:inherit; cursor:pointer;
  transition:background 0.15s, color 0.15s, border-color 0.15s;
}
.type-pill:hover { background:var(--ares-surface-2); color:var(--ares-text); }
.type-pill--active { background:var(--ares-accent-bg); border-color:transparent; color:#fff; }
.type-pill-count {
  background:rgba(255,255,255,0.15); border-radius: var(--ares-radius); padding:0 0.4em;
  font-size:0.7em; font-weight:700;
}

.type-badge { display:inline-flex; align-items:center; gap:0.35rem; font-size:0.78rem; color:var(--ares-text-2); }

/* ── Scope badges ─────────────────────────────────────────────────────────── */
.scope-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15em 0.55em;
  border-radius: var(--ares-radius);
  cursor: pointer;
  transition: opacity 0.12s;
  white-space: nowrap;
  border: 1px solid transparent;
}
.scope-badge:hover { opacity: 0.75; }

.scope-badge--in_scope {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #4ade80;
  border-color: color-mix(in srgb, #22c55e 30%, transparent);
}
.scope-badge--out_of_scope {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #f87171;
  border-color: color-mix(in srgb, #ef4444 30%, transparent);
}
.scope-badge--indeterminate {
  background: color-mix(in srgb, #6b7280 15%, transparent);
  color: #9ca3af;
  border-color: color-mix(in srgb, #6b7280 25%, transparent);
}
.scope-badge--third_party {
  background: color-mix(in srgb, #38bdf8 15%, transparent);
  color: #38bdf8;
  border-color: color-mix(in srgb, #38bdf8 35%, transparent);
}

.scope-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--ares-border);
  background: var(--ares-surface);
  color: var(--ares-text-muted);
  cursor: pointer;
  padding: 0;
  transition: background 0.12s, color 0.12s;
}
.scope-clear-btn:hover { background: color-mix(in srgb, #ef4444 20%, transparent); color: #f87171; }

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

</style>
