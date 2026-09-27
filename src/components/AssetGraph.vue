<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core, NodeSingular } from 'cytoscape';
import type { Asset, AssetRelationship } from '@/api/assets';
import { ASSET_TYPE_LABELS, ASSET_LINK_LABELS, HOST_SUBTYPE_LABELS } from '@/api/assets';

cytoscape.use(fcose as any);

const props = defineProps<{
  assets: Asset[];
  relationships: AssetRelationship[];
  orgId: number;
  scopeStatuses?: Record<string, { status: string; override: boolean }>;
  allowDelete?: boolean;
  allowHide?: boolean;
  allowDeleteRelationship?: boolean;
  allowHideRelationship?: boolean;
  /** Visually distinguishes this node (cyan ring) — e.g. the center of a neighborhood view. */
  focusAssetId?: number | null;
  /** Visually distinguishes these nodes (green ring) — e.g. currently-selected picker items. */
  selectedIds?: number[];
  /** Overrides the default near-fullscreen height; useful when embedded in a modal. */
  height?: string;
}>();

const emit = defineEmits<{
  (e: 'nodeClick',   asset: Asset): void;
  (e: 'nodeDelete',  asset: Asset): void;
  (e: 'nodeHide',    asset: Asset): void;
  (e: 'nodeMerge',   source: Asset, target: Asset): void;
  (e: 'edgeDelete',  rel: AssetRelationship): void;
  (e: 'edgeHide',    rel: AssetRelationship): void;
}>();

const container = ref<HTMLElement | null>(null);
let cy: Core | null = null;

// "sourceId:type" keys for groups that the user has expanded
const expandedGroups = ref(new Set<string>());
const hiddenTypes    = ref(new Set<string>());
const hideThirdParty = ref(false);
const hideOutOfScope = ref(false);

// Whole legend panel can be collapsed to a header-only strip to save screen space.
// Persisted in localStorage so the preference sticks across sessions.
const legendCollapsed = ref<boolean>(
  (() => { try { return localStorage.getItem('graphLegendCollapsed') === '1'; } catch { return false; } })()
);
function setLegendCollapsed(v: boolean) {
  legendCollapsed.value = v;
  try { localStorage.setItem('graphLegendCollapsed', v ? '1' : '0'); } catch { /* ignore */ }
}

// Auto-collapse: when ON, sibling groups larger than COLLAPSE_LIMIT are folded into
// a single "N×" proxy node (faster layout, fewer nodes on screen). When OFF, every
// node is rendered individually — slower on huge graphs but nothing is hidden.
// Persisted in localStorage so the user's preference sticks across sessions.
const COLLAPSE_LIMIT = 10;
const LARGE_GRAPH_THRESHOLD = 200;

const autoCollapse = ref<boolean>(
  (() => { try { return localStorage.getItem('graphAutoCollapse') === '1'; } catch { return false; } })()
);
function setAutoCollapse(v: boolean) {
  autoCollapse.value = v;
  try { localStorage.setItem('graphAutoCollapse', v ? '1' : '0'); } catch { /* ignore */ }
  if (v) expandedGroups.value = new Set();
  incrementalRebuild();
}

// Nodes with no relationships — shown in a disconnected grid that adds noise on large graphs.
const hideIsolated = ref(false);
const largeBannerDismissed = ref(false);

const connectedAssetIds = computed(() => {
  const allIds = new Set(props.assets.map((a) => a.id));
  const ids = new Set<number>();
  for (const r of props.relationships) {
    if (allIds.has(r.fromAssetId)) ids.add(r.fromAssetId);
    if (allIds.has(r.toAssetId))   ids.add(r.toAssetId);
  }
  return ids;
});

const isolatedCount = computed(() =>
  props.assets.filter((a) => !connectedAssetIds.value.has(a.id)).length,
);

const visibleNodeCount = computed(() =>
  props.assets.length - (hideIsolated.value ? isolatedCount.value : 0),
);

function gKey(sourceId: number, type: string) { return `${sourceId}:${type}`; }

// ── Type colors ───────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  network:         '#1e0f40',
  system:          '#1e3060',
  directory:       '#6b1010',
  host:            '#0a2540',
  domain:          '#0c5050',
  web_application: '#3a1480',
  web_endpoint:    '#251060',
  technology:      '#2a2a2a',
  ip:              '#0e5028',
  interface:       '#283640',
  service:      '#602000',
  'node-group': '#1a1a2e',
  android_app:     '#0a3a1a',
  ios_app:         '#0a2a40',
  windows_app:     '#0a1a50',
  hardware:        '#3a2a0a',
  software:        '#123020',
  text_data:       '#2a1a0a',
  email:           '#1a0a30',
  credential:      '#3a0a0a',
  person:          '#0a2a1a',
  location:        '#1a2a0a',
};
const TYPE_BORDER: Record<string, string> = {
  network:         '#9060e0',
  system:          '#4a7cd0',
  directory:       '#d04040',
  host:            '#3a80d0',
  domain:          '#30b0b0',
  web_application: '#8060f0',
  web_endpoint:    '#6040c0',
  technology:      '#888888',
  ip:              '#30c060',
  interface:       '#507080',
  service:      '#e06020',
  'node-group': '#888888',
  android_app:     '#3ddc84',
  ios_app:         '#4ab0f0',
  windows_app:     '#4090f0',
  hardware:        '#c09030',
  software:        '#30c090',
  text_data:       '#d08040',
  email:           '#a060e0',
  credential:      '#e04040',
  person:          '#40c080',
  location:        '#80c040',
};

// ── Host subtype distinction ───────────────────────────────────────────────
// 'unknown' deliberately has no entry — unclassified hosts get no badge/border override.
const HOST_SUBTYPE_BADGE: Record<string, { color: string; mono: string }> = {
  pc:        { color: '#3b82f6', mono: 'PC' },
  server:    { color: '#8b5cf6', mono: 'SV' },
  vm:        { color: '#06b6d4', mono: 'VM' },
  container: { color: '#10b981', mono: 'CT' },
  router:    { color: '#f59e0b', mono: 'RT' },
  firewall:  { color: '#ef4444', mono: 'FW' },
  switch:    { color: '#eab308', mono: 'SW' },
  wifi_ap:   { color: '#ec4899', mono: 'AP' },
  other:     { color: '#6b7280', mono: '?' },
};

// Types actually present in current assets (for legend), ordered as TYPE_COLOR
const presentTypes = computed(() => {
  const seen = new Set(props.assets.map((a) => a.type));
  return Object.keys(TYPE_COLOR)
    .filter((t) => seen.has(t) && t !== 'node-group')
    .map((t) => ({ type: t, color: TYPE_COLOR[t], border: TYPE_BORDER[t] ?? '#555' }));
});

