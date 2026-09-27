<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { DashboardLevel, DashboardWidgetDto, AqlCountData } from '@/api/dashboards';
import { dashboardEntityListRoute } from '@/utils/dashboardNavigation';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{
  widget: DashboardWidgetDto;
  data: AqlCountData | null;
  loading?: boolean;
  error?: string | null;
  level: DashboardLevel;
  scopeId: number | null;
  orgId: number | null;
}>();

const router = useRouter();

const entity = computed<string>(() => props.widget.config?.entity ?? '');
const aql = computed<string>(() => props.widget.config?.aql ?? '');

const target = computed(() =>
  dashboardEntityListRoute(entity.value, props.level, props.scopeId, props.orgId, aql.value));

function go() {
  if (target.value) router.push(target.value);
}
</script>

<template>
  <div class="ares-stat-card aql-count-widget" :class="{ clickable: !!target && !loading && !error }" @click="!loading && !error && go()">
    <div class="ares-stat-label">{{ widget.title || entity }}</div>
    <WidgetLoading v-if="loading" />
    <div v-else-if="error" class="widget-error" v-tooltip.top="error">
      <i class="pi pi-exclamation-triangle" /><span>Failed to load</span>
    </div>
    <div v-else class="ares-stat-value">{{ data ? data.count : '—' }}</div>
  </div>
</template>

<style scoped>
.aql-count-widget { height: 100%; box-sizing: border-box; justify-content: center; }
.aql-count-widget.clickable { cursor: pointer; }
.aql-count-widget.clickable:hover { border-color: var(--p-primary-400); }
.widget-error {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.78rem; color: var(--ares-error);
}
</style>
