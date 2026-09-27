<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import AresLoadingState from '@/components/AresLoadingState.vue';
import { dashboardsApi, type DashboardSummary, type DashboardLevel } from '@/api/dashboards';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router = useRouter();

const LEVEL_OPTIONS: { label: string; value: DashboardLevel }[] = [
  { label: 'Project', value: 'PROJECT' },
  { label: 'Organization', value: 'ORGANIZATION' },
  { label: 'Platform', value: 'PLATFORM' },
];

const level = ref<DashboardLevel>('PROJECT');
const templates = ref<DashboardSummary[]>([]);
const loading = ref(true);
const err = ref<string | null>(null);
const q = ref('');
const deleting = ref<number | null>(null);

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return templates.value;
  return templates.value.filter((t) =>
    t.name.toLowerCase().includes(needle) || (t.description ?? '').toLowerCase().includes(needle));
});

async function load() {
  loading.value = true;
  err.value = null;
  try {
    templates.value = await dashboardsApi.listTemplates(level.value);
  } catch {
    err.value = 'Failed to load dashboard templates.';
  } finally {
    loading.value = false;
  }
}
watch(level, load);
onMounted(load);

// ── Create dialog ────────────────────────────────────────────────────────────
const showCreate = ref(false);
const creating = ref(false);
const newName = ref('');
const newLevel = ref<DashboardLevel>('PROJECT');
const newDescription = ref('');

function openCreate() {
  newName.value = '';
  newLevel.value = level.value;
  newDescription.value = '';
  showCreate.value = true;
}

async function createTemplate() {
  if (!newName.value.trim()) return;
  creating.value = true;
  try {
    const created = await dashboardsApi.createTemplate({
      level: newLevel.value, name: newName.value.trim(), description: newDescription.value.trim() || undefined,
    });
    showCreate.value = false;
    router.push({ name: 'kb-dashboard-template-detail', params: { id: created.id } });
  } catch {
    err.value = 'Failed to create template.';
  } finally {
    creating.value = false;
  }
}

async function remove(e: Event, id: number) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete dashboard template', message: 'Delete this template? This can\'t be undone.' });
  if (!ok) return;
  deleting.value = id;
  try {
    await dashboardsApi.remove(id);
    templates.value = templates.value.filter((t) => t.id !== id);
  } catch {
    err.value = 'Failed to delete.';
  } finally {
    deleting.value = null;
  }
}
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Dashboard Templates</h2>
        <p class="ares-page-subtitle">
          Reusable widget layouts, per level — offered when creating a new project/organization/platform
          dashboard so it doesn't have to start blank.
        </p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New template'" @click="openCreate" />
    </div>

    <div style="display:flex; gap:0.6rem; margin-bottom:0.85rem; flex-wrap:wrap;">
      <Select v-model="level" :options="LEVEL_OPTIONS" option-label="label" option-value="value" style="width:160px;" />
      <InputText v-model="q" placeholder="Search templates…" style="max-width:280px;" />
    </div>

    <div v-if="err" class="ares-alert ares-alert--error" style="margin-bottom:0.75rem;">{{ err }}</div>

    <AresLoadingState v-if="loading" />
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table ares-table--clickable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th style="width:60px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in filtered" :key="t.id"
              @click="router.push({ name: 'kb-dashboard-template-detail', params: { id: t.id } })">
              <td style="font-weight:500;">{{ t.name }}</td>
              <td style="color:var(--ares-text-muted); font-size:0.85rem;">{{ t.description || '—' }}</td>
              <td @click.stop style="text-align:right; padding-right:0.5rem;">
                <Button icon="pi pi-trash" text severity="danger" size="small"
                  :loading="deleting === t.id" @click="remove($event, t.id)" />
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="3" class="ares-table-empty">
                No {{ LEVEL_OPTIONS.find(o => o.value === level)?.label.toLowerCase() }} dashboard templates yet.
                Click "New template" to create one.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <Dialog v-model:visible="showCreate" modal header="New dashboard template" style="width: 440px;">
      <div style="display:flex; flex-direction:column; gap:0.85rem;">
        <div class="ares-form-field">
          <label class="ares-form-label">Level</label>
          <Select v-model="newLevel" :options="LEVEL_OPTIONS" option-label="label" option-value="value" style="width:100%;" />
        </div>
        <div class="ares-form-field">
          <label class="ares-form-label">Name</label>
          <InputText v-model="newName" style="width:100%;" placeholder="Template name" @keyup.enter="createTemplate" />
        </div>
        <div class="ares-form-field">
          <label class="ares-form-label">Description (optional)</label>
          <Textarea v-model="newDescription" rows="2" style="width:100%;" placeholder="What this template is for…" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showCreate = false" />
        <Button label="Create" :disabled="!newName.trim()" :loading="creating" @click="createTemplate" />
      </template>
    </Dialog>
  </div>
</template>
