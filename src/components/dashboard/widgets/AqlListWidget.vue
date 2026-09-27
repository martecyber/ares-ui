<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { DashboardLevel, DashboardWidgetDto, AqlListData } from '@/api/dashboards';
import { dashboardEntityListRoute, dashboardEntityDetailRoute } from '@/utils/dashboardNavigation';
import { statusLabel, statusSeverity } from '@/api/findings';
import { detectionStatusLabel, detectionStatusSeverity } from '@/api/detections';
import AresBadge from '@/components/AresBadge.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{
  widget: DashboardWidgetDto;
  data: AqlListData | null;
  loading?: boolean;
  error?: string | null;
  level: DashboardLevel;
  scopeId: number | null;
  orgId: number | null;
}>();

const router = useRouter();

const entity = computed<string>(() => props.widget.config?.entity ?? '');
const aql = computed<string>(() => props.widget.config?.aql ?? '');
const items = computed(() => props.data?.items ?? []);

const listTarget = computed(() =>
  dashboardEntityListRoute(entity.value, props.level, props.scopeId, props.orgId, aql.value));

function rowTarget(row: Record<string, any>) {
  return dashboardEntityDetailRoute(entity.value, props.level, props.scopeId, props.orgId, row.id);
}

function goToRow(row: Record<string, any>) {
  const target = rowTarget(row);
  if (target) router.push(target);
}

function goToList() {
  if (listTarget.value) router.push(listTarget.value);
}
</script>

<template>
  <div class="ares-card widget-card">
    <div class="ares-card-section-header">
      <span>{{ widget.title || entity }}</span>
      <a v-if="listTarget" class="widget-link" @click="goToList">View all</a>
    </div>
    <WidgetLoading v-if="loading" />
    <div v-else-if="error" class="widget-status widget-error" v-tooltip.top="error">
      <i class="pi pi-exclamation-triangle" /><span>Failed to load</span>
    </div>
    <div v-else class="widget-body">
      <table class="ares-table ares-table--clickable">
        <thead v-if="entity === 'finding'">
          <tr><th style="width:80px;">Code</th><th style="width:70px;">Priority</th><th>Title</th><th style="width:100px;">Status</th></tr>
        </thead>
        <thead v-else-if="entity === 'asset'">
          <tr><th style="width:90px;">Type</th><th>Identifier</th><th style="width:90px;">Code</th></tr>
        </thead>
        <thead v-else-if="entity === 'detection'">
          <tr><th style="width:70px;">Severity</th><th>Title</th><th style="width:110px;">Status</th><th style="width:120px;">Asset</th></tr>
        </thead>
        <tbody>
          <template v-if="entity === 'finding'">
            <tr v-for="row in items" :key="row.id" @click="goToRow(row)">
              <td><code style="font-size:0.7rem; color:var(--ares-accent-muted);">{{ row.code ?? '—' }}</code></td>
              <td style="text-align:center;"><SeverityTag :level="row.severity" scale="priority" /></td>
              <td style="font-size:0.82rem;">{{ row.title }}</td>
              <td>
                <AresBadge v-if="row.isDraft" :value="statusLabel(row.statusName)" :severity="statusSeverity(row.statusName)" style="font-size:0.68rem;" />
                <AresBadge v-else-if="row.remediationStatus"
                  :value="row.remediationStatus === 'closed' ? 'Remediated' : 'Open'"
                  :severity="row.remediationStatus === 'closed' ? 'success' : 'danger'" style="font-size:0.68rem;" />
              </td>
            </tr>
          </template>
          <template v-else-if="entity === 'asset'">
            <tr v-for="row in items" :key="row.id" @click="goToRow(row)">
              <td><span style="font-size:0.76rem; color:var(--ares-text-muted);">{{ row.type }}</span></td>
              <td style="font-size:0.82rem;">{{ row.identifier }}</td>
              <td><code style="font-size:0.7rem; color:var(--ares-accent-muted);">{{ row.code ?? '—' }}</code></td>
            </tr>
          </template>
          <template v-else-if="entity === 'detection'">
            <tr v-for="row in items" :key="row.id" @click="goToRow(row)">
              <td style="text-align:center;"><SeverityTag :level="row.severity" short scale="priority" /></td>
              <td style="font-size:0.82rem;">{{ row.title }}</td>
              <td><AresBadge :value="detectionStatusLabel(row.status)" :severity="detectionStatusSeverity(row.status)" style="font-size:0.68rem;" /></td>
              <td style="font-size:0.76rem; color:var(--ares-text-muted);">{{ row.assetIdentifier ?? '—' }}</td>
            </tr>
          </template>
          <tr v-if="!items.length"><td :colspan="entity === 'finding' ? 4 : entity === 'detection' ? 4 : 3" class="ares-table-empty">Nothing to show.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.widget-card { height: 100%; padding: 0; display: flex; flex-direction: column; }
.widget-body { flex: 1; min-height: 0; overflow: auto; }
.widget-link { font-size: 0.78rem; color: var(--ares-accent-muted); cursor: pointer; }
.widget-link:hover { text-decoration: underline; }
.widget-status {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem;
  padding: 1rem; font-size: 0.8rem; color: var(--ares-text-muted);
}
.widget-status.widget-error { color: var(--ares-error); }
</style>