// Scope filters shown in the legend. "3rd party" is derived from either the org-level
// Asset.thirdParty flag or the project-level scopeStatuses map (whichever is present);
// "Out of scope" only exists in a project context, so it's only offered when scopeStatuses
// was passed in at all (org-level graphs have no notion of scope).
const hasScopeStatuses = computed(() => !!props.scopeStatuses);
const thirdPartyAssetIds = computed(() => {
  const s = new Set<number>();
  for (const a of props.assets) {
    if (a.thirdParty || props.scopeStatuses?.[String(a.id)]?.status === 'third_party') s.add(a.id);
  }
  return s;
});
const outOfScopeAssetIds = computed(() => {
  const s = new Set<number>();
  for (const a of props.assets) {
    if (props.scopeStatuses?.[String(a.id)]?.status === 'out_of_scope') s.add(a.id);
  }
  return s;
});

// ── Label helpers ─────────────────────────────────────────────────────────
function truncate(s: string, max = 20) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function serviceLabel(id: string): string {
  const m = id.match(/:(\d+\/\w+)$/);
  return m ? m[1].toUpperCase() : truncate(id, 12);
}
function networkLabel(asset: Asset): string {
  try {
    const meta = asset.metadata ? JSON.parse(asset.metadata) : {};
    return (meta.name as string) ? `${meta.name}\n${asset.identifier}` : asset.identifier;
  } catch { return asset.identifier; }
}
function endpointLabel(identifier: string): string {
  try {
    const path = new URL(identifier).pathname || '/';
    return truncate(path, 20);
  } catch {
    const m = identifier.match(/https?:\/\/[^/]+(\/.*)?$/);
    return truncate(m?.[1] ?? identifier, 20);
  }
}

// ── Scope dot SVG overlay ─────────────────────────────────────────────────
function scopeDotSvg(status: string): string | undefined {
  const color = status === 'in_scope'    ? '%2322c55e'
    : status === 'out_of_scope'          ? '%23ef4444'
    : status === 'indeterminate'         ? '%236b7280'
    : null;
  if (!color) return undefined;
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='87' cy='13' r='11' fill='${color}' stroke='%230d0d1a' stroke-width='3'/%3E%3C/svg%3E`;
}

/** Bottom-left monogram badge distinguishing host subtypes (PC, Server, Router…). */
function hostSubtypeDotSvg(subtype: string | null | undefined): string | undefined {
  if (!subtype) return undefined;
  const badge = HOST_SUBTYPE_BADGE[subtype];
  if (!badge) return undefined; // 'unknown' (and anything unrecognized) stays unbadged
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E` +
    `%3Ccircle cx='13' cy='87' r='15' fill='${badge.color.replace('#', '%23')}' stroke='%230d0d1a' stroke-width='3'/%3E` +
    `%3Ctext x='13' y='92' font-family='ui-monospace,monospace' font-size='18' font-weight='700' fill='%23fff' text-anchor='middle'%3E${badge.mono}%3C/text%3E%3C/svg%3E`;
}

// ── Build elements ────────────────────────────────────────────────────────
function buildElements(): cytoscape.ElementDefinition[] {
  const allIds  = new Set(props.assets.map((a) => a.id));
  const assetById = new Map(props.assets.map((a) => [a.id, a]));

  // Degree for node sizing
  const degree = new Map<number, number>();
  for (const r of props.relationships) {
    if (allIds.has(r.fromAssetId)) degree.set(r.fromAssetId, (degree.get(r.fromAssetId) ?? 0) + 1);
    if (allIds.has(r.toAssetId))   degree.set(r.toAssetId,   (degree.get(r.toAssetId)   ?? 0) + 1);
  }

  // Group children by (sourceId, childType) across all relationship types
  // childGroups: gKey(sourceId, type) → { sourceId, type, childIds[] }
  const childGroups = new Map<string, { sourceId: number; type: string; ids: number[] }>();
  for (const r of props.relationships) {
    if (!allIds.has(r.fromAssetId) || !allIds.has(r.toAssetId)) continue;
    const child = assetById.get(r.toAssetId);
    if (!child) continue;
    const key = gKey(r.fromAssetId, child.type);
    const g = childGroups.get(key);
    if (g) { if (!g.ids.includes(r.toAssetId)) g.ids.push(r.toAssetId); }
    else childGroups.set(key, { sourceId: r.fromAssetId, type: child.type, ids: [r.toAssetId] });
  }

  // Which node IDs are hidden inside a collapsed group, and which proxy represents them.
  // When auto-collapse is OFF, this stays empty — every node is rendered individually.
  const collapseActive = autoCollapse.value;
  const collapsedIds = new Set<number>();
  const collapsedToProxy = new Map<number, string>(); // nodeId → proxy node id
  if (collapseActive) {
    for (const [key, g] of childGroups) {
      if (g.ids.length > COLLAPSE_LIMIT && !expandedGroups.value.has(key)) {
        const proxyId = `grp-${key}`;
        g.ids.forEach((id) => { collapsedIds.add(id); collapsedToProxy.set(id, proxyId); });
      }
    }
  }

  const nodes: cytoscape.ElementDefinition[] = [];
  const edges: cytoscape.ElementDefinition[] = [];

  // ── Group proxy nodes (only when auto-collapse is active) ───────────────
  if (collapseActive) for (const [key, g] of childGroups) {
    if (g.ids.length <= COLLAPSE_LIMIT || expandedGroups.value.has(key)) continue;
    const typeColor = TYPE_BORDER[g.type] ?? '#888';
    nodes.push({ data: {
      id: `grp-${key}`, label: `${g.ids.length}×`,
      type: 'node-group', nodeType: g.type,
      groupKey: key, sourceId: g.sourceId, count: g.ids.length, deg: g.ids.length,
      typeColor,
    }});
    edges.push({ data: {
      id: `e-grp-${key}`, source: String(g.sourceId), target: `grp-${key}`,
      etype: 'group_link',
    }});
  }

  // ── Individual asset nodes ─────────────────────────────────────────────
  const connIds = connectedAssetIds.value;
  for (const a of props.assets) {
    if (hideIsolated.value && !connIds.has(a.id)) continue;
    if (collapsedIds.has(a.id)) continue;
    const isIface = a.type === 'interface';
    const nodeDeg = degree.get(a.id) ?? 0;
    const label = isIface ? '' : (
      a.type === 'service'      ? serviceLabel(a.identifier) :
      a.type === 'network'      ? networkLabel(a) :
      a.type === 'web_endpoint' ? endpointLabel(a.identifier) :
      truncate(a.identifier)
    );
    const scopeStatus = props.scopeStatuses?.[String(a.id)]?.status;
    const subtype = a.type === 'host' ? (a.hostSubtype ?? undefined) : undefined;
    const badges = [
      scopeStatus ? scopeDotSvg(scopeStatus) : undefined,
      hostSubtypeDotSvg(subtype),
    ].filter((b): b is string => !!b);

    nodes.push({
      data: {
        id: String(a.id), label, fullLabel: a.identifier,
        type: a.type, typeLabel: ASSET_TYPE_LABELS[a.type] ?? a.type,
        assetId: a.id, deg: nodeDeg, subtype,
        isFocus: props.focusAssetId === a.id,
        isSelected: (props.selectedIds ?? []).includes(a.id),
      },
      ...(badges.length ? { style: {
        'background-image': badges,
        'background-width': '100%', 'background-height': '100%',
        'background-image-containment': 'inside',
      } as cytoscape.Css.Node } : {}),
    });
  }

  // ── Regular edges ─────────────────────────────────────────────────────
  // If source is collapsed → skip (it has no visible node).
  // If target is collapsed → redirect to its group proxy so the relationship
  //   is still visible (e.g. webapp_service edge when the service is in a group).
  const edgeIds = new Set<string>();
  for (const r of props.relationships) {
    if (!allIds.has(r.fromAssetId) || !allIds.has(r.toAssetId)) continue;
    if (collapsedIds.has(r.fromAssetId)) continue; // source invisible → skip

    const targetCyId = collapsedIds.has(r.toAssetId)
      ? collapsedToProxy.get(r.toAssetId)!   // redirect to proxy
      : String(r.toAssetId);

    const eid = `e-${r.fromAssetId}-${targetCyId}-${r.type}`;
    if (edgeIds.has(eid)) continue;
    edgeIds.add(eid);
    edges.push({ data: {
      id: eid, source: String(r.fromAssetId), target: targetCyId,
      etype: r.type, label: ASSET_LINK_LABELS[r.type] ?? '',
    }});
  }

  // ── Invisible sibling-attraction edges (layout only) ──────────────────
  // Chain same-type visible siblings to pull them together in fcose
  for (const [, g] of childGroups) {
    const visible = g.ids.filter((id) => !collapsedIds.has(id) && allIds.has(id));
    for (let i = 0; i < visible.length - 1; i++) {
      edges.push({ data: {
        id: `sib-${visible[i]}-${visible[i + 1]}`,
        source: String(visible[i]), target: String(visible[i + 1]),
        etype: 'sibling',
      }});
    }
  }

  return [...nodes, ...edges];
}

