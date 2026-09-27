<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import AgentEnrollDialog from '@/components/AgentEnrollDialog.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { agentsApi, parseCapabilities, type Agent, type AgentStatus } from '@/api/agents';

const router = useRouter();
function openAgent(a: Agent) { router.push({ name: 'agent-detail', params: { id: a.id } }); }

const toast = useToast();
const items = ref<Agent[]>([]);
const loading = ref(false);

const showEnrollDialog = ref(false);
const latestVersion = ref<string | null>(null);
const isOutdated = (a: Agent) =>
  !!latestVersion.value && !!a.version && a.version !== latestVersion.value;

// ── Sort + filter ─────────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterStatus = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const statusOptions = [
  { label: 'Online',   value: 'online'   },
  { label: 'Stale',    value: 'stale'    },
  { label: 'Offline',  value: 'offline'  },
  { label: 'Pending',  value: 'pending'  },
  { label: 'Disabled', value: 'disabled' },
];

const processedItems = computed(() => {
  let data = [...items.value];
  if (filterStatus.value.length) data = data.filter((a) => filterStatus.value.includes(a.status));
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

function statusSeverity(s: AgentStatus): 'success' | 'warn' | 'secondary' | 'danger' | 'info' {
  switch (s) {
    case 'online':   return 'success';
    case 'stale':    return 'warn';
    case 'offline':  return 'danger';
    case 'pending':  return 'info';
    case 'disabled': return 'secondary';
  }
}

function lastSeenLabel(a: Agent): string {
  if (!a.lastSeenAt) return '—';
  const ms = Date.now() - new Date(a.lastSeenAt).getTime();
  if (ms < 60_000)   return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

async function load() {
  loading.value = true;
  try {
    const [agentsRes, versionRes] = await Promise.all([
      agentsApi.list({ size: 200 }),
      agentsApi.latestVersion().catch(() => null),
    ]);
    items.value = agentsRes.items ?? (agentsRes as any);
    latestVersion.value = versionRes?.latest ?? null;
  } finally {
    loading.value = false;
  }
}

async function toggleEnabled(a: Agent) {
  try {
    const updated = await agentsApi.update(a.id, { enabled: !a.enabled });
    const idx = items.value.findIndex((x) => x.id === a.id);
    if (idx !== -1) items.value[idx] = updated;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

async function deleteAgent(a: Agent) {
  const ok = await confirmDialog({ header: 'Delete agent', message: `Delete agent "${a.name}"? This revokes its token.` });
  if (!ok) return;
  try {
    await agentsApi.delete(a.id);
    items.value = items.value.filter((x) => x.id !== a.id);
    toast.add({ severity: 'success', summary: 'Agent deleted', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

function onAgentCreated() {
  // refresh list once the dialog closes; user is currently looking at the enrollment code
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Agents</h2>
        <p class="ares-page-subtitle">Remote scan daemons that execute tasks dispatched from projects.</p>
      </div>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <Button icon="pi pi-download" text severity="secondary" size="small"
          v-tooltip.top="'Installer'" @click="$router.push({ name: 'agent-installer' })" />
        <Button icon="pi pi-plus" text size="small" v-tooltip.top="'Register agent'" @click="showEnrollDialog = true" />
      </div>
    </div>

    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else class="ares-card" style="padding:0;">
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:110px;">
              <ColumnHeader label="Status" :sortable="true"
                :sort-dir="sortCol === 'status' ? sortDir : null"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                :filter-options="statusOptions"
                :filter-value="filterStatus"
                @update:sort-dir="onSort('status', $event)"
                @update:filter-value="filterStatus = $event" />
            </th>
            <th>
              <ColumnHeader label="Name" :sortable="true"
                :sort-dir="sortCol === 'name' ? sortDir : null"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                @update:sort-dir="onSort('name', $event)" />
            </th>
            <th style="width:180px;">Hostname / platform</th>
            <th>Capabilities</th>
            <th style="width:90px;">Version</th>
            <th style="width:75px;" v-tooltip.top="'Concurrency slots — tasks the agent runs in parallel'">Slots</th>
            <th style="width:120px;">Last seen</th>
            <th style="width:120px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in processedItems" :key="a.id">
            <td data-label="Status"><AresBadge :value="a.status" :severity="statusSeverity(a.status)" /></td>
            <td data-label="Name">
              <a href="#" class="agent-name-link" @click.prevent="openAgent(a)">{{ a.name }}</a>
              <div v-if="a.description" style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.15rem;">{{ a.description }}</div>
            </td>
            <td data-label="Hostname / platform" style="font-size:0.78rem; color:var(--ares-text-muted);">
              <div v-if="a.hostname" style="font-family:monospace;">{{ a.hostname }}</div>
              <div v-if="a.platform || a.arch">{{ a.platform }}{{ a.arch ? ' / ' + a.arch : '' }}</div>
              <div v-if="!a.hostname && !a.platform">—</div>
            </td>
            <td data-label="Capabilities">
              <div v-if="parseCapabilities(a.capabilities).length" style="display:flex; flex-wrap:wrap; gap:0.25rem;">
                <span v-for="c in parseCapabilities(a.capabilities)" :key="c.tool" class="cap-chip">
                  {{ c.tool }}
                </span>
              </div>
              <span v-else style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
            </td>
            <td data-label="Version" style="font-family:monospace; font-size:0.78rem;">
              <span :class="{ 'version-outdated': isOutdated(a) }"
                v-tooltip.top="isOutdated(a) ? `Latest: ${latestVersion}` : ''">
                {{ a.version ?? '—' }}
              </span>
            </td>
            <td data-label="Slots" style="font-size:0.82rem;">{{ a.maxConcurrentTasks ?? 1 }}</td>
            <td data-label="Last seen" style="font-size:0.78rem; color:var(--ares-text-muted);">{{ lastSeenLabel(a) }}</td>
            <td data-actions style="text-align:right;">
              <Button :icon="a.enabled ? 'pi pi-pause' : 'pi pi-play'"
                text size="small" class="row-action row-action--toggle"
                v-tooltip.left="a.enabled ? 'Disable' : 'Enable'" @click="toggleEnabled(a)" />
              <Button icon="pi pi-trash" text severity="danger" size="small" class="row-action"
                v-tooltip.left="'Delete'" @click="deleteAgent(a)" />
            </td>
          </tr>
          <tr v-if="!processedItems.length">
            <td colspan="7" class="ares-table-empty">No agents registered yet. Click "Register agent" to begin.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <AgentEnrollDialog v-model:visible="showEnrollDialog" @created="onAgentCreated" />
  </div>
</template>

<style scoped>
.cap-chip {
  display: inline-block;
  padding: 0.12rem 0.45rem;
  border-radius: var(--ares-radius);
  font-family: monospace;
  font-size: 0.7rem;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-2);
}
.version-outdated {
  color: var(--p-yellow-500);
  border-bottom: 1px dotted var(--p-yellow-500);
}
.ares-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.agent-name-link {
  font-weight: 600;
  color: var(--ares-text-1);
  text-decoration: none;
}
.agent-name-link:hover { color: var(--p-primary-400); text-decoration: underline; }

/* Row-action buttons: PrimeVue's `text` variant defaults to a low-contrast muted
   tint. Bump the icon brightness so the pause/play glyph isn't ghosted on dark BGs. */
.row-action :deep(.p-button-icon) { color: var(--ares-text-1); opacity: 0.9; }
.row-action:hover :deep(.p-button-icon) { color: var(--p-primary-400); opacity: 1; }
.row-action--toggle :deep(.p-button-icon) { color: var(--p-primary-400); }
.row-action--toggle:hover :deep(.p-button-icon) { color: var(--p-primary-300); }
</style>
