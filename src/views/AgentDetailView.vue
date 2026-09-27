<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import AresBadge from '@/components/AresBadge.vue';
import { agentsApi, parseCapabilities, parseUnavailableTools, type Agent, type AgentStatus } from '@/api/agents';
import type { AgentPool } from '@/api/agent-pools';
import type { AgentTask, AgentTaskStatus } from '@/api/agent-tasks';
import { confirmDialog } from '@/composables/useConfirmDialog';

const route  = useRoute();
const router = useRouter();
const toast  = useToast();

const id = computed(() => Number(route.params.id));

const agent     = ref<Agent | null>(null);
const pools     = ref<AgentPool[]>([]);
const tasks     = ref<AgentTask[]>([]);
const taskTotal = ref(0);
const loading   = ref(false);

// Editable identity fields (mirrors the inline pattern used elsewhere).
const editing  = ref(false);
const editName = ref('');
const editDesc = ref('');
const saving   = ref(false);

async function load() {
  loading.value = true;
  try {
    const [a, p, t] = await Promise.all([
      agentsApi.get(id.value),
      agentsApi.pools(id.value).catch(() => []),
      agentsApi.tasks(id.value, { page: 0, size: 20 }).catch(() => ({ items: [], total: 0, totalPages: 0 })),
    ]);
    agent.value     = a;
    pools.value     = p;
    tasks.value     = t.items;
    taskTotal.value = t.total;
  } finally { loading.value = false; }
}

const editConcurrency = ref<number>(1);

function startEdit() {
  if (!agent.value) return;
  editName.value = agent.value.name;
  editDesc.value = agent.value.description ?? '';
  editConcurrency.value = agent.value.maxConcurrentTasks ?? 1;
  editing.value  = true;
}

