<script setup lang="ts">
// "Visual" alternate rendering for JsonViewer — boxed, form-like rows with a type badge per
// field instead of raw {}/[] punctuation (JsonTreeNode's "code" style covers that already).
// Read-only: no add/remove controls, unlike the schema-editor UI this look is modeled on.
defineOptions({ name: 'JsonVisualNode' });

import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{
  data: unknown;
  keyName?: string | null;
  depth?: number;
  isArrayItem?: boolean;
  defaultExpandDepth?: number;
}>(), {
  keyName: null,
  depth: 0,
  isArrayItem: false,
  defaultExpandDepth: 2,
});

type TypeTag = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

const isArray = computed(() => Array.isArray(props.data));
const isObject = computed(() => props.data !== null && typeof props.data === 'object' && !isArray.value);
const isContainer = computed(() => isObject.value || isArray.value);

const typeTag = computed<TypeTag>(() => {
  if (props.data === null || props.data === undefined) return 'null';
  if (isArray.value) return 'array';
  if (isObject.value) return 'object';
  return typeof props.data as 'string' | 'number' | 'boolean';
});

const typeBadge: Record<TypeTag, string> = {
  string: 'Str', number: 'Num', boolean: 'Bool', null: 'Nul', object: 'Obj', array: 'Arr',
};

const entries = computed<[string, unknown][]>(() => {
  if (isArray.value) return (props.data as unknown[]).map((v, i) => [String(i), v]);
  if (isObject.value) return Object.entries(props.data as Record<string, unknown>);
  return [];
});

const expanded = ref(props.depth < props.defaultExpandDepth);

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return String(v);
}
</script>

<template>
  <div class="jv-node" :class="{ 'jv-node--array-item': isArrayItem }">
    <!-- Container (object/array): boxed group with its own header row -->
    <div v-if="isContainer" class="jv-group">
      <button type="button" class="jv-group-header" @click="expanded = !expanded">
        <i class="pi" :class="expanded ? 'pi-chevron-down' : 'pi-chevron-right'" />
        <span class="jv-badge" :class="`jv-badge--${typeTag}`">{{ typeBadge[typeTag] }}</span>
        <span v-if="keyName !== null && !isArrayItem" class="jv-key">{{ keyName }}</span>
        <span v-else-if="isArrayItem" class="jv-key jv-key--index">#{{ keyName }}</span>
        <span class="jv-count">{{ entries.length }} {{ isArray ? (entries.length === 1 ? 'item' : 'items') : (entries.length === 1 ? 'key' : 'keys') }}</span>
      </button>
      <div v-if="expanded" class="jv-group-body">
        <p v-if="!entries.length" class="jv-empty">Empty {{ isArray ? 'array' : 'object' }}</p>
        <JsonVisualNode
          v-for="[k, v] in entries" :key="k"
          :data="v" :key-name="k" :depth="depth + 1" :is-array-item="isArray"
          :default-expand-depth="defaultExpandDepth"
        />
      </div>
    </div>

    <!-- Leaf field: badge + key, value follows directly after (not pushed to the row's far edge) -->
    <div v-else class="jv-row">
      <span class="jv-badge" :class="`jv-badge--${typeTag}`">{{ typeBadge[typeTag] }}</span>
      <span v-if="keyName !== null && !isArrayItem" class="jv-key">{{ keyName }}</span>
      <span v-else-if="isArrayItem" class="jv-key jv-key--index">#{{ keyName }}</span>
      <span class="jv-value" :class="{ 'jv-value--null': typeTag === 'null' }">{{ displayValue(data) }}</span>
    </div>
  </div>
</template>

<style scoped>
.jv-node { font-size: 0.8rem; }

/* Every group looks the same regardless of nesting depth — border + indent alone carry the
   nesting, no alternating fill (that read as "only some sections have a background"). */
.jv-group {
  border: 1px solid var(--ares-border);
  border-radius: 8px;
  margin: 0.3rem 0;
  overflow: hidden;
}

.jv-group-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.55rem;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: var(--ares-text-1);
}
.jv-group-header:hover { background: var(--ares-surface-2); }
.jv-group-header .pi { font-size: 0.65rem; color: var(--ares-text-muted); flex-shrink: 0; }

.jv-group-body { padding: 0.15rem 0.55rem 0.5rem 1.25rem; }

.jv-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.1rem 0.5rem;
  padding: 0.3rem 0.1rem;
  border-bottom: 1px solid var(--ares-border);
}
.jv-row:last-child { border-bottom: none; }

/* Fixed-ish label column so values start at a consistent, scannable position instead of being
   pushed to the far right of the row (unreadable once values get long). */
.jv-key {
  flex: 0 0 auto;
  min-width: 9rem;
  color: var(--ares-text-2);
  font-weight: 600;
}
.jv-key--index { color: var(--ares-text-muted); font-weight: 400; font-style: italic; min-width: 0; }

.jv-count { color: var(--ares-text-muted); font-size: 0.72rem; }

.jv-empty { color: var(--ares-text-muted); font-style: italic; font-size: 0.75rem; margin: 0.2rem 0; }

/* Base/neutral for every value regardless of type — only the type badge carries color; a
   colored value on a colored background reads poorly (low contrast, looks like an error state). */
.jv-value {
  color: var(--ares-text-1);
  font-family: var(--ares-mono-font, ui-monospace, monospace);
  font-size: 0.75rem;
  word-break: break-word;
}
.jv-value--null { color: var(--ares-text-muted); font-style: italic; }

.jv-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.8rem;
  height: 1.15rem;
  padding: 0 0.25rem;
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.jv-badge--string { color: #4ade80; background: rgba(74, 222, 128, 0.18); }
.jv-badge--number { color: #60a5fa; background: rgba(96, 165, 250, 0.2); }
.jv-badge--boolean { color: #f0b429; background: rgba(240, 180, 41, 0.22); }
.jv-badge--null { color: var(--ares-text-muted); background: var(--ares-surface-2); }
.jv-badge--object { color: #c4b5fd; background: rgba(167, 139, 250, 0.2); }
.jv-badge--array { color: #a5b4fc; background: rgba(129, 140, 248, 0.2); }

/* Dark palette above reads fine on this app's default dark surfaces; light theme needs the
   deeper/more saturated shades for contrast on a near-white background. */
[data-theme="light"] .jv-badge--string { color: #16a34a; }
[data-theme="light"] .jv-badge--number { color: #2563eb; }
[data-theme="light"] .jv-badge--boolean { color: #b45309; }
[data-theme="light"] .jv-badge--object { color: #6d28d9; }
[data-theme="light"] .jv-badge--array { color: #4338ca; }
</style>
