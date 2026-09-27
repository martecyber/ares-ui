<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { assetsApi, ASSET_TYPE_LABELS, ASSET_LINK_LABELS, type Asset, type AssetRelationshipDetail, type AssetToolSighting, type AssetToolSightingProject, type ServiceVisibility } from '@/api/assets';
import { dataFieldsFor, parseServiceIdentifier, type DataFieldDef } from '@/api/asset-data-schemas';
import { toolIconSrc, whiteBackingSrc } from '@/utils/tool-icons';
import { projectsApi, type ScopeExplain } from '@/api/projects';
import { detectionsApi, detectionStatusSeverity, detectionStatusLabel, type Detection } from '@/api/detections';
import { findingsApi, statusSeverity, statusLabel, type Finding } from '@/api/findings';
import SeverityTag from '@/components/SeverityTag.vue';
import AresBadge from '@/components/AresBadge.vue';
import HttpSamplesPanel, { type HttpSampleInput } from '@/components/HttpSamplesPanel.vue';
import RelationshipMiniGraph from '@/components/RelationshipMiniGraph.vue';
import EditableField from '@/components/EditableField.vue';
import UrlListField from '@/components/UrlListField.vue';
import ChipListField from '@/components/ChipListField.vue';
import AppPagination from '@/components/AppPagination.vue';
import { isValidIpLiteral, validateHostname } from '@/utils/validators';
import { confirmDialog } from '@/composables/useConfirmDialog';
import TagChipList from '@/components/TagChipList.vue';
import EntityTagEditDialog from '@/components/EntityTagEditDialog.vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import ProgressSpinner from 'primevue/progressspinner';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { isMobile } = useBreakpoint();

const asset = ref<Asset | null>(null);
const relationships = ref<AssetRelationshipDetail[]>([]);
const REL_PAGE_SIZE = 15;
const relPage = ref(0);
const relPageCount = computed(() => Math.ceil(relationships.value.length / REL_PAGE_SIZE));
const relPagedItems = computed(() =>
  relationships.value.slice(relPage.value * REL_PAGE_SIZE, (relPage.value + 1) * REL_PAGE_SIZE)
);
const detections = ref<Detection[]>([]);
const DET_PAGE_SIZE = 10;
const detPage = ref(0);
const detPageCount = computed(() => Math.ceil(detections.value.length / DET_PAGE_SIZE));
const detPagedItems = computed(() =>
  detections.value.slice(detPage.value * DET_PAGE_SIZE, (detPage.value + 1) * DET_PAGE_SIZE)
);
const findings   = ref<Finding[]>([]);
const FIND_PAGE_SIZE = 10;
const findPage = ref(0);
const findPageCount = computed(() => Math.ceil(findings.value.length / FIND_PAGE_SIZE));
const findPagedItems = computed(() =>
  findings.value.slice(findPage.value * FIND_PAGE_SIZE, (findPage.value + 1) * FIND_PAGE_SIZE)
);
const visibility = ref<ServiceVisibility[]>([]);
const toolSightings = ref<AssetToolSighting[]>([]);
const sightingProjects = ref<AssetToolSightingProject[]>([]);
const loading = ref(true);

const orgId = computed(() => route.params.orgId ? Number(route.params.orgId) : null);
const engId = computed(() => route.params.engId ? Number(route.params.engId) : null);

// Parsed metadata object
const meta = computed<Record<string, unknown>>(() => {
  if (!asset.value?.metadata) return {};
  try { return JSON.parse(asset.value.metadata) as Record<string, unknown>; }
  catch { return {}; }
});

// ── Scope status (project context only) ────────────────────────────────
interface ScopeEntry { status: string; override: boolean }
const scopeEntry     = ref<ScopeEntry | null>(null);
const scopeStatusMap = ref<Record<string, { status: string; override: boolean }>>({});
const overrideDialog = ref(false);
const overrideStatus = ref('indeterminate');
const overrideSaving = ref(false);

const SCOPE_OPTIONS = [
  { label: 'In scope',      value: 'in_scope'      },
  { label: 'Out of scope',  value: 'out_of_scope'  },
  { label: 'Indeterminate', value: 'indeterminate'  },
];

function scopeLabel(s: string) {
  return s === 'in_scope' ? 'In scope' : s === 'out_of_scope' ? 'Out of scope' : 'Indeterminate';
}
function scopeSeverity(s: string): 'success' | 'danger' | 'secondary' {
  return s === 'in_scope' ? 'success' : s === 'out_of_scope' ? 'danger' : 'secondary';
}
function openOverrideDialog() {
  if (auth.isClient || !scopeEntry.value) return;
  overrideStatus.value = scopeEntry.value.status;
  overrideDialog.value = true;
}

async function loadScopeStatus() {
  if (!engId.value || !asset.value) return;
  try {
    const map = await projectsApi.getScopeStatuses(engId.value);
    scopeStatusMap.value = map;
    scopeEntry.value = (map[String(asset.value.id)] ?? null) as ScopeEntry | null;
  } catch { /* silent */ }
}

async function saveOverride() {
  if (!engId.value || !asset.value) return;
  overrideSaving.value = true;
  try {
    const result = await projectsApi.setScopeOverride(engId.value, asset.value.id, overrideStatus.value);
    scopeEntry.value = result as ScopeEntry;
    overrideDialog.value = false;
  } finally {
    overrideSaving.value = false;
  }
}

async function clearOverride() {
  if (!engId.value || !asset.value) return;
  await projectsApi.clearScopeOverride(engId.value, asset.value.id);
  await loadScopeStatus();
  await loadScopeExplain();
}

async function saveOverrideAndReload() {
  await saveOverride();
  await loadScopeExplain();
}

// ── Scope explain ──────────────────────────────────────────────────────────
const scopeExplain = ref<ScopeExplain | null>(null);

async function loadScopeExplain() {
  if (!engId.value || !asset.value) return;
  try {
    scopeExplain.value = await projectsApi.explainScope(engId.value, asset.value.id);
  } catch { scopeExplain.value = null; }
}