async function saveEdit() {
  if (!agent.value) return;
  saving.value = true;
  try {
    agent.value = await agentsApi.update(agent.value.id, {
      name: editName.value.trim() || agent.value.name,
      description: editDesc.value,
      maxConcurrentTasks: Math.max(1, Math.min(16, Math.floor(editConcurrency.value || 1))),
    });
    editing.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally { saving.value = false; }
}

async function toggleEnabled() {
  if (!agent.value) return;
  try {
    agent.value = await agentsApi.update(agent.value.id, { enabled: !agent.value.enabled });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

async function deleteAgent() {
  if (!agent.value) return;
  const ok = await confirmDialog({ header: 'Delete agent', message: `Delete agent "${agent.value.name}"? This revokes its token.` });
  if (!ok) return;
  try {
    await agentsApi.delete(agent.value.id);
    toast.add({ severity: 'success', summary: 'Agent deleted', life: 3000 });
    router.push({ name: 'agents' });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

function statusSeverity(s: AgentStatus): 'success' | 'warn' | 'secondary' | 'danger' | 'info' {
  switch (s) {
    case 'online':   return 'success';
    case 'stale':    return 'warn';
    case 'offline':  return 'danger';
    case 'pending':  return 'info';
    case 'disabled': return 'secondary';
  }
}

function taskStatusSeverity(s: AgentTaskStatus): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
  switch (s) {
    case 'completed':            return 'success';
    case 'failed':               return 'danger';
    case 'running':
    case 'dispatched':
    case 'uploading':            return 'info';
    case 'cancelled':            return 'secondary';
    case 'pending':              return 'warn';
  }
}

function ageLabel(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)   return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function argsSummary(json: string): string {
  try {
    const o = JSON.parse(json || '{}');
    const targets = Array.isArray(o.targets) ? o.targets : (o.targets ? [o.targets] : []);
    if (!targets.length) return '';
    return targets.length === 1 ? targets[0] : `${targets[0]} +${targets.length - 1}`;
  } catch { return ''; }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <Button icon="pi pi-arrow-left" text size="small"
          v-tooltip.right="'Agents'" @click="$router.push({ name: 'agents' })" />
        <h2 v-if="agent" class="ares-page-title" style="margin-top:0.4rem;">
          <i class="pi pi-bolt" style="margin-right:0.4rem;" />
          {{ agent.name }}
          <AresBadge :value="agent.status" :severity="statusSeverity(agent.status)" style="margin-left:0.6rem;" />
        </h2>
      </div>
      <div v-if="agent" style="display:flex; gap:0.5rem; align-items:center;">
        <Button :icon="agent.enabled ? 'pi pi-pause' : 'pi pi-play'"
          v-tooltip.top="agent.enabled ? 'Disable' : 'Enable'"
          text severity="secondary" size="small" @click="toggleEnabled" />
        <Button icon="pi pi-trash" v-tooltip.top="'Delete'" text severity="danger" size="small" @click="deleteAgent" />
      </div>
    </div>

    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else-if="!agent" class="ares-card" style="padding:1rem; color:var(--ares-text-muted);">
      Agent not found.
    </div>

    <div v-else class="agent-grid">
      <!-- ── Identity ───────────────────────────────────────────────── -->
      <section class="ares-card" style="padding:1rem;">
        <div class="card-head">
          <h3>Identity</h3>
          <Button v-if="!editing" icon="pi pi-pencil" text size="small" v-tooltip.left="'Edit'" @click="startEdit" />
        </div>

        <template v-if="!editing">
          <div class="kv">
            <div class="kv-row"><div class="kv-k">Name</div>           <div class="kv-v">{{ agent.name }}</div></div>
            <div class="kv-row"><div class="kv-k">Description</div>    <div class="kv-v">{{ agent.description || '—' }}</div></div>
            <div class="kv-row"><div class="kv-k">Hostname</div>       <div class="kv-v mono">{{ agent.hostname ?? '—' }}</div></div>
            <div class="kv-row"><div class="kv-k">Platform</div>       <div class="kv-v">{{ agent.platform ?? '—' }}{{ agent.arch ? ' / ' + agent.arch : '' }}</div></div>
            <div class="kv-row"><div class="kv-k">Version</div>        <div class="kv-v mono">{{ agent.version ?? '—' }}</div></div>
            <div class="kv-row"><div class="kv-k">Enabled</div>        <div class="kv-v">{{ agent.enabled ? 'Yes' : 'No' }}</div></div>
            <div class="kv-row"><div class="kv-k">Concurrency</div>    <div class="kv-v">{{ agent.maxConcurrentTasks ?? 1 }} slot{{ (agent.maxConcurrentTasks ?? 1) !== 1 ? 's' : '' }}</div></div>
            <div class="kv-row"><div class="kv-k">Enrolled</div>       <div class="kv-v">{{ agent.enrolled ? 'Yes' : 'No (pending)' }}</div></div>
            <div class="kv-row"><div class="kv-k">Registered</div>     <div class="kv-v">{{ new Date(agent.registeredAt).toLocaleString() }}</div></div>
            <div class="kv-row"><div class="kv-k">Last seen</div>      <div class="kv-v">{{ ageLabel(agent.lastSeenAt) }}<span v-if="agent.lastSeenAt" style="color:var(--ares-text-muted); margin-left:0.5rem;">({{ new Date(agent.lastSeenAt).toLocaleString() }})</span></div></div>
          </div>
        </template>

        <template v-else>
          <div style="display:flex; flex-direction:column; gap:0.7rem;">
            <div>
              <label class="ares-field-label">Name</label>
              <InputText v-model="editName" style="width:100%;" />
            </div>
            <div>
              <label class="ares-field-label">Description</label>
              <Textarea v-model="editDesc" rows="3" style="width:100%;" auto-resize />
            </div>
            <div>
              <label class="ares-field-label">Concurrency (slots)</label>
              <InputNumber v-model="editConcurrency" :min="1" :max="16"
                show-buttons :input-style="{ width: '70px' }" />
              <p style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.25rem;">
                How many tasks this agent is allowed to run in parallel. Default 1.
              </p>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
              <Button label="Cancel" severity="secondary" size="small" @click="editing = false" />
              <Button label="Save" size="small" :loading="saving" @click="saveEdit" />
            </div>
          </div>
        </template>
      </section>

      <!-- ── Capabilities + Pools ───────────────────────────────────── -->
      <section class="ares-card" style="padding:1rem;">
        <div class="card-head"><h3>Capabilities</h3></div>
        <div v-if="parseCapabilities(agent.capabilities).length" style="display:flex; flex-wrap:wrap; gap:0.35rem;">
          <span v-for="c in parseCapabilities(agent.capabilities)" :key="c.tool" class="cap-chip"
            v-tooltip.top="c.path + (c.version ? ' · ' + c.version : '')">
            {{ c.tool }}<span v-if="c.version" class="cap-ver"> {{ c.version }}</span>
          </span>
        </div>
        <div v-else style="color:var(--ares-text-muted); font-size:0.8rem;">
          Agent hasn't reported any installed tools yet.
        </div>

        <template v-if="parseUnavailableTools(agent.unavailableTools).length">
          <div class="card-head" style="margin-top:1rem;">
            <h3 style="font-size:0.82rem; color:var(--ares-text-muted);">Unavailable tools</h3>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.3rem;">
            <div v-for="u in parseUnavailableTools(agent.unavailableTools)" :key="u.toolId"
              style="display:flex; align-items:baseline; gap:0.5rem; font-size:0.8rem;">
              <span class="cap-chip cap-chip--unavailable">{{ u.toolId }}</span>
              <span style="color:var(--ares-text-muted);">{{ u.reason }}</span>
            </div>
          </div>
        </template>

        <div class="card-head" style="margin-top:1.2rem;"><h3>Pool memberships</h3></div>
        <div v-if="pools.length" style="display:flex; flex-direction:column; gap:0.4rem;">
          <router-link v-for="p in pools" :key="p.id" :to="{ name: 'agent-pools' }" class="pool-row">
            <div>
              <div style="font-weight:600;">{{ p.name }}</div>
              <div v-if="p.description" style="font-size:0.72rem; color:var(--ares-text-muted);">{{ p.description }}</div>
            </div>
            <i v-if="!p.enabled" class="pi pi-pause" v-tooltip.left="'Pool disabled'" style="color:var(--p-yellow-500);" />
          </router-link>
        </div>
        <div v-else style="color:var(--ares-text-muted); font-size:0.8rem;">
          This agent doesn't belong to any pool. Add it from <router-link :to="{ name: 'agent-pools' }">Agent pools</router-link>.
        </div>
      </section>

      <!-- ── Recent tasks ──────────────────────────────────────────── -->
      <section class="ares-card" style="padding:0; grid-column: 1 / -1;">
        <div class="card-head" style="padding:0.75rem 1rem 0;">
          <h3>Recent tasks <span style="font-weight:400; color:var(--ares-text-muted); font-size:0.78rem;">({{ taskTotal }} total)</span></h3>
        </div>
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:110px;">Status</th>
              <th>Name / tool</th>
              <th>Args</th>
              <th style="width:130px;">Created</th>
              <th style="width:130px;">Completed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tasks" :key="t.id">
              <td><AresBadge :value="t.status" :severity="taskStatusSeverity(t.status)" /></td>
              <td>
                <div v-if="t.name" style="font-weight:600;">{{ t.name }}</div>
                <code style="font-family:monospace; font-size:0.72rem; color:var(--ares-text-muted);">{{ t.tool }}</code>
              </td>
              <td style="font-family:monospace; font-size:0.78rem; color:var(--ares-text-2);">{{ argsSummary(t.args) }}</td>
              <td style="font-size:0.78rem; color:var(--ares-text-muted);">{{ ageLabel(t.createdAt) }}</td>
              <td style="font-size:0.78rem; color:var(--ares-text-muted);">{{ ageLabel(t.completedAt) }}</td>
            </tr>
            <tr v-if="!tasks.length">
              <td colspan="5" class="ares-table-empty">No tasks claimed by this agent yet.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<style scoped>
.agent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 900px) {
  .agent-grid { grid-template-columns: 1fr; }
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.card-head h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--ares-text-1);
}
.kv { display: flex; flex-direction: column; gap: 0.45rem; }
.kv-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.5rem;
  align-items: baseline;
}
.kv-k {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ares-text-muted);
}
.kv-v { font-size: 0.85rem; color: var(--ares-text-1); }
.kv-v.mono { font-family: monospace; font-size: 0.8rem; }
.cap-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.18rem 0.55rem;
  border-radius: var(--ares-radius);
  font-family: monospace;
  font-size: 0.72rem;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-2);
}
.cap-ver { font-size: 0.65rem; color: var(--ares-text-muted); }
.cap-chip--unavailable {
  opacity: 0.65;
  border-style: dashed;
}
.pool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-sunken);
  color: var(--ares-text-1);
  text-decoration: none;
}
.pool-row:hover { border-color: var(--p-primary-400); }
.ares-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
