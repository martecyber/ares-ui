<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import { useToast } from 'primevue/usetoast';
import { vdpIntegrationsApi, vdpPlatformLabel, bugHuntingPlatformsRef, loadBugHuntingPlatforms, type CredentialField } from '@/api/vdp-integrations';
import type { ToolIntegration } from '@/api/tool-integrations';

// Idempotent/cached — safe even though VdpIntegrationsView (the only current caller) already
// triggers this on its own mount; keeps this dialog self-sufficient if reused elsewhere.
loadBugHuntingPlatforms();

const props = defineProps<{
  visible: boolean;
  integration: ToolIntegration | null;
  preselectedType?: string;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  saved: [];
}>();

const toast = useToast();
const bugHuntingPlatforms = bugHuntingPlatformsRef();

const name        = ref('');
const type        = ref('');
const credentials = ref<Record<string, string>>({});
const saving      = ref(false);

const isEdit  = computed(() => !!props.integration);
const title   = computed(() => {
  if (isEdit.value) return 'Edit VDP integration';
  return `New ${vdpPlatformLabel(type.value)} integration`;
});

// The credential form is entirely driven by the platform's own declared field list — a platform
// with unusual auth (e.g. HackerOne's username+token pair) just contributes a different list,
// no branch in this component. See BugHuntingClient#credentialFields' own doc.
const fields = computed<CredentialField[]>(() =>
  bugHuntingPlatforms.value.find((p) => p.id === type.value)?.credentialFields ?? []
);
const platformHint = computed(() =>
  bugHuntingPlatforms.value.find((p) => p.id === type.value)?.credentialHelpText ?? ''
);

watch(() => props.visible, (open) => {
  if (!open) return;
  const i = props.integration;
  name.value = i?.name ?? '';
  type.value = props.preselectedType ?? i?.type ?? '';
  credentials.value = {};
});

async function save() {
  if (!name.value.trim()) return;
  saving.value = true;
  try {
    const filledCredentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials.value)) {
      if (value) filledCredentials[key] = value;
    }

    if (isEdit.value) {
      await vdpIntegrationsApi.update(props.integration!.id, {
        name: name.value.trim(),
        credentials: Object.keys(filledCredentials).length ? filledCredentials : undefined,
      });
    } else {
      await vdpIntegrationsApi.create({
        name: name.value.trim(),
        type: type.value,
        credentials: filledCredentials,
      });
    }
    toast.add({ severity: 'success', summary: isEdit.value ? 'Integration updated' : 'Integration created', life: 3000 });
    emit('saved');
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally { saving.value = false; }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    modal
    :style="{ width: 'min(520px, 96vw)' }"
    :pt="{ content: { style: 'padding: 1.25rem' } }"
    @update:visible="$emit('update:visible', $event)"
  >
    <form @submit.prevent="save" style="display:flex; flex-direction:column; gap:1.1rem;">

      <!-- Name -->
      <div>
        <label class="dlg-label">Name *</label>
        <InputText v-model="name" style="width:100%;" placeholder="e.g. Acme Bugcrowd" required />
      </div>

      <!-- Credential fields, entirely driven by the platform's own declared list -->
      <div v-for="field in fields" :key="field.key">
        <label class="dlg-label">{{ field.label }}{{ field.required ? ' *' : '' }}</label>
        <Password v-if="field.inputType === 'password'" v-model="credentials[field.key]" style="width:100%;" :feedback="false"
          :placeholder="isEdit ? '(unchanged — enter to update)' : (field.placeholder ?? '')" />
        <InputText v-else v-model="credentials[field.key]" style="width:100%;"
          :placeholder="isEdit ? '(unchanged)' : (field.placeholder ?? '')" />
      </div>

      <p v-if="platformHint" style="font-size:0.77rem;color:var(--ares-text-muted);margin:0;">
        {{ platformHint }}
      </p>

      <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
        <Button type="button" label="Cancel" severity="secondary" size="small"
          @click="$emit('update:visible', false)" />
        <Button type="submit" :label="isEdit ? 'Save' : 'Create'" icon="pi pi-check"
          size="small" :loading="saving" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
