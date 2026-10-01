<script setup lang="ts">
// Grants content for a standard tool integration — embedded as a tab in
// ToolIntegrationFormDialog rather than its own modal (see admin integrations action-menu
// homogenization: every integration type now edits via one dialog with a Grants tab).
import { ref, computed, onMounted } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { toolIntegrationsApi, INTEGRATION_TYPES, mergeWithDynamicTypes, type ToolIntegration, type IntegrationGrant, type RegisteredIntegrationType } from '@/api/tool-integrations';
import { organizationsApi } from '@/api/organizations';
import { projectsApi } from '@/api/projects';
import ActiveGrantsTable, { type ActiveGrantRow } from '@/components/ActiveGrantsTable.vue';

const props = defineProps<{ integration: ToolIntegration }>();

const toast = useToast();

const grants = ref<IntegrationGrant[]>([]);
const loading = ref(true);
const orgList = ref<{ id: number; name: string; hasLogo: boolean }[]>([]);
const orgs = computed(() => orgList.value.map((o) => ({ label: o.name, value: o.id })));
const projectsByOrg = ref<Record<number, { id: number; name: string }[]>>({});
const projects = ref<{ label: string; value: number }[]>([]);

const activeGrantRows = computed<ActiveGrantRow[]>(() => grants.value.map((g) => {
  const org = orgList.value.find((o) => o.id === g.organizationId);
  const proj = g.projectId != null ? projectsByOrg.value[g.organizationId]?.find((p) => p.id === g.projectId) : null;
  const notes = [g.accountName ? `Account: ${g.accountName}` : null, g.taskName ? `Task: ${g.taskName}` : null].filter(Boolean);
  return {
    id: g.id,
    organizationId: g.organizationId,
    organizationName: org?.name ?? `Org #${g.organizationId}`,
    organizationHasLogo: org?.hasLogo ?? false,
    projectLabel: g.projectId != null ? (proj?.name ?? `Project #${g.projectId}`) : null,
    badges: g.capabilities.map((c) => c.replace('_', ' ')),
    note: notes.length ? notes.join(' · ') : null,
  };
}));

const selectedOrgId    = ref<number | null>(null);
const selectedEngId    = ref<number | null>(null);
const selectedCapabilities = ref<string[]>([]);
const orgWide          = ref(true);
const saving           = ref(false);

// Plugin-provided integration types (FortiRecon, Shodan — see tool-integrations.ts's own note on
// why they have no static INTEGRATION_TYPES entry anymore) fall through to the backend's live
// registry instead, same source ToolIntegrationFormDialog's own type picker already uses via
// mergeWithDynamicTypes — otherwise this panel always saw an empty capability list for them,
// with nothing to select and no grant creatable.
const registeredTypes = ref<RegisteredIntegrationType[]>([]);
const availableCapabilities = computed(() =>
  INTEGRATION_TYPES.find((t) => t.id === props.integration.type)?.capabilities
    ?? mergeWithDynamicTypes(registeredTypes.value).find((t) => t.id === props.integration.type)?.capabilities
    ?? []
);

const isMssp = computed(() => props.integration.type === 'tenable-mssp');
const msspAccounts = ref<{ id: string; name: string }[]>([]);
const msspAccountOptions = computed(() =>
  msspAccounts.value.map((a) => ({ label: a.name, value: a.id }))
);
const selectedMsspAccountId = ref<string | null>(null);
const selectedMsspAccountName = computed(
  () => msspAccounts.value.find((a) => a.id === selectedMsspAccountId.value)?.name ?? null
);
const loadingMsspAccounts = ref(false);

