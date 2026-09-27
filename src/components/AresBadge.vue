<script lang="ts">
export type BadgeSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'
                           | 'critical' | 'high' | 'medium' | 'low';
</script>

<script setup lang="ts">
/**
 * Dark-style badge — replaces PrimeVue Tag for status/role labels.
 * Uses color-mix for background so it adapts to any theme surface.
 *
 * severity: success | info | warn | danger | secondary | contrast
 */
defineProps<{
  value: string;
  severity?: BadgeSeverity;
}>();
</script>

<template>
  <span :class="['ares-badge', `ares-badge--${severity ?? 'secondary'}`]">{{ value }}</span>
</template>

<style scoped>
.ares-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--ares-radius);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.ares-badge--success  { background: color-mix(in srgb, #4ade80 12%, transparent); color: #4ade80; }
.ares-badge--info     { background: color-mix(in srgb, #60a5fa 12%, transparent); color: #60a5fa; }
.ares-badge--warn     { background: color-mix(in srgb, #fb923c 12%, transparent); color: #fb923c; }
.ares-badge--danger   { background: color-mix(in srgb, #f87171 12%, transparent); color: #f87171; }
.ares-badge--secondary{ background: color-mix(in srgb, var(--ares-text-muted) 10%, transparent); color: var(--ares-text-muted); }
.ares-badge--contrast { background: color-mix(in srgb, #e2e8f0 12%, transparent); color: #e2e8f0; }
/* Finding severity scale — mirrors SeverityTag colors */
.ares-badge--critical { background: rgba(239, 68,  68,  0.15); color: #ef4444; }
.ares-badge--high     { background: rgba(249, 115, 22,  0.15); color: #f97316; }
.ares-badge--medium   { background: rgba(202, 138, 4,   0.15); color: #ca8a04; }
.ares-badge--low      { background: rgba(22,  163, 74,  0.15); color: #16a34a; }
</style>
