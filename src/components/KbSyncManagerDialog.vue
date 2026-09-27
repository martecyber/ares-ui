<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import KbScheduleDialog from '@/components/KbScheduleDialog.vue';
import { cveApi, cisaKevApi, vulncheckKevApi, type CveSyncStats, type CisaKevSyncStats, type VulnCheckKevSyncStats } from '@/api/kb';

const props = defineProps<{ visible: boolean }>();
defineEmits<{ 'update:visible': [boolean] }>();

const cveStats = ref<CveSyncStats | null>(null);
const kevStats = ref<CisaKevSyncStats | null>(null);
const vcStats  = ref<VulnCheckKevSyncStats | null>(null);

const syncingCveUpdate = ref(false);
const syncingCveFull   = ref(false);
const syncingKevUpdate = ref(false);
const syncingKevFull   = ref(false);
const syncingVcUpdate  = ref(false);
const syncingVcFull    = ref(false);

const cveMsg = ref<string | null>(null);
const kevMsg = ref<string | null>(null);
const vcMsg  = ref<string | null>(null);
const cveMsgError = ref(false);
const kevMsgError = ref(false);
const vcMsgError  = ref(false);

/** Extracts the real backend detail (RFC 7807 ProblemDetail) instead of a generic string. */
function errorDetail(e: any, fallback: string): string {
  return e?.response?.data?.detail ?? e?.message ?? fallback;
}

const showCveSchedule = ref(false);
const showKevSchedule = ref(false);
const showVcSchedule  = ref(false);

const editingVcKey = ref(false);
const vcApiKeyInput = ref('');
const savingVcKey = ref(false);

async function loadStats() {
  cveStats.value = await cveApi.stats().catch(() => null);
  kevStats.value = await cisaKevApi.stats().catch(() => null);
  vcStats.value  = await vulncheckKevApi.stats().catch(() => null);
}

watch(() => props.visible, (open) => {
  if (!open) return;
  cveMsg.value = null;
  kevMsg.value = null;
  vcMsg.value = null;
  cveMsgError.value = false;
  kevMsgError.value = false;
  vcMsgError.value = false;
  editingVcKey.value = false;
  vcApiKeyInput.value = '';
  loadStats();
});

async function cveUpdate() {
  syncingCveUpdate.value = true;
  cveMsg.value = null;
  try {
    const r = await cveApi.sync();
    cveMsgError.value = false;
    cveMsg.value = `Update queued (job #${r.jobId}). Only changed CVEs will be processed.`;
    setTimeout(loadStats, 8000);
  } catch (e: any) {
    cveMsgError.value = true;
    cveMsg.value = errorDetail(e, 'Failed to trigger update.');
  } finally {
    syncingCveUpdate.value = false;
  }
}

async function cveFull() {
  syncingCveFull.value = true;
  cveMsg.value = null;
  try {
    const r = await cveApi.syncFull();
    cveMsgError.value = false;
    cveMsg.value = `Full download queued (job #${r.jobId}). Processing all ~250k CVEs — this may take several minutes.`;
    setTimeout(loadStats, 15000);
  } catch (e: any) {
    cveMsgError.value = true;
    cveMsg.value = errorDetail(e, 'Failed to trigger full download.');
  } finally {
    syncingCveFull.value = false;
  }
}

async function kevUpdate() {
  syncingKevUpdate.value = true;
  kevMsg.value = null;
  try {
    const r = await cisaKevApi.sync();
    kevMsgError.value = false;
    kevMsg.value = `Update queued (job #${r.jobId}).`;
    setTimeout(loadStats, 8000);
  } catch (e: any) {
    kevMsgError.value = true;
    kevMsg.value = errorDetail(e, 'Failed to trigger update.');
  } finally {
    syncingKevUpdate.value = false;
  }
}

async function kevFull() {
  syncingKevFull.value = true;
  kevMsg.value = null;
  try {
    const r = await cisaKevApi.syncFull();
    kevMsgError.value = false;
    kevMsg.value = `Full download queued (job #${r.jobId}). Existing KEV data will be cleared and re-fetched from scratch.`;
    setTimeout(loadStats, 8000);
  } catch (e: any) {
    kevMsgError.value = true;
    kevMsg.value = errorDetail(e, 'Failed to trigger full download.');
  } finally {
    syncingKevFull.value = false;
  }
}

