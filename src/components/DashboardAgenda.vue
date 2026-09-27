<script setup lang="ts">
/**
 * Mobile substitute for the monthly calendar grid in DashboardView. Renders
 * the next 14 days as a vertical agenda: each day shows project bars / OoO /
 * holiday pills inline. Trades the spatial week-view of the desktop calendar
 * for something that's actually readable on a 375 px viewport.
 *
 * Reuses the per-day lookup callbacks from the parent so the source of truth
 * for "what's scheduled when" stays in one place.
 */
import { computed } from 'vue';
import type { Project } from '@/api/projects';
import type { OutOfOfficeDto, HolidayDayDto } from '@/api/profile';

const props = defineProps<{
  /** Cursor for "today" in the agenda. Lets the parent pin the start. */
  today: Date;
  /** Project resolver — returns the projects active on the given day for the current user. */
  projectsOn: (day: Date) => Project[];
  oooOn: (day: Date) => OutOfOfficeDto[];
  holidaysOn: (day: Date) => HolidayDayDto[];
  onProjectClick: (eng: Project) => void;
}>();

const DAYS_AHEAD = 14;

const days = computed(() => {
  const out: Date[] = [];
  const base = new Date(props.today);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
});

function dayLabel(d: Date): string {
  const today = new Date(props.today);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

function projectColor(status: string): string {
  if (status === 'completed') return 'color-mix(in srgb, var(--ares-accent-bg) 40%, #111)';
  if (status === 'past_due')  return 'color-mix(in srgb, var(--ares-error) 55%, #111)';
  return 'var(--ares-accent-bg)';
}
</script>

<template>
  <div class="agenda">
    <div v-for="d in days" :key="d.toISOString()" class="agenda-day"
      :class="{ 'agenda-day--weekend': isWeekend(d) }">
      <div class="agenda-day__head">
        <span class="agenda-day__title">{{ dayLabel(d) }}</span>
        <span class="agenda-day__date">{{ d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }}</span>
      </div>

      <div class="agenda-day__pills">
        <button
          v-for="eng in projectsOn(d)" :key="'p-' + eng.id"
          type="button" class="agenda-pill agenda-pill--project"
          :style="{ background: projectColor(eng.status) }"
          @click="onProjectClick(eng)"
        >
          <span v-if="eng.code" style="opacity:0.85; margin-right:0.3rem;">{{ eng.code }}</span>
          {{ eng.name }}
        </button>

        <span v-for="o in oooOn(d)" :key="'o-' + o.id" class="agenda-pill agenda-pill--ooo">
          <i class="pi pi-calendar-times" style="font-size:0.65rem; margin-right:0.25rem;" />
          OoO{{ o.reason ? ': ' + o.reason : '' }}
        </span>

        <span v-for="h in holidaysOn(d)" :key="'h-' + h.id" class="agenda-pill agenda-pill--holiday">
          {{ h.label || 'Holiday' }}
        </span>

        <span
          v-if="!projectsOn(d).length && !oooOn(d).length && !holidaysOn(d).length"
          class="agenda-empty"
        >
          —
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agenda {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.agenda-day {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.55rem 0.7rem;
  background: var(--ares-surface);
}
.agenda-day--weekend {
  background: color-mix(in srgb, var(--ares-surface-sunken) 60%, var(--ares-surface));
}
.agenda-day__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}
.agenda-day__title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ares-text-1);
  text-transform: capitalize;
}
.agenda-day__date {
  font-size: 0.7rem;
  color: var(--ares-text-muted);
}
.agenda-day__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.agenda-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.55rem;
  border-radius: var(--ares-radius);
  font-size: 0.72rem;
  border: none;
  font-family: inherit;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agenda-pill--project {
  color: #fff;
  cursor: pointer;
}
.agenda-pill--ooo {
  background: color-mix(in srgb, var(--ares-warning) 55%, var(--ares-bg));
  color: rgba(255, 255, 255, 0.85);
}
.agenda-pill--holiday {
  background: color-mix(in srgb, var(--ares-info) 50%, var(--ares-bg));
  color: rgba(255, 255, 255, 0.9);
}
.agenda-empty {
  font-size: 0.7rem;
  color: var(--ares-text-muted);
  opacity: 0.6;
}
</style>
