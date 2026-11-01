<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import AresLoadingState from '@/components/AresLoadingState.vue';
import AppPagination from '@/components/AppPagination.vue';
import AddAssetDialog, { type NewAssetPayload } from '@/components/AddAssetDialog.vue';
import AssetBulkBar from '@/components/AssetBulkBar.vue';
import AssetGraph from '@/components/AssetGraph.vue';
import AddRelationshipDialog from '@/components/AddRelationshipDialog.vue';
import AssetGraphLoader from '@/components/AssetGraphLoader.vue';
import AssetListFilters from '@/components/AssetListFilters.vue';
import AssetListTable from '@/components/AssetListTable.vue';
import AssetViewToggle from '@/components/AssetViewToggle.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import MergeAssetDialog from '@/components/MergeAssetDialog.vue';
import TagManagerDialog from '@/components/TagManagerDialog.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { useAssetList } from '@/composables/useAssetList';
import { projectsApi } from '@/api/projects';
import { assetsApi, ASSET_TYPE_LABELS, type Asset, type AssetRelationship } from '@/api/assets';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';

const route   = useRoute();
const router  = useRouter();
const context = useContextStore();
const auth    = useAuthStore();
const toast   = useToast();
const engId   = computed(() => Number(route.params.engId));
const orgId   = computed(() => Number(route.params.orgId));

// ── Scope status ───────────────────────────────────────────────────────────
type ScopeStatus = 'in_scope' | 'out_of_scope' | 'indeterminate' | 'third_party';
interface ScopeEntry { status: ScopeStatus; override: boolean }
const scopeMap    = ref<Record<string, ScopeEntry>>({});
const filterScope = ref<string[]>([]);

function scopeOf(assetId: number): ScopeEntry {
  return scopeMap.value[String(assetId)] ?? { status: 'indeterminate', override: false };
}

async function loadScopeStatuses() {
  try {
    scopeMap.value = await projectsApi.getScopeStatuses(engId.value) as Record<string, ScopeEntry>;
  } catch { /* silent */ }
}

const list = useAssetList({
  scope: () => ({ projectId: engId.value }),
  loadRelationships: () => assetsApi.listProjectRelationships(engId.value),
  extraListParams: () => ({ scopeStatus: filterScope.value.length ? filterScope.value : undefined }),
  extraServerSortCols: ['scope'],
  isThirdParty: (a) => scopeOf(a.id).status === 'third_party',
});
const {
  viewMode, switchMode, loading, page, totalPages, total, sortCol, sortDir, onSort,
  selectedIds, selectedAssets, canMergeSelection, clearSelection, openSelectionMerge,
  graphAssets, graphRelationships, graphLoading, graphLoadCount, graphLoadTotal,
  showMergeDialog, mergeSource, mergeTarget, openMerge, onMerged,
  showLinkDialog, linkSource, linkTarget, openLink, onLinked,
  loadList, loadTypeCounts, refreshAll, removeLocally, removeRelationshipLocally, typeCounts,
} = list;

function setFilterScope(v: string[]) {
  filterScope.value = v;
  if (page.value === 0) loadList(); else page.value = 0;
}

function assetRoute(id: number) {
  return { name: 'org-project-asset-detail', params: { orgId: orgId.value, engId: engId.value, id } };
}

const SCOPE_FILTER_OPTIONS = [
  { label: 'In scope',      value: 'in_scope' },
  { label: 'Out of scope',  value: 'out_of_scope' },
  { label: 'Indeterminate', value: 'indeterminate' },
  { label: 'Third party',   value: 'third_party' },
];
const SCOPE_OVERRIDE_OPTIONS = SCOPE_FILTER_OPTIONS.filter((o) => o.value !== 'third_party');

function scopeLabel(status: string): string {
  switch (status) {
    case 'in_scope':     return 'In scope';
    case 'out_of_scope': return 'Out of scope';
    case 'third_party':  return '3rd party';
    default:             return 'Indeterminate';
  }
}

// ── Scope override (single or bulk) ────────────────────────────────────────
const overrideDialog = ref(false);
const overrideAsset  = ref<Asset | null>(null);
const overrideBulk   = ref<Asset[] | null>(null);
const overrideStatus = ref<string>('indeterminate');
const overrideSaving = ref(false);

