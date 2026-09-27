<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import { agentPoolsApi, type AgentPool } from '@/api/agent-pools';
import { agentsApi, type Agent } from '@/api/agents';

const props = defineProps<{ visible: boolean; pool: AgentPool | null }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'saved'): void }>();

const toast = useToast();
const allAgents  = ref<Agent[]>([]);
const selected   = ref<Set<number>>(new Set());
const search     = ref('');
const loading    = ref(false);
const saving     = ref(false);

watch(() => props.visible, async (v) => {
  if (!v || !props.pool) return;
  loading.value = true;
  try {
    const [agents, members] = await Promise.all([
      agentsApi.list({ size: 500 }),
      agentPoolsApi.listMembers(props.pool.id),
    ]);
    allAgents.value = agents.items ?? (agents as any);
    selected.value = new Set(members);
  } finally {
    loading.value = false;
  }
});

const visibleAgents = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q
    ? allAgents.value.filter((a) =>
        a.name.toLowerCase().includes(q) || (a.hostname ?? '').toLowerCase().includes(q))
    : allAgents.value;
});

function toggle(id: number) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next;
}

async function save() {
  if (!props.pool) return;
  saving.value = true;
  try {
    await agentPoolsApi.setMembers(props.pool.id, Array.from(selected.value));
    toast.add({ severity: 'success', summary: 'Members updated', life: 3000 });
    emit('saved');
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)"
    modal :header="`Members of ${pool?.name ?? ''}`" :style="{ width: 'min(520px, 95vw)' }">
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <InputText v-model="search" placeholder="Search agents…" style="width:100%;" />
      <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
      <div v-else style="border:1px solid var(--ares-border); border-radius: var(--ares-radius); max-height:360px; overflow-y:auto;">
        <label v-for="a in visibleAgents" :key="a.id"
          style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.75rem;
                 border-bottom:1px solid var(--ares-border); cursor:pointer;
                 font-size:0.85rem; color:var(--ares-text-1);">
          <input type="checkbox" :checked="selected.has(a.id)" @change="toggle(a.id)" />
          <span style="font-weight:600;">{{ a.name }}</span>
          <span v-if="a.hostname" style="font-family:monospace; font-size:0.78rem; color:var(--ares-text-muted);">
            {{ a.hostname }}
          </span>
          <span style="margin-left:auto; font-size:0.72rem; color:var(--ares-text-muted);">{{ a.status }}</span>
        </label>
        <div v-if="!visibleAgents.length" style="padding:1rem; text-align:center; color:var(--ares-text-muted);">
          No matching agents.
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
        <Button :label="`Save (${selected.size})`" size="small" :loading="saving" @click="save" />
      </div>
    </div>
  </Dialog>
</template>