// ── Stylesheet ────────────────────────────────────────────────────────────
function buildStyle(): cytoscape.StylesheetStyle[] {
  const typeStyles = Object.entries(TYPE_COLOR).map(([type, bg]) => ({
    selector: `node[type="${type}"]`,
    style: { 'background-color': bg, 'border-color': TYPE_BORDER[type] ?? '#555' } as cytoscape.Css.Node,
  }));

  return [
    {
      selector: 'node',
      style: {
        'width':  'mapData(deg, 0, 15, 22, 90)',
        'height': 'mapData(deg, 0, 15, 22, 90)',
        'shape':              'round-rectangle',
        'label':              'data(label)',
        'text-valign':        'center',
        'text-halign':        'center',
        'text-wrap':          'wrap' as any,
        'text-max-width':     '80px' as any,
        'font-family':        'ui-monospace, monospace',
        'font-size':          9,
        'color':              'rgba(255,255,255,0.85)',
        'border-width':       1.5,
        'transition-property': 'opacity, border-width, border-color',
        'transition-duration': '150ms' as any,
      } as cytoscape.Css.Node,
    },
    ...typeStyles,
    { selector: 'node[type="network"]',   style: { 'shape': 'diamond', 'width': 'mapData(deg, 0, 15, 28, 96)', 'height': 'mapData(deg, 0, 15, 28, 96)' } as cytoscape.Css.Node },
    { selector: 'node[type="interface"]', style: { 'shape': 'ellipse', 'label': '', 'width': 14, 'height': 14, 'border-width': 1.5 } as cytoscape.Css.Node },
    { selector: 'node[type="node-group"]', style: {
      'width': 38, 'height': 38, 'shape': 'ellipse',
      'background-color': '#1a1a2e',
      'border-color': 'data(typeColor)', 'border-style': 'dashed' as any, 'border-width': 2,
      'color': 'data(typeColor)', 'font-size': 11, 'font-weight': 700,
    } as cytoscape.Css.Node },
    { selector: 'node[deg > 6]',  style: { 'border-width': 2.5, 'font-size': 10 } as cytoscape.Css.Node },
    { selector: 'node[deg > 12]', style: { 'border-width': 3,   'font-size': 11 } as cytoscape.Css.Node },
    // Host subtype border color — distinguishes PC/Server/Router/etc. within the
    // same 'host' type fill color. Placed before isFocus/isSelected so those still win.
    ...Object.entries(HOST_SUBTYPE_BADGE).map(([subtype, { color }]) => ({
      selector: `node[type="host"][subtype="${subtype}"]`,
      style: { 'border-color': color } as cytoscape.Css.Node,
    })),
    { selector: 'node[?isSelected]', style: { 'border-color': '#22c55e', 'border-width': 3.5 } as cytoscape.Css.Node },
    { selector: 'node[?isFocus]', style: { 'border-color': '#38bdf8', 'border-width': 4, 'border-style': 'double' as any } as cytoscape.Css.Node },
    // Merge mode: the right-clicked source node, its same-type merge candidates, and
    // everything else dimmed out of the way. Driven by the `mergeState` data flag
    // (set in applyMergeHighlight()) rather than a transient class, so it isn't
    // clobbered by the hover-driven .faded/.highlighted toggling below.
    { selector: 'node[mergeState="source"]',    style: { 'border-color': '#d946ef', 'border-width': 4, 'border-style': 'double' as any } as cytoscape.Css.Node },
    { selector: 'node[mergeState="candidate"]', style: { 'border-color': '#e879f9', 'border-width': 3, 'border-style': 'dashed' as any } as cytoscape.Css.Node },
    { selector: 'node[mergeState="dim"]',       style: { 'opacity': 0.15 } as cytoscape.Css.Node },
    { selector: 'edge[mergeState="dim"]',       style: { 'opacity': 0.03 } as cytoscape.Css.Edge },
    { selector: 'node:selected',    style: { 'border-color': '#facc15', 'border-width': 3 } as cytoscape.Css.Node },
    { selector: 'node.highlighted', style: { 'border-color': '#facc15', 'border-width': 3 } as cytoscape.Css.Node },
    { selector: 'node.faded',       style: { 'opacity': 0.12 } as cytoscape.Css.Node },
    { selector: 'edge', style: { 'width': 0.8, 'line-color': 'rgba(140,160,200,0.2)', 'target-arrow-color': 'rgba(140,160,200,0.2)', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.6, 'curve-style': 'bezier', 'label': '' } as cytoscape.Css.Edge },
    { selector: 'edge[etype="interface_service"]', style: { 'line-color': 'rgba(200,80,20,0.2)', 'target-arrow-color': 'rgba(200,80,20,0.2)' } as cytoscape.Css.Edge },
    { selector: 'edge[etype="network_ip"],[etype="network_subnet"]', style: { 'line-color': 'rgba(80,130,240,0.25)', 'target-arrow-color': 'rgba(80,130,240,0.25)' } as cytoscape.Css.Edge },
    { selector: 'edge[etype="sibling"]',    style: { 'opacity': 0, 'width': 0.1, 'target-arrow-shape': 'none' } as cytoscape.Css.Edge },
    { selector: 'edge[etype="group_link"]', style: { 'opacity': 0, 'width': 0.1, 'target-arrow-shape': 'none' } as cytoscape.Css.Edge },
    { selector: 'edge.highlighted', style: { 'line-color': 'rgba(250,204,21,0.7)', 'target-arrow-color': 'rgba(250,204,21,0.7)', 'width': 1.5 } as cytoscape.Css.Edge },
    { selector: 'edge.faded',       style: { 'opacity': 0.04 } as cytoscape.Css.Edge },
  ];
}

