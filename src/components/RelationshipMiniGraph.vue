<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core } from 'cytoscape';
import type { Asset, AssetRelationshipDetail } from '@/api/assets';
import { ASSET_TYPE_LABELS, ASSET_LINK_LABELS } from '@/api/assets';

// Guard registration — AssetGraph may have already called cytoscape.use(fcose)
try { cytoscape.use(fcose as any); } catch { /* already registered */ }

// ── Same type colors as AssetGraph ────────────────────────────────────────
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
  service:         '#602000',
  'node-group':    '#1a1a2e',
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
  service:         '#e06020',
  'node-group':    '#888888',
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

const props = defineProps<{
  asset: Asset;
  relationships: AssetRelationshipDetail[];
  scopeMap?: Record<string, { status: string; override: boolean }>;
}>();

const emit = defineEmits<{
  (e: 'nodeClick', assetId: number): void;
}>();

const container = ref<HTMLElement | null>(null);
let cy: Core | null = null;

// ── Label helpers (same as AssetGraph) ───────────────────────────────────
function truncate(s: string, max = 20) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function serviceLabel(id: string) {
  const m = id.match(/:(\d+\/\w+)$/);
  return m ? m[1].toUpperCase() : truncate(id, 12);
}
function endpointLabel(id: string) {
  try {
    const path = new URL(id).pathname || '/';
    return truncate(path, 20);
  } catch {
    const m = id.match(/https?:\/\/[^/]+(\/.*)?$/);
    return truncate(m?.[1] ?? id, 20);
  }
}
function nodeLabel(type: string, identifier: string) {
  if (type === 'service')      return serviceLabel(identifier);
  if (type === 'web_endpoint') return endpointLabel(identifier);
  if (type === 'interface')    return '';
  return truncate(identifier);
}

