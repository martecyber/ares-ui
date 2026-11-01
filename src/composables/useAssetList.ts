import { computed, ref, watch } from 'vue';
import {
  assetsApi, ASSET_TYPE_LABELS,
  HOST_SUBTYPES, HOST_SUBTYPE_LABELS, INTERFACE_TYPES, INTERFACE_TYPE_LABELS,
  type Asset, type AssetRelationship, type ServiceVisibilityState, type ServiceHostInfo,
} from '@/api/assets';

// ── Identifier helpers (SERVICE identifiers are "ip:port/proto") ──────────────

export function protocolOf(identifier: string): string | null {
  const slash = identifier.lastIndexOf('/');
  if (slash < 0) return null;
  return identifier.substring(slash + 1).toUpperCase();
}

function splitHostPort(identifier: string): [string, string] | null {
  const slash = identifier.lastIndexOf('/');
  const head  = slash < 0 ? identifier : identifier.substring(0, slash);
  const colon = head.lastIndexOf(':');
  if (colon < 0) return null;
  return [head.substring(0, colon), head.substring(colon + 1)];
}

export function ipOf(identifier: string): string | null {
  return splitHostPort(identifier)?.[0] ?? null;
}

export function portOf(identifier: string): string | null {
  return splitHostPort(identifier)?.[1] ?? null;
}

export function endpointPath(identifier: string): string {
  try { return new URL(identifier).pathname || '/'; } catch { return identifier; }
}

export function endpointApp(identifier: string): string {
  try { return new URL(identifier).origin; } catch { return ''; }
}

/** User-facing label: the display name when set, otherwise the identifier. */
export function assetLabel(asset: { displayName?: string | null; identifier: string }): string {
  return asset.displayName?.trim() || asset.identifier;
}

/** host → hostSubtype, ip → IPv4/IPv6, interface → metadata.interfaceType. */
export function subtypeOf(asset: Asset): string | null {
  if (asset.type === 'host') {
    return asset.hostSubtype ? (HOST_SUBTYPE_LABELS[asset.hostSubtype] ?? asset.hostSubtype) : null;
  }
  if (asset.type === 'ip') return asset.identifier.includes(':') ? 'IPv6' : 'IPv4';
  if (asset.type === 'interface') {
    try {
      const t = JSON.parse(asset.metadata ?? '{}').interfaceType as string | undefined;
      return t ? (INTERFACE_TYPE_LABELS[t] ?? t) : null;
    } catch { return null; }
  }
  return null;
}

export function visibilitySeverity(s: ServiceVisibilityState): 'success' | 'warn' | 'secondary' {
  switch (s) {
    case 'OPEN':     return 'success';
    case 'FILTERED': return 'warn';
    case 'CLOSED':   return 'secondary';
  }
}

export const SUBTYPE_TYPES = new Set(['host', 'ip', 'interface']);

export const SUBTYPE_FILTER_OPTIONS = [
  ...HOST_SUBTYPES.map((s) => ({ label: `Host: ${HOST_SUBTYPE_LABELS[s]}`, value: HOST_SUBTYPE_LABELS[s] })),
  { label: 'IP: IPv4', value: 'IPv4' },
  { label: 'IP: IPv6', value: 'IPv6' },
  ...INTERFACE_TYPES.map((t) => ({ label: `Interface: ${INTERFACE_TYPE_LABELS[t]}`, value: INTERFACE_TYPE_LABELS[t] })),
];

export const PROTOCOL_FILTER_OPTIONS = [
  { label: 'TCP', value: 'tcp' },
  { label: 'UDP', value: 'udp' },
];

export const VISIBILITY_FILTER_OPTIONS = [
  { label: 'Open',     value: 'OPEN' },
  { label: 'Filtered', value: 'FILTERED' },
  { label: 'Closed',   value: 'CLOSED' },
];

// ── Composable ───────────────────────────────────────────────────────────────

type ListParams = Parameters<typeof assetsApi.list>[0];
export type AssetViewMode = 'list' | 'graph';