// ── Layout options ────────────────────────────────────────────────────────
// ── fcose layout ──────────────────────────────────────────────────────────
function fcoseLayout(animate = true, nodeCount = 0): cytoscape.LayoutOptions {
  // Adapt quality to graph size to keep it responsive
  const large  = nodeCount > 150;
  const medium = nodeCount > 60;

  return {
    name: 'fcose',
    quality:           large ? 'default' : 'proof',
    animate,
    animationDuration: animate ? (large ? 500 : 1000) : 0,
    animationEasing:   'ease-out' as any,
    fit: true, padding: 70, randomize: true,

    nodeRepulsion:  () => large ? 16000 : 32000,
    idealEdgeLength: (edge: any) =>
      edge.data('etype') === 'sibling' ? 28 : (large ? 65 : 100),
    edgeElasticity: (edge: any) =>
      edge.data('etype') === 'sibling' ? 0.7 : 0.45,

    gravity:              large ? 0.12 : 0.06,
    gravityRange:         large ? 4.0  : 6.0,
    gravityCompound:      1.0,
    gravityRangeCompound: 2.0,

    nodeSeparation:            large ? 14 : 28,
    nodeDimensionsIncludeLabels: true,

    // No sampling for small/medium graphs → full optimization → fewer crossings
    // Sampling for large graphs → much faster at the cost of some quality
    samplingType: large,
    sampleSize:   35,
    numIter:      large ? 1500 : (medium ? 3500 : 6000),

    tile: true,
    tilingPaddingVertical:   18,
    tilingPaddingHorizontal: 18,
  } as any;
}

/** Incremental layout: preserves existing positions, repositions only changed nodes. */
function incrementalLayout(): cytoscape.LayoutOptions {
  const n = cy?.nodes().length ?? 0;
  return { ...fcoseLayout(true, n), randomize: false, fit: false } as any;
}

// ── Visibility ────────────────────────────────────────────────────────────
function applyVisibility() {
  if (!cy) return;
  cy.nodes().forEach((node) => {
    const type = node.data('type') as string;
    const assetId = node.data('assetId') as number | undefined;
    const hidden = hiddenTypes.value.has(type)
      || (hideThirdParty.value && assetId != null && thirdPartyAssetIds.value.has(assetId))
      || (hideOutOfScope.value && assetId != null && outOfScopeAssetIds.value.has(assetId));
    // hide()/show() are real, documented cytoscape.js methods (http://js.cytoscape.org/#eles.hide)
    // just missing from this version's own .d.ts — not an `any`-worthy app bug, an upstream typing gap.
    hidden ? (node as any).hide() : (node as any).show();
  });
  cy.edges().forEach((edge) => {
    const shouldHide = edge.source().hidden() || edge.target().hidden();
    shouldHide ? (edge as any).hide() : (edge as any).show();
  });
}

function toggleType(type: string) {
  const next = new Set(hiddenTypes.value);
  next.has(type) ? next.delete(type) : next.add(type);
  hiddenTypes.value = next;
  applyVisibility();
  cy?.layout(incrementalLayout()).run();
}

function toggleThirdParty() {
  hideThirdParty.value = !hideThirdParty.value;
  applyVisibility();
  cy?.layout(incrementalLayout()).run();
}

function toggleOutOfScope() {
  hideOutOfScope.value = !hideOutOfScope.value;
  applyVisibility();
  cy?.layout(incrementalLayout()).run();
}

// ── Incremental rebuild (expand/collapse) ─────────────────────────────────
function incrementalRebuild() {
  if (!cy) return;
  const newElems = buildElements();
  const newIds   = new Set(newElems.map((e) => e.data.id as string));

  cy.remove(cy.elements().filter((e) => !newIds.has(e.id())));

  const existingIds = new Set(cy.elements().map((e) => e.id()));
  const toAdd = newElems.filter((e) => !existingIds.has(e.data.id as string));
  if (toAdd.length > 0) cy.add(toAdd);

  cy.style(buildStyle());
  applyVisibility();
  cy.layout(incrementalLayout()).run();
  applyMergeHighlight();
}

// ── Tooltip ───────────────────────────────────────────────────────────────
const tooltip = ref<{ visible: boolean; x: number; y: number; label: string; type: string; extra?: string }>({
  visible: false, x: 0, y: 0, label: '', type: '',
});

// ── Context menu ──────────────────────────────────────────────────────────
const ctxMenu = ref<{
  visible: boolean; x: number; y: number;
  asset: Asset | null; nodeType: string;
  groupKey: string | null; isGroup: boolean;
  canExpand: boolean; canCollapse: boolean;
}>({ visible: false, x: 0, y: 0, asset: null, nodeType: '', groupKey: null, isGroup: false, canExpand: false, canCollapse: false });

const edgeCtxMenu = ref<{
  visible: boolean; x: number; y: number;
  fromAssetId: number; toAssetId: number; linkType: string;
}>({ visible: false, x: 0, y: 0, fromAssetId: 0, toAssetId: 0, linkType: '' });

function closeCtx() { ctxMenu.value.visible = false; edgeCtxMenu.value.visible = false; }

function findRelationship(fromId: number, toId: number, type: string): AssetRelationship | undefined {
  return props.relationships.find((r) => r.fromAssetId === fromId && r.toAssetId === toId && r.type === type);
}
function onEdgeCtxDelete() {
  const rel = findRelationship(edgeCtxMenu.value.fromAssetId, edgeCtxMenu.value.toAssetId, edgeCtxMenu.value.linkType);
  if (rel) emit('edgeDelete', rel);
  closeCtx();
}
function onEdgeCtxHide() {
  const rel = findRelationship(edgeCtxMenu.value.fromAssetId, edgeCtxMenu.value.toAssetId, edgeCtxMenu.value.linkType);
  if (rel) emit('edgeHide', rel);
  closeCtx();
}

function onCtxView() {
  if (ctxMenu.value.asset) emit('nodeClick', ctxMenu.value.asset);
  closeCtx();
}
function onCtxExpand() {
  const key = ctxMenu.value.groupKey;
  if (key) { expandedGroups.value = new Set([...expandedGroups.value, key]); incrementalRebuild(); }
  closeCtx();
}
function onCtxCollapse() {
  const key = ctxMenu.value.groupKey;
  if (key) { const s = new Set(expandedGroups.value); s.delete(key); expandedGroups.value = s; incrementalRebuild(); }
  closeCtx();
}
function onCtxDelete() {
  if (ctxMenu.value.asset) emit('nodeDelete', ctxMenu.value.asset);
  closeCtx();
}
function onCtxHide() {
  if (ctxMenu.value.asset) emit('nodeHide', ctxMenu.value.asset);
  closeCtx();
}
function onCtxMerge() {
  if (ctxMenu.value.asset) enterMergeMode(ctxMenu.value.asset);
  closeCtx();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') { closeCtx(); if (mergeSourceId.value != null) exitMergeMode(); }
}

