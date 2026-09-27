<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { projectsApi, type Project } from '@/api/projects';
import { organizationsApi } from '@/api/organizations';
import { useAuthStore } from '@/stores/auth';
import WidgetLoading from './WidgetLoading.vue';

const router = useRouter();
const auth = useAuthStore();
const projects = ref<Project[]>([]);
const loading = ref(true);
const logoFailedOrgs = ref<Set<number>>(new Set());

function onLogoError(orgId: number) {
  logoFailedOrgs.value = new Set(logoFailedOrgs.value).add(orgId);
}

const currentUserId = computed(() => auth.user?.id ?? null);

const continuousProjects = computed(() => {
  const uid = currentUserId.value;
  if (!uid) return [];
  return projects.value.filter((e) => !e.endDate && e.members.some((m) => m.userId === uid));
});

function goToProject(eng: Project) {
  router.push({ name: 'org-project-dashboard', params: { orgId: eng.organizationId, engId: eng.id } });
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

onMounted(async () => {
  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    projects.value = await projectsApi.schedule(toLocalDateStr(today), toLocalDateStr(tomorrow));
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="cp-widget">
    <WidgetLoading v-if="loading" />
    <div v-else-if="!continuousProjects.length" style="color:var(--ares-text-muted); font-size:0.82rem;">No active continuous projects.</div>
    <div v-else class="cp-list">
      <div v-for="eng in continuousProjects" :key="eng.id" class="cp-card" @click="goToProject(eng)">
        <div class="cp-card__logo" :title="eng.organizationName">
          <img
            v-if="!logoFailedOrgs.has(eng.organizationId)"
            :src="organizationsApi.logoUrl(eng.organizationId)"
            alt=""
            @error="onLogoError(eng.organizationId)"
          />
          <i v-else class="pi pi-building" />
        </div>
        <div class="cp-card__text">
          <code v-if="eng.code" class="cp-card__code">{{ eng.code }}</code>
          <div class="cp-card__name">{{ eng.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp-widget { height: 100%; overflow: auto; }
.cp-list { display: flex; flex-direction: column; gap: 0.5rem; }
.cp-card {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.75rem;
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius); background: var(--ares-surface); cursor: pointer;
}
.cp-card:hover { border-color: var(--p-primary-400); background: var(--ares-surface-raised); }
.cp-card__logo {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: var(--ares-radius);
  background: var(--p-surface-700); display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.cp-card__logo img { width: 100%; height: 100%; object-fit: contain; }
.cp-card__logo .pi { font-size: 0.95rem; color: var(--ares-text-muted); }
.cp-card__text { min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.cp-card__code { font-size: 0.62rem; font-family: monospace; color: var(--ares-accent); background: color-mix(in srgb, var(--ares-accent) 10%, transparent); padding: 0.1rem 0.35rem; border-radius: var(--ares-radius); align-self: flex-start; }
.cp-card__name { font-size: 0.83rem; font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
</style>
