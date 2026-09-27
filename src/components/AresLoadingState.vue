<script setup lang="ts">
/**
 * Shared loading placeholder for entity list/search views (KB catalogs, exploits, findings,
 * detections, assets, ...) — replaces the plain "Loading…" text every one of these used to show
 * in its `.ares-table-empty` slot with an actual animation, same PrimeVue ProgressSpinner already
 * used by every entity detail view.
 */
import ProgressSpinner from 'primevue/progressspinner';

withDefaults(defineProps<{ label?: string }>(), { label: 'Loading…' });
</script>

<template>
  <div class="ares-table-empty ares-loading-state">
    <ProgressSpinner style="width: 2rem; height: 2rem;" stroke-width="5" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.ares-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}
</style>
