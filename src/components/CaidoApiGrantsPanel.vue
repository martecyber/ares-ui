<script setup lang="ts">
// Grants content for a Caido API integration — embedded as a tab in the Caido API edit
// dialog rather than its own modal (admin integrations action-menu homogenization).
import { ref, computed, onMounted } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { caidoApiIntegrationApi, CAIDO_ACTIONS, type CaidoApiIntegration, type CaidoApiGrant } from '@/api/caido';
import { organizationsApi } from '@/api/organizations';
import { projectsApi } from '@/api/projects';
import ActiveGrantsTable, { type ActiveGrantRow } from '@/components/ActiveGrantsTable.vue';

const props = defineProps<{ integration: CaidoApiIntegration }>();

const toast = useToast();
const grants = ref<CaidoApiGrant[]>([]);
const loading = ref(true);
const orgList = ref<{ id: number; name: string; hasLogo: boolean }[]>([]);
const orgs = computed(() => orgList.value.map((o) => ({ label: o.name, value: o.id })));
const projectsByOrg = ref<Record<number, { id: number; name: string }[]>>({});
const projects = ref<{ label: string; value: number }[]>([]);

const selectedOrgId = ref<number | null>(null);
const selectedEngId = ref<number | null>(null);
const selectedCaps = ref<string[]>(CAIDO_ACTIONS.map((c) => c.id));
const orgWide = ref(true);
const saving = ref(false);

function capLabel(id: string) { return CAIDO_ACTIONS.find((c) => c.id === id)?.label ?? id; }

const activeGrantRows = computed<ActiveGrantRow[]>(() => grants.value.map((g) => {
  const org = orgList.value.find((o) => o.id === g.organizationId);
  const proj = g.projectId != null ? projectsByOrg.value[g.organizationId]?.find((p) => p.id === g.projectId) : null;
  return {
    id: g.id,
    organizationId: g.organizationId,
    organizationName: org?.name ?? `Org #${g.organizationId}`,
    organizationHasLogo: org?.hasLogo ?? false,
    projectLabel: g.projectId != null ? (proj?.name ?? `Project #${g.projectId}`) : null,
    badges: g.capabilities.map(capLabel),
  };
}));

async function loadProjectsForOrg(orgId: number) {
  if (projectsByOrg.value[orgId]) return;
  const res = await projectsApi.list({ organizationId: orgId, size: 500 });
  projectsByOrg.value[orgId] = (res.items ?? []).map((e: any) => ({ id: e.id, name: e.name }));
}

async function load() {
  loading.value = true;
  try {
    grants.value = await caidoApiIntegrationApi.listGrants(props.integration.id).catch(() => []);
    const res = await organizationsApi.list({ size: 500 });
    orgList.value = (res.items ?? []).map((o: any) => ({ id: o.id, name: o.name, hasLogo: o.hasLogo }));
    const orgIds = new Set(grants.value.filter((g) => g.projectId != null).map((g) => g.organizationId));
    for (const id of orgIds) await loadProjectsForOrg(id);
  } finally { loading.value = false; }
}

async function onOrgChange() {
  selectedEngId.value = null;
  projects.value = [];
  if (!selectedOrgId.value) return;
  await loadProjectsForOrg(selectedOrgId.value);
  projects.value = projectsByOrg.value[selectedOrgId.value].map((p) => ({ label: p.name, value: p.id }));
}

function toggleCap(cap: string) {
  selectedCaps.value = selectedCaps.value.includes(cap)
    ? selectedCaps.value.filter((c) => c !== cap)
    : [...selectedCaps.value, cap];
}

async function addGrant() {
  if (!selectedOrgId.value || !selectedCaps.value.length) return;
  saving.value = true;
  try {
    const g = await caidoApiIntegrationApi.createGrant(props.integration.id, {
      organizationId: selectedOrgId.value,
      projectId: orgWide.value ? null : selectedEngId.value,
      capabilities: selectedCaps.value,
    });
    grants.value = [...grants.value, g];
    selectedOrgId.value = null;
    selectedEngId.value = null;
    orgWide.value = true;
    toast.add({ severity: 'success', summary: 'Grant created', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { saving.value = false; }
}

async function revoke(grantId: number) {
  try {
    await caidoApiIntegrationApi.deleteGrant(props.integration.id, grantId);
    grants.value = grants.value.filter((x) => x.id !== grantId);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

onMounted(load);
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:1.25rem;">
    <div>
      <p class="section-label">Active grants</p>
      <ActiveGrantsTable :rows="activeGrantRows" :loading="loading"
        empty-text="No grants yet — projects can't use this Caido API integration." @revoke="revoke" />
    </div>

    <div>
      <p class="section-label">Add grant</p>
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <div>
          <label class="dlg-label">Organization *</label>
          <Select v-model="selectedOrgId" :options="orgs" option-label="label" option-value="value"
            placeholder="Select organization…" style="width:100%;" filter @change="onOrgChange" />
        </div>
        <div>
          <label class="dlg-label">Scope</label>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" :class="['scope-btn', { 'scope-btn--active': orgWide }]" @click="orgWide = true">All projects</button>
            <button type="button" :class="['scope-btn', { 'scope-btn--active': !orgWide }]" @click="orgWide = false">Specific project</button>
          </div>
        </div>
        <div v-if="!orgWide">
          <label class="dlg-label">Project</label>
          <Select v-model="selectedEngId" :options="projects" option-label="label" option-value="value"
            placeholder="Select project…" style="width:100%;" filter />
        </div>
        <div>
          <label class="dlg-label">Capabilities</label>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button v-for="cap in CAIDO_ACTIONS" :key="cap.id" type="button"
              :class="['cap-btn', { 'cap-btn--active': selectedCaps.includes(cap.id) }]"
              @click="toggleCap(cap.id)">{{ cap.label }}</button>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <Button label="Add grant" icon="pi pi-plus" size="small" :loading="saving"
            :disabled="!selectedOrgId || !selectedCaps.length" @click="addGrant" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ares-text-muted); margin-bottom: 0.6rem; }
.dlg-label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--ares-text-muted); margin-bottom: 0.35rem; }
.scope-btn, .cap-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.75rem; border: 1px solid var(--ares-border); border-radius: var(--ares-radius); background: var(--ares-surface-raised); color: var(--ares-text-muted); cursor: pointer; font-size: 0.8rem; font-family: inherit; }
.scope-btn--active, .cap-btn--active { border-color: var(--p-primary-500); background: color-mix(in srgb, var(--p-primary-500) 12%, transparent); color: var(--p-primary-300); font-weight: 600; }
</style>