async function saveVcApiKey() {
  if (!vcApiKeyInput.value.trim()) return;
  savingVcKey.value = true;
  vcMsg.value = null;
  try {
    await vulncheckKevApi.setApiKey(vcApiKeyInput.value.trim());
    vcApiKeyInput.value = '';
    editingVcKey.value = false;
    vcMsgError.value = false;
    vcMsg.value = 'API key saved.';
    loadStats();
  } catch (e: any) {
    vcMsgError.value = true;
    vcMsg.value = errorDetail(e, 'Failed to save API key.');
  } finally {
    savingVcKey.value = false;
  }
}

async function vcUpdate() {
  syncingVcUpdate.value = true;
  vcMsg.value = null;
  try {
    const r = await vulncheckKevApi.sync();
    vcMsgError.value = false;
    vcMsg.value = `Update queued (job #${r.jobId}).`;
    setTimeout(loadStats, 8000);
  } catch (e: any) {
    vcMsgError.value = true;
    vcMsg.value = errorDetail(e, 'Failed to trigger update.');
  } finally {
    syncingVcUpdate.value = false;
  }
}

async function vcFull() {
  syncingVcFull.value = true;
  vcMsg.value = null;
  try {
    const r = await vulncheckKevApi.syncFull();
    vcMsgError.value = false;
    vcMsg.value = `Full download queued (job #${r.jobId}). Existing VulnCheck KEV data will be cleared and re-fetched from scratch.`;
    setTimeout(loadStats, 8000);
  } catch (e: any) {
    vcMsgError.value = true;
    vcMsg.value = errorDetail(e, 'Failed to trigger full download.');
  } finally {
    syncingVcFull.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="CVE Data Sources"
    modal
    style="width:40rem;"
    @update:visible="$emit('update:visible', $event)"
  >
    <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.25rem;">

      <!-- CVE row -->
      <div class="sync-row">
        <div class="sync-row-head">
          <div class="sync-row-title">CVE <span class="sync-row-sub">NVD / MITRE</span></div>
          <div v-if="cveStats" class="sync-row-stats">
            {{ cveStats.total.toLocaleString() }} entries
            <span v-if="cveStats.lastSync"> · Last sync {{ new Date(cveStats.lastSync).toLocaleString() }}</span>
            <span v-if="!cveStats.synced" class="sync-row-warn"> · Not synced yet</span>
          </div>
        </div>
        <div class="sync-row-actions">
          <Button
            size="small" severity="secondary" icon="pi pi-download"
            :label="syncingCveFull ? 'Queuing...' : 'Full Download'"
            :disabled="syncingCveFull || syncingCveUpdate"
            title="Re-process all CVEs from scratch (~250k files, takes several minutes)"
            @click="cveFull"
          />
          <Button
            size="small" severity="secondary" icon="pi pi-refresh"
            :label="syncingCveUpdate ? 'Queuing...' : 'Update'"
            :disabled="!cveStats?.synced || syncingCveFull || syncingCveUpdate"
            :title="cveStats?.synced ? 'Fetch latest commits and process only changed CVEs' : 'Run a Full Download first'"
            @click="cveUpdate"
          />
          <Button
            size="small" severity="secondary" icon="pi pi-calendar" label="Schedule"
            :disabled="!cveStats?.synced"
            :title="cveStats?.synced ? 'Schedule automatic updates' : 'Run a Full Download first'"
            @click="showCveSchedule = true"
          />
        </div>
        <p v-if="cveMsg" class="sync-row-msg" :class="{ 'sync-row-msg--error': cveMsgError }">{{ cveMsg }}</p>
      </div>

      <!-- CISA KEV row -->
      <div class="sync-row">
        <div class="sync-row-head">
          <div class="sync-row-title">CISA KEV</div>
          <div v-if="kevStats" class="sync-row-stats">
            {{ kevStats.total.toLocaleString() }} entries
            <span v-if="kevStats.lastSync"> · Last sync {{ new Date(kevStats.lastSync).toLocaleString() }}</span>
            <span v-if="!kevStats.synced" class="sync-row-warn"> · Not synced yet</span>
          </div>
        </div>
        <div class="sync-row-actions">
          <Button
            size="small" severity="secondary" icon="pi pi-download"
            :label="syncingKevFull ? 'Queuing...' : 'Full Download'"
            :disabled="syncingKevFull || syncingKevUpdate"
            title="Clear the existing KEV catalog and re-fetch it from scratch"
            @click="kevFull"
          />
          <Button
            size="small" severity="secondary" icon="pi pi-refresh"
            :label="syncingKevUpdate ? 'Queuing...' : 'Update'"
            :disabled="!kevStats?.synced || syncingKevFull || syncingKevUpdate"
            :title="kevStats?.synced ? 'Re-fetch the KEV catalog and update existing entries' : 'Run a Full Download first'"
            @click="kevUpdate"
          />
          <Button
            size="small" severity="secondary" icon="pi pi-calendar" label="Schedule"
            :disabled="!kevStats?.synced"
            :title="kevStats?.synced ? 'Schedule automatic updates' : 'Run a Full Download first'"
            @click="showKevSchedule = true"
          />
        </div>
        <p v-if="kevMsg" class="sync-row-msg" :class="{ 'sync-row-msg--error': kevMsgError }">{{ kevMsg }}</p>
      </div>

      <!-- VulnCheck KEV row -->
      <div class="sync-row">
        <div class="sync-row-head">
          <div class="sync-row-title">VulnCheck KEV <span class="sync-row-sub">extended, community tier</span></div>
          <div v-if="vcStats" class="sync-row-stats">
            {{ vcStats.total.toLocaleString() }} entries
            <span v-if="vcStats.lastSync"> · Last sync {{ new Date(vcStats.lastSync).toLocaleString() }}</span>
            <span v-if="!vcStats.synced" class="sync-row-warn"> · Not synced yet</span>
          </div>
        </div>

        <div v-if="(vcStats && !vcStats.apiKeyConfigured) || editingVcKey" style="display:flex; gap:0.5rem; margin-bottom:0.6rem;">
          <InputText
            v-model="vcApiKeyInput"
            type="password"
            placeholder="VulnCheck API key"
            style="flex:1;"
            @keyup.enter="saveVcApiKey"
          />
          <Button
            size="small" icon="pi pi-check" label="Save"
            :loading="savingVcKey" :disabled="!vcApiKeyInput.trim()"
            @click="saveVcApiKey"
          />
          <Button
            v-if="editingVcKey"
            size="small" severity="secondary" label="Cancel"
            @click="editingVcKey = false; vcApiKeyInput = ''"
          />
        </div>

        <div class="sync-row-actions">
          <Button
            size="small" severity="secondary" icon="pi pi-download"
            :label="syncingVcFull ? 'Queuing...' : 'Full Download'"
            :disabled="!vcStats?.apiKeyConfigured || syncingVcFull || syncingVcUpdate"
            :title="vcStats?.apiKeyConfigured ? 'Clear the existing VulnCheck KEV catalog and re-fetch it from scratch' : 'Set an API key first'"
            @click="vcFull"
          />
          <Button
            size="small" severity="secondary" icon="pi pi-refresh"
            :label="syncingVcUpdate ? 'Queuing...' : 'Update'"
            :disabled="!vcStats?.synced || !vcStats?.apiKeyConfigured || syncingVcFull || syncingVcUpdate"
            :title="vcStats?.synced ? 'Re-fetch the VulnCheck KEV catalog and update existing entries' : 'Run a Full Download first'"
            @click="vcUpdate"
          />
          <Button
            size="small" severity="secondary" icon="pi pi-calendar" label="Schedule"
            :disabled="!vcStats?.synced"
            :title="vcStats?.synced ? 'Schedule automatic updates' : 'Run a Full Download first'"
            @click="showVcSchedule = true"
          />
          <Button
            v-if="vcStats?.apiKeyConfigured && !editingVcKey"
            size="small" text icon="pi pi-key" label="Change API key"
            @click="editingVcKey = true"
          />
        </div>
        <p v-if="vcMsg" class="sync-row-msg" :class="{ 'sync-row-msg--error': vcMsgError }">{{ vcMsg }}</p>
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <Button label="Close" severity="secondary" size="small" @click="$emit('update:visible', false)" />
      </div>
    </div>
  </Dialog>

  <KbScheduleDialog v-model:visible="showCveSchedule" sync-type="cve_update" label="CVE — Update" />
  <KbScheduleDialog v-model:visible="showKevSchedule" sync-type="cisa_kev" label="CISA KEV" />
  <KbScheduleDialog v-model:visible="showVcSchedule" sync-type="vulncheck_kev" label="VulnCheck KEV" />
</template>

<style scoped>
.sync-row {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.85rem 1rem;
  background: var(--ares-surface);
}
.sync-row-head { margin-bottom: 0.65rem; }
.sync-row-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ares-text-2);
}
.sync-row-sub {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--ares-text-muted);
  margin-left: 0.35rem;
}
.sync-row-stats {
  font-size: 0.75rem;
  color: var(--ares-text-muted);
  margin-top: 0.2rem;
}
.sync-row-warn { color: var(--ares-warning); }
.sync-row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.sync-row-msg { font-size: 0.78rem; color: var(--ares-success); margin: 0.5rem 0 0; }
.sync-row-msg--error { color: var(--ares-error); }
</style>
