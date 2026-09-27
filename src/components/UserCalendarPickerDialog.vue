<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { projectsApi, type Project } from '@/api/projects';
import { profileApi, type OutOfOfficeDto } from '@/api/profile';
import { usersApi, type UserSummary } from '@/api/users';

const props = defineProps<{
  visible: boolean;
  title: string;
  /** Dates of the project being created — used to highlight the range */
  engStartDate: Date | null;
  engEndDate: Date | null;
  /** User IDs already assigned — excluded from the list */
  excludeUserIds?: number[];
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'select': [UserSummary];
}>();

// ── User list ─────────────────────────────────────────────────────
const allUsers    = ref<UserSummary[]>([]);
const search      = ref('');
const hoveredUser = ref<UserSummary | null>(null);
const pickedUser  = ref<UserSummary | null>(null);

const CAN_LEAD    = (r: string) => r === 'MSSP_ADMIN'    || r === 'ROLE_MSSP_ADMIN';
const CAN_OPERATE = (r: string) => r === 'MSSP_OPERATOR' || r === 'ROLE_MSSP_OPERATOR';

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase();
  return allUsers.value.filter((u) => {
    if (u.status !== 'active') return false;
    if (!u.roles.some((r) => CAN_LEAD(r) || CAN_OPERATE(r))) return false;
    if (props.excludeUserIds?.includes(u.id)) return false;
    if (!q) return true;
    return (u.displayName ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
});

const activeUser = computed(() => hoveredUser.value ?? pickedUser.value ?? null);

// ── Calendar ──────────────────────────────────────────────────────
const monthOffset     = ref(0);
const scheduleLoading = ref(false);
const projects     = ref<Project[]>([]);
const oooList      = ref<OutOfOfficeDto[]>([]);

const DAY_NAMES_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const monthBase = computed(() => {
  const base = props.engStartDate ?? new Date();
  const d = new Date(base);
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset.value);
  d.setHours(0, 0, 0, 0);
  return d;
});

const monthLabel = computed(() =>
  monthBase.value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
);

const monthGrid = computed(() => {
  const year  = monthBase.value.getFullYear();
  const month = monthBase.value.getMonth();
  const firstDay    = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart   = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  const weeks: Date[][] = [];
  let cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor.getMonth() !== month && cursor.getDay() === 1) break;
  }
  return weeks;
});

function isCurrentMonth(d: Date) {
  return d.getMonth() === monthBase.value.getMonth() && d.getFullYear() === monthBase.value.getFullYear();
}
function isToday(d: Date) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
function isWeekend(d: Date) { return d.getDay() === 0 || d.getDay() === 6; }
function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function normDate(s: string | null | undefined): string | null { return s ? s.slice(0, 10) : null; }

// Is this day within the NEW project's date range?
function isNewEngDay(day: Date): boolean {
  const dayStr = toStr(day);
  const start  = props.engStartDate ? toStr(props.engStartDate) : null;
  const end    = props.engEndDate   ? toStr(props.engEndDate)   : null;
  if (!start && !end) return false;
  if (start && dayStr < start) return false;
  if (end   && dayStr > end)   return false;
  return true;
}

// Is this the first / last day of the new project range in the current row?
function newEngStart(day: Date, rowFirst: Date): boolean {
  const dayStr   = toStr(day);
  const rowStr   = toStr(rowFirst);
  const startStr = props.engStartDate ? toStr(props.engStartDate) : null;
  if (!startStr || startStr <= rowStr) return dayStr === rowStr;
  return dayStr === startStr;
}
function newEngEnd(day: Date, rowLast: Date): boolean {
  const dayStr  = toStr(day);
  const rowStr  = toStr(rowLast);
  const endStr  = props.engEndDate ? toStr(props.engEndDate) : null;
  if (!endStr || endStr >= rowStr) return dayStr === rowStr;
  return dayStr === endStr;
}

