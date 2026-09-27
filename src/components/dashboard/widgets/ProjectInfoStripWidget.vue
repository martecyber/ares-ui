<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { projectsApi, type Project } from '@/api/projects';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null }>();
const project = ref<Project | null>(null);
const loading = ref(true);

const currentLead = computed(() => project.value?.members.find((m) => m.role === 'lead') ?? null);
const uniqueMemberCount = computed(() => new Set(project.value?.members.map((m) => m.userId) ?? []).size);

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
  <div v-else class="info-strip-widget">
    <div class="ares-info-card">
      <span class="ares-info-card-label">Start</span>
      <span class="ares-info-card-value">{{ project?.startDate ? project.startDate.slice(0, 10) : '—' }}</span>
    </div>
    <div class="ares-info-card">
      <span class="ares-info-card-label">End</span>
      <span class="ares-info-card-value">{{ project?.endDate ? project.endDate.slice(0, 10) : '—' }}</span>
    </div>
    <div class="ares-info-card">
      <span class="ares-info-card-label">Lead</span>
      <span class="ares-info-card-value">{{ currentLead?.userDisplayName ?? '—' }}</span>
    </div>
    <div class="ares-info-card">
      <span class="ares-info-card-label">Team</span>
      <span class="ares-info-card-value">{{ uniqueMemberCount }} member{{ uniqueMemberCount !== 1 ? 's' : '' }}</span>
    </div>
  </div>
</template>

<style scoped>
.info-strip-widget { height: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
</style>