async function loadMsspAccounts() {
  if (!isMssp.value) return;
  loadingMsspAccounts.value = true;
  try { msspAccounts.value = await toolIntegrationsApi.listMsspAccounts(props.integration.id); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Could not load MSSP accounts', detail: e?.response?.data?.message ?? e.message, life: 5000 }); }
  finally { loadingMsspAccounts.value = false; }
}

const isGreenbone = computed(() => props.integration.type === 'greenbone');
const greenboneTasks = ref<{ id: string; name: string; status: string }[]>([]);
const greenboneTaskOptions = computed(() =>
  greenboneTasks.value.map((t) => ({ label: `${t.name} (${t.status})`, value: t.id }))
);
const selectedGreenboneTaskId = ref<string | null>(null);
const selectedGreenboneTaskName = computed(
  () => greenboneTasks.value.find((t) => t.id === selectedGreenboneTaskId.value)?.name ?? null
);
const loadingGreenboneTasks = ref(false);

async function loadGreenboneTasks() {
  if (!isGreenbone.value) return;
  loadingGreenboneTasks.value = true;
  try { greenboneTasks.value = await toolIntegrationsApi.listGreenboneTasks(props.integration.id); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Could not load Greenbone tasks', detail: e?.response?.data?.message ?? e.message, life: 5000 }); }
  finally { loadingGreenboneTasks.value = false; }
}

async function loadProjectsForOrg(orgId: number) {
  if (projectsByOrg.value[orgId]) return;
  const res = await projectsApi.list({ organizationId: orgId, size: 500 });
  projectsByOrg.value[orgId] = (res.items ?? []).map((e: any) => ({ id: e.id, name: e.name }));
}

async function loadGrants() {
  loading.value = true;
  try {
    grants.value = await toolIntegrationsApi.listGrants(props.integration.id);
    const orgIds = new Set(grants.value.filter((g) => g.projectId != null).map((g) => g.organizationId));
    for (const id of orgIds) await loadProjectsForOrg(id);
  } finally { loading.value = false; }
}

async function loadOrgs() {
  const res = await organizationsApi.list({ size: 500 });
  orgList.value = (res.items ?? []).map((o: any) => ({ id: o.id, name: o.name, hasLogo: o.hasLogo }));
}

async function onOrgChange() {
  selectedEngId.value = null;
  projects.value = [];
  if (!selectedOrgId.value) return;
  await loadProjectsForOrg(selectedOrgId.value);
  projects.value = projectsByOrg.value[selectedOrgId.value].map((p) => ({ label: p.name, value: p.id }));
}

function toggleCapability(cap: string) {
  if (selectedCapabilities.value.includes(cap)) {
    selectedCapabilities.value = selectedCapabilities.value.filter((c) => c !== cap);
  } else {
    selectedCapabilities.value = [...selectedCapabilities.value, cap];
  }
}

async function addGrant() {
  if (!selectedOrgId.value || !selectedCapabilities.value.length) return;
  if (isMssp.value && !selectedMsspAccountId.value) return;
  if (isGreenbone.value && !selectedGreenboneTaskId.value) return;
  saving.value = true;
  try {
    const grant = await toolIntegrationsApi.createGrant(props.integration.id, {
      organizationId: selectedOrgId.value,
      projectId: orgWide.value ? undefined : (selectedEngId.value ?? undefined),
      capabilities: selectedCapabilities.value,
      accountId: isMssp.value ? (selectedMsspAccountId.value ?? undefined) : undefined,
      accountName: isMssp.value ? (selectedMsspAccountName.value ?? undefined) : undefined,
      taskId: isGreenbone.value ? (selectedGreenboneTaskId.value ?? undefined) : undefined,
      taskName: isGreenbone.value ? (selectedGreenboneTaskName.value ?? undefined) : undefined,
    });
    grants.value = [...grants.value, grant];
    selectedOrgId.value = null;
    selectedEngId.value = null;
    orgWide.value = true;
    toast.add({ severity: 'success', summary: 'Grant created', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { saving.value = false; }
}

async function revokeGrant(grantId: number) {
  try {
    await toolIntegrationsApi.revokeGrant(props.integration.id, grantId);
    grants.value = grants.value.filter((g) => g.id !== grantId);
    toast.add({ severity: 'success', summary: 'Grant revoked', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

onMounted(async () => {
  loadGrants();
  loadOrgs();
  if (!INTEGRATION_TYPES.find((t) => t.id === props.integration.type)) {
    registeredTypes.value = await toolIntegrationsApi.listTypes().catch(() => []);
  }
  selectedCapabilities.value = availableCapabilities.value.map((c) => c.id);
  loadMsspAccounts();
  loadGreenboneTasks();
});
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:1.25rem;">
    <!-- Existing grants -->
    <div>
      <p class="section-label">Active grants</p>
      <ActiveGrantsTable :rows="activeGrantRows" :loading="loading" @revoke="revokeGrant" />
    </div>

    <!-- Add new grant -->
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
          <Select v-model="selectedEngId" :options="projects" option-label="label" option-value="value"
            placeholder="Select project…" style="width:100%;" filter />
        </div>

        <div v-if="isMssp">
          <label class="dlg-label">Managed account *</label>
          <Select
            v-model="selectedMsspAccountId"
            :options="msspAccountOptions"
            option-label="label"
            option-value="value"
            :loading="loadingMsspAccounts"
            placeholder="Select MSSP account…"
            style="width:100%;"
            filter
          />
          <p v-if="!loadingMsspAccounts && !msspAccountOptions.length" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
            No accounts found. Ensure the integration credentials have MSSP admin access.
          </p>
        </div>

        <div v-if="isGreenbone">
          <label class="dlg-label">Task *</label>
          <Select
            v-model="selectedGreenboneTaskId"
            :options="greenboneTaskOptions"
            option-label="label"
            option-value="value"
            :loading="loadingGreenboneTasks"
            placeholder="Select GVM task…"
            style="width:100%;"
            filter
          />
          <p v-if="!loadingGreenboneTasks && !greenboneTaskOptions.length" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
            No tasks found. Ensure the integration credentials can reach the GVM instance.
          </p>
          <p style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
            This grant syncs/launches only this task. Add another grant for a different task.
          </p>
        </div>

        <div>
          <label class="dlg-label">Capabilities</label>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button
              v-for="cap in availableCapabilities" :key="cap.id"
              type="button"
              :class="['cap-btn', { 'cap-btn--active': selectedCapabilities.includes(cap.id) }]"
              @click="toggleCapability(cap.id)"
            >{{ cap.label }}</button>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end;">
          <Button label="Add grant" icon="pi pi-plus" size="small" :loading="saving"
            :disabled="!selectedOrgId || !selectedCapabilities.length || (isMssp && !selectedMsspAccountId) || (isGreenbone && !selectedGreenboneTaskId)"
            @click="addGrant" />
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
.scope-btn, .cap-btn {
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
.scope-btn--active, .cap-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  color: var(--p-primary-300);
  font-weight: 600;
}
</style>