// Existing projects (with end date) of the active user on a given day
function userEngsOnDay(day: Date): Project[] {
  const uid = activeUser.value?.id;
  if (!uid) return [];
  const dayStr = toStr(day);
  return projects.value.filter((eng) => {
    if (!eng.members.some((m) => m.userId === uid)) return false;
    const s = normDate(eng.startDate);
    const e = normDate(eng.endDate);
    if (!e) return false; // open-ended projects go to the list below
    if (s && dayStr < s) return false;
    if (dayStr > e) return false;
    return true;
  });
}

// Open-ended projects (no endDate) of the active user, active during the new project's dates
const openEndedUserProjects = computed(() => {
  const uid = activeUser.value?.id;
  if (!uid) return [];
  const engEnd = props.engEndDate ? toStr(props.engEndDate) : null;
  return projects.value.filter((p) => {
    if (!p.members.some((m) => m.userId === uid)) return false;
    if (normDate(p.endDate) !== null) return false;
    const pStart = normDate(p.startDate);
    if (engEnd && pStart && pStart > engEnd) return false;
    return true;
  });
});

function barIsStart(eng: Project, day: Date, rowFirst: Date): boolean {
  const dayStr   = toStr(day);
  const rowStr   = toStr(rowFirst);
  const startStr = normDate(eng.startDate);
  if (!startStr || startStr <= rowStr) return dayStr === rowStr;
  return startStr === dayStr;
}
function barIsEnd(eng: Project, day: Date, rowLast: Date): boolean {
  const dayStr  = toStr(day);
  const rowStr  = toStr(rowLast);
  const endStr  = normDate(eng.endDate);
  if (!endStr || endStr >= rowStr) return dayStr === rowStr;
  return endStr === dayStr;
}
function barBg(status: string): string {
  if (status === 'completed') return 'color-mix(in srgb, var(--ares-accent-bg) 40%, #111)';
  if (status === 'past_due')  return 'color-mix(in srgb, var(--ares-error) 55%, #111)';
  return 'var(--ares-accent-bg)';
}

function barStyle(eng: Project, day: Date, rowFirst: Date, rowLast: Date): Record<string, string> {
  const s = barIsStart(eng, day, rowFirst);
  const e = barIsEnd(eng, day, rowLast);
  const dimmed = eng.status === 'completed' || eng.status === 'past_due';
  return {
    display: 'block', cursor: 'default',
    background: barBg(eng.status),
    color: dimmed ? 'rgba(255,255,255,0.65)' : '#fff',
    borderRadius: s && e ? '3px' : s ? '3px 0 0 3px' : e ? '0 3px 3px 0' : '0',
    paddingLeft: s ? '0.3rem' : '0', paddingRight: e ? '0.3rem' : '0',
    marginLeft: s ? '0' : '-0.41rem', marginRight: e ? '0' : '-0.41rem',
    marginBottom: '0.1rem', fontSize: '0.6rem', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
    minHeight: '1.1rem', lineHeight: '1.1rem',
  };
}

function oooOnDay(day: Date): OutOfOfficeDto[] {
  const uid = activeUser.value?.id;
  if (!uid) return [];
  const dayStr = toStr(day);
  return oooList.value.filter(o => o.userId === uid && o.startDate <= dayStr && o.endDate >= dayStr);
}

function oooBarIsStart(o: OutOfOfficeDto, day: Date, rowFirst: Date): boolean {
  const dayStr  = toStr(day);
  const rowStr  = toStr(rowFirst);
  if (!o.startDate || o.startDate <= rowStr) return dayStr === rowStr;
  return o.startDate === dayStr;
}

function oooBarStyle(o: OutOfOfficeDto, day: Date, rowFirst: Date, rowLast: Date): Record<string, string> {
  const s = oooBarIsStart(o, day, rowFirst);
  const eStr = toStr(rowLast);
  const e = !o.endDate || o.endDate >= eStr ? toStr(day) === eStr : o.endDate === toStr(day);
  return {
    display: 'block', cursor: 'default',
    background: 'color-mix(in srgb, var(--ares-warning) 55%, var(--ares-bg))',
    color: 'rgba(255,255,255,0.75)',
    borderRadius: s && e ? '3px' : s ? '3px 0 0 3px' : e ? '0 3px 3px 0' : '0',
    paddingLeft: s ? '0.3rem' : '0', paddingRight: e ? '0.3rem' : '0',
    marginLeft: s ? '0' : '-0.41rem', marginRight: e ? '0' : '-0.41rem',
    marginBottom: '0.1rem', fontSize: '0.58rem', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
    minHeight: '1.1rem', lineHeight: '1.1rem',
  };
}

