<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { kbSchedulesApi, CRON_PRESETS, humanCron, type KbSyncSchedule } from '@/api/kb-schedules';

const props = defineProps<{
  visible: boolean;
  /** Internal sync type key, e.g. 'cve_update', 'cwe' */
  syncType: string;
  /** Human-readable title for the dialog header */
  label: string;
}>();

defineEmits<{ 'update:visible': [boolean] }>();

const schedules    = ref<KbSyncSchedule[]>([]);
const loading      = ref(false);
const addingSchedule = ref(false);
const scheduleError  = ref('');

// ── Add schedule form ─────────────────────────────────────────────
const showAdd      = ref(false);
const scheduleMode = ref<'preset' | 'custom'>('preset');
const selectedPreset = ref<string>(CRON_PRESETS[0].cron);
const customCron   = ref('');

const activeCron = computed(() =>
  scheduleMode.value === 'preset' ? selectedPreset.value : customCron.value.trim()
);

watch(() => props.visible, async (open) => {
  if (!open) return;
  showAdd.value = false;
  loading.value = true;
  try {
    schedules.value = await kbSchedulesApi.list(props.syncType);
  } finally {
    loading.value = false;
  }
});

async function addSchedule() {
  if (!activeCron.value) return;
  addingSchedule.value = true;
  scheduleError.value = '';
  try {
    const s = await kbSchedulesApi.create(props.syncType, activeCron.value);
    schedules.value.push(s);
    showAdd.value = false;
    scheduleMode.value = 'preset';
    selectedPreset.value = CRON_PRESETS[0].cron;
    customCron.value = '';
  } catch (e: any) {
    scheduleError.value = e?.response?.data?.message ?? e?.response?.data?.detail ?? e.message ?? 'Error';
  } finally {
    addingSchedule.value = false;
  }
}

async function toggleEnabled(s: KbSyncSchedule) {
  const updated = await kbSchedulesApi.setEnabled(s.id, !s.enabled);
  const idx = schedules.value.findIndex(x => x.id === s.id);
  if (idx !== -1) schedules.value[idx] = updated;
}

async function remove(s: KbSyncSchedule) {
  await kbSchedulesApi.delete(s.id);
  schedules.value = schedules.value.filter(x => x.id !== s.id);
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="`Scheduled syncs — ${label}`"
    modal
    style="width:34rem;"
    @update:visible="$emit('update:visible', $event)"
  >
    <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem;">

      <!-- Existing schedules -->
      <div v-if="loading" style="text-align:center; color:var(--ares-text-muted); padding:1rem;">Loading…</div>
      <template v-else>
        <div v-if="!schedules.length" style="text-align:center; color:var(--ares-text-muted); font-size:0.82rem; padding:0.5rem 0;">
          No scheduled syncs configured yet.
        </div>
        <div v-else style="display:flex; flex-direction:column; gap:0.4rem;">
          <div
            v-for="s in schedules" :key="s.id"
            class="schedule-row"
            :style="s.enabled ? {} : { opacity: '0.55' }"
          >
            <div style="flex:1; min-width:0;">
              <div style="font-size:0.75rem; color:var(--ares-accent); font-family:monospace;">
                {{ humanCron(s.cronExpression) }}
                <span v-if="humanCron(s.cronExpression) !== s.cronExpression"
                  style="color:var(--ares-text-muted);"> · {{ s.cronExpression }}</span>
              </div>
              <div style="font-size:0.7rem; color:var(--ares-text-muted); margin-top:0.1rem;">
                <span v-if="s.lastRunAt">Last: {{ new Date(s.lastRunAt).toLocaleString() }} · </span>
                <span v-if="s.nextRunAt">Next: {{ new Date(s.nextRunAt).toLocaleString() }}</span>
              </div>
            </div>
            <div style="display:flex; gap:0.3rem; align-items:center; flex-shrink:0;">
              <Button
                :icon="s.enabled ? 'pi pi-pause' : 'pi pi-play'"
                text size="small"
                :severity="s.enabled ? 'warn' : 'secondary'"
                :title="s.enabled ? 'Pause' : 'Resume'"
                @click="toggleEnabled(s)"
              />
              <Button icon="pi pi-trash" text size="small" severity="danger" @click="remove(s)" />
            </div>
          </div>
        </div>

        <div style="display:flex; gap:0.5rem; justify-content:flex-end; padding-top:0.25rem;">
          <Button label="Close" severity="secondary" size="small" @click="$emit('update:visible', false)" />
          <Button label="Add schedule" icon="pi pi-plus" size="small" @click="showAdd = true" />
        </div>
      </template>
    </div>
  </Dialog>

  <!-- Add schedule sub-modal -->
  <Dialog v-model:visible="showAdd" header="Add schedule" modal style="width:28rem;">
    <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.5rem;">

      <div>
        <div class="form-label">Frequency</div>
        <div style="display:flex; gap:0.4rem; margin-bottom:0.6rem;">
          <button class="cap-option" :class="{ 'cap-option--selected': scheduleMode === 'preset' }"
            style="padding:0.3rem 0.7rem; font-size:0.78rem;" @click="scheduleMode = 'preset'">Preset</button>
          <button class="cap-option" :class="{ 'cap-option--selected': scheduleMode === 'custom' }"
            style="padding:0.3rem 0.7rem; font-size:0.78rem;" @click="scheduleMode = 'custom'">Custom cron</button>
        </div>

        <div v-if="scheduleMode === 'preset'" style="display:flex; flex-wrap:wrap; gap:0.4rem;">
          <button
            v-for="p in CRON_PRESETS" :key="p.cron"
            class="cap-option"
            :class="{ 'cap-option--selected': selectedPreset === p.cron }"
            style="padding:0.35rem 0.8rem; font-size:0.8rem;"
            @click="selectedPreset = p.cron"
          >{{ p.label }}</button>
        </div>

        <div v-else>
          <input v-model="customCron" class="cron-input" placeholder="e.g. 0 3 * * 0" />
          <div style="font-size:0.7rem; color:var(--ares-text-muted); margin-top:0.3rem;">
            5 fields: minute hour day-of-month month day-of-week
          </div>
        </div>
      </div>

      <div v-if="scheduleError" style="font-size:0.78rem; color:var(--ares-error);">{{ scheduleError }}</div>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" size="small" @click="showAdd = false" />
        <Button label="Save" icon="pi pi-check" size="small"
          :loading="addingSchedule" :disabled="!activeCron"
          @click="addSchedule" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.schedule-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
  background: var(--ares-surface);
}
.form-label {
  font-size: 0.75rem; font-weight: 600;
  color: var(--ares-text-muted); margin-bottom: 0.4rem;
}
.cap-option {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.7rem; border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); background: var(--ares-surface);
  color: var(--ares-text-2); cursor: pointer; font-size: 0.82rem;
  font-family: inherit; transition: border-color 0.12s, background 0.12s;
}
.cap-option:hover { border-color: var(--p-primary-400); }
.cap-option--selected {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  color: var(--p-primary-300); font-weight: 600;
}
.cron-input {
  width: 100%; background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.45rem 0.7rem; font-family: monospace;
  font-size: 0.85rem; color: var(--ares-text); outline: none;
  transition: border-color 0.12s; box-sizing: border-box;
}
.cron-input:focus { border-color: var(--p-primary-400); }
.cron-input::placeholder { color: var(--ares-text-muted); }
</style>