function openOverride(asset: Asset) {
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
    if (overrideBulk.value?.length) {
      let ok = 0;
      let fail = 0;
      for (const a of overrideBulk.value) {
        try {
          scopeMap.value[String(a.id)] = await projectsApi.setScopeOverride(engId.value, a.id, overrideStatus.value) as ScopeEntry;
          ok++;
        } catch {
          fail++;
        }
      }
      overrideDialog.value = false;
      overrideBulk.value   = null;
      clearSelection();
      toast.add({
        severity: fail ? 'warn' : 'success',
        summary: fail ? `Updated ${ok} of ${ok + fail} assets` : `Scope updated for ${ok} asset${ok === 1 ? '' : 's'}`,
        life: 4000,
      });
      return;
    }
    if (!overrideAsset.value) return;
    scopeMap.value[String(overrideAsset.value.id)] =
      await projectsApi.setScopeOverride(engId.value, overrideAsset.value.id, overrideStatus.value) as ScopeEntry;
    overrideDialog.value = false;
  } finally {
    overrideSaving.value = false;
  }
}

async function clearOverride(asset: Asset) {
  await projectsApi.clearScopeOverride(engId.value, asset.id);
  startClassify();
}

// ── Reclassify scope ───────────────────────────────────────────────────────
const reclassifying = ref(false);
let classifyPoll: ReturnType<typeof setInterval> | undefined;

function stopClassifyPoll() {
  if (classifyPoll) { clearInterval(classifyPoll); classifyPoll = undefined; }
  reclassifying.value = false;
}

function startClassifyPoll() {
  reclassifying.value = true;
  if (classifyPoll) return;
  classifyPoll = setInterval(async () => {
    try {
      const { running } = await projectsApi.classifyScopeStatus(engId.value);
      if (!running) {
        stopClassifyPoll();
        await loadScopeStatuses();
      }
    } catch {
      stopClassifyPoll();
    }
  }, 2000);
}

async function startClassify(): Promise<boolean> {
  try {
    await projectsApi.classifyScope(engId.value);
    startClassifyPoll();
    return true;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
    return false;
  }
}

async function reclassify() {
  if (await startClassify()) {
    toast.add({ severity: 'info', summary: 'Reclassification started', detail: 'Running in background. Scope will update when done.', life: 3500 });
  }
}

// ── Add asset (creates in the org inventory, or links an existing one) ────
const showAddDialog  = ref(false);
const showTagManager = ref(false);

async function addAsset(p: NewAssetPayload) {
  const result = await projectsApi.addAssetManually(
    engId.value, p.type, p.identifier, p.metadata, p.hostSubtype, p.hostnames, p.displayName,
  );
  toast.add({
    severity: 'success',
    summary: result.created ? 'Asset created' : 'Asset linked',
    detail: result.created
      ? `New ${ASSET_TYPE_LABELS[result.type]} "${result.identifier}" added to project.`
      : `Existing ${ASSET_TYPE_LABELS[result.type]} "${result.identifier}" (${result.code}) linked from inventory.`,
    life: 5000,
  });
  await refreshAll();
}

// ── Hide asset / relationship from this project ────────────────────────────
const hideDialog  = ref(false);
const pendingHide = ref<Asset | null>(null);
const hideLoading = ref(false);

function confirmHide(asset: Asset) {
  pendingHide.value = asset;
  hideDialog.value  = true;
}

