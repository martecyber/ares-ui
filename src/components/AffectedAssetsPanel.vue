<script setup lang="ts">
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { findingsApi, type AffectedAsset } from '@/api/findings';
import AresBadge from '@/components/AresBadge.vue';

/**
 * Small right-margin summary panel for findings-list views: the deduplicated set of assets
 * touched by whatever findings currently match the view's own filter (not just the current
 * page — the backend aggregates across the whole matching set, see
 * FindingService.affectedAssets).
 */
const props = defineProps<{
  orgId: number;
  /** Project-scoped views pass their project id so asset links route to the project-scoped
   *  asset detail page instead of the org-wide one. */
  engId?: number;
  organizationId?: number;
  projectId?: number;
  projectIds?: number[];
  includeDrafts?: boolean;
  severity?: string[];
  statusId?: number[];
  iterationLabel?: string;
  q?: string;
  aql?: string;
}>();

const assets = ref<AffectedAsset[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    assets.value = await findingsApi.affectedAssets({
      organizationId: props.organizationId,
      projectId: props.projectId,
      projectIds: props.projectIds,
      includeDrafts: props.includeDrafts,
      severity: props.severity,
      statusId: props.statusId,
      iterationLabel: props.iterationLabel,
      q: props.q,
      aql: props.aql,
    });
  } catch {
    assets.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.organizationId, props.projectId, props.projectIds?.join(','), props.includeDrafts,
    props.severity?.join(','), props.statusId?.join(','), props.iterationLabel, props.q, props.aql],
  load,
  { immediate: true },
);

function assetRoute(asset: AffectedAsset) {
  return props.engId
    ? { name: 'org-project-asset-detail', params: { orgId: props.orgId, engId: props.engId, id: asset.id } }
    : { name: 'org-asset-detail', params: { orgId: props.orgId, id: asset.id } };
}
</script>

<template>
  <div class="ares-card">
    <div class="ares-card-section-header">
      Affected assets
      <span style="font-weight:400; color:var(--ares-text-muted);">({{ assets.length }})</span>
    </div>
    <div style="padding:0.5rem 0.85rem 0.85rem;">
      <div v-if="loading" style="font-size:0.8rem; color:var(--ares-text-muted);">Loading…</div>
      <div v-else-if="!assets.length" style="font-size:0.8rem; color:var(--ares-text-muted);">No affected assets.</div>
      <ul v-else style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:0.35rem; max-height:420px; overflow-y:auto;">
        <li v-for="a in assets" :key="a.id">
          <RouterLink :to="assetRoute(a)" style="display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; color:var(--ares-text); text-decoration:none;">
            <AresBadge :value="a.type" severity="secondary" style="flex-shrink:0;" />
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" :title="a.identifier">{{ a.identifier }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
</template>