export interface AssetListConfig {
  /** `{ organizationId }` or `{ projectId }` — used for list, type counts and graph. */
  scope: () => { organizationId?: number; projectId?: number };
  loadRelationships: () => Promise<AssetRelationship[]>;
  /** Extra server-side list params owned by the view (e.g. project scopeStatus filter). */
  extraListParams?: () => ListParams;
  extraServerSortCols?: string[];
  /** Used by the "3rd Party" toggle. */
  isThirdParty: (a: Asset) => boolean;
}

const PAGE_SIZE = 50;
const BASE_SERVER_SORT_COLS = ['identifier', 'type', 'code', 'createdAt'];

export function useAssetList(config: AssetListConfig) {
  const viewMode = ref<AssetViewMode>('list');

  // ── List + filters ─────────────────────────────────────────────────────────
  const items      = ref<Asset[]>([]);
  const loading    = ref(true);
  const page       = ref(0);
  const totalPages = ref(0);
  const total      = ref(0);
  const typeCounts = ref<Record<string, number>>({});

  const typeFilter       = ref<string | null>(null);
  const searchState      = ref<{ mode: 'basic' | 'aql'; value: string }>({ mode: 'basic', value: '' });
  const sortCol          = ref<string | null>(null);
  const sortDir          = ref<'asc' | 'desc' | null>(null);
  const filterType       = ref<string[]>([]);
  const filterProtocol   = ref<string[]>([]);
  const filterVisibility = ref<string[]>([]);
  // Subtype stays client-side: it spans three representations (Asset.hostSubtype, a derived
  // IPv4/IPv6 split with no backing column, and metadata->>'interfaceType').
  const filterSubtype    = ref<string[]>([]);
  const showThirdParty   = ref(true);

  const aggregateVisibility = ref<Record<number, ServiceVisibilityState>>({});
  const serviceHosts        = ref<Record<number, ServiceHostInfo>>({});

  const isServiceFilter   = computed(() => typeFilter.value === 'service');
  const showSubtypeColumn = computed(() => SUBTYPE_TYPES.has(typeFilter.value ?? ''));
  const allCount          = computed(() => Object.values(typeCounts.value).reduce((s, n) => s + n, 0));
  const typeFilterOptions = computed(() =>
    Object.keys(typeCounts.value).sort().map((t) => ({ label: ASSET_TYPE_LABELS[t] ?? t, value: t })),
  );

  const serverSortCols = new Set([...BASE_SERVER_SORT_COLS, ...(config.extraServerSortCols ?? [])]);

  async function loadList() {
    loading.value = true;
    try {
      const search = searchState.value;
      const res = await assetsApi.list({
        ...config.scope(),
        ...config.extraListParams?.(),
        type: typeFilter.value ?? undefined,
        q:   search.mode === 'basic' && search.value ? search.value : undefined,
        aql: search.mode === 'aql'   && search.value ? search.value : undefined,
        protocol:   filterProtocol.value.length === 1 ? filterProtocol.value[0] : undefined,
        types:      filterType.value.length ? filterType.value : undefined,
        visibility: filterVisibility.value.length ? filterVisibility.value : undefined,
        sortBy:  sortCol.value ?? undefined,
        sortDir: sortDir.value ?? undefined,
        page: page.value,
        size: PAGE_SIZE,
      });
      items.value      = res.items;
      total.value      = res.total;
      totalPages.value = res.totalPages;

      const svcIds = res.items.filter((a) => a.type === 'service').map((a) => a.id);
      if (svcIds.length) {
        try {
          const [agg, hosts] = await Promise.all([
            assetsApi.visibilityAggregates(svcIds),
            assetsApi.serviceHosts(svcIds),
          ]);
          aggregateVisibility.value = agg;
          serviceHosts.value        = hosts;
        } catch { aggregateVisibility.value = {}; serviceHosts.value = {}; }
      } else {
        aggregateVisibility.value = {};
        serviceHosts.value        = {};
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadTypeCounts() {
    try {
      typeCounts.value = await assetsApi.typeCounts(config.scope());
    } catch { /* silent — pills just stay hidden */ }
  }

  /** Resets to page 0, reloading directly if already there (watch(page) covers the other case). */
  function reloadFromFirstPage() {
    if (page.value === 0) loadList();
    else page.value = 0;
  }

  function setType(t: string | null) {
    typeFilter.value = t;
    if (viewMode.value === 'list') reloadFromFirstPage();
  }

  function onSearch(payload: { mode: 'basic' | 'aql'; value: string }) {
    searchState.value = payload;
    reloadFromFirstPage();
  }

  function onSort(col: string, dir: 'asc' | 'desc' | null) {
    sortCol.value = dir ? col : null;
    sortDir.value = dir;
    if (serverSortCols.has(col) || !dir) reloadFromFirstPage();
  }

  watch(page, loadList);
  watch([filterType, filterProtocol, filterVisibility], reloadFromFirstPage);

  function sortValue(a: Asset, col: string): string | number {
    switch (col) {
      case 'type':        return ASSET_TYPE_LABELS[a.type] ?? a.type;
      case 'identifier':  return a.identifier;
      case 'application': return endpointApp(a.identifier);
      case 'host':        return serviceHosts.value[a.id]?.hostIdentifier ?? '';
      case 'ip':          return ipOf(a.identifier) ?? '';
      case 'port':        return parseInt(portOf(a.identifier) ?? '0', 10) || 0;
      case 'protocol':    return protocolOf(a.identifier) ?? '';
      case 'subtype':     return subtypeOf(a) ?? '';
      case 'code':        return a.code;
      case 'createdAt':   return a.createdAt;
      default:            return '';
    }
  }

  // Derived columns (host, ip, port, application, subtype) sort client-side on the current page.
  const processedAssets = computed(() => {
    let data = items.value;
    if (filterSubtype.value.length) data = data.filter((a) => filterSubtype.value.includes(subtypeOf(a) ?? ''));
    if (!showThirdParty.value) data = data.filter((a) => !config.isThirdParty(a));
    const col = sortCol.value;
    if (col && sortDir.value && !serverSortCols.has(col)) {
      const dir = sortDir.value === 'asc' ? 1 : -1;
      data = [...data].sort((a, b) => {
        const va = sortValue(a, col);
        const vb = sortValue(b, col);
        if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
        return dir * String(va).localeCompare(String(vb), undefined, { numeric: true });
      });
    }
    return data;
  });

  // ── Selection ──────────────────────────────────────────────────────────────
  const selectedIds = ref<Set<number>>(new Set());

  const selectedAssets = computed(() => items.value.filter((a) => selectedIds.value.has(a.id)));
  const allVisibleSelected = computed(() =>
    processedAssets.value.length > 0 && processedAssets.value.every((a) => selectedIds.value.has(a.id)),
  );
  const canMergeSelection = computed(() =>
    selectedAssets.value.length === 2 && selectedAssets.value[0].type === selectedAssets.value[1].type,
  );

  function toggleSelect(id: number) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds.value = next;
  }

  function toggleSelectAll() {
    const next = new Set(selectedIds.value);
    const select = !allVisibleSelected.value;
    processedAssets.value.forEach((a) => (select ? next.add(a.id) : next.delete(a.id)));
    selectedIds.value = next;
  }

  function clearSelection() {
    selectedIds.value = new Set();
  }

  // ── Graph ──────────────────────────────────────────────────────────────────
  const graphAssets        = ref<Asset[]>([]);
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
      graphRelationships.value = await config.loadRelationships();
      let firstPage = true;
      await assetsApi.listAll(config.scope(), (batch, loaded, tot) => {
        graphLoadTotal.value = tot;
        graphLoadCount.value = loaded;
        graphAssets.value    = [...graphAssets.value, ...batch];
        if (firstPage) { firstPage = false; graphLoading.value = false; }
      });
    } finally {
      graphLoading.value = false;
    }
  }

  async function switchMode(mode: AssetViewMode) {
    viewMode.value = mode;
    if (mode === 'graph' && graphAssets.value.length === 0) await loadGraph();
  }

  /** Drops assets (and their edges) from both list and graph state after a delete/hide. */
  function removeLocally(ids: Iterable<number>) {
    const gone = new Set(ids);
    items.value              = items.value.filter((a) => !gone.has(a.id));
    graphAssets.value        = graphAssets.value.filter((a) => !gone.has(a.id));
    graphRelationships.value = graphRelationships.value.filter(
      (r) => !gone.has(r.fromAssetId) && !gone.has(r.toAssetId),
    );
    total.value = Math.max(0, total.value - gone.size);
    const nextSel = new Set([...selectedIds.value].filter((id) => !gone.has(id)));
    if (nextSel.size !== selectedIds.value.size) selectedIds.value = nextSel;
  }

  function removeRelationshipLocally(rel: AssetRelationship) {
    graphRelationships.value = graphRelationships.value.filter(
      (r) => !(r.fromAssetId === rel.fromAssetId && r.toAssetId === rel.toAssetId && r.type === rel.type),
    );
  }

  async function refreshAll() {
    await Promise.all([loadList(), loadTypeCounts()]);
    if (viewMode.value === 'graph') await loadGraph();
  }

  // ── Merge (list: 2 selected of the same type; graph: pick target in AssetGraph) ──
  const showMergeDialog = ref(false);
  const mergeSource     = ref<Asset | null>(null);
  const mergeTarget     = ref<Asset | null>(null);

  function openMerge(source: Asset, target: Asset) {
    mergeSource.value     = source;
    mergeTarget.value     = target;
    showMergeDialog.value = true;
  }

  function openSelectionMerge() {
    if (!canMergeSelection.value) return;
    openMerge(selectedAssets.value[0], selectedAssets.value[1]);
  }

  function onMerged() {
    showMergeDialog.value = false;
    mergeSource.value     = null;
    mergeTarget.value     = null;
    clearSelection();
    refreshAll();
  }

  // ── Manual relationship (graph: "Link to…" → pick target in AssetGraph) ──
  const showLinkDialog = ref(false);
  const linkSource     = ref<Asset | null>(null);
  const linkTarget     = ref<Asset | null>(null);

  function openLink(source: Asset, target: Asset) {
    linkSource.value     = source;
    linkTarget.value     = target;
    showLinkDialog.value = true;
  }

  /** Adds the new edge in place — no graph reload, so the layout stays put. */
  function onLinked(rel: AssetRelationship) {
    const exists = graphRelationships.value.some(
      (r) => r.fromAssetId === rel.fromAssetId && r.toAssetId === rel.toAssetId && r.type === rel.type,
    );
    if (!exists) graphRelationships.value = [...graphRelationships.value, rel];
  }

  return {
    viewMode, switchMode,
    items, loading, page, totalPages, total, typeCounts, allCount,
    typeFilter, searchState, sortCol, sortDir,
    filterType, filterProtocol, filterVisibility, filterSubtype, showThirdParty,
    typeFilterOptions, aggregateVisibility, serviceHosts, isServiceFilter, showSubtypeColumn,
    processedAssets,
    loadList, loadTypeCounts, refreshAll, setType, onSearch, onSort,
    selectedIds, selectedAssets, allVisibleSelected, canMergeSelection,
    toggleSelect, toggleSelectAll, clearSelection,
    graphAssets, graphRelationships, graphLoading, graphLoadCount, graphLoadTotal, loadGraph,
    removeLocally, removeRelationshipLocally,
    showMergeDialog, mergeSource, mergeTarget, openMerge, openSelectionMerge, onMerged,
    showLinkDialog, linkSource, linkTarget, openLink, onLinked,
  };
}

export type AssetListState = ReturnType<typeof useAssetList>;