async function doHide() {
  const asset = pendingHide.value;
  if (!asset) return;
  hideLoading.value = true;
  try {
    await projectsApi.removeAsset(engId.value, asset.id);
    removeLocally([asset.id]);
    if (typeCounts.value[asset.type]) typeCounts.value[asset.type]--;
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
  removeRelationshipLocally(rel);
}

onMounted(async () => {
  try {
    const eng = await projectsApi.get(engId.value);
    if (eng) {
      context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
    }
  } catch { /* silent */ }
  await Promise.all([loadList(), loadTypeCounts(), loadScopeStatuses()]);
  try {
    const { running } = await projectsApi.classifyScopeStatus(engId.value);
    if (running) startClassifyPoll();
  } catch { /* silent */ }
});

onUnmounted(stopClassifyPoll);
</script>

<template>
  <div>
    <Toast />

    <div class="ares-page-header" style="margin-bottom:1.25rem;">
      <div>
        <h2 class="ares-page-title">Assets</h2>
        <p class="ares-page-subtitle">Assets discovered or linked to this project's organization.</p>
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <AssetViewToggle :mode="viewMode" @change="switchMode" />
        <template v-if="!auth.isClient">
          <Button icon="pi pi-refresh" text size="small" severity="secondary"
            :loading="reclassifying" v-tooltip.top="'Recalculate scope'" @click="reclassify" />
          <Button icon="pi pi-tag" text size="small" severity="secondary" v-tooltip.top="'Manage tags'" @click="showTagManager = true" />
          <Button icon="pi pi-plus" text size="small" severity="secondary" v-tooltip.top="'Add asset'" @click="showAddDialog = true" />
          <Button icon="pi pi-upload" text size="small" v-tooltip.top="'Import'"
            @click="router.push({ name: 'org-project-imports', params: { orgId, engId } })" />
        </template>
      </div>
    </div>

    <AssetListFilters v-if="viewMode === 'list'" :list="list" :organization-id="orgId" :project-id="engId" />

    <AssetGraphLoader v-if="viewMode === 'graph'" :loading="graphLoading" :loaded="graphLoadCount" :total="graphLoadTotal">
      <AssetGraph
        :assets="graphAssets"
        :relationships="graphRelationships"
        :org-id="orgId"
        :scope-statuses="scopeMap"
        :allow-hide="!auth.isClient"
        :allow-hide-relationship="!auth.isClient"
        :readonly="auth.isClient"
        @node-click="(a) => router.push(assetRoute(a.id))"
        @node-hide="confirmHide"
        :allow-link="!auth.isClient"
        @node-merge="openMerge"
        @node-link="openLink"
        @edge-hide="confirmHideRelationship"
      />
    </AssetGraphLoader>

    <template v-else>
      <AresLoadingState v-if="loading" />
      <template v-else>
        <AssetListTable
          :list="list"
          :asset-route="assetRoute"
          :editable="!auth.isClient"
          :extra-columns="1"
          empty-text="No assets yet. Import scan results to discover assets."
        >
          <template #extra-header>
            <th style="width:110px;">
              <ColumnHeader label="Scope" :sortable="true"
                :sort-dir="sortCol === 'scope' ? sortDir : null"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                :filter-options="SCOPE_FILTER_OPTIONS" :filter-value="filterScope"
                @update:sort-dir="onSort('scope', $event)"
                @update:filter-value="setFilterScope" />
            </th>
          </template>
          <template #extra-cell="{ asset }">
            <td @click.stop>
              <div style="display:flex; align-items:center; gap:0.35rem;">
                <span
                  :class="['scope-badge', `scope-badge--${scopeOf(asset.id).status}`, { 'scope-badge--readonly': auth.isClient }]"
                  v-tooltip="auth.isClient ? undefined : (scopeOf(asset.id).override ? 'Manual override — click to change' : 'Auto-classified — click to override')"
                  @click="!auth.isClient && openOverride(asset)"
                >
                  <i v-if="scopeOf(asset.id).override" class="pi pi-pencil" style="font-size:0.58rem; opacity:0.75;" />
                  {{ scopeLabel(scopeOf(asset.id).status) }}
                </span>
                <button
                  v-if="scopeOf(asset.id).override && !auth.isClient"
                  class="scope-clear-btn"
                  v-tooltip="'Clear override — let classifier decide'"
                  @click="clearOverride(asset)"
                >
                  <i class="pi pi-times" style="font-size:0.6rem;" />
                </button>
              </div>
            </td>
          </template>
          <template #row-action="{ asset }">
            <Button icon="pi pi-eye-slash" text severity="secondary" size="small"
              v-tooltip.left="'Hide from project'" @click="confirmHide(asset)" />
          </template>
        </AssetListTable>
        <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
      </template>
    </template>

    <AssetBulkBar v-if="!auth.isClient" :count="selectedIds.size" @clear="clearSelection">
      <Button icon="pi pi-flag" label="Set scope" size="small" severity="secondary" @click="openBulkOverride" />
      <Button v-if="canMergeSelection" icon="pi pi-arrows-h" label="Merge" size="small" @click="openSelectionMerge" />
      <span v-else-if="selectedIds.size === 2" style="font-size:0.75rem; color:var(--ares-text-muted);">
        Different types — can't merge
      </span>
    </AssetBulkBar>

    <AddAssetDialog
      v-model:visible="showAddDialog"
      :submit="addAsset"
      identifier-hint="If an asset with this type and identifier already exists in the organization inventory, it will be linked instead of creating a duplicate."
    />

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
        <Select v-model="overrideStatus" :options="SCOPE_OVERRIDE_OPTIONS" option-label="label" option-value="value" class="w-full" />
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" size="small" @click="overrideDialog = false" />
          <Button :label="overrideBulk ? 'Apply to selected' : 'Save override'" size="small"
            :loading="overrideSaving" @click="saveOverride" />
        </div>
      </div>
    </Dialog>

    <MergeAssetDialog
      v-if="showMergeDialog && mergeSource && mergeTarget"
      v-model:visible="showMergeDialog"
      :source="mergeSource"
      :target="mergeTarget"
      @merged="onMerged"
    />

    <AddRelationshipDialog
      v-if="showLinkDialog && linkSource && linkTarget"
      v-model:visible="showLinkDialog"
      :source="linkSource"
      :target="linkTarget"
      from-project
      @created="onLinked"
    />

    <TagManagerDialog v-model:visible="showTagManager" :org-id="orgId" @changed="loadList" />
  </div>
</template>

<style scoped>
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
.scope-badge--readonly { cursor: default; }
.scope-badge--readonly:hover { opacity: 1; }

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
</style>
