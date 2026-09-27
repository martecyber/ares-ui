<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DatePicker from 'primevue/datepicker';
import { holidaysApi, type HolidayCalendar, type HolidayCalendarDay } from '@/api/holidays';
import { confirmDialog } from '@/composables/useConfirmDialog';

const toast = useToast();

const calendars = ref<HolidayCalendar[]>([]);
const loading   = ref(false);

// Selected calendar — its days panel renders on the right.
const selectedId = ref<number | null>(null);
const selected   = computed(() => calendars.value.find((c) => c.id === selectedId.value) ?? null);
const days       = ref<HolidayCalendarDay[]>([]);
const daysLoading = ref(false);

// Create-calendar form state
const newName = ref('');
const newDesc = ref('');
const creating = ref(false);

// Add-day form state (local to the selected calendar)
const newDay   = ref<Date | null>(null);
const newLabel = ref('');
const addingDay = ref(false);

async function load() {
  loading.value = true;
  try { calendars.value = await holidaysApi.list(); }
  finally { loading.value = false; }
}

async function selectCalendar(c: HolidayCalendar) {
  selectedId.value = c.id;
  daysLoading.value = true;
  try { days.value = await holidaysApi.listDays(c.id); }
  finally { daysLoading.value = false; }
}

async function createCalendar() {
  if (!newName.value.trim()) return;
  creating.value = true;
  try {
    const c = await holidaysApi.create({
      name: newName.value.trim(),
      description: newDesc.value.trim() || undefined,
    });
    calendars.value = [...calendars.value, c].sort((a, b) => a.name.localeCompare(b.name));
    newName.value = '';
    newDesc.value = '';
    selectCalendar(c);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Create failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally { creating.value = false; }
}

async function deleteCalendar(c: HolidayCalendar) {
  const ok = await confirmDialog({ header: 'Delete calendar', message: `Delete "${c.name}"? Users assigned to it will be detached, holiday bars stop appearing on their calendars.` });
  if (!ok) return;
  try {
    await holidaysApi.delete(c.id);
    calendars.value = calendars.value.filter((x) => x.id !== c.id);
    if (selectedId.value === c.id) {
      selectedId.value = null;
      days.value = [];
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function addDay() {
  if (!selectedId.value || !newDay.value) return;
  addingDay.value = true;
  try {
    const d = await holidaysApi.addDay(selectedId.value, {
      day: toLocalDateStr(newDay.value),
      label: newLabel.value.trim() || undefined,
    });
    days.value = [...days.value, d].sort((a, b) => a.day.localeCompare(b.day));
    // Bump count locally so the list view reflects it without a refetch.
    const cal = calendars.value.find((c) => c.id === selectedId.value);
    if (cal) cal.dayCount += 1;
    newDay.value = null;
    newLabel.value = '';
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Add failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally { addingDay.value = false; }
}

async function deleteDay(d: HolidayCalendarDay) {
  if (!selectedId.value) return;
  try {
    await holidaysApi.deleteDay(selectedId.value, d.id);
    days.value = days.value.filter((x) => x.id !== d.id);
    const cal = calendars.value.find((c) => c.id === selectedId.value);
    if (cal && cal.dayCount > 0) cal.dayCount -= 1;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Holiday Calendars</h2>
        <p class="ares-page-subtitle">
          Admin-curated holiday day lists. Each user can opt into one calendar from their profile;
          their dashboard will then highlight those days alongside Out-of-Office bars.
        </p>
      </div>
    </div>

    <div class="layout">
      <!-- ── Calendars list (left) ───────────────────────────────────── -->
      <section class="ares-card" style="padding:0;">
        <div class="card-head">
          <h3>Calendars</h3>
        </div>
        <div class="add-form">
          <InputText v-model="newName" placeholder="e.g. Spain — National 2026" />
          <InputText v-model="newDesc" placeholder="Description (optional)" />
          <Button label="Create" icon="pi pi-plus" size="small"
            :loading="creating" :disabled="!newName.trim()" @click="createCalendar" />
        </div>
        <div v-if="loading" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">Loading…</div>
        <div v-else-if="!calendars.length" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">
          No calendars yet — create the first one above.
        </div>
        <div v-else class="cal-list">
          <div v-for="c in calendars" :key="c.id" class="cal-row"
            :class="{ 'cal-row--active': c.id === selectedId }"
            @click="selectCalendar(c)">
            <div class="cal-row__main">
              <div class="cal-row__name">{{ c.name }}</div>
              <div v-if="c.description" class="cal-row__desc">{{ c.description }}</div>
            </div>
            <span class="cal-row__count">{{ c.dayCount }} day{{ c.dayCount === 1 ? '' : 's' }}</span>
            <Button icon="pi pi-trash" text severity="danger" size="small"
              v-tooltip.left="'Delete calendar'"
              @click.stop="deleteCalendar(c)" />
          </div>
        </div>
      </section>

      <!-- ── Days panel (right) ──────────────────────────────────────── -->
      <section class="ares-card" style="padding:0;">
        <div class="card-head">
          <h3>{{ selected ? `${selected.name} — days` : 'Select a calendar to manage its days' }}</h3>
        </div>

        <template v-if="selected">
          <div class="add-form">
            <DatePicker v-model="newDay" date-format="yy-mm-dd"
              placeholder="yyyy-mm-dd" :first-day-of-week="1" append-to="self" />
            <InputText v-model="newLabel" placeholder="Label (optional)" />
            <Button label="Add" icon="pi pi-plus" size="small"
              :loading="addingDay" :disabled="!newDay" @click="addDay" />
          </div>
          <div v-if="daysLoading" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">Loading…</div>
          <div v-else-if="!days.length" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">
            No days yet. Add the holidays one by one — dates shift each year, so per-year curation is intentional.
          </div>
          <div v-else class="day-list">
            <div v-for="d in days" :key="d.id" class="day-row">
              <code class="day-row__date">{{ d.day }}</code>
              <span class="day-row__label">{{ d.label || '—' }}</span>
              <Button icon="pi pi-times" text severity="danger" size="small"
                v-tooltip.left="'Remove'" @click="deleteDay(d)" />
            </div>
          </div>
        </template>
        <div v-else style="padding:1.5rem; color:var(--ares-text-muted); font-size:0.85rem;">
          Pick a calendar from the left to manage its days.
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 1rem;
}
@media (max-width: 1024px) {
  .layout { grid-template-columns: 1fr; }
}
.card-head {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ares-border);
}
.card-head h3 { margin: 0; font-size: 0.9rem; color: var(--ares-text-1); }
.add-form {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ares-border);
  flex-wrap: wrap;
}
.add-form > * { flex: 1; min-width: 140px; }
.add-form > .p-button { flex: 0 0 auto; min-width: auto; }

.cal-list { max-height: 540px; overflow-y: auto; }
.cal-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 60%, transparent);
  cursor: pointer;
}
.cal-row:last-child { border-bottom: none; }
.cal-row:hover { background: var(--ares-surface-2); }
.cal-row--active { background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); }
.cal-row__main { flex: 1; min-width: 0; }
.cal-row__name { font-size: 0.88rem; font-weight: 600; color: var(--ares-text-1); }
.cal-row__desc { font-size: 0.72rem; color: var(--ares-text-muted); margin-top: 0.1rem; }
.cal-row__count {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.day-list { max-height: 540px; overflow-y: auto; }
.day-row {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 60%, transparent);
}
.day-row:last-child { border-bottom: none; }
.day-row__date { font-family: monospace; font-size: 0.82rem; color: var(--ares-text-1); }
.day-row__label { font-size: 0.82rem; color: var(--ares-text-2); }
</style>
