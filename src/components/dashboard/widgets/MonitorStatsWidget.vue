<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { projectsApi } from '@/api/projects';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null }>();
const outOfSla = ref<number | null>(null);
const loading = ref(true);

onMounted(async () => {
  if (!props.scopeId) { loading.value = false; return; }
  try {
    const stats = await projectsApi.monitorStats(props.scopeId);
    outOfSla.value = stats.outOfSla;
  } catch {
    // Not a MONITOR project (or no stats yet) — render the placeholder dash below.
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="ares-stat-card monitor-widget" :class="{ 'ares-stat-card--danger': (outOfSla ?? 0) > 0 }">
    <div class="ares-stat-label">Out of SLA</div>
    <WidgetLoading v-if="loading" />
    <div v-else class="ares-stat-value">{{ outOfSla ?? '—' }}</div>
  </div>
</template>

<style scoped>
.monitor-widget { height: 100%; box-sizing: border-box; justify-content: center; }
</style>
