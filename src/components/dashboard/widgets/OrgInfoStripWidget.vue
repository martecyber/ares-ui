<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { organizationsApi, type Organization } from '@/api/organizations';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null }>();
const org = ref<Organization | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    if (props.scopeId) org.value = await organizationsApi.get(props.scopeId).catch(() => null);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <WidgetLoading v-if="loading" />
  <div v-else class="org-info-strip">
    <div class="org-info-strip__logo">
      <img v-if="org?.hasLogo" :src="organizationsApi.logoUrl(org.id)" :alt="org.name" />
      <i v-else class="pi pi-building" />
    </div>
    <div class="org-info-strip__text">
      <div class="org-info-strip__name">{{ org?.name ?? '—' }}</div>
      <code v-if="org?.slug" class="org-info-strip__code">{{ org.slug }}</code>
    </div>
  </div>
</template>

<style scoped>
.org-info-strip { height: 100%; display: flex; align-items: center; gap: 0.75rem; }
.org-info-strip__logo {
  flex-shrink: 0; width: 48px; height: 48px; border-radius: var(--ares-radius);
  background: var(--p-surface-700); display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.org-info-strip__logo img { width: 100%; height: 100%; object-fit: contain; }
.org-info-strip__logo .pi { font-size: 1.3rem; color: var(--ares-text-muted); }
.org-info-strip__text { min-width: 0; }
.org-info-strip__name { font-size: 1rem; font-weight: 700; color: var(--ares-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.org-info-strip__code { font-size: 0.75rem; color: var(--ares-text-muted); }
</style>
