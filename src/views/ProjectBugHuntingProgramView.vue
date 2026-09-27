<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import AresBadge from '@/components/AresBadge.vue';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Dialog from 'primevue/dialog';
import {
  bugHuntingProgramsApi,
  PLATFORM_LABELS,
  type BugHuntingProgram,
  type BugHuntingPlatform,
} from '@/api/bugHuntingPrograms';
import { projectsApi, type Project } from '@/api/projects';
import { vdpIntegrationsApi } from '@/api/vdp-integrations';
import type { ToolIntegration } from '@/api/tool-integrations';
import { useContextStore } from '@/stores/context';
import { pluginRequiredError } from '@/api/plugin-error';

const route = useRoute();
const context = useContextStore();
const engId = computed(() => Number(route.params.engId));

// Restricted to values that map onto a clean cron step (24h is "once daily", not "every 24h" —
// an hour field can't express a step of 24) — mirrors the backend's own allow-list
// (BugHuntingProgramService.ALLOWED_SYNC_INTERVAL_HOURS), since this schedule is now backed by a
// real Workflow TRIGGER_CRON node (Workflows Phase H+), not a free-form "every N hours" field.
const SYNC_INTERVAL_OPTIONS = [
  { label: 'Every hour', value: 1 },
  { label: 'Every 2 hours', value: 2 },
  { label: 'Every 3 hours', value: 3 },
  { label: 'Every 4 hours', value: 4 },
  { label: 'Every 6 hours', value: 6 },
  { label: 'Every 8 hours', value: 8 },
  { label: 'Every 12 hours', value: 12 },
  { label: 'Once daily', value: 24 },
];

const project = ref<Project | null>(null);
const program = ref<BugHuntingProgram | null>(null);
const availableIntegrations = ref<ToolIntegration[]>([]);
const loading = ref(true);
const saving = ref(false);
const syncing = ref(false);
const disconnecting = ref(false);
const error = ref('');
const successMsg = ref('');
const showDisconnectDialog = ref(false);
/** Set when the Bug Hunting plugin (or a platform sub-plugin) isn't installed/enabled — see
 *  pluginRequiredError's own doc. Distinct from `error`: this hides the whole config UI instead
 *  of just showing an inline message, since nothing on this page can work without it. */
const pluginMissing = ref('');

// Form state (mirrors program config)
const form = ref({
  integrationId: null as number | null,
  programHandle: '',
  syncEnabled: true,
  syncIntervalHours: 24,
});

const isGeneric = computed(() => project.value?.typeCode === 'BH');

// Once a programme is loaded, its own `platform` field (resolved server-side, where the platform
// plugins that actually know the BH_* -> platform mapping live) is authoritative. Before that —
// a project that's never been connected yet has no programme row to read from — this falls back
// to a client-side guess from the project's own type code, purely to pick the right integration
// list/placeholder text before the user has saved anything.
const platform = computed((): BugHuntingPlatform => {
  if (program.value) return program.value.platform;
  const code = project.value?.typeCode ?? 'BH';
  const map: Record<string, BugHuntingPlatform> = {
    BH_BC:  'bugcrowd',
    BH_YWH: 'yeswehack',
    BH_INTG: 'intigriti',
    BH_H1:  'hackerone',
    BH:     'generic',
  };
  return map[code] ?? 'generic';
});

const filteredIntegrations = computed(() =>
  availableIntegrations.value.filter((i) => i.type === platform.value)
);

const integrationOptions = computed(() =>
  filteredIntegrations.value.map((i) => ({ label: i.name, value: i.id }))
);

const syncStatusSeverity = computed(() => {
  switch (program.value?.lastSyncStatus) {
    case 'success': return 'success';
    case 'failed':  return 'danger';
    case 'partial': return 'warn';
    default:        return 'secondary';
  }
});