// ── Merge mode ────────────────────────────────────────────────────────────
// Right-click → "Merge with…" enters a mode where every other same-type node
// is highlighted as a clickable merge target; clicking one emits 'nodeMerge'
// with (source, target) so the parent can open the merge dialog directly —
// no separate picker UI needed.
const mergeSourceId = ref<number | null>(null);

function enterMergeMode(asset: Asset) {
  mergeSourceId.value = asset.id;
  applyMergeHighlight();
}
function exitMergeMode() {
  mergeSourceId.value = null;
  applyMergeHighlight();
}
const mergeSourceAsset = computed(() => props.assets.find((a) => a.id === mergeSourceId.value) ?? null);
function applyMergeHighlight() {
  if (!cy) return;
  const activeId = mergeSourceId.value;
  if (activeId == null) {
    cy.nodes('[assetId]').forEach((n) => { n.data('mergeState', null); });
    cy.nodes('[type="node-group"]').forEach((n) => { n.data('mergeState', null); });
    cy.edges().forEach((e) => { e.data('mergeState', null); });
    return;
  }
  const sourceType = props.assets.find((a) => a.id === activeId)?.type;
  cy.nodes('[assetId]').forEach((n) => {
    const id = n.data('assetId') as number;
    const type = n.data('type') as string;
    n.data('mergeState', id === activeId ? 'source' : type === sourceType ? 'candidate' : 'dim');
  });
  cy.nodes('[type="node-group"]').forEach((n) => { n.data('mergeState', 'dim'); });
  cy.edges().forEach((e) => { e.data('mergeState', 'dim'); });
}

// ── Init ──────────────────────────────────────────────────────────────────
function initCy() {
  if (!container.value) return;
  if (cy) { cy.destroy(); cy = null; }
  hiddenTypes.value = new Set(); // reset on full reinit
  hideThirdParty.value = false;
  hideOutOfScope.value = false;

  cy = cytoscape({
    container: container.value,
    elements:  buildElements(),
    style:     buildStyle(),
    layout:    { name: 'preset' } as any,
    wheelSensitivity: 0.5,
    minZoom: 0.04,
    maxZoom: 6,
  });

  cy.layout(fcoseLayout(false, cy.nodes().length)).run();
  bindEvents();
}

function bindEvents() {
  if (!cy) return;

  cy.on('mouseover', 'node[assetId]', (evt) => {
    const n = evt.target as NodeSingular;
    highlightNeighborhood(n);
    const pos = evt.renderedPosition;
    const t   = n.data('type') as string;
    const sub = n.data('subtype') as string | undefined;
    const typeLabel = ASSET_TYPE_LABELS[t] ?? t;
    tooltip.value = {
      visible: true, x: pos.x + 14, y: pos.y - 10,
      label: n.data('fullLabel'),
      type: sub ? `${typeLabel} — ${HOST_SUBTYPE_LABELS[sub] ?? sub}` : typeLabel,
    };
  });

  cy.on('mouseover', 'node[type="node-group"]', (evt) => {
    const n = evt.target as NodeSingular;
    const pos = evt.renderedPosition;
    const nodeType = n.data('nodeType') as string;
    const count    = n.data('count') as number;
    tooltip.value = {
      visible: true, x: pos.x + 14, y: pos.y - 10,
      label: `${count} × ${ASSET_TYPE_LABELS[nodeType] ?? nodeType}`,
      type: 'Collapsed group', extra: 'Click to expand',
    };
  });

  cy.on('mouseout', 'node', () => {
    cy!.elements().removeClass('faded highlighted');
    tooltip.value.visible = false;
  });

  cy.on('mouseover', 'edge', (evt) => {
    const edge = evt.target;
    const pos  = evt.renderedPosition;
    const etype: string = edge.data('etype') ?? '';
    const label = ASSET_LINK_LABELS[etype] ?? etype.replace(/_/g, ' ');
    const srcLabel: string = edge.source().data('fullLabel') ?? edge.source().data('label') ?? '';
    const tgtLabel: string = edge.target().data('fullLabel') ?? edge.target().data('label') ?? '';

    cy!.elements().addClass('faded');
    edge.removeClass('faded').addClass('highlighted');
    edge.connectedNodes().removeClass('faded').addClass('highlighted');

    tooltip.value = {
      visible: true, x: pos.x + 14, y: pos.y - 10,
      label, type: 'Relationship',
      extra: srcLabel && tgtLabel ? `${srcLabel}  →  ${tgtLabel}` : undefined,
    };
  });

  cy.on('mouseout', 'edge', () => {
    cy!.elements().removeClass('faded highlighted');
    tooltip.value.visible = false;
  });

  cy.on('tap', 'node[assetId]', (evt) => {
    const n = evt.target as NodeSingular;
    const asset = props.assets.find((a) => a.id === n.data('assetId'));
    if (!asset) return;
    if (mergeSourceId.value != null) {
      const sourceAsset = props.assets.find((a) => a.id === mergeSourceId.value);
      if (!sourceAsset) { exitMergeMode(); return; }
      if (asset.id === sourceAsset.id) { exitMergeMode(); return; } // tapping the source again cancels
      if (asset.type === sourceAsset.type) {
        emit('nodeMerge', sourceAsset, asset);
        exitMergeMode();
      }
      // tapping a non-candidate (wrong type) node is a no-op — stay in merge mode so a
      // slight miss-click doesn't force the user to reopen the context menu.
      return;
    }
    emit('nodeClick', asset);
  });

  cy.on('tap', 'node[type="node-group"]', (evt) => {
    const g = evt.target as NodeSingular;
    if (mergeSourceId.value != null) {
      const sourceAsset = props.assets.find((a) => a.id === mergeSourceId.value);
      if (sourceAsset && g.data('nodeType') === sourceAsset.type) {
        // Group of merge candidates — expand it so the individual nodes become clickable,
        // instead of silently canceling merge mode.
        const key = g.data('groupKey') as string;
        expandedGroups.value = new Set([...expandedGroups.value, key]);
        incrementalRebuild();
      }
      return; // groups of a different type are a no-op, same as any other non-candidate tap
    }
    const key = g.data('groupKey') as string;
    expandedGroups.value = new Set([...expandedGroups.value, key]);
    incrementalRebuild();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy!.elements().removeClass('faded highlighted');
      closeCtx();
      if (mergeSourceId.value != null) exitMergeMode();
    }
  });

  cy.on('cxttap', 'node', (evt) => {
    const n       = evt.target as NodeSingular;
    const pos     = evt.renderedPosition;
    const type    = n.data('type') as string;
    const assetId = n.data('assetId') as number | undefined;
    const asset   = assetId != null ? (props.assets.find((a) => a.id === assetId) ?? null) : null;
    const isGroup = type === 'node-group';
    const groupKey = isGroup
      ? (n.data('groupKey') as string)
      : null;
    const canExpand  = isGroup;
    const canCollapse = false; // collapse via double-click on source node or context menu of expanded group

    tooltip.value.visible = false;
    edgeCtxMenu.value.visible = false;
    ctxMenu.value = { visible: true, x: pos.x, y: pos.y, asset, nodeType: type, groupKey: groupKey ?? null, isGroup, canExpand, canCollapse };
  });

  cy.on('cxttap', 'edge', (evt) => {
    const e     = evt.target;
    const etype = (e.data('etype') as string) ?? '';
    // Layout-only edges, and edges redirected to a collapsed group proxy, don't map to a
    // single real relationship — nothing sensible to delete/hide.
    if (etype === 'sibling' || etype === 'group_link') return;
    const fromId = e.source().data('assetId') as number | undefined;
    const toId   = e.target().data('assetId') as number | undefined;
    if (fromId == null || toId == null) return;

    tooltip.value.visible = false;
    ctxMenu.value.visible = false;
    edgeCtxMenu.value = { visible: true, x: evt.renderedPosition.x, y: evt.renderedPosition.y, fromAssetId: fromId, toAssetId: toId, linkType: etype };
  });

  cy.on('scrollzoom pan', () => closeCtx());
}

