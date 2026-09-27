<script setup lang="ts">
/**
 * Small amber "enforced by policy" chip — same visual formula already duplicated across the
 * agent-task config panels (NucleiConfigPanel.vue and 6 siblings: `color-mix(in srgb,
 * var(--p-amber-500) 8%/35%, transparent)` + `pi pi-lock`), extracted here since this is now a
 * second real consumer (RecipientChipInput.vue) rather than an 8th copy-paste.
 */
defineProps<{
  label: string;
  tooltip?: string;
}>();
</script>

<template>
  <span class="locked-chip" v-tooltip.top="tooltip">
    <i class="pi pi-lock" />
    <span class="locked-chip__label">{{ label }}</span>
    <slot />
  </span>
</template>

<style scoped>
.locked-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--p-amber-500) 35%, transparent);
  border-radius: var(--ares-radius);
  background: color-mix(in srgb, var(--p-amber-500) 8%, transparent);
  font-size: 0.78rem;
  color: var(--ares-text-2);
}
.locked-chip .pi-lock {
  font-size: 0.68rem;
  color: var(--p-amber-500);
  flex-shrink: 0;
}
.locked-chip__label {
  white-space: nowrap;
}
</style>
