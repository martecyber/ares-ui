<script setup lang="ts">
import Button from 'primevue/button';

defineProps<{ count: number }>();
defineEmits<{ clear: [] }>();
</script>

<template>
  <Transition name="bulk-bar">
    <div v-if="count > 0" class="bulk-action-bar">
      <span class="bulk-action-bar__count">{{ count }} asset{{ count !== 1 ? 's' : '' }} selected</span>
      <slot />
      <Button label="Clear" severity="secondary" size="small" text @click="$emit('clear')" />
    </div>
  </Transition>
</template>

<style scoped>
.bulk-action-bar {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1.25rem;
  background: var(--ares-surface-2);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  z-index: 100;
  white-space: nowrap;
}
.bulk-action-bar__count { font-size: 0.85rem; color: var(--ares-text-2); font-weight: 600; }
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(0.5rem); }
</style>
