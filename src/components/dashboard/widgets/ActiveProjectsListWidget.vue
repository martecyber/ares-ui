<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { organizationsApi, type OrgDashboard } from '@/api/organizations';
import { statusLabel, statusSeverity } from '@/api/projects';
import AresBadge from '@/components/AresBadge.vue';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null }>();
const router = useRouter();
const activeProjects = ref<OrgDashboard['activeProjects']>([]);
const loading = ref(true);

onMounted(async () => {
  if (!props.scopeId) { loading.value = false; return; }
  try {
    const dash = await organizationsApi.dashboard(props.scopeId);
    activeProjects.value = dash.activeProjects;
  } finally {
    loading.value = false;
  }
});

function goToProject(engId: number) {
  if (props.scopeId) router.push({ name: 'org-project-dashboard', params: { orgId: props.scopeId, engId } });
}
</script>

<template>
  <div class="ares-card widget-card">
    <div class="ares-card-section-header">
      <span>Active projects</span>
      <a v-if="scopeId" class="widget-link" @click="router.push({ name: 'org-projects', params: { orgId: scopeId } })">All</a>
    </div>
    <div class="widget-body">
      <WidgetLoading v-if="loading" />
      <table v-else class="ares-table ares-table--clickable">
        <thead>
          <tr><th>Name</th><th style="width:100px;">Status</th><th style="width:90px;">Start</th></tr>
        </thead>
        <tbody>
          <tr v-for="eng in activeProjects" :key="eng.id" @click="goToProject(eng.id)">
            <td>{{ eng.name }}</td>
            <td><AresBadge :value="statusLabel(eng.status)" :severity="statusSeverity(eng.status)" /></td>
            <td style="font-size:0.78rem; color:var(--ares-text-muted);">{{ eng.startDate ? new Date(eng.startDate).toLocaleDateString() : '—' }}</td>
          </tr>
          <tr v-if="!activeProjects.length"><td colspan="3" class="ares-table-empty">No active projects.</td></tr>
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
</style>
