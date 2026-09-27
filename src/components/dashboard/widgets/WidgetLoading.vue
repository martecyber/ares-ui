<script setup lang="ts">
import ProgressSpinner from 'primevue/progressspinner';
</script>

<!--
  Shared loading indicator for every dashboard widget — a single small ProgressSpinner instead
  of each widget rolling its own (a mix of plain "Loading…" text, a raw `pi pi-spin pi-spinner`
  font-icon, or no loading state at all before this). The font-icon spin was the specific visual
  glitch reported: rotating a glyph around its own (off-center) bounding box makes it visibly
  wobble instead of spinning cleanly, which reads as "spinning on another axis" — ProgressSpinner
  is a proper SVG stroke animation, no such artifact.
-->
<template>
  <div class="widget-loading">
    <ProgressSpinner style="width: 1.6rem; height: 1.6rem;" stroke-width="5" />
  </div>
</template>

<style scoped>
.widget-loading {
  flex: 1;
  min-height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
}
</style>