// ── Data loading ──────────────────────────────────────────────────
async function loadSchedule() {
  if (!activeUser.value) return;
  scheduleLoading.value = true;
  try {
    const first = monthGrid.value[0][0];
    const last  = monthGrid.value[monthGrid.value.length - 1][6];
    const start = toStr(first);
    const end   = toStr(last);
    const uid   = activeUser.value.id;
    const [projs, ooo] = await Promise.all([
      projectsApi.schedule(start, end),
      profileApi.userOoo(uid, { start, end }),
    ]);
    projects.value = projs;
    oooList.value  = ooo;
  } catch { projects.value = []; oooList.value = []; }
  finally   { scheduleLoading.value = false; }
}

watch(activeUser, () => { loadSchedule(); });
watch(monthOffset, () => { loadSchedule(); });

watch(() => props.visible, async (open) => {
  if (!open) return;
  search.value = '';
  hoveredUser.value = null;
  pickedUser.value  = null;
  monthOffset.value = 0;
  projects.value = [];
  try {
    const res = await usersApi.list({ size: 200 });
    allUsers.value = res.items;
  } catch { allUsers.value = []; }
});

// ── Selection ─────────────────────────────────────────────────────
function confirmUser() {
  const u = pickedUser.value;
  if (!u) return;
  emit('select', u);
  emit('update:visible', false);
}

