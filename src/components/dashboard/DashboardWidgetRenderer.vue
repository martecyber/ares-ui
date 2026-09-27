<script setup lang="ts">
import type { DashboardLevel, DashboardWidgetDto, AqlCountData, AqlChartData, AqlListData } from '@/api/dashboards';

import AqlCountWidget from './widgets/AqlCountWidget.vue';
import AqlChartWidget from './widgets/AqlChartWidget.vue';
import AqlListWidget from './widgets/AqlListWidget.vue';
import OrgCarouselWidget from './widgets/OrgCarouselWidget.vue';
import ScheduleCalendarWidget from './widgets/ScheduleCalendarWidget.vue';
import ContinuousProjectsWidget from './widgets/ContinuousProjectsWidget.vue';
import ActiveProjectsListWidget from './widgets/ActiveProjectsListWidget.vue';
import OrgInfoStripWidget from './widgets/OrgInfoStripWidget.vue';
import ProjectIdentityStripWidget from './widgets/ProjectIdentityStripWidget.vue';
import ProjectInfoStripWidget from './widgets/ProjectInfoStripWidget.vue';
import ProjectDateProgressWidget from './widgets/ProjectDateProgressWidget.vue';
import MonitorStatsWidget from './widgets/MonitorStatsWidget.vue';
import ProjectRulesListWidget from './widgets/ProjectRulesListWidget.vue';
import ProjectScopeSummaryWidget from './widgets/ProjectScopeSummaryWidget.vue';
import ProjectTeamListWidget from './widgets/ProjectTeamListWidget.vue';

defineProps<{
  widget: DashboardWidgetDto;
  data: AqlCountData | AqlChartData | AqlListData | null;
  /** Only meaningful for AQL_COUNT/AQL_CHART/AQL_LIST — see DashboardHost.vue's per-widget fetch. */
  loading?: boolean;
  error?: string | null;
  level: DashboardLevel;
  scopeId: number | null;
  orgId: number | null;
}>();
</script>

<template>
  <AqlCountWidget v-if="widget.type === 'AQL_COUNT'" :widget="widget" :data="(data as AqlCountData) ?? null" :loading="!!loading" :error="error ?? null" :level="level" :scope-id="scopeId" :org-id="orgId" />
  <AqlChartWidget v-else-if="widget.type === 'AQL_CHART'" :widget="widget" :data="(data as AqlChartData) ?? null" :loading="!!loading" :error="error ?? null" :level="level" :scope-id="scopeId" :org-id="orgId" />
  <AqlListWidget v-else-if="widget.type === 'AQL_LIST'" :widget="widget" :data="(data as AqlListData) ?? null" :loading="!!loading" :error="error ?? null" :level="level" :scope-id="scopeId" :org-id="orgId" />

  <OrgCarouselWidget v-else-if="widget.type === 'ORG_CAROUSEL'" />
  <ScheduleCalendarWidget v-else-if="widget.type === 'SCHEDULE_CALENDAR'" />
  <ContinuousProjectsWidget v-else-if="widget.type === 'CONTINUOUS_PROJECTS'" />

  <ActiveProjectsListWidget v-else-if="widget.type === 'ACTIVE_PROJECTS_LIST'" :scope-id="scopeId" />
  <OrgInfoStripWidget v-else-if="widget.type === 'ORG_INFO_STRIP'" :scope-id="scopeId" />

  <ProjectIdentityStripWidget v-else-if="widget.type === 'PROJECT_IDENTITY_STRIP'" :scope-id="scopeId" :org-id="orgId" />
  <ProjectInfoStripWidget v-else-if="widget.type === 'PROJECT_INFO_STRIP'" :scope-id="scopeId" />
  <ProjectDateProgressWidget v-else-if="widget.type === 'PROJECT_DATE_PROGRESS'" :scope-id="scopeId" />
  <MonitorStatsWidget v-else-if="widget.type === 'MONITOR_STATS'" :scope-id="scopeId" />
  <ProjectRulesListWidget v-else-if="widget.type === 'PROJECT_RULES_LIST'" :scope-id="scopeId" />
  <ProjectScopeSummaryWidget v-else-if="widget.type === 'PROJECT_SCOPE_SUMMARY'" :scope-id="scopeId" :org-id="orgId" />
  <ProjectTeamListWidget v-else-if="widget.type === 'PROJECT_TEAM_LIST'" :scope-id="scopeId" :org-id="orgId" />

  <!-- widget.type is null: a stale/unrecognized type (renamed or removed after this row was
       seeded — see DashboardWidget.getType() server-side). Surfacing this instead of rendering
       nothing lets the operator see it and remove it via the usual edit-mode delete button,
       rather than the widget just silently vanishing from the grid. -->
  <div v-else class="unsupported-widget">
    <i class="pi pi-exclamation-triangle" />
    <span>Unsupported widget<template v-if="widget.typeName">: {{ widget.typeName }}</template></span>
  </div>
</template>

<style scoped>
.unsupported-widget {
  height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.4rem; padding: 0.75rem; text-align: center;
  color: var(--ares-text-muted); font-size: 0.78rem;
  border: 1px dashed var(--ares-border); border-radius: var(--ares-radius);
}
.unsupported-widget .pi { font-size: 1.1rem; color: var(--ares-warning); }
</style>
