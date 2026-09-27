<script setup lang="ts">
// Recursive node — one line of a JsonViewer's tree. References itself by its own registered
// name (defineOptions below), the standard Vue 3 SFC self-recursion pattern.
defineOptions({ name: 'JsonTreeNode' });

import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{
  data: unknown;
  /** null for the root node (no "key:" prefix drawn). */
  keyName?: string | null;
  depth?: number;
  /** Nodes at or below this depth start expanded; deeper ones start collapsed — keeps a large
   *  raw payload from dumping hundreds of lines open at once while still showing useful context
   *  immediately. */
  defaultExpandDepth?: number;
}>(), {
  keyName: null,
  depth: 0,
  defaultExpandDepth: 2,
});

const isArray = computed(() => Array.isArray(props.data));
const isObject = computed(() => props.data !== null && typeof props.data === 'object' && !isArray.value);
const isContainer = computed(() => isObject.value || isArray.value);

const entries = computed<[string, unknown][]>(() => {
  if (isArray.value) return (props.data as unknown[]).map((v, i) => [String(i), v]);
  if (isObject.value) return Object.entries(props.data as Record<string, unknown>);
  return [];
});

const expanded = ref(props.depth < props.defaultExpandDepth);

function valueClass(v: unknown): string {
  if (v === null) return 'jt-null';
  switch (typeof v) {
    case 'string': return 'jt-string';
    case 'number': return 'jt-number';
    case 'boolean': return 'jt-boolean';
    default: return '';
  }
}

function displayPrimitive(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
</script>

<template>
  <div class="jt-node">
    <div class="jt-row">
      <button v-if="isContainer" type="button" class="jt-toggle" @click="expanded = !expanded">
        <i :class="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" />
      </button>
      <span v-else class="jt-toggle-spacer" />
      <span v-if="keyName !== null" class="jt-key">{{ keyName }}:</span>
      <template v-if="isContainer">
        <span class="jt-bracket">{{ isArray ? '[' : '{' }}</span>
        <span v-if="!expanded" class="jt-summary">
          {{ entries.length }} {{ isArray ? (entries.length === 1 ? 'item' : 'items') : (entries.length === 1 ? 'key' : 'keys') }}
        </span>
        <span v-if="!expanded" class="jt-bracket">{{ isArray ? ']' : '}' }}</span>
      </template>
      <span v-else :class="valueClass(data)" class="jt-value">{{ displayPrimitive(data) }}</span>
    </div>
    <div v-if="isContainer && expanded" class="jt-children">
      <JsonTreeNode
        v-for="[k, v] in entries" :key="k"
        :data="v" :key-name="k" :depth="depth + 1" :default-expand-depth="defaultExpandDepth"
      />
    </div>
    <div v-if="isContainer && expanded" class="jt-row">
      <span class="jt-toggle-spacer" />
      <span class="jt-bracket">{{ isArray ? ']' : '}' }}</span>
    </div>
  </div>
</template>

<style scoped>
.jt-node { font-family: var(--ares-mono-font, ui-monospace, monospace); font-size: 0.8rem; }
.jt-row { display: flex; align-items: baseline; gap: 0.3rem; line-height: 1.55; }
.jt-children { margin-left: 1.15rem; border-left: 1px dashed var(--ares-border); padding-left: 0.35rem; }
.jt-toggle {
  background: none; border: none; padding: 0; margin: 0; cursor: pointer;
  color: var(--ares-text-muted); width: 1rem; flex-shrink: 0; text-align: center;
}
.jt-toggle:hover { color: var(--ares-text-1); }
.jt-toggle .pi { font-size: 0.65rem; }
.jt-toggle-spacer { width: 1rem; flex-shrink: 0; }
.jt-key { color: var(--ares-text-2); font-weight: 600; }
.jt-bracket { color: var(--ares-text-muted); }
.jt-summary { color: var(--ares-text-muted); font-style: italic; }
.jt-value { word-break: break-word; }
.jt-string { color: #4ade80; }
.jt-number { color: #60a5fa; }
.jt-boolean { color: #f0b429; }
.jt-null { color: var(--ares-text-muted); font-style: italic; }
</style>