function roleLabel(u: UserSummary): string {
  if (u.roles.some(CAN_LEAD)) return 'Admin';
  return 'Operator';
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    modal
    :style="{ width: 'min(920px, 96vw)' }"
    :pt="{ content: { class: 'picker-content' } }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="picker-wrap">

      <!-- ── Left: user list ───────────────────────────────────── -->
      <div class="user-panel">
        <input
          v-model="search"
          class="user-search"
          placeholder="Search by name or email…"
        />

        <div class="user-list">
          <div
            v-for="u in filteredUsers" :key="u.id"
            class="user-row"
            :class="{
              'user-row--picked':  pickedUser?.id === u.id,
              'user-row--hovered': hoveredUser?.id === u.id,
            }"
            @mouseenter="hoveredUser = u"
            @mouseleave="hoveredUser = null"
            @click="pickedUser = pickedUser?.id === u.id ? null : u"
          >
            <div class="user-avatar">{{ (u.displayName || u.email)[0]?.toUpperCase() }}</div>
            <div style="flex:1; min-width:0;">
              <div class="user-name">{{ u.displayName }}</div>
              <div class="user-email">{{ u.email }}</div>
            </div>
            <span class="user-role-tag">{{ roleLabel(u) }}</span>
          </div>
          <div v-if="!filteredUsers.length" class="user-empty">No users found.</div>
        </div>

        <div class="user-panel-footer">
          <Button label="Cancel" severity="secondary" size="small" @click="$emit('update:visible', false)" />
          <Button
            label="Select"
            size="small"
            :disabled="!pickedUser"
            @click="confirmUser"
          />
        </div>
      </div>

      <!-- ── Right: calendar ───────────────────────────────────── -->
      <div class="cal-panel">
        <div v-if="!activeUser" class="cal-empty">
          <i class="pi pi-calendar" style="font-size:2rem; opacity:0.25; display:block; margin-bottom:0.5rem;" />
          Hover over or select a user to see their schedule
        </div>

        <template v-else>
          <!-- Month nav -->
          <div class="cal-nav">
            <button class="cal-nav-btn" @click="monthOffset--">‹</button>
            <span class="cal-month-label">{{ monthLabel }}</span>
            <button class="cal-nav-btn" @click="monthOffset++">›</button>
          </div>

          <!-- Legend -->
          <div class="cal-legend">
            <span class="legend-item">
              <span class="legend-dot" style="background:var(--ares-accent-bg);" />Active
            </span>
            <span class="legend-item">
              <span class="legend-dot" style="background:color-mix(in srgb, var(--ares-accent-bg) 40%, #111);" />Completed
            </span>
            <span class="legend-item">
              <span class="legend-dot" style="background:color-mix(in srgb, var(--ares-error) 55%, #111);" />Past due
            </span>
            <span class="legend-item">
              <span class="legend-dot" style="background:color-mix(in srgb, var(--ares-warning) 55%, var(--ares-bg));" />OoO
            </span>
            <span v-if="engStartDate || engEndDate" class="legend-item">
              <span class="legend-dot" style="background:var(--ares-success, #22c55e); opacity:0.7;" />New project
            </span>
          </div>

          <!-- Calendar grid -->
          <div v-if="scheduleLoading" style="text-align:center; padding:2rem; color:var(--ares-text-muted); font-size:0.82rem;">Loading…</div>
          <table v-else class="cal-table">
            <thead>
              <tr>
                <th
                  v-for="(name, i) in DAY_NAMES_SHORT" :key="i"
                  :style="{ color: i >= 5 ? 'var(--ares-text-muted)' : 'var(--ares-text-muted)' }"
                >{{ name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(week, wi) in monthGrid" :key="wi">
                <td
                  v-for="(day, di) in week" :key="di"
                  :style="{
                    opacity: !isCurrentMonth(day) ? '0.35' : '1',
                    background: isNewEngDay(day)
                      ? 'color-mix(in srgb, #22c55e 18%, transparent)'
                      : isWeekend(day)
                        ? 'color-mix(in srgb, var(--ares-bg) 40%, transparent)'
                        : 'transparent',
                    borderRadius: isNewEngDay(day) && newEngStart(day, week[0]) && newEngEnd(day, week[6])
                      ? '4px'
                      : isNewEngDay(day) && newEngStart(day, week[0])
                        ? '4px 0 0 4px'
                        : isNewEngDay(day) && newEngEnd(day, week[6])
                          ? '0 4px 4px 0'
                          : '0',
                  }"
                >
                  <!-- Day number -->
                  <div class="cal-day-num">
                    <span :class="{ 'cal-today': isToday(day) }">{{ day.getDate() }}</span>
                  </div>
                  <!-- Project bars -->
                  <div
                    v-for="eng in userEngsOnDay(day)" :key="eng.id"
                    :style="barStyle(eng, day, week[0], week[6])"
                    :title="eng.name + (eng.status !== 'active' && eng.status !== 'scheduled' ? ' · ' + eng.status.replace('_', ' ') : '')"
                  >
                    <template v-if="barIsStart(eng, day, week[0])">{{ eng.name }}</template>
                    <template v-else>&nbsp;</template>
                  </div>
                  <!-- OoO bars -->
                  <div
                    v-for="o in oooOnDay(day)" :key="'ooo-' + o.id"
                    :style="oooBarStyle(o, day, week[0], week[6])"
                    :title="'Out of Office' + (o.reason ? ': ' + o.reason : '')"
                  >
                    <template v-if="oooBarIsStart(o, day, week[0])">
                      <i class="pi pi-calendar-times" style="font-size:0.5rem; margin-right:0.15rem;" />OoO{{ o.reason ? ': ' + o.reason : '' }}
                    </template>
                    <template v-else>&nbsp;</template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Open-ended projects list -->
          <div v-if="openEndedUserProjects.length" class="open-ended-section">
            <div class="open-ended-header">
              <i class="pi pi-infinity" />Without end date
            </div>
            <div class="open-ended-list">
              <div v-for="p in openEndedUserProjects" :key="p.id" class="open-ended-item">
                <span class="open-ended-bar" />
                <span class="open-ended-name">{{ p.name }}</span>
                <span class="open-ended-from">{{ p.startDate ? 'from ' + p.startDate : 'no start' }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.picker-wrap {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 1rem;
  height: 100%;
}

/* ── User panel ── */
.user-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
}
.user-search {
  width: 100%;
  box-sizing: border-box;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  color: var(--ares-text);
  font-family: inherit;
  outline: none;
  transition: border-color 0.12s;
}
.user-search:focus { border-color: var(--p-primary-400); }
.user-search::placeholder { color: var(--ares-text-muted); }

.user-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  scrollbar-width: thin;
}
.user-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-radius: var(--ares-radius);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s, border-color 0.1s;
  flex-shrink: 0;
}
.user-row:hover,
.user-row--hovered  { background: var(--ares-surface-2); }
.user-row--picked   { border-color: var(--p-primary-500); background: color-mix(in srgb, var(--p-primary-500) 10%, transparent); }

