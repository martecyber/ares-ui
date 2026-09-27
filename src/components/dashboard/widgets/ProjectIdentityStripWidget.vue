<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { projectsApi, type Project } from '@/api/projects';
import { organizationsApi } from '@/api/organizations';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null; orgId: number | null }>();
const project = ref<Project | null>(null);
const logoFailed = ref(false);
const loading = ref(true);

onMounted(async () => {
  try {
    if (props.scopeId) project.value = await projectsApi.get(props.scopeId).catch(() => null);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <WidgetLoading v-if="loading" />
  <div v-else class="project-identity-strip">
    <div class="project-identity-strip__logo">
      <img v-if="orgId && !logoFailed" :src="organizationsApi.logoUrl(orgId)" alt="" @error="logoFailed = true" />
      <i v-else class="pi pi-building" />
    </div>
    <div class="project-identity-strip__text">
      <div class="project-identity-strip__name">{{ project?.name ?? '—' }}</div>
      <code v-if="project?.code" class="project-identity-strip__code">{{ project.code }}</code>
    </div>
    <div class="project-identity-strip__fields">
      <div class="project-identity-strip__field">
        <span class="project-identity-strip__label">Type</span>
        <span class="project-identity-strip__value">{{ project?.typeName ?? '—' }}</span>
      </div>
      <div class="project-identity-strip__field">
        <span class="project-identity-strip__label">Start</span>
        <span class="project-identity-strip__value">{{ project?.startDate ? project.startDate.slice(0, 10) : '—' }}</span>
      </div>
      <div class="project-identity-strip__field">
        <span class="project-identity-strip__label">End</span>
        <span class="project-identity-strip__value">{{ project?.endDate ? project.endDate.slice(0, 10) : '—' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-identity-strip { height: 100%; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.project-identity-strip__logo {
  flex-shrink: 0; width: 48px; height: 48px; border-radius: var(--ares-radius);
  background: var(--p-surface-700); display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.project-identity-strip__logo img { width: 100%; height: 100%; object-fit: contain; }
.project-identity-strip__logo .pi { font-size: 1.3rem; color: var(--ares-text-muted); }
.project-identity-strip__text { min-width: 0; margin-right: auto; }
.project-identity-strip__name { font-size: 1rem; font-weight: 700; color: var(--ares-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-identity-strip__code { font-size: 0.75rem; color: var(--ares-text-muted); }
.project-identity-strip__fields { display: flex; gap: 1.25rem; flex-wrap: wrap; }
.project-identity-strip__field { display: flex; flex-direction: column; gap: 0.1rem; }
.project-identity-strip__label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ares-text-muted); }
.project-identity-strip__value { font-size: 0.85rem; color: var(--ares-text); }
</style>
