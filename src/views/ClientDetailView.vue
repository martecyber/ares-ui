<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { organizationsApi, type Organization } from '@/api/organizations';
import { useContextStore } from '@/stores/context';
import Button from 'primevue/button';
import DashboardHost from '@/components/dashboard/DashboardHost.vue';
import DashboardControls from '@/components/dashboard/DashboardControls.vue';

const route   = useRoute();
const router  = useRouter();
const context = useContextStore();

const orgId = computed(() => Number(route.params.id));

const org       = ref<Organization | null>(null);
const loading   = ref(true);
const err       = ref<string | null>(null);

// Editing organization fields (name/SLA/operators/client users, and logo upload) now lives on
// its own Settings nav page instead of a modal or this page's header — Archive moved to the
// staff Administration org list (ClientsView) — the header's old Edit/New project/Archive
// buttons are gone; New project already exists on ProjectsView too. The Edit pencil here now
// toggles the dashboard's own edit mode instead. The page itself always titles "Dashboard" (like
// the platform dashboard) — org identity (logo/name/code) lives in the ORG_INFO_STRIP widget.
const dashboardHostRef = ref<InstanceType<typeof DashboardHost> | null>(null);

async function load() {
  loading.value = true;
  err.value = null;
  try {
    org.value = await organizationsApi.get(orgId.value);
    context.setOrg({ id: org.value.id, name: org.value.name, slug: org.value.slug, hasLogo: org.value.hasLogo });
  } catch {
    err.value = 'Organization not found.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else-if="err" style="color:var(--ares-error);">{{ err }}</div>
    <template v-else-if="org">

      <!-- ── Header ─────────────────────────────────────────────── -->
      <div class="ares-page-header">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <Button icon="pi pi-arrow-left" severity="secondary" text size="small" @click="router.back()" />
          <h2 class="ares-page-title">Dashboard</h2>
        </div>

        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
          <DashboardControls :host="dashboardHostRef" />
        </div>
      </div>

      <DashboardHost ref="dashboardHostRef" level="ORGANIZATION" :scope-id="org.id" />
    </template>
  </div>
</template>
