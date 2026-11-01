<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ loading: boolean; loaded: number; total: number }>();
const pct = computed(() => (props.total > 0 ? Math.round((props.loaded / props.total) * 100) : 0));
</script>

<template>
  <div v-if="loading" class="graph-init-loading">
    <div class="graph-init-loading__orbs"><span /><span /><span /><span /><span /></div>
    <div class="graph-init-loading__label">
      <template v-if="total > 0">Loading assets… {{ loaded }} / {{ total }}</template>
      <template v-else>Loading graph…</template>
    </div>
    <div v-if="total > 0" class="graph-init-loading__bar">
      <div class="graph-init-loading__bar-fill" :style="{ width: pct + '%' }" />
    </div>
  </div>
  <template v-else>
    <div v-if="loaded < total" class="graph-load-more-bar">
      <i class="pi pi-spin pi-spinner" style="font-size:0.7rem;" />
      Loading {{ loaded }} / {{ total }} assets…
      <div class="graph-load-more-bar__fill" :style="{ width: pct + '%' }" />
    </div>
    <slot />
  </template>
</template>
