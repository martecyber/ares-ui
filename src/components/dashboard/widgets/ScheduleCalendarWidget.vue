<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { projectsApi, type Project } from '@/api/projects';
import { profileApi, type OutOfOfficeDto, type HolidayDayDto } from '@/api/profile';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useAuthStore } from '@/stores/auth';
import DashboardAgenda from '@/components/DashboardAgenda.vue';
import WidgetLoading from './WidgetLoading.vue';

// Lift-and-shift of DashboardView.vue's schedule section (pre-remodel platform dashboard) — same
// data sources/behavior, just as a standalone widget instead of half of one big page.
const { isMobile } = useBreakpoint();
const router = useRouter();
const auth = useAuthStore();

const projects = ref<Project[]>([]);
const oooList = ref<OutOfOfficeDto[]>([]);
const holidayList = ref<HolidayDayDto[]>([]);
const scheduleLoading = ref(true);
const monthOffset = ref(0);

const monthDate = computed(() => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset.value);
  d.setHours(0, 0, 0, 0);
  return d;
});

const monthLabel = computed(() =>
  monthDate.value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
);

const DAY_NAMES_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const monthGrid = computed(() => {
  const year = monthDate.value.getFullYear();
  const month = monthDate.value.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
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

function isCurrentMonth(d: Date): boolean {
  return d.getMonth() === monthDate.value.getMonth() && d.getFullYear() === monthDate.value.getFullYear();
}
function isToday(d: Date): boolean {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function normDate(s: string | null | undefined): string | null {
  return s ? s.slice(0, 10) : null;
}
function engOnDay(eng: Project, dayStr: string): boolean {
  if (!eng.endDate) return false;
  const start = normDate(eng.startDate);
  const end   = normDate(eng.endDate);
  if (start && start > dayStr) return false;
  if (end   && end   < dayStr) return false;
  return true;
}

const currentUserId = computed(() => auth.user?.id ?? null);

function projectsOnDayForUser(userId: number, day: Date): Project[] {
  const dayStr = toLocalDateStr(day);
  return projects.value.filter((eng) => {
    if (!eng.members.some((m) => m.userId === userId)) return false;
    return engOnDay(eng, dayStr);
  });
}

function oooOnDay(day: Date): OutOfOfficeDto[] {
  const dayStr = toLocalDateStr(day);
  return oooList.value.filter(o => o.startDate <= dayStr && o.endDate >= dayStr);
}

function holidaysOnDay(day: Date): HolidayDayDto[] {
  const dayStr = toLocalDateStr(day);
  return holidayList.value.filter((h) => h.day === dayStr);
}

function goToProject(eng: Project) {
  router.push({ name: 'org-project-dashboard', params: { orgId: eng.organizationId, engId: eng.id } });
}

/**
 * Every week-row renders at the same fixed height regardless of how many projects/OoO entries
 * land on a given day — instead of one bar per event (which used to make a busy week taller
 * than a quiet one), each day cell gets at most: the day number (holiday shown as a small dot
 * right next to it, not its own line), one truncated "projects" line, and one truncated "out of
 * office" line — coinciding entries of the same kind collapse into that one line instead of
 * stacking. Precomputed once per month here rather than recomputed per render in the template.
 */
interface DayCell {
  date: Date;
  dayNum: number;
  inCurrentMonth: boolean;
  today: boolean;
  weekend: boolean;
  holidayTitle: string | null;
  project: { text: string; title: string; target: Project | null } | null;
  ooo: { text: string; title: string } | null;
}

const monthGridInfo = computed<DayCell[][]>(() => {
  const uid = currentUserId.value;
  return monthGrid.value.map((week) => week.map((date): DayCell => {
    const holidays = holidaysOnDay(date);
    const oooEntries = oooOnDay(date);
    const projList = uid ? projectsOnDayForUser(uid, date) : [];
    return {
      date,
      dayNum: date.getDate(),
      inCurrentMonth: isCurrentMonth(date),
      today: isToday(date),
      weekend: isWeekend(date),
      holidayTitle: holidays.length ? holidays.map((h) => h.label || 'Holiday').join('\n') : null,
      project: projList.length ? {
        text: projList.map((p) => p.code ?? p.name).join(', '),
        title: projList.map((p) => p.name + (p.organizationName ? ' · ' + p.organizationName : '')).join('\n'),
        target: projList.length === 1 ? projList[0] : null,
      } : null,
      ooo: oooEntries.length ? {
        text: oooEntries.length === 1 ? ('OoO' + (oooEntries[0].reason ? ': ' + oooEntries[0].reason : '')) : `OoO ×${oooEntries.length}`,
        title: oooEntries.map((o) => o.reason || 'Out of Office').join('\n'),
      } : null,
    };
  }));
});

async function loadSchedule() {
  scheduleLoading.value = true;
  try {
    const first = monthGrid.value[0][0];
    const last  = monthGrid.value[monthGrid.value.length - 1][6];
    const start = toLocalDateStr(first);
    const end   = toLocalDateStr(last);
    const [projs, ooo, holidays] = await Promise.all([
      projectsApi.schedule(start, end),
      profileApi.listOoo({ start, end }),
      profileApi.listMyHolidays({ start, end }).catch(() => []),
    ]);
    projects.value = projs;
    oooList.value  = ooo;
    holidayList.value = holidays;
  } catch {
    // silent — schedule is non-critical
  } finally {
    scheduleLoading.value = false;
  }
}

watch(monthOffset, loadSchedule);
onMounted(loadSchedule);
</script>

<template>
  <div class="schedule-widget">
    <div class="schedule-header">
      <span class="schedule-title">{{ auth.user?.displayName ?? '' }}</span>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <button class="dash-nav-btn" @click="monthOffset--">‹</button>
        <span style="font-size:0.82rem; font-weight:600; color:var(--ares-text); min-width:120px; text-align:center;">{{ monthLabel }}</span>
        <button class="dash-nav-btn" @click="monthOffset++">›</button>
        <button v-if="monthOffset !== 0" class="dash-today-btn" @click="monthOffset = 0">Today</button>
      </div>
    </div>

    <div class="schedule-body">
    <WidgetLoading v-if="scheduleLoading" />

    <DashboardAgenda
      v-else-if="isMobile && currentUserId"
      :today="new Date()"
      :projects-on="(d) => projectsOnDayForUser(currentUserId!, d)"
      :ooo-on="oooOnDay"
      :holidays-on="holidaysOnDay"
      :on-project-click="goToProject"
    />

    <div v-else class="ares-table-wrap">
      <table class="cal-table">
        <thead>
          <tr>
            <th v-for="(name, i) in DAY_NAMES_SHORT" :key="i" :class="{ 'cal-th--weekend': i >= 5 }">{{ name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, wi) in monthGridInfo" :key="wi" class="cal-week-row">
            <td v-for="cell in week" :key="cell.dayNum + '-' + cell.inCurrentMonth"
              class="cal-cell"
              :class="{ 'cal-cell--faded': !cell.inCurrentMonth, 'cal-cell--weekend': cell.weekend }"
            >
              <div class="cal-day-row">
                <span class="cal-day-num" :class="{ 'cal-day-num--today': cell.today }">{{ cell.dayNum }}</span>
                <i v-if="cell.holidayTitle" class="pi pi-circle-fill cal-holiday-dot" :title="cell.holidayTitle" />
              </div>
              <div
                class="cal-line cal-line--project"
                :class="{ 'cal-line--clickable': cell.project?.target }"
                :title="cell.project?.title"
                @click="cell.project?.target && goToProject(cell.project.target)"
              >{{ cell.project?.text ?? '' }}</div>
              <div class="cal-line cal-line--ooo" :title="cell.ooo?.title">{{ cell.ooo?.text ?? '' }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-widget { display: flex; flex-direction: column; gap: 0.5rem; height: 100%; overflow: hidden; }
.schedule-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.schedule-body { flex: 1; min-height: 0; overflow: auto; }
.schedule-title { font-size: 0.85rem; font-weight: 600; color: var(--ares-text-2); }
.dash-nav-btn {
  background: var(--ares-surface); border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
  color: var(--ares-text-muted); padding: 0.15rem 0.5rem; cursor: pointer; font-family: inherit; font-size: 0.8rem;
}
.dash-nav-btn:hover { background: var(--ares-surface-2); color: var(--ares-text); }
.dash-today-btn {
  background: transparent; border: none; color: var(--ares-accent-muted); font-size: 0.72rem; cursor: pointer; font-family: inherit;
}

.cal-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; table-layout: fixed; }
.cal-table th {
  padding: 0.4rem; border-bottom: 1px solid var(--ares-border); text-align: center;
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--ares-text-muted); background: var(--ares-surface);
}
.cal-th--weekend { background: color-mix(in srgb, var(--ares-surface) 80%, black); }

/* Every row/cell is the same fixed height regardless of content — 3 lines always render
   (day number, project summary, OoO summary), just empty when there's nothing to show. */
.cal-cell {
  padding: 0.3rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--ares-border) 30%, transparent);
  vertical-align: top;
  height: 4.4rem;
}
.cal-cell:last-child { border-right: none; }
.cal-cell--faded { background: color-mix(in srgb, var(--ares-bg) 70%, transparent); opacity: 0.5; }
.cal-cell--weekend:not(.cal-cell--faded) { background: color-mix(in srgb, var(--ares-bg) 40%, transparent); }

.cal-day-row { display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.2rem; }
.cal-day-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.3rem; height: 1.3rem; border-radius: 50%; font-size: 0.68rem; color: var(--ares-text-muted);
}
.cal-day-num--today { background: var(--ares-accent-bg); color: #fff; font-weight: 700; }
.cal-holiday-dot { font-size: 0.45rem; color: var(--ares-info); flex-shrink: 0; }

.cal-line {
  font-size: 0.63rem; line-height: 1.3; min-height: 1.3rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-radius: 3px; padding: 0.1rem 0.3rem; margin-bottom: 0.15rem; box-sizing: border-box;
}
.cal-line--project { background: color-mix(in srgb, var(--ares-accent-bg) 55%, transparent); color: #fff; }
.cal-line--project:empty { background: transparent; }
.cal-line--clickable { cursor: pointer; }
.cal-line--ooo { background: color-mix(in srgb, var(--ares-warning) 45%, transparent); color: rgba(255,255,255,0.85); }
.cal-line--ooo:empty { background: transparent; }
</style>
