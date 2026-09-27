<script setup lang="ts">
// Shared "is this working?" indicator for integration tables (Data Sources, Bug Hunting
// Platforms, Notifications) — replaces the old per-table text badges ("Success"/"Error"/
// "Unknown"/"No check-in"/raw status strings/"enabled"/"disabled", each table with its
// own wording) with one consistent tick/cross/unknown icon set.
withDefaults(defineProps<{
  status: 'ok' | 'error' | 'unknown';
  tooltip?: string | null;
}>(), {
  tooltip: null,
});

const ICON: Record<'ok' | 'error' | 'unknown', string> = {
  ok: 'pi-check-circle',
  error: 'pi-times-circle',
  unknown: 'pi-question-circle',
};
</script>

<template>
  <i
    :class="['pi', ICON[status], 'status-check-icon', `status-check-icon--${status}`]"
    v-tooltip="tooltip ?? undefined"
  />
</template>

<style scoped>
.status-check-icon { font-size: 1.05rem; }
.status-check-icon--ok      { color: var(--ares-success); }
.status-check-icon--error   { color: var(--ares-error); }
.status-check-icon--unknown { color: var(--ares-text-muted); }
</style>
