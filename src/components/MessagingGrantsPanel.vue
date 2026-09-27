<script setup lang="ts">
/**
 * Grants content for a messaging integration — embedded as a tab in
 * MessagingIntegrationFormDialog rather than its own modal (admin integrations
 * action-menu homogenization). Pick an org (and optionally a project — empty = whole
 * org), see the existing list, revoke with the trash icon.
 */
import { computed, ref, onMounted } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { messagingApi, type MessagingIntegration, type MessagingGrant } from '@/api/messaging';
import { organizationsApi, type Organization } from '@/api/organizations';
import { projectsApi } from '@/api/projects';
import { confirmDialog } from '@/composables/useConfirmDialog';
import ActiveGrantsTable, { type ActiveGrantRow } from '@/components/ActiveGrantsTable.vue';

const props = defineProps<{ integration: MessagingIntegration }>();

const toast = useToast();
const grants = ref<MessagingGrant[]>([]);
const loading = ref(true);
const orgs   = ref<Organization[]>([]);
const projectsByOrg = ref<Record<number, { id: number; code: string; name: string }[]>>({});

const newOrgId     = ref<number | null>(null);
const newProjectId = ref<number | null>(null);
const orgWide      = ref(true);
const saving       = ref(false);

const projectOptions = computed(() => {
  if (!newOrgId.value) return [];
  return (projectsByOrg.value[newOrgId.value] ?? []).map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
});

async function loadOrgProjects(orgId: number) {
  if (projectsByOrg.value[orgId]) return;
  const res = await projectsApi.list({ organizationId: orgId, size: 500 });
  projectsByOrg.value[orgId] = ((res as any).items ?? res).map((x: any) =>
    ({ id: x.id, code: x.code, name: x.name }));
}

async function load() {
  loading.value = true;
  newOrgId.value = null;
  newProjectId.value = null;
  orgWide.value = true;
  try {
    const [g, o] = await Promise.all([
      messagingApi.listGrants(props.integration.id),
      organizationsApi.list({ size: 200 }),
    ]);
    grants.value = g;
    orgs.value = (o as any).items ?? (o as any);
    const orgIds = new Set<number>(g.filter((x) => x.projectId != null).map((x) => x.organizationId));
    for (const id of orgIds) await loadOrgProjects(id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Load failed', detail: e?.message, life: 4000 });
  } finally { loading.value = false; }
}

async function onOrgChange() {
  newProjectId.value = null;
  if (newOrgId.value) await loadOrgProjects(newOrgId.value);
}

async function addGrant() {
  if (!newOrgId.value) return;
  saving.value = true;
  try {
    const g = await messagingApi.createGrant(props.integration.id, {
      organizationId: newOrgId.value,
      projectId: orgWide.value ? null : newProjectId.value,
    });
    grants.value = [...grants.value, g];
    newOrgId.value = null;
    newProjectId.value = null;
    orgWide.value = true;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed',
      detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { saving.value = false; }
}

async function revoke(g: MessagingGrant) {
  const ok = await confirmDialog({ header: 'Revoke grant', message: 'Revoke this grant?', acceptLabel: 'Revoke', acceptSeverity: 'warn', acceptIcon: 'pi pi-ban' });
  if (!ok) return;
  try {
    await messagingApi.revokeGrant(props.integration.id, g.id);
    grants.value = grants.value.filter((x) => x.id !== g.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed',
      detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

const activeGrantRows = computed<ActiveGrantRow[]>(() => grants.value.map((g) => {
  const org = orgs.value.find((o) => o.id === g.organizationId);
  const proj = g.projectId != null ? projectsByOrg.value[g.organizationId]?.find((p) => p.id === g.projectId) : null;
  return {
    id: g.id,
    organizationId: g.organizationId,
    organizationName: org?.name ?? `Org #${g.organizationId}`,
    organizationHasLogo: org?.hasLogo ?? false,
    projectLabel: g.projectId != null ? (proj ? `${proj.code} — ${proj.name}` : `Project #${g.projectId}`) : null,
  };
}));

async function revokeById(grantId: number) {
  const g = grants.value.find((x) => x.id === grantId);
  if (g) await revoke(g);
}

onMounted(load);
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:1.25rem;">
    <!-- Existing grants -->
    <div>
      <p class="section-label">Active grants</p>
      <ActiveGrantsTable :rows="activeGrantRows" :loading="loading"
        empty-text="No grants yet. Without grants, no project can use this integration." @revoke="revokeById" />
    </div>

    <!-- Add new grant -->
    <div>
      <p class="section-label">Add grant</p>
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <div>
          <label class="dlg-label">Organization *</label>
          <Select v-model="newOrgId" :options="orgs" option-label="name" option-value="id"
            placeholder="Select organization…" style="width:100%;" filter @change="onOrgChange" />
        </div>

        <div>
          <label class="dlg-label">Scope</label>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" :class="['scope-btn', { 'scope-btn--active': orgWide }]" @click="orgWide = true">
              All projects
            </button>
            <button type="button" :class="['scope-btn', { 'scope-btn--active': !orgWide }]" @click="orgWide = false">
              Specific project
            </button>
          </div>
        </div>

        <div v-if="!orgWide">
          <label class="dlg-label">Project</label>
          <Select v-model="newProjectId" :options="projectOptions" option-label="label" option-value="id"
            placeholder="Select project…" style="width:100%;" filter />
        </div>

        <div style="display:flex; justify-content:flex-end;">
          <Button label="Add grant" icon="pi pi-plus" size="small" :loading="saving"
            :disabled="!newOrgId || (!orgWide && !newProjectId)" @click="addGrant" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ares-text-muted);
  margin-bottom: 0.6rem;
}
.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.scope-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.8rem;
  font-family: inherit;
  transition: border-color 0.1s;
}
.scope-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  color: var(--p-primary-300);
  font-weight: 600;
}
</style>
