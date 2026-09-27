<script setup lang="ts">
/**
 * Visual integration-type selector for the ACTION_INTEGRATION_CALL node config — same
 * button-grid pattern as AgentToolPicker (agent task tool selection), but driven entirely by
 * `options` (built from the backend's IntegrationActionRegistry catalog, see
 * NodeConfigPanel.vue's integrationCallTypeOptions) rather than a hardcoded list: a new
 * integration type just needs a backend IntegrationActionHandler bean to show up here, no
 * frontend change required. Icons are looked up by type id via tool-icons.ts, with a generic
 * plug icon fallback for any type that doesn't have artwork registered there yet.
 */
import { toolIconSrc, whiteBackingSrc } from '@/utils/tool-icons';

export interface IntegrationTypeOption {
  value: string;
  label: string;
}

defineProps<{ modelValue: string | null; options: IntegrationTypeOption[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

function pick(opt: IntegrationTypeOption) {
  emit('update:modelValue', opt.value);
}
</script>

<template>
<div class="tool-grid">
  <button v-for="opt in options" :key="opt.value" type="button" class="tool-btn"
    :class="{ 'tool-btn--active': modelValue === opt.value }"
    :title="opt.label" @click="pick(opt)">
    <!-- White backing layer stacked behind icons whose colored path carves an inner glyph out
         as a transparent hole (e.g. Qualys's Q) — see tool-icons.ts's whiteBackingSrc. Without
         it that hole reads as a gap showing this button's own background through, not white. -->
    <span v-if="toolIconSrc(opt.value)" class="tool-icon-stack">
      <img v-if="whiteBackingSrc(opt.value)" :src="whiteBackingSrc(opt.value)"
        class="tool-icon tool-icon--img" alt="" aria-hidden="true" />
      <img :src="toolIconSrc(opt.value)" class="tool-icon tool-icon--img" :alt="opt.label" />
    </span>
    <i v-else class="pi pi-plug tool-icon tool-icon--pi" />
    <span class="tool-label">{{ opt.label }}</span>
  </button>
  <p v-if="!options.length" class="field-hint">No integration types with available actions are registered for this scope.</p>
</div>
</template>

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 0.5rem;
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

.tool-icon-stack { position: relative; width: 28px; height: 28px; flex-shrink: 0; }
.tool-icon-stack .tool-icon--img { position: absolute; inset: 0; object-fit: contain; }

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
