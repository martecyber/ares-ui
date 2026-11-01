<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
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
import MergeAssetDialog from '@/components/MergeAssetDialog.vue';
import TagManagerDialog from '@/components/TagManagerDialog.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { useAssetList } from '@/composables/useAssetList';
import {
  assetsApi, ASSET_TYPE_LABELS, ASSET_TYPE_ICONS,
  type Asset, type AssetOrphanInfo, type AssetRelationship,
} from '@/api/assets';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';

const route   = useRoute();
const router  = useRouter();
const context = useContextStore();
const auth    = useAuthStore();

const orgId = computed(() => Number(route.params.orgId));

const list = useAssetList({
  scope: () => ({ organizationId: orgId.value }),
  loadRelationships: () => assetsApi.listOrgRelationships(orgId.value),
  isThirdParty: (a) => !!a.thirdParty,
});
const {
  viewMode, switchMode, loading, page, totalPages, total, typeFilter,
  selectedIds, canMergeSelection, clearSelection, openSelectionMerge,
  graphAssets, graphRelationships, graphLoading, graphLoadCount, graphLoadTotal,
  showMergeDialog, mergeSource, mergeTarget, openMerge, onMerged,
  showLinkDialog, linkSource, linkTarget, openLink, onLinked,
  loadList, loadTypeCounts, refreshAll, removeLocally, removeRelationshipLocally,
} = list;

function assetRoute(id: number) {
  return { name: 'org-asset-detail', params: { orgId: orgId.value, id } };
}

const showAddDialog  = ref(false);
const showTagManager = ref(false);

async function createAsset(p: NewAssetPayload) {
  await assetsApi.create({
    organizationId: orgId.value,
    type: p.type,
    identifier: p.identifier,
    metadata: p.metadata ? JSON.stringify(p.metadata) : undefined,
    hostSubtype: p.hostSubtype,
    hostnames: p.hostnames,
    displayName: p.displayName,
  });
  await refreshAll();
}

// ── Delete (single + bulk, with orphan preview) ───────────────────────────
const showDeleteDialog   = ref(false);
const deleteSaving       = ref(false);
const orphanLoading      = ref(false);
const pendingDeleteIds   = ref<number[]>([]);
const pendingDeleteLabel = ref('');
const orphanItems        = ref<AssetOrphanInfo[]>([]);
const orphanPage         = ref(0);
const ORPHAN_PER_PAGE    = 8;
const deleteOrphans      = ref(false);

const orphanPageItems = computed(() =>
  orphanItems.value.slice(orphanPage.value * ORPHAN_PER_PAGE, (orphanPage.value + 1) * ORPHAN_PER_PAGE),
);
const orphanTotalPages = computed(() => Math.ceil(orphanItems.value.length / ORPHAN_PER_PAGE));

function openDeleteDialog(ids: number[], label: string) {
  pendingDeleteIds.value   = ids;
  pendingDeleteLabel.value = label;
  orphanItems.value        = [];
  orphanPage.value         = 0;
  deleteOrphans.value      = false;
  showDeleteDialog.value   = true;
  orphanLoading.value      = true;
  assetsApi.previewOrphans(ids)
    .then((r) => { orphanItems.value = r; })
    .catch(() => {})
    .finally(() => { orphanLoading.value = false; });
}

function confirmDelete(asset: Asset) {
  openDeleteDialog([asset.id], asset.identifier);
}

function confirmBulkDelete() {
  const ids = [...selectedIds.value];
  if (ids.length) openDeleteDialog(ids, `${ids.length} assets`);
}

async function doDelete() {
  deleteSaving.value = true;
  const ids = deleteOrphans.value
    ? [...new Set([...pendingDeleteIds.value, ...orphanItems.value.map((o) => o.id)])]
    : [...pendingDeleteIds.value];
  try {
    if (ids.length === 1) await assetsApi.delete(ids[0]);
    else await assetsApi.bulkDelete(ids);
    removeLocally(ids);
    showDeleteDialog.value = false;
    pendingDeleteIds.value = [];
    loadTypeCounts();
  } finally {
    deleteSaving.value = false;
  }
}

async function confirmDeleteRelationship(rel: AssetRelationship) {
  const ok = await confirmDialog({
    header: 'Remove relationship',
    message: 'Remove this relationship? It will be deleted for every project sharing these assets.',
    acceptLabel: 'Remove',
  });
  if (!ok) return;
  await assetsApi.removeRelationship(rel.fromAssetId, rel.toAssetId, rel.type);
  removeRelationshipLocally(rel);
}

