<script setup lang="ts">
/**
 * Editor for one dashboard template — a template IS a Dashboard row (isTemplate=true,
 * scopeId=null), so the entire widget-editing surface (drag/resize/add/configure/save) is
 * DashboardHost.vue's existing `dashboardId`-pinned mode (built for the presentation player),
 * reused here unmodified. Only the header (name/level/description, a trimmed control row with
 * no switcher/new-dashboard/set-default — none of those make sense for a single fixed template)
 * is specific to this page.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import ProgressSpinner from 'primevue/progressspinner';
import AresBadge from '@/components/AresBadge.vue';
import { dashboardsApi, type DashboardDto } from '@/api/dashboards';
import DashboardHost from '@/components/dashboard/DashboardHost.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));

const template = ref<DashboardDto | null>(null);
const loading = ref(true);
const err = ref<string | null>(null);

const hostRef = ref<InstanceType<typeof DashboardHost> | null>(null);
const host = computed(() => hostRef.value as unknown as Record<string, any> | null);

async function load() {
  loading.value = true;
  err.value = null;
  try {
    template.value = await dashboardsApi.get(id.value);
  } catch {
    err.value = 'Failed to load this template.';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ── Description — edited inline here, independently of DashboardHost's own name/widget save ──
const editingDescription = ref(false);
const descriptionDraft = ref('');
const savingDescription = ref(false);

function startEditDescription() {
  descriptionDraft.value = template.value?.description ?? '';
  editingDescription.value = true;
}

async function saveDescription() {
  if (!template.value) return;
  savingDescription.value = true;
  try {
    await dashboardsApi.update(template.value.id, { description: descriptionDraft.value.trim() });
    template.value.description = descriptionDraft.value.trim() || null;
    editingDescription.value = false;
  } catch {
    err.value = 'Failed to save description.';
  } finally {
    savingDescription.value = false;
  }
}

// DashboardHost's own saveLayout() persists a name change together with the widget layout —
// re-fetch afterward so this page's own header (name/level badge) reflects a rename too.
async function onSaved() {
  template.value = await dashboardsApi.get(id.value).catch(() => template.value);
}
</script>

<template>
  <div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:4rem;">
      <ProgressSpinner />
    </div>
    <div v-else-if="err" class="ares-alert ares-alert--error">{{ err }}</div>

    <template v-else-if="template">
      <div class="ares-page-header" style="margin-bottom:0.75rem;">
        <div style="display:flex; align-items:center; gap:0.6rem; min-width:0;">
          <Button icon="pi pi-arrow-left" text size="small" @click="router.push({ name: 'kb-dashboard-templates' })" />
          <InputText v-if="host?.editMode" v-model="host.editingName" style="min-width:180px; max-width:320px;" placeholder="Template name" />
          <h2 v-else class="ares-page-title" style="margin:0;">{{ template.name }}</h2>
          <AresBadge :value="template.level" severity="secondary" />
        </div>
        <div style="display:flex; gap:0.4rem; align-items:center;">
          <template v-if="host?.canEdit">
            <template v-if="host.editMode">
              <Button icon="pi pi-plus" text size="small" severity="secondary" v-tooltip.top="'Add widget'" @click="host.showAddDialog = true" />
              <Button icon="pi pi-check" text size="small" :loading="host.saving" v-tooltip.top="'Save'" @click="host.saveLayout().then(onSaved)" />
              <Button icon="pi pi-times" text size="small" severity="danger" v-tooltip.top="'Cancel'" @click="host.toggleEditMode()" />
            </template>
            <Button v-else icon="pi pi-pencil" text size="small" severity="secondary" v-tooltip.top="'Edit template'" @click="host.toggleEditMode()" />
          </template>
        </div>
      </div>

      <div style="margin-bottom:1.25rem;">
        <div v-if="!editingDescription" style="display:flex; align-items:flex-start; gap:0.4rem;">
          <p style="margin:0; font-size:0.85rem; color:var(--ares-text-muted); flex:1;">
            {{ template.description || 'No description yet.' }}
          </p>
          <Button icon="pi pi-pencil" text rounded size="small" v-tooltip.top="'Edit description'" @click="startEditDescription" />
        </div>
        <div v-else style="display:flex; flex-direction:column; gap:0.5rem; max-width:520px;">
          <Textarea v-model="descriptionDraft" rows="2" style="width:100%;" placeholder="What this template is for…" />
          <div style="display:flex; gap:0.4rem; justify-content:flex-end;">
            <Button label="Cancel" size="small" text severity="secondary" @click="editingDescription = false" />
            <Button label="Save" size="small" :loading="savingDescription" @click="saveDescription" />
          </div>
        </div>
      </div>

      <DashboardHost ref="hostRef" :level="template.level" :scope-id="null" :dashboard-id="template.id" />
    </template>
  </div>
</template>