interface FlatScopeRow {
  id: string;
  entryValue: string;
  entryKind: string;
  inScope: boolean;
  via: string | null;
  viaAssetId: number | null;
  override: boolean;
}

const flatScopeEntries = computed((): FlatScopeRow[] => {
  if (!scopeExplain.value) return [];
  const rows: FlatScopeRow[] = [];
  for (const m of scopeExplain.value.directMatches) {
    rows.push({ id: `dm-${m.id}`, entryValue: m.value, entryKind: m.kind, inScope: m.inScope, via: null, viaAssetId: null, override: false });
  }
  for (const s of scopeExplain.value.propagationSources) {
    for (const m of s.directMatches) {
      rows.push({ id: `ps-${s.assetId}-${m.id}`, entryValue: m.value, entryKind: m.kind, inScope: m.inScope, via: s.identifier, viaAssetId: s.assetId, override: s.override });
    }
  }
  return rows;
});

function scopeEntryKindLabel(kind: string) {
  const labels: Record<string, string> = {
    domain: 'Domain', domain_wildcard: 'Domain wildcard',
    url: 'URL', url_wildcard: 'URL wildcard',
    ip: 'IP', cidr: 'CIDR',
    android_app: 'Android app', ios_app: 'iOS app',
    windows_app: 'Windows app', hardware: 'Hardware',
  };
  return labels[kind] ?? kind;
}

// ── Web application: unified Base URLs list (index 0 = primary, mirrors asset.identifier) ──
const savingWebApp = ref(false);

const webAppBaseUrls = computed<string[]>(() => {
  if (!asset.value) return [];
  const stored = meta.value.baseUrls;
  const list = Array.isArray(stored) ? [...(stored as string[])] : [];
  if (!list.includes(asset.value.identifier)) list.unshift(asset.value.identifier);
  return list;
});

async function saveWebAppBaseUrls(newList: string[]) {
  if (!asset.value) return;
  savingWebApp.value = true;
  try {
    const updated = { ...meta.value, baseUrls: newList };
    asset.value = await assetsApi.update(asset.value.id, {
      identifier: newList[0],
      metadata: JSON.stringify(updated),
    });
  } finally {
    savingWebApp.value = false;
  }
}

// ── Host subtype (draft mirrors asset.hostSubtype, kept for instant UI feedback) ──
const hostSubtypeDraft = ref('unknown');

watch(asset, (a) => {
  if (a?.type === 'host') hostSubtypeDraft.value = a.hostSubtype ?? 'unknown';
}, { immediate: true });

async function saveHostSubtype(newValue: string) {
  if (!asset.value) return;
  hostSubtypeDraft.value = newValue;
  savingFieldKey.value = 'hostSubtype';
  try {
    asset.value = await assetsApi.update(asset.value.id, { hostSubtype: newValue });
  } finally {
    savingFieldKey.value = null;
  }
}

// ── Host: hostnames list (Name/identifier is auto-derived server-side from this list
// unless nameOverride is pinned — see recomputeHostName on the backend) ──────────────
async function saveHostnames(newList: string[]) {
  if (!asset.value) return;
  savingFieldKey.value = 'hostnames';
  try {
    asset.value = await assetsApi.update(asset.value.id, { hostnames: newList });
  } finally {
    savingFieldKey.value = null;
  }
}

const resettingName = ref(false);

async function resetHostName() {
  if (!asset.value) return;
  resettingName.value = true;
  try {
    asset.value = await assetsApi.update(asset.value.id, { nameOverride: false });
  } finally {
    resettingName.value = false;
  }
}

// ── Data panel: generic editable key/value fields, schema per asset type ──────
// Field definitions live in asset-data-schemas.ts (per-type, JSON-shaped descriptors);
// this view just supplies the current asset's live metadata to resolve conditional fields.
const savingFieldKey = ref<string | null>(null);

const dataFields = computed<DataFieldDef[]>(() => {
  if (!asset.value) return [];
  return dataFieldsFor(asset.value.type, meta.value);
});

function fieldDisplayValue(key: string): string {
  if (key === 'identifier') return asset.value?.identifier ?? '';
  if (key === 'hostSubtype') return hostSubtypeDraft.value;
  if (key === 'ipVersion') return asset.value?.identifier.includes(':') ? 'IPv6' : 'IPv4';
  if (key === 'resolvedIps') return resolvedIps.value.join(', ');
  if (asset.value?.type === 'service') {
    const parsed = parseServiceIdentifier(asset.value.identifier);
    if (key === 'host') {
      const v = meta.value.host ?? meta.value.sourceIp ?? parsed?.host;
      return v != null ? String(v) : '';
    }
    if (key === 'ip') {
      const stored = meta.value.ip ?? meta.value.sourceIp;
      if (stored != null) return String(stored);
      return parsed?.host && isValidIpLiteral(parsed.host) ? parsed.host : '';
    }
    if (key === 'protocol') {
      const v = meta.value.protocol ?? meta.value.transport ?? parsed?.proto;
      return v != null ? String(v) : '';
    }
    if (key === 'port') {
      const v = meta.value.port ?? parsed?.port;
      return v != null ? String(v) : '';
    }
  }
  const v = meta.value[key];
  return v != null ? String(v) : '';
}

