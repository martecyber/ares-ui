<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import AresBadge from '@/components/AresBadge.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import AgentPoolMembersDialog from '@/components/AgentPoolMembersDialog.vue';
import AgentPoolGrantDialog from '@/components/AgentPoolGrantDialog.vue';
import { agentPoolsApi, type AgentPool } from '@/api/agent-pools';
import { confirmDialog } from '@/composables/useConfirmDialog';

const toast = useToast();
const router = useRouter();
const items = ref<AgentPool[]>([]);
const loading = ref(false);

// Sort
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const processed = computed(() => {
  let data = [...items.value];
  if (sortCol.value && sortDir.value) {
    const dir = sortDir.value === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      const va = String((a as any)[sortCol.value!] ?? '');
      const vb = String((b as any)[sortCol.value!] ?? '');
      return dir * va.localeCompare(vb, undefined, { numeric: true });
    });
  }
  return data;
});

// Form state
const showForm = ref(false);
const editing  = ref<AgentPool | null>(null);
const form = ref({ name: '', description: '' });
const saving = ref(false);

const showMembers = ref(false);
const membersPool = ref<AgentPool | null>(null);

const showGrants = ref(false);
const grantsPool = ref<AgentPool | null>(null);

async function load() {
  loading.value = true;
  try {
    items.value = await agentPoolsApi.list();
  } finally { loading.value = false; }
}

function openCreate() {
  editing.value = null;
  form.value = { name: '', description: '' };
  showForm.value = true;
}

function openEdit(p: AgentPool) {
  editing.value = p;
  form.value = { name: p.name, description: p.description ?? '' };
  showForm.value = true;
}

async function saveForm() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    if (editing.value) {
      await agentPoolsApi.update(editing.value.id, { name: form.value.name, description: form.value.description });
    } else {
      await agentPoolsApi.create({
        name: form.value.name,
        description: form.value.description || undefined,
      });
    }
    showForm.value = false;
    await load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { saving.value = false; }
}

async function toggleEnabled(p: AgentPool) {
  try {
    await agentPoolsApi.update(p.id, { enabled: !p.enabled });
    await load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

async function deletePool(p: AgentPool) {
  const ok = await confirmDialog({ header: 'Delete pool', message: `Delete pool "${p.name}"? Active grants will be revoked.` });
  if (!ok) return;
  try {
    await agentPoolsApi.delete(p.id);
    items.value = items.value.filter((x) => x.id !== p.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Agent pools</h2>
        <p class="ares-page-subtitle">Group agents into pools. Projects subscribe to pools, not individual agents.</p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New pool'" @click="openCreate" />
    </div>

    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else class="ares-card" style="padding:0;">
      <table class="ares-table">
        <thead>
          <tr>
            <th>
              <ColumnHeader label="Name" :sortable="true"
                :sort-dir="sortCol === 'name' ? sortDir : null"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                @update:sort-dir="onSort('name', $event)" />
            </th>
            <th style="width:100px; text-align:right;">Members</th>
            <th style="width:100px;">Status</th>
            <th style="width:240px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in processed" :key="p.id">
            <td>
              <div style="font-weight:600;">{{ p.name }}</div>
              <div v-if="p.description" style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.15rem;">{{ p.description }}</div>
            </td>
            <td style="text-align:right; font-family:monospace; font-size:0.85rem;">{{ p.memberCount }}</td>
            <td><AresBadge :value="p.enabled ? 'enabled' : 'disabled'" :severity="p.enabled ? 'success' : 'secondary'" /></td>
            <td style="text-align:right;">
              <Button icon="pi pi-chart-bar" text size="small" v-tooltip.left="'Timeline (last 24h)'"
                @click="router.push({ name: 'agent-pool-timeline', params: { id: p.id } })" />
              <Button icon="pi pi-users" text size="small" v-tooltip.left="'Members'"
                @click="membersPool = p; showMembers = true" />
              <Button icon="pi pi-key" text size="small" v-tooltip.left="'Grants'"
                @click="grantsPool = p; showGrants = true" />
              <Button icon="pi pi-pencil" text size="small" v-tooltip.left="'Edit'" @click="openEdit(p)" />
              <Button :icon="p.enabled ? 'pi pi-pause' : 'pi pi-play'" text size="small"
                v-tooltip.left="p.enabled ? 'Disable' : 'Enable'" @click="toggleEnabled(p)" />
              <Button icon="pi pi-trash" text severity="danger" size="small"
                v-tooltip.left="'Delete'" @click="deletePool(p)" />
            </td>
          </tr>
          <tr v-if="!processed.length">
            <td colspan="4" class="ares-table-empty">No pools yet. Create one to start grouping agents.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Form dialog -->
    <Dialog v-model:visible="showForm" modal :header="editing ? 'Edit pool' : 'New pool'" :style="{ width: 'min(480px, 95vw)' }">
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label class="ares-field-label">Name</label>
          <InputText v-model="form.name" placeholder="e.g. corp-vpn-pool" style="width:100%;" />
        </div>
        <div>
          <label class="ares-field-label">Description (optional)</label>
          <Textarea v-model="form.description" rows="2" class="w-full" auto-resize />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showForm = false" />
          <Button :label="editing ? 'Save' : 'Create'" size="small" :loading="saving" @click="saveForm" />
        </div>
      </div>
    </Dialog>

    <AgentPoolMembersDialog v-model:visible="showMembers" :pool="membersPool" @saved="load" />
    <AgentPoolGrantDialog   v-model:visible="showGrants"  :pool="grantsPool"  @changed="load" />
  </div>
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
