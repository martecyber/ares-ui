<script setup lang="ts">
import { ref } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import KbScheduleDialog from '@/components/KbScheduleDialog.vue';

defineProps<{
  visible: boolean;
  /** Dialog header, e.g. "CWE Sync". */
  title: string;
  /** Row/catalog label, e.g. "CWE". Also used as the KbScheduleDialog label. */
  label: string;
  /** Internal sync type key passed through to KbScheduleDialog, e.g. 'cwe'. */
  syncType: string;
  /** Pre-formatted stats line, e.g. "1,234 entries · Last sync 28/7/2026, 10:04". Null while loading. */
  statsText: string | null;
  synced: boolean;
  syncing: boolean;
  /** Defaults to "Sync". */
  syncLabel?: string;
  message?: string | null;
}>();

defineEmits<{ 'update:visible': [boolean]; sync: [] }>();

const showSchedule = ref(false);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    modal
    style="width:34rem;"
    @update:visible="$emit('update:visible', $event)"
  >
    <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.25rem;">

      <div class="sync-row">
        <div class="sync-row-head">
          <div class="sync-row-title">{{ label }}</div>
          <div v-if="statsText" class="sync-row-stats">
            {{ statsText }}
            <span v-if="!synced" class="sync-row-warn"> · Not synced yet</span>
          </div>
        </div>
        <div class="sync-row-actions">
          <Button
            size="small" severity="secondary" icon="pi pi-sync"
            :label="syncing ? 'Queuing...' : (syncLabel ?? 'Sync')"
            :disabled="syncing"
            @click="$emit('sync')"
          />
          <Button
            size="small" severity="secondary" icon="pi pi-calendar" label="Schedule"
            :disabled="!synced"
            :title="synced ? 'Schedule automatic updates' : 'Run a Sync first'"
            @click="showSchedule = true"
          />
        </div>
        <p v-if="message" class="sync-row-msg">{{ message }}</p>
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <Button label="Close" severity="secondary" size="small" @click="$emit('update:visible', false)" />
      </div>
    </div>
  </Dialog>

  <KbScheduleDialog v-model:visible="showSchedule" :sync-type="syncType" :label="label" />
</template>

<style scoped>
.sync-row {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.85rem 1rem;
  background: var(--ares-surface);
}
.sync-row-head { margin-bottom: 0.65rem; }
.sync-row-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ares-text-2);
}
.sync-row-stats {
  font-size: 0.75rem;
  color: var(--ares-text-muted);
  margin-top: 0.2rem;
}
.sync-row-warn { color: var(--ares-warning); }
.sync-row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.sync-row-msg { font-size: 0.78rem; color: var(--ares-success); margin: 0.5rem 0 0; }
</style>
