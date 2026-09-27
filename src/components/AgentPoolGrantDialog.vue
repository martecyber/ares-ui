<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { agentPoolsApi, type AgentPool, type AgentPoolGrant } from '@/api/agent-pools';
import { organizationsApi, type Organization } from '@/api/organizations';
import { projectsApi } from '@/api/projects';
import { confirmDialog } from '@/composables/useConfirmDialog';

const props = defineProps<{ visible: boolean; pool: AgentPool | null }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'changed'): void }>();

const toast = useToast();
const grants = ref<AgentPoolGrant[]>([]);
const orgs   = ref<Organization[]>([]);
const projectsByOrg = ref<Record<number, { id: number; code: string; name: string }[]>>({});

// Form state
const newOrgId     = ref<number | null>(null);
const newProjectId = ref<number | null>(null);  // null = org-wide
const saving       = ref(false);

const orgMap = computed(() =>
  Object.fromEntries(orgs.value.map((o) => [o.id, o.name])) as Record<number, string>
);

const newOrgProjects = computed(() => {
  if (!newOrgId.value) return [];
  return projectsByOrg.value[newOrgId.value] ?? [];
});

const projectOptions = computed(() => [
  { id: null, label: '— Org-wide (all projects) —' },
  ...newOrgProjects.value.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })),
]);

async function loadOrgProjects(orgId: number) {
  if (projectsByOrg.value[orgId]) return;
  const res = await projectsApi.list({ organizationId: orgId, size: 500 });
  projectsByOrg.value[orgId] = (res.items ?? (res as any)).map((x: any) =>
    ({ id: x.id, code: x.code, name: x.name }));
}

watch(newOrgId, async (v) => {
  newProjectId.value = null;
  if (v) await loadOrgProjects(v);
});

watch(() => props.visible, async (v) => {
  if (!v || !props.pool) return;
  newOrgId.value = null;
  newProjectId.value = null;
  try {
    const [g, o] = await Promise.all([
      agentPoolsApi.listGrants(props.pool.id),
      organizationsApi.list({ size: 200 }),
    ]);
    grants.value = g;
    orgs.value = o.items ?? (o as any);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Load failed', detail: e?.message, life: 4000 });
  }
});

async function addGrant() {
  if (!props.pool || !newOrgId.value) return;
  saving.value = true;
  try {
    const g = await agentPoolsApi.createGrant(props.pool.id, {
      organizationId: newOrgId.value,
      projectId: newProjectId.value,
    });
    grants.value = [...grants.value, g];
    newOrgId.value = null;
    newProjectId.value = null;
    emit('changed');
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}

async function revoke(g: AgentPoolGrant) {
  if (!props.pool) return;
  const ok = await confirmDialog({ header: 'Revoke grant', message: 'Revoke this grant?', acceptLabel: 'Revoke', acceptSeverity: 'warn', acceptIcon: 'pi pi-ban' });
  if (!ok) return;
  try {
    await agentPoolsApi.revokeGrant(props.pool.id, g.id);
    grants.value = grants.value.filter((x) => x.id !== g.id);
    emit('changed');
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

/** Label for an existing grant. Lazy-loads org's projects if not yet cached. */
function grantLabel(g: AgentPoolGrant): string {
  const orgName = orgMap.value[g.organizationId] ?? `Org #${g.organizationId}`;
  if (g.projectId == null) return `${orgName} · all projects`;
  const proj = projectsByOrg.value[g.organizationId]?.find((p) => p.id === g.projectId);
  return proj ? `${orgName} · ${proj.code} — ${proj.name}` : `${orgName} · Project #${g.projectId}`;
}

// When grants land, ensure we cache their orgs' projects so the labels render fully.
watch(grants, async (gs) => {
  const orgIds = new Set<number>(gs.filter((g) => g.projectId != null).map((g) => g.organizationId));
  for (const id of orgIds) await loadOrgProjects(id);
}, { deep: true });
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)"
    modal :header="`Grants for ${pool?.name ?? ''}`" :style="{ width: 'min(620px, 95vw)' }">
    <div style="display:flex; flex-direction:column; gap:1rem;">
      <p style="margin:0; font-size:0.83rem; color:var(--ares-text-muted);">
        Grant access to this pool. Pools are platform-level — you can grant the same pool
        to projects in any organization.
      </p>

      <div style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap;">
        <div style="flex:1; min-width:180px;">
          <label class="ares-field-label">Organization</label>
          <Select v-model="newOrgId" :options="orgs" option-label="name" option-value="id"
            placeholder="Select organization" style="width:100%;" filter />
        </div>
        <div style="flex:1; min-width:200px;">
          <label class="ares-field-label">Project</label>
          <Select v-model="newProjectId" :options="projectOptions" option-label="label" option-value="id"
            :disabled="!newOrgId" style="width:100%;" />
        </div>
        <Button label="Add grant" icon="pi pi-plus" size="small"
          :loading="saving" :disabled="!newOrgId" @click="addGrant" />
      </div>

      <div style="border:1px solid var(--ares-border); border-radius: var(--ares-radius);">
        <div v-for="g in grants" :key="g.id"
          style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.75rem;
                 border-bottom:1px solid var(--ares-border); font-size:0.85rem;">
          <span style="flex:1;">{{ grantLabel(g) }}</span>
          <Button icon="pi pi-trash" text severity="danger" size="small" @click="revoke(g)" />
        </div>
        <div v-if="!grants.length" style="padding:1rem; text-align:center; color:var(--ares-text-muted); font-size:0.85rem;">
          No grants yet.
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <Button label="Close" severity="secondary" size="small" @click="emit('update:visible', false)" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.ares-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