/** Array-valued Data fields (chip-list editor) — distinct set of observed values per key. */
function fieldListValue(key: string): string[] {
  const v = meta.value[key];
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

async function saveDataField(key: string, value: string) {
  if (key === 'hostSubtype') { await saveHostSubtype(value); return; }
  if (!asset.value) return;
  savingFieldKey.value = key;
  try {
    if (key === 'identifier') {
      asset.value = await assetsApi.update(asset.value.id, { identifier: value });
      return;
    }
    const updated: Record<string, unknown> = { ...meta.value };
    if (value) updated[key] = value; else delete updated[key];
    asset.value = await assetsApi.update(asset.value.id, { metadata: JSON.stringify(updated) });
  } finally {
    savingFieldKey.value = null;
  }
}

async function saveListField(key: string, value: string[]) {
  if (!asset.value) return;
  savingFieldKey.value = key;
  try {
    const updated: Record<string, unknown> = { ...meta.value };
    if (value.length) updated[key] = value; else delete updated[key];
    asset.value = await assetsApi.update(asset.value.id, { metadata: JSON.stringify(updated) });
  } finally {
    savingFieldKey.value = null;
  }
}

// ── Type-specific computed helpers ─────────────────────────────────────────
const openPorts = computed<{ port: number; protocol: string; service?: string; product?: string; version?: string; state?: string }[]>(() => {
  const ports = meta.value.ports;
  if (Array.isArray(ports)) return ports as never[];
  // IP assets from Nmap may store a single port object
  if (meta.value.port) return [{ port: Number(meta.value.port), protocol: String(meta.value.protocol ?? 'tcp'), service: meta.value.service as string }];
  return [];
});

const resolvedIps = computed<string[]>(() => {
  // resolvedIp (Nmap, singular) and ip (Shodan) are legacy/alternate key names for the
  // same fact — read-only fallback here rather than a migration, mirroring how service's
  // host/protocol fields fall back to Shodan's sourceIp/transport.
  const ips = meta.value.resolvedIps ?? meta.value.resolvedIp ?? meta.value.ips ?? meta.value.ip;
  if (Array.isArray(ips)) return ips as string[];
  if (typeof ips === 'string') return [ips];
  return [];
});

// Keys already shown via dedicated multi-value UIs (ports table, base URL list, params table)
// or via the type-aware Data fields above are excluded here to avoid duplicate display.
const ALIAS_SKIP: Record<string, string[]> = {
  web_endpoint: ['status'],
  service: ['transport', 'sourceIp'],
  domain: ['resolvedIp', 'ip'],
  interface: ['host'],
};

function metaEntries() {
  const globalSkip = new Set(['ports', 'ips', 'resolvedIps', 'baseUrls', 'params']);
  const typeSkip = new Set([
    ...dataFields.value.map((f) => f.key),
    ...(ALIAS_SKIP[asset.value?.type ?? ''] ?? []),
  ]);
  return Object.entries(meta.value)
    .filter(([k]) => !globalSkip.has(k) && !typeSkip.has(k))
    .map(([k, v]) => ({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
}

const endpointParams = computed(() => {
  if (asset.value?.type !== 'web_endpoint') return [];
  const p = meta.value.params;
  if (!p || typeof p !== 'object') return [];
  return Object.entries(p as Record<string, string[]>).map(([name, values]) => ({ name, values: Array.isArray(values) ? values : [String(values)] }));
});

async function load() {
  loading.value = true;
  try {
    const assetId = Number(route.params.id);
    const isProjectCtx = !!engId.value;

    const [a, rel, det, fnd, sightings, sightingProjs] = await Promise.all([
      assetsApi.get(assetId),
      assetsApi.listRelationships(assetId).catch(() => [] as AssetRelationshipDetail[]),
      // Detections only in project context
      isProjectCtx
        ? detectionsApi.list({ assetId: [assetId], size: 100 }).then((r) => r.items).catch(() => [] as Detection[])
        : Promise.resolve([] as Detection[]),
      // Findings: project scope or org scope
      isProjectCtx
        ? findingsApi.listByAsset(assetId, { projectId: engId.value! }).catch(() => [] as Finding[])
        : findingsApi.listByAsset(assetId, { organizationId: orgId.value ?? undefined }).catch(() => [] as Finding[]),
      // Discovered by — project context shows which tools; organization context shows which
      // projects instead, never the tool (see backend AssetToolSighting's own isolation rationale).
      isProjectCtx
        ? assetsApi.listToolSightings(assetId, engId.value!).catch(() => [] as AssetToolSighting[])
        : Promise.resolve([] as AssetToolSighting[]),
      isProjectCtx
        ? Promise.resolve([] as AssetToolSightingProject[])
        : assetsApi.listToolSightingProjects(assetId, orgId.value!).catch(() => [] as AssetToolSightingProject[]),
    ]);
    asset.value = a;
    relationships.value = rel;
    detections.value = det;
    findings.value   = fnd;
    toolSightings.value = sightings;
    sightingProjects.value = sightingProjs;
    relPage.value = 0;
    detPage.value = 0;
    findPage.value = 0;
    // Visibility — only meaningful for SERVICE-type assets
    if (a.type === 'service') {
      visibility.value = await assetsApi.visibility(assetId).catch(() => [] as ServiceVisibility[]);
    } else {
      visibility.value = [];
    }
    await loadScopeStatus();
    await loadScopeExplain();
  } finally {
    loading.value = false;
  }
}

// ── Tags ───────────────────────────────────────────────────────────────────
const showTagEditor = ref(false);

async function assignTag(tagId: number) {
  if (!asset.value) return;
  asset.value = await assetsApi.assignTag(asset.value.id, tagId);
}

async function unassignTag(tagId: number) {
  if (!asset.value) return;
  asset.value = await assetsApi.unassignTag(asset.value.id, tagId);
}

function goToFinding(findingId: number) {
  if (orgId.value && engId.value) {
    router.push({ name: 'org-project-finding-detail', params: { orgId: orgId.value, engId: engId.value, id: findingId } });
  } else if (orgId.value) {
    router.push({ name: 'org-finding-detail', params: { orgId: orgId.value, id: findingId } });
  }
}

function goToDetection(id: number) {
  if (engId.value && orgId.value) {
    router.push({ name: 'org-project-detection-detail', params: { orgId: orgId.value, engId: engId.value, id } });
  } else {
    router.push({ name: 'org-detection-detail', params: { orgId: orgId.value, id } });
  }
}

function visibilityStateSeverity(s: string) {
  switch (s) {
    case 'OPEN':     return 'success';
    case 'FILTERED': return 'warn';
    case 'CLOSED':   return 'secondary';
    default:         return 'secondary';
  }
}

function formatVisibilityTs(ts: string) {
  return new Date(ts).toLocaleString();
}

function goToRelatedAsset(relatedAssetId: number) {
  if (orgId.value && engId.value) {
    router.push({ name: 'org-project-asset-detail', params: { orgId: orgId.value, engId: engId.value, id: relatedAssetId } });
  } else if (orgId.value) {
    router.push({ name: 'org-asset-detail', params: { orgId: orgId.value, id: relatedAssetId } });
  }
}

async function removeOrHideRelationship(r: AssetRelationshipDetail, event: Event) {
  event.stopPropagation();
  if (!asset.value) return;
  const fromAssetId = r.direction === 'outgoing' ? asset.value.id : r.relatedAssetId;
  const toAssetId   = r.direction === 'outgoing' ? r.relatedAssetId : asset.value.id;
  if (engId.value) {
    const ok = await confirmDialog({
      header: 'Hide relationship',
      message: 'Hide this relationship from the project graph? It remains visible in other projects.',
      acceptLabel: 'Hide',
      acceptSeverity: 'warn',
      acceptIcon: 'pi pi-eye-slash',
    });
    if (!ok) return;
    await projectsApi.hideRelationship(engId.value, fromAssetId, toAssetId, r.linkType);
  } else {
    const ok = await confirmDialog({
      header: 'Remove relationship',
      message: 'Remove this relationship? It will be deleted for every project sharing these assets.',
      acceptLabel: 'Remove',
    });
    if (!ok) return;
    await assetsApi.removeRelationship(fromAssetId, toAssetId, r.linkType);
  }
  relationships.value = relationships.value.filter(
    (x) => !(x.relatedAssetId === r.relatedAssetId && x.linkType === r.linkType && x.direction === r.direction)
  );
}

onMounted(load);

// ── Delete (org context) ───────────────────────────────────────────────────
const deleteDialog  = ref(false);
const deleteLoading = ref(false);

async function doDelete() {
  if (!asset.value) return;
  deleteLoading.value = true;
  try {
    await assetsApi.delete(asset.value.id);
    router.back();
  } finally {
    deleteLoading.value = false;
  }
}

// ── Hide (project context) ──────────────────────────────────────────────
const hideDialog  = ref(false);
const hideLoading = ref(false);

async function doHide() {
  if (!asset.value || !engId.value) return;
  hideLoading.value = true;
  try {
    await projectsApi.removeAsset(engId.value, asset.value.id);
    router.back();
  } finally {
    hideLoading.value = false;
  }
}

// Reload when navigating from one asset detail to another (same component, different params)
watch(() => route.params.id, (newId, oldId) => { if (newId && newId !== oldId) load(); });
</script>

<template>
  <div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:4rem;">
      <ProgressSpinner />
    </div>

    <template v-else-if="asset">
      <!-- Header -->
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.5rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <Button icon="pi pi-arrow-left" severity="secondary" text @click="router.back()" />
          <h2 class="ares-page-title" style="margin:0;">{{ asset.identifier }}</h2>
        </div>
        <div v-if="!auth.isClient" style="display:flex; align-items:center; gap:0.5rem;">
          <!-- Hide button — project context only -->
          <Button
            v-if="engId"
            icon="pi pi-eye-slash"
            text
            size="small"
            severity="secondary"
            v-tooltip.left="'Hide from this project'"
            @click="hideDialog = true"
          />
          <!-- Delete button — org context only -->
          <Button
            v-if="!engId"
            icon="pi pi-trash"
            text
            size="small"
            severity="danger"
            v-tooltip.left="'Permanently delete this asset'"
            @click="deleteDialog = true"
          />
        </div>
      </div>

      <!-- Data (type-specific, editable) + Meta (code/type/scope/stats) -->
      <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <div class="ares-card detail-grid__meta" style="padding:0;">
          <div class="ares-card-section-header"><span class="section-header-label">Meta</span></div>
          <div class="detail-grid__body">
            <dl class="ares-dl">
              <dt>Code</dt>
              <dd style="font-family:monospace;">{{ asset.code }}</dd>
              <dt>Type</dt>
              <dd><AresBadge :value="ASSET_TYPE_LABELS[asset.type] ?? asset.type" severity="secondary" /></dd>
              <dt>Tags</dt>
              <dd>
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.4rem;">
                  <TagChipList :tags="asset.tags" :limit="6" />
                  <Button
                    v-if="!auth.isClient"
                    icon="pi pi-pencil"
                    text
                    size="small"
                    severity="secondary"
                    v-tooltip="'Edit tags'"
                    style="width:1.6rem; height:1.6rem; padding:0;"
                    @click="showTagEditor = true"
                  />
                </div>
              </dd>
              <template v-if="engId && scopeEntry">
                <dt>Scope</dt>
                <dd>
                  <span
                    :style="{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', cursor: auth.isClient ? 'default' : 'pointer' }"
                    v-tooltip="auth.isClient ? undefined : (scopeEntry.override ? 'Manual override — click to change' : 'Auto-classified — click to override')"
                    @click="openOverrideDialog"
                  >
                    <i v-if="scopeEntry.override" class="pi pi-pencil" style="font-size:0.58rem; opacity:0.75;" />
                    <AresBadge :value="scopeLabel(scopeEntry.status)" :severity="scopeSeverity(scopeEntry.status)" />
                  </span>
                  <Button
                    v-if="scopeEntry.override && !auth.isClient"
                    icon="pi pi-times"
                    text
                    size="small"
                    severity="secondary"
                    v-tooltip="'Clear override'"
                    style="width:1.4rem; height:1.4rem; padding:0; vertical-align:middle;"
                    @click="clearOverride"
                  />
                </dd>
              </template>
              <dt>Detections</dt>
              <dd>{{ detections.length }}</dd>
              <dt>Relationships</dt>
              <dd>{{ relationships.length }}</dd>
              <dt>Discovered</dt>
              <dd>{{ asset.createdAt.slice(0, 10) }}</dd>
              <dt>Last modified</dt>
              <dd>{{ asset.updatedAt ? asset.updatedAt.slice(0, 10) : '—' }}</dd>
            </dl>
          </div>
        </div>

        <div class="ares-card detail-grid__data" style="padding:0;">
          <div class="ares-card-section-header"><span class="section-header-label">Data</span></div>
          <div class="detail-grid__body">
            <dl class="ares-dl">
              <template v-for="f in dataFields" :key="f.key">
                <dt>{{ f.label }}</dt>
                <dd>
                  <!-- Read-only for clients — plain text, no edit affordances -->
                  <template v-if="auth.isClient">
                    <span v-if="f.editor === 'chip-list' || f.editor === 'hostname-list' || f.editor === 'url-list'" style="font-size:0.85rem;">
                      {{ (f.editor === 'url-list' ? webAppBaseUrls : f.editor === 'hostname-list' ? (asset.hostnames ?? []) : fieldListValue(f.key)).join(', ') || '—' }}
                    </span>
                    <span v-else style="font-size:0.85rem;">{{ fieldDisplayValue(f.key) || '—' }}</span>
                  </template>
                  <div v-else-if="f.key === 'identifier' && asset.type === 'host' && asset.nameOverride"
                    style="display:flex; align-items:center; gap:0.4rem;">
                    <EditableField
                      :model-value="fieldDisplayValue(f.key)"
                      editor="text"
                      :validate="f.validate"
                      :saving="savingFieldKey === f.key"
                      @save="(v) => saveDataField(f.key, v)"
                      style="flex:1;"
                    />
                    <Button icon="pi pi-replay" text rounded size="small" severity="secondary"
                      :loading="resettingName" v-tooltip.top="'Reset to auto-naming from Hostnames'"
                      @click="resetHostName" />
                  </div>
                  <UrlListField
                    v-else-if="f.editor === 'url-list'"
                    :model-value="webAppBaseUrls"
                    :saving="savingWebApp"
                    @save="saveWebAppBaseUrls"
                  />
                  <UrlListField
                    v-else-if="f.editor === 'hostname-list'"
                    :model-value="asset.hostnames ?? []"
                    :validate="validateHostname"
                    placeholder="e.g. web01.corp.local"
                    :min-items="0"
                    :saving="savingFieldKey === 'hostnames'"
                    @save="saveHostnames"
                  />
                  <ChipListField
                    v-else-if="f.editor === 'chip-list'"
                    :model-value="fieldListValue(f.key)"
                    :validate="f.validate"
                    :chip-color="f.chipColor"
                    :saving="savingFieldKey === f.key"
                    @save="(v) => saveListField(f.key, v)"
                  />
                  <EditableField
                    v-else
                    :model-value="fieldDisplayValue(f.key)"
                    :editor="f.editor"
                    :options="f.options"
                    :validate="f.validate"
                    :chip-color="f.chipColor"
                    :saving="savingFieldKey === f.key"
                    @save="(v) => saveDataField(f.key, v)"
                  />
                </dd>
              </template>
            </dl>
          </div>
        </div>
      </div>

      <!-- ── IP-specific: open ports list ── -->
      <template v-if="asset.type === 'ip'">
        <div v-if="openPorts.length" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
          <div class="ares-card-section-header"><span>Open ports</span></div>
          <table class="ares-table">
            <thead>
              <tr>
                <th style="width:80px;">Port</th>
                <th style="width:80px;">Protocol</th>
                <th>Service</th>
                <th>Product / Version</th>
                <th style="width:80px;">State</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in openPorts" :key="`${p.port}/${p.protocol}`">
                <td><code>{{ p.port }}</code></td>
                <td style="color:var(--ares-text-muted); font-size:0.8rem;">{{ p.protocol }}</td>
                <td>{{ p.service ?? '—' }}</td>
                <td style="font-size:0.8rem; color:var(--ares-text-muted);">
                  {{ [p.product, p.version].filter(Boolean).join(' ') || '—' }}
                </td>
                <td><AresBadge :value="p.state ?? 'open'" severity="success" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- ── Web endpoint ── -->
      <template v-else-if="asset.type === 'web_endpoint'">
        <div v-if="endpointParams.length" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Observed parameters <span class="section-badge">{{ endpointParams.length }}</span></span>
          </div>
          <table class="ares-table">
            <thead>
              <tr>
                <th style="width:220px;">Parameter</th>
                <th>Observed values</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in endpointParams" :key="p.name">
                <td><code style="font-size:0.82rem;">{{ p.name }}</code></td>
                <td>
                  <div style="display:flex; flex-wrap:wrap; gap:0.3rem;">
                    <code v-for="v in p.values" :key="v"
                          style="font-size:0.78rem; background:var(--ares-surface-2); padding:0.15rem 0.45rem; border-radius: var(--ares-radius); word-break:break-all;">
                      {{ v }}
                    </code>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <HttpSamplesPanel
          :load="() => assetsApi.listHttpSamples(asset!.id)"
          :create="(body: HttpSampleInput) => assetsApi.createHttpSample(asset!.id, body)"
          :update="(sid: number, body: HttpSampleInput) => assetsApi.updateHttpSample(asset!.id, sid, body)"
          :remove="(sid: number) => assetsApi.deleteHttpSample(asset!.id, sid)"
        />
      </template>
      <!-- ── Extra metadata (any remaining keys) ── -->
      <div v-if="asset.type !== 'web_endpoint' && metaEntries().length" class="ares-card" style="margin-bottom:1.25rem;">
        <p class="section-label">Additional metadata</p>
        <dl class="ares-dl">
          <template v-for="e in metaEntries()" :key="e.key">
            <dt>{{ e.key }}</dt>
            <dd style="font-family:monospace; font-size:0.82rem; word-break:break-all;">{{ e.value }}</dd>
          </template>
        </dl>
      </div>

      <!-- Discovered by (all asset types) — project context: which tools; organization
           context: which projects instead, never the tool (project-exclusive information). -->
      <div class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Discovered by
            <span v-if="engId ? toolSightings.length : sightingProjects.length" class="section-badge">{{ engId ? toolSightings.length : sightingProjects.length }}</span>
          </span>
        </div>
        <table v-if="engId" class="ares-table">
          <thead>
            <tr>
              <th style="width:72px;">Tool</th>
              <th>First seen</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in toolSightings" :key="s.id">
              <td>
                <span v-tooltip.top="s.tool" class="tool-icon-wrap">
                  <span v-if="toolIconSrc(s.tool)" class="tool-icon-stack">
                    <img v-if="whiteBackingSrc(s.tool)" :src="whiteBackingSrc(s.tool)" class="tool-icon-img" alt="" aria-hidden="true" />
                    <img :src="toolIconSrc(s.tool)" class="tool-icon-img" :alt="s.tool" />
                  </span>
                  <i v-else class="pi pi-wrench tool-icon-pi" />
                </span>
              </td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ new Date(s.firstSeenAt).toLocaleString() }}</td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ new Date(s.lastSeenAt).toLocaleString() }}</td>
            </tr>
            <tr v-if="!toolSightings.length">
              <td colspan="3" class="ares-table-empty">No tool sightings recorded yet.</td>
            </tr>
          </tbody>
        </table>
        <table v-else class="ares-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th style="width:1px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in sightingProjects" :key="p.projectId">
              <td>{{ p.projectName }}</td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ new Date(p.firstSeenAt).toLocaleString() }}</td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ new Date(p.lastSeenAt).toLocaleString() }}</td>
              <td>
                <Button label="View in project" size="small" severity="secondary" text
                  @click="router.push({ name: 'org-project-asset-detail', params: { orgId: orgId!, engId: p.projectId, id: asset!.id } })" />
              </td>
            </tr>
            <tr v-if="!sightingProjects.length">
              <td colspan="4" class="ares-table-empty">Not discovered in any project yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Findings + Detections: side-by-side independent cards (stacked on mobile) -->
      <div :class="['lists-row', { 'lists-row--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <!-- Findings (always shown: org scope or project scope) -->
        <div class="ares-card lists-row__card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Findings <span v-if="findings.length" class="section-badge">{{ findings.length }}</span></span>
          </div>
          <div class="lists-row__table-wrap">
            <table class="ares-table">
              <thead>
                <tr>
                  <th style="width:70px;">Sev.</th>
                  <th>Title</th>
                  <th style="width:110px;">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="f in findPagedItems"
                  :key="f.id"
                  style="cursor:pointer;"
                  @click="goToFinding(f.id)"
                >
                  <td><SeverityTag :level="f.severity" short scale="priority" /></td>
                  <td>
                    <div>{{ f.title }}</div>
                    <div v-if="f.code" style="font-size:0.72rem; color:var(--ares-text-muted); font-family:monospace;">{{ f.code }}</div>
                  </td>
                  <td><AresBadge :value="statusLabel(f.statusName)" :severity="statusSeverity(f.statusName)" /></td>
                </tr>
                <tr v-if="!findings.length">
                  <td colspan="3" class="ares-table-empty">No findings linked to this asset.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <AppPagination :page="findPage" :total-pages="findPageCount" :total="findings.length" @prev="findPage--" @next="findPage++" />
        </div>

        <!-- Detections (project context only) -->
        <div v-if="engId" class="ares-card lists-row__card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Detections <span v-if="detections.length" class="section-badge">{{ detections.length }}</span></span>
          </div>
          <div class="lists-row__table-wrap">
            <table class="ares-table">
              <thead>
                <tr>
                  <th style="width:70px;">Sev.</th>
                  <th>Title</th>
                  <th style="width:110px;">Status</th>
                  <th style="width:100px;">Last seen</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="d in detPagedItems"
                  :key="d.id"
                  style="cursor:pointer;"
                  @click="goToDetection(d.id)"
                >
                  <td><SeverityTag :level="d.severity" short scale="priority" /></td>
                  <td>
                    <div>{{ d.title }}</div>
                    <div v-if="d.sourceTemplateId" style="font-size:0.72rem; color:var(--ares-text-muted);">{{ d.sourceTemplateId }}</div>
                  </td>
                  <td><AresBadge :value="detectionStatusLabel(d.status)" :severity="detectionStatusSeverity(d.status)" /></td>
                  <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ d.lastSeen ? d.lastSeen.slice(0, 10) : '—' }}</td>
                </tr>
                <tr v-if="!detections.length">
                  <td colspan="4" class="ares-table-empty">No detections linked to this asset.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <AppPagination :page="detPage" :total-pages="detPageCount" :total="detections.length" @prev="detPage--" @next="detPage++" />
        </div>
      </div>

      <!-- Relationships -->
      <div class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">
            Relationships
            <span v-if="relationships.length" class="section-badge">{{ relationships.length }}</span>
          </span>
          <!-- Pagination controls -->
          <span v-if="relPageCount > 1" style="display:flex; align-items:center; gap:0.35rem; margin-left:auto;">
            <span style="font-size:0.72rem; color:var(--ares-text-muted); white-space:nowrap;">
              {{ relPage * REL_PAGE_SIZE + 1 }}–{{ Math.min((relPage + 1) * REL_PAGE_SIZE, relationships.length) }}
              of {{ relationships.length }}
            </span>
            <button class="rel-page-btn" :disabled="relPage === 0" @click="relPage--">
              <i class="pi pi-angle-left" style="font-size:0.75rem;" />
            </button>
            <button class="rel-page-btn" :disabled="relPage >= relPageCount - 1" @click="relPage++">
              <i class="pi pi-angle-right" style="font-size:0.75rem;" />
            </button>
          </span>
        </div>

        <!-- Split: table left, graph right (stacked on mobile) -->
        <div :class="['rel-split', { 'rel-split--stacked': isMobile }]">
          <!-- Table -->
          <div class="rel-table-col">
            <table class="ares-table">
              <thead>
                <tr>
                  <th style="width:120px;">Code</th>
                  <th style="width:130px;">Link</th>
                  <th style="width:85px;">Type</th>
                  <th>Identifier</th>
                  <th v-if="engId" style="width:90px;">Scope</th>
                  <th style="width:70px;">Dir</th>
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in relPagedItems"
                  :key="`${r.direction}-${r.relatedAssetId}-${r.linkType}`"
                  style="cursor:pointer;"
                  @click="goToRelatedAsset(r.relatedAssetId)"
                >
                  <td><code style="font-size:0.72rem; color:var(--ares-text-muted);">{{ r.relatedCode }}</code></td>
                  <td style="font-size:0.78rem; color:var(--ares-text-muted);">{{ ASSET_LINK_LABELS[r.linkType] ?? r.linkType }}</td>
                  <td><span style="font-size:0.76rem; color:var(--ares-text-2);">{{ ASSET_TYPE_LABELS[r.relatedType] ?? r.relatedType }}</span></td>
                  <td style="font-family:monospace; font-size:0.8rem;">{{ r.relatedIdentifier }}</td>
                  <td v-if="engId">
                    <template v-if="scopeStatusMap[String(r.relatedAssetId)]">
                      <i v-if="scopeStatusMap[String(r.relatedAssetId)].override" class="pi pi-pencil" style="font-size:0.55rem; opacity:0.6; margin-right:0.2rem;" />
                      <span :class="['scope-pill',
                        scopeStatusMap[String(r.relatedAssetId)].status === 'in_scope' ? 'scope-pill--in' :
                        scopeStatusMap[String(r.relatedAssetId)].status === 'out_of_scope' ? 'scope-pill--out' : 'scope-pill--ind']">
                        {{ scopeLabel(scopeStatusMap[String(r.relatedAssetId)].status) }}
                      </span>
                    </template>
                    <span v-else style="color:var(--ares-text-muted); font-size:0.75rem;">—</span>
                  </td>
                  <td>
                    <span :class="r.direction === 'outgoing' ? 'rel-dir rel-dir--out' : 'rel-dir rel-dir--in'">
                      <i :class="r.direction === 'outgoing' ? 'pi pi-arrow-right' : 'pi pi-arrow-left'" style="font-size:0.65rem;" />
                      {{ r.direction === 'outgoing' ? 'Out' : 'In' }}
                    </span>
                  </td>
                  <td>
                    <Button
                      v-if="!auth.isClient"
                      :icon="engId ? 'pi pi-eye-slash' : 'pi pi-trash'"
                      text rounded size="small"
                      :severity="engId ? 'warn' : 'danger'"
                      :title="engId ? 'Hide from project' : 'Remove relationship'"
                      @click="removeOrHideRelationship(r, $event)"
                    />
                  </td>
                </tr>
                <tr v-if="!relationships.length">
                  <td :colspan="engId ? 7 : 6" class="ares-table-empty">No relationships defined for this asset.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mini graph (right on desktop, below on mobile) -->
          <div v-if="relationships.length && asset" class="rel-graph-col">
            <RelationshipMiniGraph
              :asset="asset"
              :relationships="relationships"
              :scope-map="engId ? scopeStatusMap : undefined"
              @nodeClick="goToRelatedAsset"
            />
          </div>
        </div>
      </div>

      <!-- Scope classification (project context only) -->
      <div v-if="engId && scopeExplain && flatScopeEntries.length" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Scope classification</span>
        </div>
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:90px;">Kind</th>
              <th>Entry</th>
              <th style="width:105px;">Result</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in flatScopeEntries" :key="row.id">
              <td style="font-size:0.75rem; color:var(--ares-text-muted);">
                {{ row.entryKind === '—' ? '—' : scopeEntryKindLabel(row.entryKind) }}
              </td>
              <td>
                <code v-if="row.entryValue !== '—'" style="font-size:0.78rem;">{{ row.entryValue }}</code>
                <span v-else style="color:var(--ares-text-muted);">—</span>
              </td>
              <td>
                <span :class="['scope-pill', row.inScope ? 'scope-pill--in' : 'scope-pill--out']">
                  {{ row.inScope ? 'In scope' : 'Out of scope' }}
                </span>
              </td>
              <td>
                <span v-if="!row.via" class="scope-source-direct">Direct</span>
                <span v-else class="scope-source-via">
                  <i class="pi pi-arrow-right" style="font-size:0.6rem; opacity:0.5;" />
                  <button type="button" class="scope-asset-link" @click="goToRelatedAsset(row.viaAssetId!)">{{ row.via }}</button>
                  <i v-if="row.override" class="pi pi-pencil" style="font-size:0.55rem; opacity:0.55; margin-left:0.2rem;" v-tooltip.top="'Override on source asset'" />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Visibility (SERVICE assets only) -->
      <div v-if="asset.type === 'service'" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Visibility <span v-if="visibility.length" class="section-badge">{{ visibility.length }}</span></span>
        </div>
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:180px;">Source IP</th>
              <th style="width:160px;">NAC profile</th>
              <th style="width:120px;">State</th>
              <th>First seen</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in visibility" :key="`${v.sourceIp}|${v.nacProfile}`">
              <td style="font-family:monospace; font-size:0.85rem;">{{ v.sourceIp }}</td>
              <td>
                <span v-if="v.nacProfile" class="nac-tag">{{ v.nacProfile }}</span>
                <span v-else style="color:var(--ares-text-muted); font-size:0.8rem;">—</span>
              </td>
              <td><AresBadge :value="v.state" :severity="visibilityStateSeverity(v.state)" /></td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ formatVisibilityTs(v.firstSeen) }}</td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ formatVisibilityTs(v.lastSeen) }}</td>
            </tr>
            <tr v-if="!visibility.length">
              <td colspan="5" class="ares-table-empty">
                No visibility records yet. Re-import scans with a source IP to track reachability.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else style="color:var(--ares-text-muted); padding:3rem; text-align:center;">
      Asset not found.
    </div>

    <!-- Delete dialog (org context) -->
    <Dialog v-model:visible="deleteDialog" header="Delete asset" modal style="width:24rem;">
      <p style="color:var(--ares-text-2); margin-bottom:1rem; font-size:0.88rem;">
        Permanently delete <strong style="font-family:monospace; color:var(--ares-accent);">{{ asset?.identifier }}</strong>?
        This cannot be undone and will remove all its relationships.
      </p>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" size="small" @click="deleteDialog = false" />
        <Button label="Delete" severity="danger" size="small" icon="pi pi-trash" :loading="deleteLoading" @click="doDelete" />
      </div>
    </Dialog>

    <!-- Hide dialog (project context) -->
    <Dialog v-model:visible="hideDialog" header="Hide asset" modal style="width:24rem;">
      <p style="color:var(--ares-text-2); margin-bottom:1rem; font-size:0.88rem;">
        Hide <strong style="font-family:monospace; color:var(--ares-accent);">{{ asset?.identifier }}</strong>
        from this project? The asset remains in the organization and can be re-added later.
      </p>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" size="small" @click="hideDialog = false" />
        <Button label="Hide" severity="warn" size="small" icon="pi pi-eye-slash" :loading="hideLoading" @click="doHide" />
      </div>
    </Dialog>

    <!-- Scope override dialog -->
    <Dialog v-model:visible="overrideDialog" header="Override scope status" modal style="width:22rem;">
      <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem;">
        <p style="font-size:0.85rem; color:var(--ares-text-muted); margin:0;">
          The classifier will not overwrite this until the override is cleared.
        </p>
        <Select v-model="overrideStatus" :options="SCOPE_OPTIONS" option-label="label" option-value="value" class="w-full" />
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" size="small" @click="overrideDialog = false" />
          <Button label="Save" size="small" :loading="overrideSaving" @click="saveOverrideAndReload" />
        </div>
      </div>
    </Dialog>

    <!-- Edit this asset's tags -->
    <EntityTagEditDialog
      v-if="orgId"
      v-model:visible="showTagEditor"
      :org-id="orgId"
      :assigned-tags="asset?.tags"
      :assign="assignTag"
      :unassign="unassignTag"
    />
  </div>
