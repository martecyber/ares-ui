<script setup lang="ts">
// Friendly renderer for a raw_data-style JSON blob. Two interchangeable views of the same data —
// "tree" (JsonTreeNode, code-like with {}/[] punctuation) and "visual" (JsonVisualNode, boxed
// form-like rows with a type badge per field) — the `mode` prop picks which one renders; the
// switch control itself lives in the caller's own header (see DetectionDetailView), not here.
// Falls back to a plain <pre> of `rawText` when `value` is null (the source string wasn't valid
// JSON — some parsers still just pass through whatever text the tool gave them).
import JsonTreeNode from './JsonTreeNode.vue';
import JsonVisualNode from './JsonVisualNode.vue';

withDefaults(defineProps<{ value: unknown; rawText?: string | null; mode?: 'tree' | 'visual' }>(), {
  mode: 'tree',
});
</script>

<template>
  <div class="json-viewer">
    <template v-if="value !== null && value !== undefined">
      <div v-if="mode === 'tree'" class="json-viewer__tree">
        <JsonTreeNode :data="value" />
      </div>
      <div v-else class="json-viewer__visual">
        <JsonVisualNode :data="value" />
      </div>
    </template>
    <pre v-else class="json-viewer__fallback">{{ rawText }}</pre>
  </div>
</template>

<style scoped>
.json-viewer__tree { overflow-x: auto; }
.json-viewer__visual { overflow-x: auto; }
.json-viewer__fallback {
  margin: 0;
  font-family: var(--ares-mono-font, ui-monospace, monospace);
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
