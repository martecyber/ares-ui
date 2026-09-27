<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import StatusCheckIcon from '@/components/StatusCheckIcon.vue';
import { useToast } from 'primevue/usetoast';
import {
  toolIntegrationsApi, INTEGRATION_TYPES, mergeWithDynamicTypes,
  type ToolIntegration, type IntegrationTypeOption,
} from '@/api/tool-integrations';
import ToolIntegrationFormDialog from '@/components/ToolIntegrationFormDialog.vue';
import IntegrationPickerDialog from '@/components/IntegrationPickerDialog.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import { caidoApiIntegrationApi, type CaidoApiIntegration } from '@/api/caido';
import CaidoApiGrantsPanel from '@/components/CaidoApiGrantsPanel.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import Password from 'primevue/password';

const toast = useToast();
const items = ref<ToolIntegration[]>([]);
const loading = ref(false);

// ── Dialogs ───────────────────────────────────────────────────────────────────
const showPicker = ref(false);
const pickedType = ref('tenable');
const showForm = ref(false);
const editingIntegration = ref<ToolIntegration | null>(null);

const testingId = ref<number | null>(null);

// ── Sort / filter state ────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterConnectionStatus = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const connectionStatusOptions = [
  { label: 'Success', value: 'success' },
  { label: 'Error', value: 'failed' },
];