</template>

<style scoped>
.section-header-label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.section-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  line-height: 1;
}
/* Data (left, 2/3) + Meta (right, 1/3) header row */
.detail-grid {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}
.detail-grid__data {
  flex: 2;
  order: 1;
  min-width: 0;
}
.detail-grid__meta {
  flex: 1;
  order: 2;
  min-width: 0;
}
.detail-grid--stacked {
  flex-direction: column;
  align-items: stretch;
}
.detail-grid--stacked .detail-grid__meta {
  order: 1;
}
.detail-grid--stacked .detail-grid__data {
  order: 2;
}
.detail-grid__body {
  padding: 1rem 1.25rem 1.25rem;
}

/* Findings + Detections: independent cards side by side */
.lists-row {
  display: flex;
  gap: 1.25rem;
}
.lists-row__card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.lists-row__table-wrap {
  min-height: 220px;
}
.lists-row--stacked {
  flex-direction: column;
}

.section-label {
  font-size: 0.75rem;
  color: var(--ares-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.65rem;
  font-weight: 600;
}
.ares-dl {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.4rem 1rem;
  font-size: 0.85rem;
}
.ares-dl dt {
  color: var(--ares-text-muted);
  font-size: 0.8rem;
  padding-top: 0.1rem;
}
.ares-dl dd {
  margin: 0;
  color: var(--ares-text-2);
  line-height: 1.5;
}

.rel-dir {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15em 0.55em;
  border-radius: var(--ares-radius);
}
.rel-dir--out {
  background: color-mix(in srgb, var(--p-primary-500) 15%, transparent);
  color: var(--p-primary-300);
}
.rel-dir--in {
  background: color-mix(in srgb, #22c55e 12%, transparent);
  color: #4ade80;
}

.nac-tag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 30%, transparent);
  border-radius: var(--ares-radius);
  font-size: 0.75rem;
  font-family: monospace;
  color: var(--ares-text-1);
}

