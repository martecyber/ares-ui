<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import StatusCheckIcon from '@/components/StatusCheckIcon.vue';
import { useToast } from 'primevue/usetoast';
import { vdpIntegrationsApi, vdpPlatformLabel, vdpLogoMarkup, loadBugHuntingPlatforms, bugHuntingPlatformsRef } from '@/api/vdp-integrations';
import { toolIconSrc } from '@/utils/tool-icons';
import VdpIntegrationFormDialog from '@/components/VdpIntegrationFormDialog.vue';
import IntegrationPickerDialog from '@/components/IntegrationPickerDialog.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import type { ToolIntegration } from '@/api/tool-integrations';
import { confirmDialog } from '@/composables/useConfirmDialog';

const toast = useToast();
const items      = ref<ToolIntegration[]>([]);
const loading    = ref(false);
const showPicker = ref(false);
const pickedType = ref('');
const showForm   = ref(false);
const editing    = ref<ToolIntegration | null>(null);
const testingId  = ref<number | null>(null);
const bugHuntingPlatforms = bugHuntingPlatformsRef();

// ── Sort / filter state ────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterPlatform = ref<string[]>([]);
const filterConnectionStatus = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const researcherFacingPlatforms = computed(() => bugHuntingPlatforms.value.filter((p) => p.researcherFacing));
const platformOptions = computed(() => researcherFacingPlatforms.value.map((p) => ({ label: p.label, value: p.id })));
const pickerOptions = computed(() => researcherFacingPlatforms.value.map((p) => ({
  id: p.id, label: p.label, logo: toolIconSrc(p.id),
})));

const connectionStatusOptions = [
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Unknown', value: 'unknown' },
];

const processedItems = computed(() => {
  let data = [...items.value];
  if (filterPlatform.value.length) data = data.filter((i) => filterPlatform.value.includes(i.type));
  if (filterConnectionStatus.value.length) {
    data = data.filter((i) => filterConnectionStatus.value.includes(i.connectionStatus));
  }
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

async function load() {
  loading.value = true;
  try {
    const res = await vdpIntegrationsApi.list();
    items.value = res.items;
  } finally { loading.value = false; }
}

function openCreate() { editing.value = null; showPicker.value = true; }
function openEdit(i: ToolIntegration) { editing.value = i; showForm.value = true; }
function onTypePicked(type: string) { pickedType.value = type; showForm.value = true; }

async function testConnection(i: ToolIntegration) {
  testingId.value = i.id;
  try {
    const updated = await vdpIntegrationsApi.testConnection(i.id);
    const idx = items.value.findIndex((x) => x.id === i.id);
    if (idx !== -1) items.value[idx] = updated;
    toast.add({
      severity: updated.connectionStatus === 'success' ? 'success' : 'error',
      summary: updated.connectionStatus === 'success' ? 'Connection OK' : 'Connection failed',
      life: 4000,
    });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Test failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { testingId.value = null; }
}

async function deleteIntegration(i: ToolIntegration) {
  const ok = await confirmDialog({ header: 'Delete integration', message: `Delete integration "${i.name}"?` });
  if (!ok) return;
  try {
    await vdpIntegrationsApi.delete(i.id);
    items.value = items.value.filter((x) => x.id !== i.id);
    toast.add({ severity: 'success', summary: 'Deleted', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

function vdpPlatformLogo(type: string): string {
  return vdpLogoMarkup(type);
}

/** Normalised connection status → tick/cross/unknown for the shared StatusCheckIcon. */
function connStatus(status: string): 'ok' | 'error' | 'unknown' {
  if (status === 'success') return 'ok';
  if (status === 'failed') return 'error';
  return 'unknown';
}

onMounted(() => {
  load();
  loadBugHuntingPlatforms();
});
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Bug Hunting Platforms</h2>
        <p class="ares-page-subtitle">
          Connect Bug Bounty / Vulnerability Disclosure Programme platforms
          <template v-if="researcherFacingPlatforms.length">({{ researcherFacingPlatforms.map((p) => p.label).join(', ') }})</template>
          to enable automatic scope synchronisation in Bug Hunting projects.
        </p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New integration'" @click="openCreate" />
    </div>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th>
                <ColumnHeader label="Name" :sortable="true"
                  :sort-dir="sortCol === 'name' ? sortDir : null"
                  sort-asc-label="A → Z" sort-desc-label="Z → A"
                  @update:sort-dir="onSort('name', $event)" />
              </th>
              <th style="width:130px;">
                <ColumnHeader label="Platform"
                  :filter-options="platformOptions"
                  :filter-value="filterPlatform"
                  @update:filter-value="filterPlatform = $event" />
              </th>
              <th style="width:100px;">
                <ColumnHeader label="Status" :sortable="true"
                  :sort-dir="sortCol === 'connectionStatus' ? sortDir : null"
                  :filter-options="connectionStatusOptions"
                  :filter-value="filterConnectionStatus"
                  @update:sort-dir="onSort('connectionStatus', $event)"
                  @update:filter-value="filterConnectionStatus = $event" />
              </th>
              <th style="width:160px;">
                <ColumnHeader label="Last sync" :sortable="true"
                  :sort-dir="sortCol === 'lastSyncAt' ? sortDir : null"
                  sort-asc-label="Oldest first" sort-desc-label="Newest first"
                  @update:sort-dir="onSort('lastSyncAt', $event)" />
              </th>
              <th style="width:140px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in processedItems" :key="i.id">
              <td>
                <div style="font-weight:600;">{{ i.name }}</div>
                <div v-if="i.status !== 'active'" style="font-size:0.72rem; color:var(--ares-text-muted);">
                  {{ i.status }}
                </div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <span class="inline-logo" style="width:20px; height:20px; flex-shrink:0; display:flex; align-items:center;" v-html="vdpPlatformLogo(i.type)" />
                  <span style="font-size:0.85rem;">{{ vdpPlatformLabel(i.type) }}</span>
                </div>
              </td>
              <td>
                <StatusCheckIcon
                  :status="connStatus(i.connectionStatus)"
                  :tooltip="connStatus(i.connectionStatus) === 'error' ? i.connectionError : undefined"
                />
              </td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">
                {{ i.lastSyncAt ? new Date(i.lastSyncAt).toLocaleString() : '—' }}
              </td>
              <td>
                <div style="display:flex; gap:0.4rem; justify-content:flex-end;">
                  <Button icon="pi pi-wifi" size="small" severity="secondary" text
                    :loading="testingId === i.id" title="Test connection" @click="testConnection(i)" />
                  <Button icon="pi pi-pencil" size="small" severity="secondary" text @click="openEdit(i)" />
                  <Button icon="pi pi-trash" size="small" severity="danger" text @click="deleteIntegration(i)" />
                </div>
              </td>
            </tr>
            <tr v-if="!processedItems.length">
              <td colspan="5" class="ares-table-empty">
                No VDP platform integrations configured yet. Add one to enable scope sync in Bug Hunting projects.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Picker dialog -->
    <IntegrationPickerDialog
      v-model:visible="showPicker"
      header="Select VDP platform"
      :options="pickerOptions"
      @select="onTypePicked"
    />

    <VdpIntegrationFormDialog
      v-model:visible="showForm"
      :integration="editing"
      :preselected-type="pickedType"
      @saved="load"
    />
  </div>
</template>