function highlightNeighborhood(node: NodeSingular) {
  cy!.elements().addClass('faded');
  node.removeClass('faded').addClass('highlighted');
  const edges = node.connectedEdges();
  edges.removeClass('faded').addClass('highlighted');
  edges.connectedNodes().removeClass('faded');
}


// Auto-enable readability aids when the graph is large.
// Runs immediately so the features are active before initCy builds the first layout.
watch(
  () => props.assets.length,
  (len) => {
    if (len > LARGE_GRAPH_THRESHOLD) {
      if (!autoCollapse.value) {
        autoCollapse.value = true;
        expandedGroups.value = new Set();
      }
      hideIsolated.value = true;
    }
  },
  { immediate: true },
);

onMounted(() => { initCy(); window.addEventListener('keydown', onKeyDown); });
onUnmounted(() => { if (cy) cy.destroy(); window.removeEventListener('keydown', onKeyDown); });

watch(
  () => [props.assets.length, props.relationships.length],
  () => {
    if (!cy) { initCy(); return; }
    incrementalRebuild();
  },
);

// Selection/focus changes shouldn't trigger a re-layout — just flip the data
// flags that drive the border styles above.
function updateHighlights() {
  if (!cy) return;
  cy.nodes('[assetId]').forEach((n) => {
    const id = n.data('assetId') as number;
    n.data('isFocus', props.focusAssetId === id);
    n.data('isSelected', (props.selectedIds ?? []).includes(id));
  });
}
watch(() => [props.focusAssetId, props.selectedIds], updateHighlights, { deep: true });

