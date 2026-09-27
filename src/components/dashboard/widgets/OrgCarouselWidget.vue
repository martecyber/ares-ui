<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { organizationsApi, type Organization } from '@/api/organizations';
import WidgetLoading from './WidgetLoading.vue';

const router = useRouter();
const orgs = ref<Organization[]>([]);
const orgSearch = ref('');
const loading = ref(true);
const carouselRef = ref<HTMLElement | null>(null);

const filteredOrgs = computed(() => {
  const q = orgSearch.value.trim().toLowerCase();
  const active = orgs.value.filter((o) => o.status !== 'archived');
  if (!q) return active;
  return active.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
});

function scrollCarousel(dir: 'prev' | 'next') {
  if (!carouselRef.value) return;
  const step = carouselRef.value.clientWidth * 0.75;
  carouselRef.value.scrollBy({ left: dir === 'next' ? step : -step, behavior: 'smooth' });
}

onMounted(async () => {
  try {
    const res = await organizationsApi.list({ size: 200 });
    orgs.value = res.items;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="org-carousel-widget">
    <div class="org-carousel-header">
      <div class="org-search-wrap">
        <i class="pi pi-search org-search-icon" />
        <input v-model="orgSearch" class="org-search-input" placeholder="Search organizations…" />
      </div>
    </div>

    <WidgetLoading v-if="loading" />
    <div v-else-if="!orgs.length" style="color:var(--ares-text-muted); font-size:0.82rem;">No organizations yet.</div>
    <div v-else class="dash-carousel-wrap">
      <button class="dash-carousel-arrow" :disabled="!filteredOrgs.length" @click="scrollCarousel('prev')" aria-label="Previous"><i class="pi pi-chevron-left" /></button>
      <div ref="carouselRef" class="dash-carousel-track">
        <div v-if="!filteredOrgs.length" style="font-size:0.82rem; color:var(--ares-text-muted); padding:0.5rem 0.25rem;">No organizations match "{{ orgSearch }}"</div>
        <div v-for="org in filteredOrgs" :key="org.id" class="dash-org-card" @click="router.push({ name: 'organization-detail', params: { id: org.id } })">
          <div class="dash-org-card__logo-area">
            <img v-if="org.hasLogo" :src="organizationsApi.logoUrl(org.id)" :alt="org.name" class="dash-org-card__logo-img" />
            <i v-else class="pi pi-building dash-org-card__logo-placeholder" />
          </div>
          <div class="dash-org-card__info">
            <div class="dash-org-card__name">{{ org.name }}</div>
            <code class="dash-org-card__slug">{{ org.slug.toUpperCase() }}</code>
          </div>
        </div>
      </div>
      <button class="dash-carousel-arrow" @click="scrollCarousel('next')" aria-label="Next"><i class="pi pi-chevron-right" /></button>
    </div>
  </div>
</template>

<style scoped>
/* overflow:hidden here is the real safety net — a too-short allocation clips the card row
   instead of it escaping into neighboring widgets (see .dash-carousel-wrap's align-items). */
.org-carousel-widget { height: 100%; display: flex; flex-direction: column; gap: 0.6rem; overflow: hidden; }
.org-carousel-header { flex-shrink: 0; }
.org-search-wrap {
  display: flex; align-items: center; gap: 0.4rem; background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.35rem 0.7rem; max-width: 260px;
}
.org-search-icon { font-size: 0.75rem; color: var(--ares-text-muted); flex-shrink: 0; }
.org-search-input { background: transparent; border: none; outline: none; font-size: 0.82rem; color: var(--ares-text); font-family: inherit; width: 100%; }
.org-search-input::placeholder { color: var(--ares-text-muted); }

/* align-items: flex-start (not center) is deliberate — if the widget is ever shorter than the
   card row's natural height, overflow only extends downward (clipped by the parent's
   overflow:hidden), never upward into the search bar above it. */
.dash-carousel-wrap { display: flex; align-items: flex-start; gap: 0; flex: 1; min-height: 0; }
/* margin-top centers the arrow on the org card's own content height (logo area +
   info block), not on dash-carousel-wrap's available height — that keeps the
   flex-start anchoring above (top of the row never bleeds upward) while still
   lining the arrow up with the card row instead of sitting near its top edge. */
.dash-carousel-arrow {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--ares-border);
  background: var(--ares-surface-raised); color: var(--ares-text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 0.78rem;
  margin-top: 4.8rem;
}
.dash-carousel-arrow:hover { background: var(--ares-surface-2); color: var(--ares-text); border-color: var(--p-primary-400); }
.dash-carousel-arrow:first-child { margin-right: 0.6rem; }
.dash-carousel-arrow:last-child  { margin-left:  0.6rem; }

.dash-carousel-track { display: flex; gap: 0.9rem; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; flex: 1; padding: 0.15rem 0.1rem 0.4rem; }
.dash-carousel-track::-webkit-scrollbar { display: none; }

.dash-org-card {
  flex-shrink: 0; width: 172px; background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); cursor: pointer; overflow: hidden; display: flex; flex-direction: column;
}
.dash-org-card:hover { border-color: var(--p-primary-400); }
.dash-org-card__logo-area { width: 100%; aspect-ratio: 4 / 3; background: var(--ares-surface-2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dash-org-card__logo-img { width: 100%; height: 100%; object-fit: cover; }
.dash-org-card__logo-placeholder { font-size: 2.25rem; color: var(--ares-text-muted); opacity: 0.35; }
.dash-org-card__info { padding: 0.65rem 0.75rem 0.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
.dash-org-card__name { font-weight: 600; font-size: 0.85rem; color: var(--ares-text); line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dash-org-card__slug { font-size: 0.68rem; color: var(--ares-text-muted); font-family: monospace; }
</style>