async function load() {
  loading.value = true;
  try {
    project.value = await projectsApi.get(engId.value);
    if (project.value) {
      context.setProject({ id: project.value.id, name: project.value.name, code: project.value.code, typeCode: project.value.typeCode ?? null, supertypeCode: project.value.supertypeCode ?? null, clientsCanViewDetections: project.value.clientsCanViewDetections ?? false });
    }
    // Load BH program config (may 404 if not yet configured — or, distinctly, if the Bug
    // Hunting plugin itself isn't installed/enabled, which carries a pluginId and must not be
    // silently swallowed the same way).
    try {
      program.value = await bugHuntingProgramsApi.get(engId.value);
      if (program.value) {
        form.value = {
          integrationId: program.value.integrationId,
          programHandle: program.value.programHandle ?? '',
          syncEnabled: program.value.syncEnabled,
          syncIntervalHours: program.value.syncIntervalHours,
        };
      }
    } catch (e) {
      const pluginErr = pluginRequiredError(e);
      if (pluginErr) pluginMissing.value = pluginErr.message;
      // else: plain 404 = not yet configured, nothing to show
    }

    // Load integrations matching the platform — includes Bugcrowd/YesWeHack, whose
    // connections now live under Data Sources even though the platform itself is unchanged.
    const res = await vdpIntegrationsApi.bugHuntingProgramPlatformIntegrations();
    availableIntegrations.value = res.items;
  } finally {
    loading.value = false;
  }
}

async function save() {
  error.value = '';
  successMsg.value = '';
  saving.value = true;
  try {
    program.value = await bugHuntingProgramsApi.upsert(engId.value, {
      integrationId: isGeneric.value ? undefined : form.value.integrationId ?? undefined,
      programHandle: isGeneric.value ? undefined : form.value.programHandle || undefined,
      syncEnabled: form.value.syncEnabled,
      syncIntervalHours: form.value.syncIntervalHours,
    });
    successMsg.value = 'Configuration saved.';
  } catch (e: any) {
    error.value = pluginRequiredError(e)?.message ?? e?.response?.data?.detail ?? e?.message ?? 'Failed to save.';
  } finally {
    saving.value = false;
  }
}

async function syncNow() {
  error.value = '';
  syncing.value = true;
  try {
    const jobId = await bugHuntingProgramsApi.triggerSync(engId.value);
    successMsg.value = `Sync started (job #${jobId}). Scope will update shortly.`;
    // Refresh program data after a brief delay to pick up updated lastSyncAt
    setTimeout(async () => {
      try { program.value = await bugHuntingProgramsApi.get(engId.value); } catch { /* ignore */ }
    }, 3000);
  } catch (e: any) {
    error.value = pluginRequiredError(e)?.message ?? e?.response?.data?.detail ?? e?.message ?? 'Failed to start sync.';
  } finally {
    syncing.value = false;
  }
}