.user-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--ares-accent-bg); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 700; flex-shrink: 0;
}
.user-name  { font-size: 0.82rem; font-weight: 600; color: var(--ares-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-email { font-size: 0.7rem; color: var(--ares-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-role-tag {
  font-size: 0.62rem; padding: 0.1rem 0.35rem; border-radius: var(--ares-radius);
  background: var(--ares-surface-2); color: var(--ares-text-muted);
  white-space: nowrap; flex-shrink: 0;
}
.user-empty { font-size: 0.8rem; color: var(--ares-text-muted); text-align: center; padding: 1rem; }
.user-panel-footer { display: flex; gap: 0.5rem; justify-content: flex-end; padding-top: 0.25rem; border-top: 1px solid var(--ares-border); }

/* ── Calendar panel ── */
.cal-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  scrollbar-width: thin;
}
.cal-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--ares-text-muted); font-size: 0.82rem; text-align: center;
}
.cal-nav {
  display: flex; align-items: center; gap: 0.5rem; justify-content: center;
}
.cal-nav-btn {
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); color: var(--ares-text-muted);
  padding: 0.15rem 0.5rem; cursor: pointer; font-size: 0.9rem; font-family: inherit;
  transition: background 0.1s;
}
.cal-nav-btn:hover { background: var(--ares-surface-2); }
.cal-month-label { font-size: 0.85rem; font-weight: 600; color: var(--ares-text); min-width: 130px; text-align: center; }

.cal-legend { display: flex; gap: 0.75rem; font-size: 0.7rem; color: var(--ares-text-muted); }
.legend-item { display: flex; align-items: center; gap: 0.3rem; }
.legend-dot  { width: 10px; height: 10px; border-radius: var(--ares-radius); flex-shrink: 0; }

.cal-table {
  width: 100%; border-collapse: collapse; font-size: 0.75rem; table-layout: fixed;
}
.cal-table thead th {
  text-align: center; padding: 0.3rem 0;
  font-size: 0.67rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--ares-text-muted);
  border-bottom: 1px solid var(--ares-border);
}
.cal-table tbody td {
  padding: 0.25rem 0.3rem;
  vertical-align: top;
  min-height: 52px;
  height: 52px;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 40%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--ares-border) 20%, transparent);
}
.cal-table tbody td:last-child { border-right: none; }

.cal-day-num {
  /* Fixed height so the "today" circle doesn't push the project bars below it
     down on its column. Matches the .cal-today width/height. */
  height: 1.35rem;
  font-size: 0.7rem;
  margin-bottom: 0.15rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cal-today {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.35rem; height: 1.35rem; border-radius: 50%;
  background: var(--ares-accent-bg); color: #fff; font-weight: 700;
}

/* ── Open-ended projects list ── */
.open-ended-section {
  border-top: 1px solid var(--ares-border);
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.open-ended-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.67rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
}
.open-ended-list {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.open-ended-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.3rem;
}
.open-ended-bar {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: var(--ares-radius);
  background: var(--ares-accent-bg);
  flex-shrink: 0;
}
.open-ended-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ares-text);
}
.open-ended-from {
  font-size: 0.68rem;
  color: var(--ares-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Dialog content slot ── */
:global(.picker-content) {
  padding: 1rem 1.25rem 1.25rem;
  height: 520px;
}

@media (max-width: 767px) {
  :global(.picker-content) { height: auto; padding: 0.75rem; }
  .picker-wrap { grid-template-columns: 1fr; height: auto; }
  .user-panel { max-height: 180px; border-right: none; border-bottom: 1px solid var(--ares-border); padding-bottom: 0.5rem; }
}
</style>
