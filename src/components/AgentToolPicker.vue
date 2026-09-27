<script setup lang="ts">
/**
 * Visual tool selector for the agent task/schedule dialogs. Renders one icon button per
 * tool the live AgentToolSpec catalog reports (GET /agent-tasks/tools or one of its
 * project-scoped/template-scoped siblings) — replaces the old hardcoded 10-tool list, so
 * installing/uninstalling/disabling a scan-tool plugin changes this picker with zero
 * frontend changes. Only one tool is selectable at a time.
 */
import { toolIconSrc } from '@/utils/tool-icons';
import type { AgentToolSpec } from '@/api/agent-tasks';

defineProps<{ modelValue: string | null; tools: AgentToolSpec[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

function pick(t: AgentToolSpec) {
  emit('update:modelValue', t.toolId);
}
</script>

<template>
<div class="tool-grid">
  <div v-if="!tools.length" class="tool-empty">No scan-tool plugins installed.</div>
  <button v-for="t in tools" :key="t.toolId" type="button" class="tool-btn"
    :class="{ 'tool-btn--active': modelValue === t.toolId }"
    :title="t.displayName" @click="pick(t)">
    <img v-if="toolIconSrc(t.toolId)" :src="toolIconSrc(t.toolId)" class="tool-icon tool-icon--img" :alt="t.displayName" />
    <i v-else class="pi pi-wrench tool-icon tool-icon--pi" />
    <span class="tool-label">{{ t.displayName }}</span>
  </button>
</div>
</template>

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 0.5rem;
}

.tool-empty {
  grid-column: 1 / -1;
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  padding: 0.5rem 0;
}

.tool-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.75rem 0.5rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  cursor: pointer;
  color: var(--ares-text-1);
  font-family: inherit;
  transition: border-color 0.12s, background 0.12s, transform 0.05s;
}

.tool-btn:hover {
  border-color: var(--p-primary-400);
}

.tool-btn:active {
  transform: translateY(1px);
}

.tool-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
}

.tool-icon {
  display: block;
}

.tool-icon--img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.tool-icon--pi {
  font-size: 1.4rem;
  color: var(--ares-text-2);
}

.tool-label {
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
}
</style>
