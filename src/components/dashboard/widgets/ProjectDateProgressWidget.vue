<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { projectsApi, type Project } from '@/api/projects';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null }>();
const project = ref<Project | null>(null);
const loading = ref(true);

const dateProgress = computed(() => {
  const eng = project.value;
  if (!eng?.startDate || !eng?.endDate) return null;
  const start = new Date(eng.startDate).getTime();
  const end = new Date(eng.endDate).getTime();
  const now = Date.now();
  if (end <= start) return null;
  const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const total = Math.round((end - start) / (1000 * 60 * 60 * 24));
  const elapsed = Math.max(0, Math.round((now - start) / (1000 * 60 * 60 * 24)));
  const remaining = Math.max(0, Math.round((end - now) / (1000 * 60 * 60 * 24)));
  return { pct, total, elapsed, remaining };
});

onMounted(async () => {
  try {
    if (props.scopeId) project.value = await projectsApi.get(props.scopeId);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <WidgetLoading v-if="loading" />
  <div v-else-if="dateProgress && project && project.status !== 'completed'" class="date-progress-widget">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
      <span style="font-size:0.75rem; font-weight:600; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:0.06em;">Timeline</span>
      <span style="font-size:0.75rem; color:var(--ares-text-muted);">
        <template v-if="project.status === 'past_due'">{{ dateProgress.elapsed - dateProgress.total }}d overdue</template>
        <template v-else>{{ dateProgress.remaining }}d remaining · {{ dateProgress.elapsed }}d elapsed of {{ dateProgress.total }}d</template>
      </span>
    </div>
    <div style="height:6px; border-radius: var(--ares-radius); background:var(--ares-surface-2); overflow:hidden;">
      <div :style="{
        width: `${dateProgress.pct}%`, height: '100%', borderRadius: '3px',
        background: project.status === 'past_due' ? 'var(--ares-error)' : project.status === 'active' ? 'var(--ares-success)' : 'var(--ares-accent)',
        transition: 'width 0.4s ease',
      }" />
    </div>
  </div>
  <div v-else style="color:var(--ares-text-muted); font-size:0.8rem;">No date range set for this project.</div>
</template>

<style scoped>
.date-progress-widget { height: 100%; display: flex; flex-direction: column; justify-content: center; }
</style>