// ── Controls ───────────────────────────────────────────────────────────────
function fitGraph()    { cy?.fit(undefined, 50); }
function zoomIn()      { cy?.zoom({ level: (cy.zoom() || 1) * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }
function zoomOut()     { cy?.zoom({ level: (cy.zoom() || 1) / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }
function reLayout() { cy?.layout(fcoseLayout(true, cy.nodes().length)).run(); }
function collapseAll() { expandedGroups.value = new Set(); incrementalRebuild(); }
function expandAll()   {
  // Build all group keys that exist and expand them all
  const allIds = new Set(props.assets.map((a) => a.id));
  const assetById = new Map(props.assets.map((a) => [a.id, a]));
  const keys = new Set<string>();
  for (const r of props.relationships) {
    if (!allIds.has(r.fromAssetId) || !allIds.has(r.toAssetId)) continue;
    const child = assetById.get(r.toAssetId);
    if (child) keys.add(gKey(r.fromAssetId, child.type));
  }
  expandedGroups.value = keys;
  incrementalRebuild();
}
function showAll()     { hiddenTypes.value = new Set(); applyVisibility(); cy?.layout(incrementalLayout()).run(); }
</script>

<template>
  <div :style="{ position: 'relative', width: '100%', height: height ?? 'calc(100vh - 230px)', minHeight: '480px' }">

    <div
      ref="container"
      style="width:100%; height:100%; background:#0d0d1a; border-radius: var(--ares-radius); border:1px solid rgba(255,255,255,0.06);"
    />

    <!-- Top-left: stats + auto-collapse toggle + collapse/expand -->
    <div style="position:absolute; top:12px; left:12px; z-index:10; display:flex; align-items:center; gap:7px; flex-wrap:wrap; max-width:calc(100% - 120px);">
      <div class="graph-badge">
        {{ visibleNodeCount }} nodes
        <template v-if="hideIsolated && isolatedCount > 0"> · <span style="opacity:0.55;">{{ isolatedCount }} isolated hidden</span></template>
        <template v-else> · {{ relationships.length }} links</template>
      </div>
      <button
        class="graph-ctrl-btn graph-ctrl-btn--sm"
        :class="{ 'graph-ctrl-btn--active': autoCollapse }"
        :title="autoCollapse
          ? 'Auto-grouping ON: large sibling clusters are folded into a single N× node. Click to show every node individually.'
          : 'Auto-grouping OFF: every node is shown. Click to fold large sibling clusters (faster on huge graphs).'"
        @click="setAutoCollapse(!autoCollapse)"
      >
        <i class="pi pi-sitemap" style="font-size:0.75rem;" />
      </button>
      <button v-if="autoCollapse" class="graph-ctrl-btn graph-ctrl-btn--sm" title="Collapse all groups" @click="collapseAll">
        <i class="pi pi-minus-circle" style="font-size:0.75rem;" />
      </button>
      <button v-if="autoCollapse" class="graph-ctrl-btn graph-ctrl-btn--sm" title="Expand all groups" @click="expandAll">
        <i class="pi pi-plus-circle" style="font-size:0.75rem;" />
      </button>
      <button
        v-if="isolatedCount > 0"
        class="graph-ctrl-btn graph-ctrl-btn--sm"
        :class="{ 'graph-ctrl-btn--active': hideIsolated }"
        :title="hideIsolated
          ? `Show ${isolatedCount} isolated nodes (no relationships)`
          : `Hide ${isolatedCount} isolated nodes (no relationships)`"
        @click="hideIsolated = !hideIsolated; incrementalRebuild()"
      >
        <i class="pi pi-eye-slash" style="font-size:0.75rem;" />
      </button>
    </div>

    <!-- Merge-mode banner -->
    <transition name="ttip">
      <div
        v-if="mergeSourceAsset"
        style="position:absolute; top:48px; left:12px; z-index:10; max-width:360px;
               background:rgba(60,10,60,0.92); border:1px solid rgba(217,70,239,0.35);
               border-radius: var(--ares-radius); padding:8px 12px; font-size:0.72rem; color:rgba(255,255,255,0.85);
               display:flex; align-items:flex-start; gap:8px; backdrop-filter:blur(6px);"
      >
        <i class="pi pi-arrows-h" style="color:#e879f9; margin-top:1px; flex-shrink:0;" />
        <span>
          Merge mode — click a highlighted <strong>{{ ASSET_TYPE_LABELS[mergeSourceAsset.type] ?? mergeSourceAsset.type }}</strong>
          asset to merge with <strong>{{ mergeSourceAsset.identifier }}</strong>, or press Esc to cancel.
        </span>
        <button
          @click="exitMergeMode"
          style="background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer;
                 font-size:0.9rem; padding:0; flex-shrink:0; line-height:1;"
          title="Cancel"
        >×</button>
      </div>
    </transition>

    <!-- Large-graph banner -->
    <transition name="ttip">
      <div
        v-if="assets.length > LARGE_GRAPH_THRESHOLD && !largeBannerDismissed"
        style="position:absolute; top:48px; left:12px; z-index:10; max-width:340px;
               background:rgba(20,18,40,0.92); border:1px solid rgba(140,120,255,0.25);
               border-radius: var(--ares-radius); padding:8px 12px; font-size:0.72rem; color:rgba(255,255,255,0.7);
               display:flex; align-items:flex-start; gap:8px; backdrop-filter:blur(6px);"
      >
        <i class="pi pi-info-circle" style="color:#a78bfa; margin-top:1px; flex-shrink:0;" />
        <span>
          Large graph ({{ assets.length }} nodes) — auto-grouping and isolated node hiding
          have been enabled automatically. Use the <i class="pi pi-sitemap" /> and
          <i class="pi pi-eye-slash" /> buttons to toggle them.
        </span>
        <button
          @click="largeBannerDismissed = true"
          style="background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer;
                 font-size:0.9rem; padding:0; flex-shrink:0; line-height:1;"
          title="Dismiss"
        >×</button>
      </div>
    </transition>

    <!-- Top-right: zoom controls -->
    <div style="position:absolute; top:12px; right:12px; z-index:10; display:flex; flex-direction:column; gap:5px;">
      <button class="graph-ctrl-btn" title="Fit to screen" @click="fitGraph"><i class="pi pi-expand" /></button>
      <button class="graph-ctrl-btn" title="Zoom in"       @click="zoomIn"><i class="pi pi-plus" /></button>
      <button class="graph-ctrl-btn" title="Zoom out"      @click="zoomOut"><i class="pi pi-minus" /></button>
      <button class="graph-ctrl-btn" title="Re-layout" @click="reLayout"><i class="pi pi-refresh" /></button>
    </div>

    <!-- Bottom-left: interactive legend -->
    <div class="graph-legend" :class="{ 'graph-legend--collapsed': legendCollapsed }">
      <div class="graph-legend-header">
        <div class="graph-legend-header-left">
          <button
            class="graph-legend-collapse-btn"
            :title="legendCollapsed ? 'Expand legend' : 'Collapse legend'"
            @click="setLegendCollapsed(!legendCollapsed)"
          ><i :class="legendCollapsed ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" /></button>
          <span class="graph-legend-title">Asset types</span>
        </div>
        <button
          v-if="!legendCollapsed && hiddenTypes.size > 0"
          class="graph-legend-showall"
          @click="showAll"
        >Show all</button>
      </div>
      <template v-if="!legendCollapsed">
        <div class="graph-legend-list">
          <button
            v-for="{ type, color, border } in presentTypes"
            :key="type"
            class="graph-legend-item"
            :class="{ 'graph-legend-item--off': hiddenTypes.has(type) }"
            :title="hiddenTypes.has(type) ? `Show ${ASSET_TYPE_LABELS[type] ?? type}` : `Hide ${ASSET_TYPE_LABELS[type] ?? type}`"
            @click="toggleType(type)"
          >
            <span
              class="graph-legend-dot"
              :style="{
                borderRadius: type === 'interface' ? '50%' : '2px',
                background: hiddenTypes.has(type) ? 'transparent' : color,
                borderColor: border,
              }"
            />
            <span>{{ ASSET_TYPE_LABELS[type] ?? type }}</span>
            <i v-if="hiddenTypes.has(type)" class="pi pi-eye-slash" style="font-size:0.6rem; margin-left:auto; opacity:0.5;" />
          </button>
        </div>
        <div class="graph-legend-divider" />
        <div class="graph-legend-list">
          <button
            class="graph-legend-item"
            :class="{ 'graph-legend-item--off': hideThirdParty }"
            :title="hideThirdParty ? 'Show 3rd party assets' : 'Hide 3rd party assets'"
            @click="toggleThirdParty"
          >
            <span
              class="graph-legend-dot"
              :style="{ borderRadius: '50%', background: hideThirdParty ? 'transparent' : '#38bdf8', borderColor: '#38bdf8' }"
            />
            <span>3rd party</span>
            <i v-if="hideThirdParty" class="pi pi-eye-slash" style="font-size:0.6rem; margin-left:auto; opacity:0.5;" />
          </button>
          <button
            v-if="hasScopeStatuses"
            class="graph-legend-item"
            :class="{ 'graph-legend-item--off': hideOutOfScope }"
            :title="hideOutOfScope ? 'Show out-of-scope assets' : 'Hide out-of-scope assets'"
            @click="toggleOutOfScope"
          >
            <span
              class="graph-legend-dot"
              :style="{ borderRadius: '50%', background: hideOutOfScope ? 'transparent' : '#ef4444', borderColor: '#ef4444' }"
            />
            <span>Out of scope</span>
            <i v-if="hideOutOfScope" class="pi pi-eye-slash" style="font-size:0.6rem; margin-left:auto; opacity:0.5;" />
          </button>
        </div>
        <div class="graph-legend-hint">
          <i class="pi pi-info-circle" />
          Node size = connections · Click to toggle
        </div>
      </template>
    </div>

    <!-- Context menu -->
    <transition name="ttip">
      <div
        v-if="ctxMenu.visible"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click.stop
      >
        <button v-if="ctxMenu.asset && !ctxMenu.isGroup" class="ctx-item" @click="onCtxView">
          <i class="pi pi-eye" />View
        </button>
        <button v-if="ctxMenu.canExpand" class="ctx-item" @click="onCtxExpand">
          <i class="pi pi-plus-circle" />Expand group
        </button>
        <button v-if="ctxMenu.canCollapse" class="ctx-item" @click="onCtxCollapse">
          <i class="pi pi-minus-circle" />Collapse group
        </button>
        <template v-if="ctxMenu.asset && !ctxMenu.isGroup">
          <div class="ctx-separator" />
          <button class="ctx-item" @click="onCtxMerge">
            <i class="pi pi-arrows-h" />Merge with…
          </button>
          <div v-if="allowDelete || allowHide" class="ctx-separator" />
          <button v-if="allowHide" class="ctx-item ctx-item--warn" @click="onCtxHide">
            <i class="pi pi-eye-slash" />Hide in project
          </button>
          <button v-if="allowDelete" class="ctx-item ctx-item--danger" @click="onCtxDelete">
            <i class="pi pi-trash" />Remove
          </button>
        </template>
      </div>
    </transition>

    <!-- Edge (relationship) context menu -->
    <transition name="ttip">
      <div
        v-if="edgeCtxMenu.visible"
        class="ctx-menu"
        :style="{ left: edgeCtxMenu.x + 'px', top: edgeCtxMenu.y + 'px' }"
        @click.stop
      >
        <button v-if="allowHideRelationship" class="ctx-item ctx-item--warn" @click="onEdgeCtxHide">
          <i class="pi pi-eye-slash" />Hide in project
        </button>
        <button v-if="allowDeleteRelationship" class="ctx-item ctx-item--danger" @click="onEdgeCtxDelete">
          <i class="pi pi-trash" />Remove relationship
        </button>
      </div>
    </transition>

    <!-- Tooltip -->
    <transition name="ttip">
      <div
        v-if="tooltip.visible"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        class="graph-tooltip"
      >
        <div class="graph-tooltip-type">{{ tooltip.type }}</div>
        <div class="graph-tooltip-label">{{ tooltip.label }}</div>
        <div v-if="tooltip.extra" class="graph-tooltip-hint">{{ tooltip.extra }}</div>
      </div>
    </transition>

    <!-- Empty state -->
    <div v-if="assets.length === 0" class="graph-empty">
      <i class="pi pi-share-alt" style="font-size:3rem; display:block; margin-bottom:1rem;" />
      <div style="font-size:0.95rem; font-weight:500;">No assets to display</div>
      <div style="font-size:0.8rem; margin-top:0.35rem; opacity:0.6;">Import scan results or add assets manually</div>
    </div>

  </div>
</template>

<style scoped>
.graph-ctrl-btn {
  width:32px; height:32px; display:flex; align-items:center; justify-content:center;
  background:rgba(8,8,20,0.85); border:1px solid rgba(255,255,255,0.1);
  border-radius: var(--ares-radius); color:rgba(255,255,255,0.5); cursor:pointer;
  font-size:0.82rem; transition:background 0.15s, color 0.15s; backdrop-filter:blur(4px);
}
.graph-ctrl-btn:hover { background:rgba(40,40,70,0.9); color:#fff; }
.graph-ctrl-btn--sm   { width:26px; height:26px; font-size:0.72rem; }
.graph-ctrl-btn--active {
  background: color-mix(in srgb, var(--p-primary-500) 30%, rgba(8,8,20,0.85));
  border-color: color-mix(in srgb, var(--p-primary-500) 50%, transparent);
  color: #fff;
}

.graph-badge {
  background:rgba(8,8,20,0.85); border:1px solid rgba(255,255,255,0.08);
  border-radius: var(--ares-radius); padding:4px 10px; font-size:0.72rem;
  color:rgba(255,255,255,0.3); backdrop-filter:blur(4px);
}

/* ── Legend ────────────────────────────────────────────────────────────── */
.graph-legend {
  position:absolute; bottom:12px; left:12px; z-index:10;
  background:rgba(8,8,20,0.92); border:1px solid rgba(255,255,255,0.07);
  border-radius: var(--ares-radius); padding:10px 12px; backdrop-filter:blur(6px);
  min-width:160px; max-height:calc(100% - 80px); overflow-y:auto;
}
.graph-legend--collapsed { min-width:0; max-height:none; overflow:visible; padding:6px 8px; }
.graph-legend-header {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin-bottom:7px;
}
.graph-legend--collapsed .graph-legend-header { margin-bottom:0; }
.graph-legend-header-left { display:flex; align-items:center; gap:6px; }
.graph-legend-collapse-btn {
  display:flex; align-items:center; justify-content:center;
  width:16px; height:16px; flex-shrink:0;
  background:none; border:none; cursor:pointer; padding:0; border-radius: var(--ares-radius);
  color:rgba(255,255,255,0.35); font-size:0.62rem; transition:background 0.12s, color 0.12s;
}
.graph-legend-collapse-btn:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.75); }
.graph-legend-title { font-size:0.6rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:rgba(255,255,255,0.22); }
.graph-legend-showall {
  font-size:0.58rem; color:rgba(140,160,255,0.7); background:none; border:none;
  cursor:pointer; padding:0; text-decoration:underline;
}
.graph-legend-showall:hover { color:rgba(160,180,255,1); }
.graph-legend-divider { border-top:1px solid rgba(255,255,255,0.08); margin:6px 0; }
.graph-legend-list { display:flex; flex-direction:column; gap:3px; }
.graph-legend-item {
  display:flex; align-items:center; gap:6px;
  font-size:0.68rem; color:rgba(255,255,255,0.55);
  background:none; border:none; cursor:pointer; padding:3px 4px; border-radius: var(--ares-radius);
  text-align:left; transition:background 0.12s, color 0.12s; width:100%;
}
.graph-legend-item:hover { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.8); }
.graph-legend-item--off  { color:rgba(255,255,255,0.2); }
.graph-legend-dot {
  width:9px; height:9px; flex-shrink:0;
  border:1px solid; transition:background 0.15s;
}
.graph-legend-hint {
  margin-top:7px; padding-top:7px; border-top:1px solid rgba(255,255,255,0.07);
  font-size:0.6rem; color:rgba(255,255,255,0.2); display:flex; align-items:center; gap:4px;
}

/* ── Tooltip ───────────────────────────────────────────────────────────── */
.graph-tooltip {
  position:absolute; pointer-events:none; z-index:30;
  background:rgba(8,8,20,0.97); border:1px solid rgba(255,255,255,0.12);
  border-radius: var(--ares-radius); padding:7px 12px; max-width:280px; word-break:break-all;
  backdrop-filter:blur(4px); box-shadow:0 4px 20px rgba(0,0,0,0.6);
}
.graph-tooltip-type  { font-size:0.65rem; color:rgba(255,255,255,0.28); margin-bottom:2px; text-transform:uppercase; letter-spacing:0.06em; }
.graph-tooltip-label { font-size:0.82rem; color:#fff; font-family:ui-monospace,monospace; font-weight:500; }
.graph-tooltip-hint  { font-size:0.68rem; color:rgba(255,200,80,0.8); margin-top:4px; }

.graph-empty {
  position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; pointer-events:none; text-align:center; color:rgba(255,255,255,0.15);
}

.ttip-enter-active, .ttip-leave-active { transition:opacity 0.1s; }
.ttip-enter-from, .ttip-leave-to       { opacity:0; }

/* ── Context menu ──────────────────────────────────────────────────────── */
.ctx-menu {
  position: absolute;
  z-index: 40;
  background: rgba(10,10,24,0.98);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: var(--ares-radius);
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.7);
  backdrop-filter: blur(6px);
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  background: none;
  border: none;
  color: rgba(255,255,255,0.75);
  font-size: 0.78rem;
  font-family: inherit;
  padding: 0.4rem 0.65rem;
  border-radius: var(--ares-radius);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s, color 0.1s;
}
.ctx-item:hover             { background: rgba(255,255,255,0.07); color: #fff; }
.ctx-item--warn             { color: rgba(243,156,18,0.85); }
.ctx-item--warn:hover       { background: rgba(243,156,18,0.1); color: #f39c12; }
.ctx-item--danger           { color: rgba(231,76,60,0.85); }
.ctx-item--danger:hover     { background: rgba(231,76,60,0.1); color: #e74c3c; }
.ctx-separator              { height: 1px; background: rgba(255,255,255,0.07); margin: 3px 0; }
</style>
