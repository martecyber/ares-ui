<script setup lang="ts">
import type { AssetViewMode } from '@/composables/useAssetList';

defineProps<{ mode: AssetViewMode }>();
defineEmits<{ change: [mode: AssetViewMode] }>();
</script>

<template>
  <div class="view-toggle">
    <button class="view-toggle-btn" :class="{ active: mode === 'list' }" v-tooltip.top="'List view'" @click="$emit('change', 'list')">
      <i class="pi pi-list" />
    </button>
    <button class="view-toggle-btn" :class="{ active: mode === 'graph' }" v-tooltip.top="'Graph view'" @click="$emit('change', 'graph')">
      <i class="pi pi-share-alt" />
    </button>
  </div>
</template>

<style scoped>
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
.view-toggle-btn.active { background: var(--ares-accent-bg); color: #fff; }
</style>