onMounted(() => Promise.all([loadList(), loadTypeCounts()]));
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.25rem;">
      <div>
        <h2 class="ares-page-title">Assets</h2>
        <p class="ares-page-subtitle">{{ context.org?.name ?? '' }} — attack surface inventory.</p>
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <!-- Clients get a view-only graph (relationships between assets they can see) -->
        <AssetViewToggle :mode="viewMode" @change="switchMode" />
        <template v-if="!auth.isClient">
          <Button icon="pi pi-tag" text size="small" severity="secondary" v-tooltip.top="'Manage tags'" @click="showTagManager = true" />
          <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New asset'" @click="showAddDialog = true" />
        </template>
      </div>
    </div>

    <AssetListFilters v-if="viewMode === 'list'" :list="list" :organization-id="orgId" />

    <AssetGraphLoader v-if="viewMode === 'graph'" :loading="graphLoading" :loaded="graphLoadCount" :total="graphLoadTotal">
      <AssetGraph
        :assets="graphAssets"
        :relationships="graphRelationships"
        :org-id="orgId"
        :allow-delete="!auth.isClient"
        :allow-delete-relationship="!auth.isClient"
        :readonly="auth.isClient"
        @node-click="(a) => router.push(assetRoute(a.id))"
        @node-delete="confirmDelete"
        :allow-link="!auth.isClient"
        @node-merge="openMerge"
        @node-link="openLink"
        @edge-delete="confirmDeleteRelationship"
      />
    </AssetGraphLoader>

    <template v-else>
      <AresLoadingState v-if="loading" />
      <template v-else>
        <AssetListTable
          :list="list"
          :asset-route="assetRoute"
          :editable="!auth.isClient"
          show-third-party-badge
          :empty-text="`No assets${typeFilter ? ' of type ' + (ASSET_TYPE_LABELS[typeFilter] ?? typeFilter) : ''}.`"
        >
          <template #row-action="{ asset }">
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="confirmDelete(asset)" />
          </template>
        </AssetListTable>
        <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
      </template>
    </template>

    <AssetBulkBar v-if="!auth.isClient" :count="selectedIds.size" @clear="clearSelection">
      <Button v-if="canMergeSelection" icon="pi pi-arrows-h" label="Merge" size="small" @click="openSelectionMerge" />
      <Button icon="pi pi-trash" label="Delete selected" severity="danger" size="small" @click="confirmBulkDelete" />
    </AssetBulkBar>

    <AddAssetDialog
      v-model:visible="showAddDialog"
      :submit="createAsset"
      identifier-hint="Unique identifier for this asset within the organization."
    />

    <Dialog v-model:visible="showDeleteDialog" header="Delete asset(s)" modal style="width:30rem;">
      <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.25rem;">
        <p style="margin:0; color:var(--ares-text-2);">
          Delete
          <strong v-if="pendingDeleteIds.length === 1" style="font-family:monospace; color:var(--ares-accent);">{{ pendingDeleteLabel }}</strong>
          <strong v-else>{{ pendingDeleteLabel }}</strong>?
          <br>
          <span style="font-size:0.78rem; color:var(--ares-text-muted);">
            Associated detections will also be deleted. This cannot be undone.
          </span>
        </p>

        <div v-if="orphanLoading" style="font-size:0.82rem; color:var(--ares-text-muted); display:flex; align-items:center; gap:0.4rem;">
          <i class="pi pi-spin pi-spinner" /> Checking for isolated assets…
        </div>
        <div v-else-if="orphanItems.length > 0" class="orphan-section">
          <label class="orphan-toggle">
            <input type="checkbox" v-model="deleteOrphans" />
            <span>
              Also delete <strong>{{ orphanItems.length }}</strong>
              asset{{ orphanItems.length !== 1 ? 's' : '' }} that would become isolated
            </span>
          </label>
          <div class="orphan-list">
            <div v-for="o in orphanPageItems" :key="o.id" class="orphan-item">
              <i :class="'pi ' + (ASSET_TYPE_ICONS[o.type] ?? 'pi-circle')" style="font-size:0.72rem; color:var(--ares-text-muted); flex-shrink:0;" />
              <span class="orphan-item__id">{{ o.identifier }}</span>
              <span style="font-size:0.72rem; color:var(--ares-text-muted); flex-shrink:0;">{{ ASSET_TYPE_LABELS[o.type] ?? o.type }}</span>
            </div>
          </div>
          <div v-if="orphanTotalPages > 1" class="orphan-pager">
            <button :disabled="orphanPage === 0" @click="orphanPage--">&#8249;</button>
            <span>{{ orphanPage + 1 }} / {{ orphanTotalPages }}</span>
            <button :disabled="orphanPage >= orphanTotalPages - 1" @click="orphanPage++">&#8250;</button>
          </div>
        </div>

        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" size="small" @click="showDeleteDialog = false" />
          <Button label="Delete" severity="danger" size="small" :loading="deleteSaving" @click="doDelete" />
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
      @created="onLinked"
    />

    <TagManagerDialog v-model:visible="showTagManager" :org-id="orgId" @changed="loadList" />
  </div>
</template>

<style scoped>
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
.orphan-list { display: flex; flex-direction: column; gap: 0.2rem; }
.orphan-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
}
.orphan-item__id {
  font-family: monospace;
  font-size: 0.8rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
