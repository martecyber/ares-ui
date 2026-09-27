<script setup lang="ts">
import { ref } from 'vue';
import DashboardHost from '@/components/dashboard/DashboardHost.vue';
import DashboardControls from '@/components/dashboard/DashboardControls.vue';

const dashboardHostRef = ref<InstanceType<typeof DashboardHost> | null>(null);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <h2 class="ares-page-title">Dashboard</h2>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
        <DashboardControls :host="dashboardHostRef" />
      </div>
    </div>

    <DashboardHost ref="dashboardHostRef" level="PLATFORM" :scope-id="null" />
  </div>
</template>