async function disconnect() {
  error.value = '';
  disconnecting.value = true;
  try {
    await bugHuntingProgramsApi.disconnect(engId.value);
    program.value = null;
    form.value = { integrationId: null, programHandle: '', syncEnabled: true, syncIntervalHours: 24 };
    showDisconnectDialog.value = false;
    successMsg.value = 'Programme disconnected. All imported scope entries have been removed.';
  } catch (e: any) {
    error.value = pluginRequiredError(e)?.message ?? e?.response?.data?.detail ?? e?.message ?? 'Failed to disconnect.';
  } finally {
    disconnecting.value = false;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.25rem;">
      <div>
        <h2 class="ares-page-title">
          <i class="pi pi-bug" style="margin-right:0.4rem;" />Programme
        </h2>
        <p class="ares-page-subtitle">
          {{ isGeneric
            ? 'Generic Bug Hunting programme — scope is managed manually.'
            : `Link a ${PLATFORM_LABELS[platform]} integration to auto-sync the programme scope.` }}
        </p>
      </div>
      <div v-if="program && !isGeneric" style="display:flex;gap:0.5rem;align-items:center;">
        <Button
          icon="pi pi-sync"
          text
          size="small"
          :loading="syncing"
          v-tooltip.top="'Sync now'"
          @click="syncNow"
        />
        <Button
          icon="pi pi-times"
          text
          size="small"
          severity="danger"
          v-tooltip.top="'Disconnect'"
          @click="showDisconnectDialog = true"
        />
      </div>
    </div>

    <div v-if="loading" class="ares-table-empty"><ProgressSpinner style="width:32px;height:32px;" /></div>

    <div v-else style="display:flex;flex-direction:column;gap:1.5rem;max-width:560px;">

      <Message v-if="pluginMissing" severity="warn" :closable="false">{{ pluginMissing }}</Message>

      <!-- Status panel (when connected) -->
      <div v-if="program && !isGeneric" style="background:var(--ares-surface-card);border:1px solid var(--ares-border);border-radius: var(--ares-radius);padding:1rem;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;font-size:0.83rem;">
          <span style="color:var(--ares-text-muted);">Last sync</span>
          <span>{{ formatDate(program.lastSyncAt) }}</span>
          <span style="color:var(--ares-text-muted);">Status</span>
          <AresBadge
            :value="program.lastSyncStatus ?? 'never'"
            :severity="syncStatusSeverity"
            style="font-size:0.78rem;"
          />
          <template v-if="program.lastSyncError">
            <span style="color:var(--ares-text-muted);">Error</span>
            <span style="color:var(--ares-danger);word-break:break-word;">{{ program.lastSyncError }}</span>
          </template>
        </div>
      </div>

      <!-- Config form -->
      <div v-if="!isGeneric && !pluginMissing" style="display:flex;flex-direction:column;gap:0.75rem;">
        <label style="font-size:0.83rem;font-weight:500;">Integration
          <span style="color:var(--ares-text-muted);font-weight:400;"> ({{ PLATFORM_LABELS[platform] }})</span>
        </label>
        <Select
          v-model="form.integrationId"
          :options="integrationOptions"
          option-label="label"
          option-value="value"
          placeholder="Select integration…"
          class="w-full"
        />
        <small v-if="filteredIntegrations.length === 0" style="color:var(--ares-text-muted);">
          No {{ PLATFORM_LABELS[platform] }} integrations found. Create one in
          <router-link :to="{ name: 'vdp-integrations' }">Bug Hunting Platforms</router-link>.
        </small>

        <label style="font-size:0.83rem;font-weight:500;margin-top:0.25rem;">Programme handle / slug</label>
        <InputText v-model="form.programHandle"
          :placeholder="platform === 'intigriti' ? 'companyHandle/programHandle' : 'e.g. my-program'"
          class="w-full" />
        <small v-if="platform === 'intigriti'" style="color:var(--ares-text-muted);">
          Use the programme URL slug: <code>companyHandle/programHandle</code><br/>
          e.g. <code>allegro/allegrobugbounty</code> from
          <em>app.intigriti.com/researcher/programs/<strong>allegro/allegrobugbounty</strong>/tac/detail</em>
        </small>

        <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.25rem;">
          <ToggleSwitch v-model="form.syncEnabled" />
          <span style="font-size:0.83rem;">Auto-sync enabled</span>
        </div>

        <label style="font-size:0.83rem;font-weight:500;margin-top:0.25rem;">Sync interval</label>
        <Select v-model="form.syncIntervalHours" :options="SYNC_INTERVAL_OPTIONS"
          option-label="label" option-value="value" class="w-full" />
      </div>

      <div v-if="isGeneric" style="color:var(--ares-text-muted);font-size:0.85rem;line-height:1.6;">
        This is a generic Bug Hunting project. Scope entries are managed manually from the
        <router-link :to="{ name: 'org-project-scope', params: $route.params }">Scope</router-link> tab.
        No external platform integration is available for this type.
      </div>

      <Message v-if="error"       severity="error"   :closable="false">{{ error }}</Message>
      <Message v-if="successMsg"  severity="success" :closable="false">{{ successMsg }}</Message>

      <div v-if="!isGeneric && !pluginMissing" style="display:flex;gap:0.5rem;">
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </div>
    </div>

    <!-- Disconnect confirmation dialog -->
    <Dialog v-model:visible="showDisconnectDialog" header="Disconnect programme?" modal style="width:26rem;">
      <p style="margin:0 0 1rem;font-size:0.9rem;">
        This will remove the link to {{ PLATFORM_LABELS[platform] }} and
        <strong>delete all imported scope entries</strong> for this project. Manually added entries are kept.
      </p>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" @click="showDisconnectDialog = false" />
        <Button label="Disconnect" severity="danger" :loading="disconnecting" @click="disconnect" />
      </div>
    </Dialog>
  </div>
</template>
