<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { agentsApi, type Agent } from '@/api/agents';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'created', agent: Agent): void;
}>();

const toast = useToast();

// Form state
const name = ref('');
const description = ref('');
const saving = ref(false);

// Post-create state
const enrollmentCode = ref<string | null>(null);
const createdAgent = ref<Agent | null>(null);
const serverBase = computed(() => window.location.origin);
const enrollCommand = computed(() =>
  enrollmentCode.value
    ? `ares-agent enroll --server ${serverBase.value} --code ${enrollmentCode.value}`
    : ''
);

const canSubmit = computed(() => name.value.trim().length > 0);

watch(() => props.visible, (v) => {
  if (v) {
    name.value = '';
    description.value = '';
    enrollmentCode.value = null;
    createdAgent.value = null;
  }
});

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  try {
    const out = await agentsApi.create({
      name: name.value.trim(),
      description: description.value || undefined,
    });
    enrollmentCode.value = out.enrollmentCode;
    createdAgent.value = out.agent;
    emit('created', out.agent);
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Create failed',
      detail: e?.response?.data?.message ?? e.message,
      life: 5000,
    });
  } finally {
    saving.value = false;
  }
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() =>
    toast.add({ severity: 'success', summary: 'Copied', life: 2000 })
  );
}

function close() {
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    modal
    :header="enrollmentCode ? 'Enrollment ready' : 'Register new agent'"
    :style="{ width: 'min(560px, 95vw)' }"
  >
    <!-- ── Step 1: form ────────────────────────────────────────────────── -->
    <div v-if="!enrollmentCode" style="display:flex; flex-direction:column; gap:1rem;">
      <p style="margin:0; font-size:0.85rem; color:var(--ares-text-muted);">
        Creates an agent record and a one-time enrollment code. The agent is platform-level
        inventory — grant pools containing this agent to specific projects/orgs afterwards.
      </p>

      <div>
        <label class="ares-field-label">Agent name</label>
        <InputText v-model="name" placeholder="e.g. scanner-vpn-01" style="width:100%;" />
      </div>

      <div>
        <label class="ares-field-label">Description (optional)</label>
        <Textarea v-model="description" rows="2" class="w-full" auto-resize />
      </div>

      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <Button label="Cancel" severity="secondary" size="small" @click="close" />
        <Button label="Generate enrollment code" icon="pi pi-key" size="small"
          :loading="saving" :disabled="!canSubmit" @click="submit" />
      </div>
    </div>

    <!-- ── Step 2: enrollment code ────────────────────────────────────── -->
    <div v-else style="display:flex; flex-direction:column; gap:1rem;">
      <div style="background: color-mix(in srgb, var(--p-yellow-500) 12%, transparent);
                  border:1px solid color-mix(in srgb, var(--p-yellow-500) 35%, transparent);
                  border-radius: var(--ares-radius); padding:0.75rem 1rem; font-size:0.83rem;">
        <i class="pi pi-exclamation-triangle" style="margin-right:0.4rem;" />
        This enrollment code is shown <strong>only once</strong>. If you lose it, delete the
        agent and create a new one.
      </div>

      <div>
        <label class="ares-field-label">Enrollment code</label>
        <div style="display:flex; gap:0.4rem; align-items:center;">
          <code style="flex:1; padding:0.55rem 0.8rem; background:var(--p-surface-800);
                       border:1px solid var(--ares-border); border-radius: var(--ares-radius);
                       font-family:monospace; font-size:0.85rem; word-break:break-all;">
            {{ enrollmentCode }}
          </code>
          <Button icon="pi pi-copy" text size="small" @click="copy(enrollmentCode!)" />
        </div>
      </div>

      <div>
        <label class="ares-field-label">On the agent host, run</label>
        <div style="display:flex; gap:0.4rem; align-items:center;">
          <code style="flex:1; padding:0.55rem 0.8rem; background:var(--p-surface-800);
                       border:1px solid var(--ares-border); border-radius: var(--ares-radius);
                       font-family:monospace; font-size:0.78rem; word-break:break-all;">
            {{ enrollCommand }}
          </code>
          <Button icon="pi pi-copy" text size="small" @click="copy(enrollCommand)" />
        </div>
        <p style="font-size:0.72rem; color:var(--ares-text-muted); margin:0.4rem 0 0;">
          Need an installer? Visit the <router-link :to="{ name: 'agent-installer' }">Agent installer</router-link> page.
        </p>
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <Button label="Done" size="small" @click="close" />
      </div>
    </div>
  </Dialog>
</template>