.tool-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--ares-radius);
  cursor: default;
  transition: opacity 0.15s;
}
.tool-icon-wrap:hover {
  opacity: 0.8;
}
.tool-icon-stack {
  position: relative;
  width: 20px;
  height: 20px;
}
.tool-icon-img {
  width: 20px;
  height: 20px;
  display: block;
  object-fit: contain;
  border-radius: var(--ares-radius);
}
.tool-icon-stack .tool-icon-img {
  position: absolute;
  inset: 0;
}
.tool-icon-pi {
  font-size: 0.8rem;
  color: var(--ares-text-muted);
}

/* Relationships split layout */
.rel-split {
  display: flex;
  flex-direction: row;
  min-height: 0;
}
.rel-table-col {
  flex: 1 1 0;
  min-width: 0;
  overflow-x: auto;
}
.rel-graph-col {
  flex: 0 0 44%;
  max-width: 44%;
  border-left: 1px solid var(--ares-border);
  min-height: 320px;
}
/* Mobile: stack vertically */
.rel-split--stacked {
  flex-direction: column;
}
.rel-split--stacked .rel-graph-col {
  flex: 0 0 auto;
  max-width: 100%;
  border-left: none;
  border-top: 1px solid var(--ares-border);
  height: 270px;
  min-height: 270px;
}
@media (max-width: 767px) {
  .rel-split {
    flex-direction: column;
  }
  .rel-graph-col {
    flex: 0 0 auto;
    max-width: 100%;
    border-left: none;
    border-top: 1px solid var(--ares-border);
    height: 270px;
    min-height: 270px;
  }
}

.rel-page-btn {
  background: none;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.3rem;
  cursor: pointer;
  color: var(--ares-text);
  line-height: 1;
}
.rel-page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.rel-page-btn:not(:disabled):hover {
  background: var(--ares-hover);
}
.scope-explain-group-label {
  margin: 0;
  padding: 0.4rem 1rem 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ares-text-muted);
}
.scope-pill {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: var(--ares-radius);
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}
.scope-pill--in  { background: rgba(34,197,94,.15); color: #16a34a; }
.scope-pill--out { background: rgba(239,68,68,.13); color: #dc2626; }
.scope-pill--ind { background: rgba(234,179,8,.15); color: #ca8a04; }
.scope-asset-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--ares-accent);
  font-size: 0.78rem;
  font-family: monospace;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.scope-asset-link:hover { opacity: 0.75; }

.scope-source-direct {
  display: inline-flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--p-primary-300);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  padding: 0.1rem 0.45rem;
  border-radius: var(--ares-radius);
}
.scope-source-via {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--ares-text-muted);
}
</style>
