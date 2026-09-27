<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import { projectsApi, isBugHunting, type Project } from '@/api/projects';
import { useContextStore } from '@/stores/context';
import { bugHuntingProgramsApi, type BugHuntingProgram, type BugHuntingPlatform } from '@/api/bugHuntingPrograms';
import DashboardHost from '@/components/dashboard/DashboardHost.vue';
import DashboardControls from '@/components/dashboard/DashboardControls.vue';

const route = useRoute();
const context = useContextStore();

const project     = ref<Project | null>(null);
const loading     = ref(true);

// Editing project fields (name/dates/iteration/danger-zone delete) now lives on its own
// Settings nav page (MSSP_ADMIN-only) instead of a modal — the header's old Edit pencil now
// toggles the dashboard's own edit mode instead.
const dashboardHostRef = ref<InstanceType<typeof DashboardHost> | null>(null);
const program        = ref<BugHuntingProgram | null>(null);

const isBH = computed(() => isBugHunting(project.value?.typeCode));

// The programme's own `platform` field (resolved server-side, where the platform plugins that
// actually know the BH_* -> platform mapping live) rather than a client-side type-code map —
// `showProgramButton` already gates on `program` being loaded, so this is never read before then.
const platform = computed((): BugHuntingPlatform => program.value?.platform ?? 'generic');

const programUrl = computed((): string => {
  const h = program.value?.programHandle;
  if (!h) return '';
  // Generic projects have no platform API to resolve a handle against — the field
  // holds a plain URL to the programme page instead, entered manually.
  if (platform.value === 'generic') return h;
  switch (platform.value) {
    case 'bugcrowd':  return `https://bugcrowd.com/${h}`;
    case 'yeswehack': return `https://yeswehack.com/programs/${h}`;
    case 'intigriti': return `https://app.intigriti.com/researcher/programs/${h}/tac/detail`;
    case 'hackerone': return `https://hackerone.com/${h}`;
    default: return '';
  }
});

const showProgramButton = computed(() =>
  isBH.value &&
  !!program.value?.programHandle &&
  (platform.value === 'generic'
    ? true
    : !!program.value?.integrationId && program.value?.lastSyncStatus === 'success')
);

const engId  = computed(() => Number(route.params.engId));
const orgId  = computed(() => Number(route.params.orgId));

async function load() {
  loading.value = true;
  try {
    project.value = await projectsApi.get(engId.value);
    if (project.value) {
      context.setProject({ id: project.value.id, name: project.value.name, code: project.value.code, typeCode: project.value.typeCode ?? null, supertypeCode: project.value.supertypeCode ?? null, clientsCanViewDetections: project.value.clientsCanViewDetections ?? false });
    }
    program.value = isBugHunting(project.value?.typeCode)
      ? await bugHuntingProgramsApi.get(engId.value).catch(() => null)
      : null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:4rem;">
      <ProgressSpinner />
    </div>

    <template v-else-if="project">
      <!-- Header -->
      <div class="ares-page-header" style="margin-bottom:1.5rem;">
        <h2 class="ares-page-title" style="margin:0;">Dashboard</h2>
        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
          <a v-if="showProgramButton" :href="programUrl" target="_blank" rel="noopener">
            <Button icon="pi pi-external-link" text size="small" severity="secondary" v-tooltip.top="'View programme'" />
          </a>
          <DashboardControls :host="dashboardHostRef" />
        </div>
      </div>

      <DashboardHost ref="dashboardHostRef" level="PROJECT" :scope-id="engId" :org-id="orgId" />
    </template>
  </div>
</template>