const processedItems = computed(() => {
  let data = [...items.value];
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

// Starts out as the static list so the picker renders instantly; replaced once
// GET /integrations/types answers (includes anything a plugin registered — see
// mergeWithDynamicTypes's own doc comment for why a static entry can also get dropped).
const integrationTypeOptions = ref<IntegrationTypeOption[]>(INTEGRATION_TYPES as unknown as IntegrationTypeOption[]);

async function load() {
  loading.value = true;
  try {
    const [res, caidoApi_, types] = await Promise.all([
      toolIntegrationsApi.list({ size: 200 }),
      caidoApiIntegrationApi.list().catch(() => [] as CaidoApiIntegration[]),
      toolIntegrationsApi.listTypes(true).catch(() => null),
    ]);
    items.value = res.items ?? (res as any);
    caidoApiItems.value = caidoApi_;
    if (types) integrationTypeOptions.value = mergeWithDynamicTypes(types);
  } finally { loading.value = false; }
}

function openCreate() { editingIntegration.value = null; showPicker.value = true; }
function openEdit(i: ToolIntegration) { editingIntegration.value = i; showForm.value = true; }

function onTypePicked(type: string) {
  if (type === 'caido-api') { openCaidoApiCreate(); return; }
  pickedType.value = type;
  showForm.value = true;
}

// ── Caido API (push-based: Ares calls Caido GraphQL directly) ─────────────────────
const caidoApiItems = ref<CaidoApiIntegration[]>([]);
const showCaidoApiForm = ref(false);
const caidoApiEditing = ref<CaidoApiIntegration | null>(null);
const caidoApiLabel = ref('');
const caidoApiBaseUrl = ref('');
const caidoApiToken = ref('');
const savingCaidoApi = ref(false);
const testingCaidoApiId = ref<number | null>(null);
const caidoApiActiveTab = ref('general');

function openCaidoApiCreate() {
  caidoApiEditing.value = null;
  caidoApiLabel.value = '';
  caidoApiBaseUrl.value = '';
  caidoApiToken.value = '';
  caidoApiActiveTab.value = 'general';
  showCaidoApiForm.value = true;
}
function openCaidoApiEdit(i: CaidoApiIntegration) {
  caidoApiEditing.value = i;
  caidoApiLabel.value = i.label;
  caidoApiBaseUrl.value = i.baseUrl;
  caidoApiToken.value = '';
  caidoApiActiveTab.value = 'general';
  showCaidoApiForm.value = true;
}

async function submitCaidoApi() {
  if (!caidoApiLabel.value.trim() || !caidoApiBaseUrl.value.trim()) return;
  savingCaidoApi.value = true;
  try {
    if (caidoApiEditing.value) {
      const saved = await caidoApiIntegrationApi.update(caidoApiEditing.value.id, {
        label: caidoApiLabel.value.trim(),
        baseUrl: caidoApiBaseUrl.value.trim(),
        ...(caidoApiToken.value.trim() ? { accessToken: caidoApiToken.value.trim() } : {}),
      });
      const idx = caidoApiItems.value.findIndex((x) => x.id === saved.id);
      if (idx !== -1) caidoApiItems.value[idx] = saved;
    } else {
      const saved = await caidoApiIntegrationApi.create({
        label: caidoApiLabel.value.trim(),
        baseUrl: caidoApiBaseUrl.value.trim(),
        accessToken: caidoApiToken.value.trim() || undefined,
      });
      caidoApiItems.value = [...caidoApiItems.value, saved].sort((a, b) => a.label.localeCompare(b.label));
    }
    showCaidoApiForm.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { savingCaidoApi.value = false; }
}

async function testCaidoApi(i: CaidoApiIntegration) {
  testingCaidoApiId.value = i.id;
  try {
    const updated = await caidoApiIntegrationApi.testConnection(i.id);
    const idx = caidoApiItems.value.findIndex((x) => x.id === i.id);
    if (idx !== -1) caidoApiItems.value[idx] = updated;
    toast.add({
      severity: updated.connectionStatus === 'ok' ? 'success' : 'error',
      summary: updated.connectionStatus === 'ok' ? 'Connection successful' : 'Connection error',
      detail: updated.connectionStatus !== 'ok' ? (updated.connectionError ?? '') : undefined,
      life: 4000,
    });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Test failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { testingCaidoApiId.value = null; }
}

async function deleteCaidoApi(i: CaidoApiIntegration) {
  const ok = await confirmDialog({ header: 'Delete integration', message: `Delete "${i.label}"? Project tasks using it will be removed too.` });
  if (!ok) return;
  try {
    await caidoApiIntegrationApi.delete(i.id);
    caidoApiItems.value = caidoApiItems.value.filter((x) => x.id !== i.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

async function testConnection(i: ToolIntegration) {
  testingId.value = i.id;
  try {
    const updated = await toolIntegrationsApi.testConnection(i.id);
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
    await toolIntegrationsApi.delete(i.id);
    items.value = items.value.filter((x) => x.id !== i.id);
    toast.add({ severity: 'success', summary: 'Deleted', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

/** Normalised connection status → tick/cross/unknown for the shared StatusCheckIcon. */
function connStatus(status: string, isOkValue = false): 'ok' | 'error' | 'unknown' {
  const ok = isOkValue ? status === 'ok' : status === 'success';
  const err = isOkValue ? status === 'error' : status === 'failed';
  if (ok) return 'ok';
  if (err) return 'error';
  return 'unknown';
}

function typeMeta(type: string) {
  return integrationTypeOptions.value.find((t) => t.id === type) ?? { label: type, icon: 'pi-plug', color: 'var(--ares-text-muted)', logo: '' };
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Data Sources</h2>
        <p class="ares-page-subtitle">Connect external security tools to import assets and vulnerabilities.</p>
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
              <th style="width:120px;">Platform</th>
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
              <th style="width:200px;"></th>
            </tr>
          </thead>
          <tbody>
            <!-- ── Standard tool integration rows ── -->
            <tr v-for="i in processedItems" :key="i.id">
              <td>
                <div style="font-weight:600;">{{ i.name }}</div>
                <div v-if="i.status !== 'active'" style="font-size:0.72rem; color:var(--ares-text-muted);">{{ i.status }}</div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <img v-if="typeMeta(i.type).logo" :src="typeMeta(i.type).logo" style="width:20px; height:20px; flex-shrink:0; object-fit:contain; border-radius: var(--ares-radius);" :alt="typeMeta(i.type).label" />
                  <i v-else class="pi pi-plug" style="font-size:0.9rem; color:var(--ares-text-muted);" />
                  <span style="font-size:0.85rem;">{{ typeMeta(i.type).label }}</span>
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
                    :loading="testingId === i.id" v-tooltip.top="'Test Connection'" @click="testConnection(i)" />
                  <Button icon="pi pi-pencil" size="small" severity="secondary" text
                    v-tooltip.top="'Edit'" @click="openEdit(i)" />
                  <Button icon="pi pi-trash" size="small" severity="danger" text
                    v-tooltip.top="'Delete'" @click="deleteIntegration(i)" />
                </div>
              </td>
            </tr>
            <!-- ── Caido rows — push-based, Ares calls Caido GraphQL directly ── -->
            <tr v-for="c in caidoApiItems" :key="`caido-api-${c.id}`">
              <td>
                <div style="font-weight:600;">{{ c.label }}</div>
                <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ c.baseUrl }}</div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <img v-if="typeMeta('caido-api').logo" :src="typeMeta('caido-api').logo" style="width:20px; height:20px; flex-shrink:0; object-fit:contain; border-radius: var(--ares-radius);" alt="Caido" />
                  <span style="font-size:0.85rem;">Caido</span>
                </div>
              </td>
              <td>
                <StatusCheckIcon
                  :status="connStatus(c.connectionStatus, true)"
                  :tooltip="connStatus(c.connectionStatus, true) === 'error' ? c.connectionError : undefined"
                />
              </td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">
                {{ c.lastTestedAt ? new Date(c.lastTestedAt).toLocaleString() : '—' }}
              </td>
              <td>
                <div style="display:flex; gap:0.4rem; justify-content:flex-end;">
                  <Button icon="pi pi-wifi" size="small" severity="secondary" text
                    :loading="testingCaidoApiId === c.id" v-tooltip.top="'Test Connection'" @click="testCaidoApi(c)" />
                  <Button icon="pi pi-pencil" size="small" severity="secondary" text
                    v-tooltip.top="'Edit'" @click="openCaidoApiEdit(c)" />
                  <Button icon="pi pi-trash" size="small" severity="danger" text
                    v-tooltip.top="'Delete'" @click="deleteCaidoApi(c)" />
                </div>
              </td>
            </tr>
            <tr v-if="!processedItems.length && !caidoApiItems.length">
              <td colspan="5" class="ares-table-empty">No integrations configured yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Picker dialog -->
    <IntegrationPickerDialog
      v-model:visible="showPicker"
      header="Select tool"
      :options="integrationTypeOptions"
      @select="onTypePicked"
    />

    <!-- Create / Edit dialog (non-Shodan types) -->
    <ToolIntegrationFormDialog
      v-model:visible="showForm"
      :integration="editingIntegration"
      :preselected-type="pickedType"
      @saved="load"
    />

    <!-- Caido create / edit -->
    <Dialog v-model:visible="showCaidoApiForm" modal
      :header="caidoApiEditing ? 'Edit Caido integration' : 'New Caido integration'"
      :style="{ width: 'min(520px, 95vw)' }">
      <Tabs v-if="caidoApiEditing" v-model:value="caidoApiActiveTab">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="grants">Grants</Tab>
        </TabList>
      </Tabs>
      <div v-show="!caidoApiEditing || caidoApiActiveTab === 'general'"
        style="display:flex; flex-direction:column; gap:0.9rem;" :style="caidoApiEditing ? 'padding-top:1.25rem;' : ''">
        <p v-if="!caidoApiEditing" style="font-size:0.85rem; color:var(--ares-text-muted); margin:0;">
          Ares will call Caido's GraphQL API directly to push scope and pull findings.
          Caido must be reachable from the Ares server (e.g. same VPN).
        </p>
        <div>
          <label class="ares-field-label">Label</label>
          <InputText v-model="caidoApiLabel" placeholder="e.g. VPS Caido instance" style="width:100%;" />
        </div>
        <div>
          <label class="ares-field-label">Caido base URL</label>
          <InputText v-model="caidoApiBaseUrl" placeholder="http://10.0.0.5:8080" style="width:100%;" />
        </div>
        <div>
          <label class="ares-field-label">
            Access token
            <span v-if="caidoApiEditing" style="opacity:0.6; font-weight:400;"> (leave blank to keep current)</span>
          </label>
          <Password v-model="caidoApiToken" :feedback="false" toggle-mask
            placeholder="Bearer token from Caido localStorage" input-class="w-full" style="width:100%;" />
          <div v-if="!caidoApiEditing" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
            Get it from Caido's browser: <code>JSON.parse(localStorage.CAIDO_AUTHENTICATION).accessToken</code>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showCaidoApiForm = false" />
          <Button :label="caidoApiEditing ? 'Save' : 'Create'" size="small"
            :loading="savingCaidoApi"
            :disabled="!caidoApiLabel.trim() || !caidoApiBaseUrl.trim()"
            @click="submitCaidoApi" />
        </div>
      </div>
      <div v-if="caidoApiEditing && caidoApiActiveTab === 'grants'" style="padding-top:1.25rem;">
        <CaidoApiGrantsPanel :integration="caidoApiEditing" />
      </div>
    </Dialog>
  </div>
</template>