// ── Stylesheet (mirrors AssetGraph.buildStyle) ───────────────────────────
function buildStyle(): any[] {
  const typeStyles = Object.entries(TYPE_COLOR).map(([type, bg]) => ({
    selector: `node[type="${type}"]`,
    style: {
      'background-color': bg,
      'border-color': TYPE_BORDER[type] ?? '#555',
    } as cytoscape.Css.Node,
  }));

  return [
    {
      selector: 'node',
      style: {
        'width':  'mapData(deg, 0, 10, 22, 60)',
        'height': 'mapData(deg, 0, 10, 22, 60)',
        'shape':             'round-rectangle',
        'label':             'data(label)',
        'text-valign':       'center',
        'text-halign':       'center',
        'text-wrap':         'wrap' as any,
        'text-max-width':    '70px' as any,
        'font-family':       'ui-monospace, monospace',
        'font-size':         8,
        'color':             'rgba(255,255,255,0.85)',
        'border-width':      1.5,
      } as cytoscape.Css.Node,
    },
    ...typeStyles,
    {
      selector: 'node[type="network"]',
      style: { 'shape': 'diamond', 'width': 'mapData(deg, 0, 10, 28, 64)', 'height': 'mapData(deg, 0, 10, 28, 64)' } as cytoscape.Css.Node,
    },
    {
      selector: 'node[type="interface"]',
      style: { 'shape': 'ellipse', 'label': '', 'width': 12, 'height': 12, 'border-width': 1.5 } as cytoscape.Css.Node,
    },
    // Scope status → border color (overrides type border, before center override)
    {
      selector: 'node[scopeStatus="in_scope"]',
      style: { 'border-color': '#22c55e', 'border-width': 2.5 } as cytoscape.Css.Node,
    },
    {
      selector: 'node[scopeStatus="out_of_scope"]',
      style: { 'border-color': '#ef4444', 'border-width': 2.5 } as cytoscape.Css.Node,
    },
    {
      selector: 'node[scopeStatus="indeterminate"]',
      style: { 'border-color': '#eab308', 'border-width': 2 } as cytoscape.Css.Node,
    },
    // Center node: yellow border highlight (last → highest priority)
    {
      selector: 'node[?isCenter]',
      style: { 'border-color': '#facc15', 'border-width': 2.5 } as cytoscape.Css.Node,
    },
    {
      selector: 'node[deg > 4]',
      style: { 'border-width': 2, 'font-size': 9 } as cytoscape.Css.Node,
    },
    {
      selector: 'node:selected',
      style: { 'border-color': '#facc15', 'border-width': 3 } as cytoscape.Css.Node,
    },
    {
      selector: 'edge',
      style: {
        'width': 0.8,
        'line-color': 'rgba(140,160,200,0.2)',
        'target-arrow-color': 'rgba(140,160,200,0.2)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.6,
        'curve-style': 'bezier',
        'label': '',
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'edge[etype="interface_service"]',
      style: {
        'line-color': 'rgba(200,80,20,0.2)',
        'target-arrow-color': 'rgba(200,80,20,0.2)',
      } as cytoscape.Css.Edge,
    },
  ];
}

// ── Build graph ───────────────────────────────────────────────────────────
function buildGraph() {
  if (!cy) return;

  const nodes: cytoscape.ElementDefinition[] = [];
  const edges: cytoscape.ElementDefinition[] = [];
  const seenNodes = new Set<number>();

  // Degree count for sizing
  const degree = new Map<number, number>();
  degree.set(props.asset.id, props.relationships.length);
  for (const r of props.relationships) {
    degree.set(r.relatedAssetId, (degree.get(r.relatedAssetId) ?? 0) + 1);
  }

  const scopeOf = (id: number) => props.scopeMap?.[String(id)]?.status ?? 'unknown';

  // Center node
  nodes.push({
    data: {
      id: String(props.asset.id),
      label: nodeLabel(props.asset.type, props.asset.identifier),
      type: props.asset.type,
      isCenter: true,
      deg: props.relationships.length,
      scopeStatus: scopeOf(props.asset.id),
    },
  });
  seenNodes.add(props.asset.id);

  // Neighbor nodes
  for (const r of props.relationships) {
    if (!seenNodes.has(r.relatedAssetId)) {
      nodes.push({
        data: {
          id: String(r.relatedAssetId),
          label: nodeLabel(r.relatedType, r.relatedIdentifier),
          type: r.relatedType,
          isCenter: false,
          deg: degree.get(r.relatedAssetId) ?? 1,
          scopeStatus: scopeOf(r.relatedAssetId),
        },
      });
      seenNodes.add(r.relatedAssetId);
    }

    const src = r.direction === 'outgoing' ? String(props.asset.id) : String(r.relatedAssetId);
    const tgt = r.direction === 'outgoing' ? String(r.relatedAssetId) : String(props.asset.id);
    edges.push({
      data: {
        id: `e-${r.direction}-${r.relatedAssetId}-${r.linkType}`,
        source: src,
        target: tgt,
        etype: r.linkType,
        label: ASSET_LINK_LABELS[r.linkType] ?? '',
      },
    });
  }

  cy.elements().remove();
  cy.add([...nodes, ...edges]);

  const n = nodes.length;
  cy.layout({
    name: 'fcose',
    quality: 'proof',
    animate: false,
    fit: true,
    padding: 28,
    randomize: true,
    nodeRepulsion: () => n > 30 ? 8000 : 16000,
    idealEdgeLength: () => n > 30 ? 55 : 80,
    edgeElasticity: () => 0.45,
    gravity: 0.08,
    gravityRange: 4.0,
    nodeSeparation: 16,
    nodeDimensionsIncludeLabels: true,
    numIter: n > 40 ? 1500 : 3500,
  } as any).run();
}

// ── Types visible in the current graph (for legend) ───────────────────────
const presentTypes = computed(() => {
  const seen = new Set<string>([props.asset.type]);
  for (const r of props.relationships) seen.add(r.relatedType);
  return Object.keys(TYPE_COLOR)
    .filter((t) => seen.has(t) && t !== 'node-group')
    .map((t) => ({ type: t, label: ASSET_TYPE_LABELS[t] ?? t, color: TYPE_BORDER[t] ?? '#888' }));
});

onMounted(() => {
  if (!container.value) return;

  cy = cytoscape({
    container: container.value,
    style: buildStyle(),
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false,
    minZoom: 0.15,
    maxZoom: 4,
  });

  cy.on('tap', 'node', (evt) => {
    const id = Number(evt.target.id());
    if (id !== props.asset.id) emit('nodeClick', id);
  });

  buildGraph();
});

onUnmounted(() => {
  cy?.destroy();
  cy = null;
});

watch([() => props.relationships, () => props.asset.id, () => props.scopeMap], buildGraph, { deep: true });
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100%; min-height:0;">
    <!-- Legend -->
    <div class="rmg-legend">
      <span
        v-for="t in presentTypes"
        :key="t.type"
        class="rmg-legend-item"
      >
        <span class="rmg-legend-dot" :style="{ background: t.color }" />
        {{ t.label }}
      </span>
      <template v-if="scopeMap">
        <span class="rmg-legend-item rmg-legend-sep" />
        <span class="rmg-legend-item">
          <span class="rmg-legend-ring" style="border-color:#22c55e;" />
          In scope
        </span>
        <span class="rmg-legend-item">
          <span class="rmg-legend-ring" style="border-color:#ef4444;" />
          Out
        </span>
        <span class="rmg-legend-item">
          <span class="rmg-legend-ring" style="border-color:#eab308;" />
          Indet.
        </span>
      </template>
      <span class="rmg-legend-item" style="margin-left:auto;">
        <span class="rmg-legend-dot" style="background:#facc15; border-radius: 0;" />
        Current
      </span>
    </div>
    <!-- Graph canvas -->
    <div ref="container" style="flex:1; min-height:0;" />
  </div>
</template>

<style scoped>
.rmg-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.75rem;
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid var(--ares-border);
  flex-shrink: 0;
}
.rmg-legend-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.65rem;
  color: var(--ares-text-muted);
  white-space: nowrap;
}
.rmg-legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--ares-radius);
  flex-shrink: 0;
}
.rmg-legend-ring {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--ares-radius);
  border: 2px solid currentColor;
  flex-shrink: 0;
  background: transparent;
}
.rmg-legend-sep {
  width: 1px;
  height: 12px;
  background: var(--ares-border);
  padding: 0;
  margin: 0 0.15rem;
}
</style>
