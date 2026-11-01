<script setup lang="ts">
import { useRoute } from 'vue-router';
import ToggleSwitch from 'primevue/toggleswitch';
import QueryBar from '@/components/QueryBar.vue';
import { ASSET_TYPES, ASSET_TYPE_LABELS } from '@/api/assets';
import type { AssetListState } from '@/composables/useAssetList';

const props = defineProps<{
  list: AssetListState;
  organizationId: number;
  projectId?: number;
}>();

const route = useRoute();
const { typeFilter, typeCounts, allCount, showThirdParty, setType, onSearch } = props.list;
const initialAql = typeof route.query.aql === 'string' ? route.query.aql : undefined;
</script>

<template>
  <div class="type-pills">
    <button class="type-pill" :class="{ 'type-pill--active': typeFilter === null }" @click="setType(null)">
      All <span class="type-pill-count">{{ allCount }}</span>
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
    <div class="type-pills__divider" />
    <label class="tp-toggle">
      <ToggleSwitch v-model="showThirdParty" />
      3rd Party
    </label>
  </div>

  <div style="margin-bottom:1.25rem;">
    <QueryBar entity="asset" placeholder="Search by identifier, name…"
      :organization-id="organizationId" :project-id="projectId"
      :initial-aql="initialAql" @search="onSearch" />
  </div>
</template>

<style scoped>
.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  align-items: center;
}
.type-pills__divider {
  width: 1px;
  height: 18px;
  background: var(--ares-border);
  margin: 0 0.15rem;
}
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
.type-pill:hover { background: var(--ares-surface-2); color: var(--ares-text); }
.type-pill--active { background: var(--ares-accent-bg); border-color: transparent; color: #fff; }
.type-pill-count {
  background: rgba(255,255,255,0.15);
  border-radius: var(--ares-radius);
  padding: 0 0.4em;
  font-size: 0.7em;
  font-weight: 700;
}
.type-pill--active .type-pill-count { background: rgba(255,255,255,0.2); }
.tp-toggle {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  cursor: pointer;
}
</style>
