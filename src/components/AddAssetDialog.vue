<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { ASSET_TYPES, ASSET_TYPE_LABELS, HOST_SUBTYPES, HOST_SUBTYPE_LABELS } from '@/api/assets';
import { validateAssetIdentifier } from '@/utils/validators';

export interface NewAssetPayload {
  type: string;
  identifier: string;
  metadata?: Record<string, unknown>;
  hostSubtype?: string;
  hostnames?: string[];
  displayName?: string;
}

const props = defineProps<{
  /** Performs the create; a thrown error is shown inline and keeps the dialog open. */
  submit: (payload: NewAssetPayload) => Promise<void>;
  identifierHint: string;
}>();
const visible = defineModel<boolean>('visible', { required: true });

const TYPE_OPTIONS     = ASSET_TYPES.map((t) => ({ label: ASSET_TYPE_LABELS[t] ?? t, value: t }));
const SUBTYPE_OPTIONS  = HOST_SUBTYPES.map((s) => ({ label: HOST_SUBTYPE_LABELS[s], value: s }));
const PROTOCOL_OPTIONS = ['tcp', 'udp'];

function emptyForm() {
  return {
    type: 'host', identifier: '', displayName: '',
    hostHostname: '', hostSubtype: 'unknown',
    svcHost: '', svcPort: '', svcProtocol: 'tcp',
  };
}

const form   = ref(emptyForm());
const saving = ref(false);
const error  = ref('');

const isNetwork = computed(() => form.value.type === 'network');
const isHost    = computed(() => form.value.type === 'host');
const isService = computed(() => form.value.type === 'service');
const IDENTIFIER_PLACEHOLDERS: Record<string, string> = {
  ip: 'e.g. 192.168.1.10',
  network: 'e.g. 192.168.1.0/24',
  domain: 'e.g. example.com',
  email: 'e.g. jane.doe@example.com',
  web_application: 'e.g. https://app.example.com',
  web_endpoint: 'e.g. https://app.example.com/api/login',
};
const identifierPlaceholder = computed(() => IDENTIFIER_PLACEHOLDERS[form.value.type] ?? 'Name or identifier');

const hasInput = computed(() =>
  isService.value
    ? !!form.value.svcHost.trim() && !!form.value.svcPort.trim()
    : !!form.value.identifier.trim(),
);
/** Shown only once something has been typed, so an empty form isn't immediately red. */
const formatError = computed(() =>
  hasInput.value ? validateAssetIdentifier(form.value.type, buildPayload().identifier) : null,
);
const canSubmit = computed(() => hasInput.value && !formatError.value);

function close() {
  visible.value = false;
  error.value   = '';
  form.value    = emptyForm();
}

function buildPayload(): NewAssetPayload {
  const f = form.value;
  if (isService.value) {
    const port = f.svcPort.trim();
    return {
      type: f.type,
      identifier: `${f.svcHost.trim()}:${port}/${f.svcProtocol}`,
      metadata: { port: Number(port), protocol: f.svcProtocol },
      displayName: f.displayName.trim() || undefined,
    };
  }
  return {
    type: f.type,
    identifier: f.identifier.trim(),
    displayName: !isHost.value && f.displayName.trim() ? f.displayName.trim() : undefined,
    hostSubtype: isHost.value ? f.hostSubtype : undefined,
    hostnames: isHost.value && f.hostHostname.trim() ? [f.hostHostname.trim()] : undefined,
  };
}

async function onSubmit() {
  if (!canSubmit.value) return;
  saving.value = true;
  error.value  = '';
  try {
    await props.submit(buildPayload());
    close();
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message ?? 'Failed to create asset';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" header="New asset" modal style="width:min(32rem,96vw);" @update:visible="(v) => !v && close()">
    <form style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.5rem;" @submit.prevent="onSubmit">
      <div>
        <label class="form-label">Type</label>
        <Select v-model="form.type" :options="TYPE_OPTIONS" option-label="label" option-value="value" class="w-full" />
      </div>

      <!-- Service: structured host/port/protocol instead of a free-text identifier -->
      <template v-if="isService">
        <div>
          <label class="form-label">Host / IP</label>
          <InputText v-model="form.svcHost" placeholder="e.g. 192.168.1.1" class="w-full" autofocus />
        </div>
        <div style="display:flex; gap:0.75rem;">
          <div style="flex:1;">
            <label class="form-label">Port</label>
            <InputText v-model="form.svcPort" placeholder="e.g. 443" class="w-full" />
          </div>
          <div style="flex:1;">
            <label class="form-label">Protocol</label>
            <Select v-model="form.svcProtocol" :options="PROTOCOL_OPTIONS" class="w-full" />
          </div>
        </div>
        <p v-if="formatError" class="form-error">{{ formatError }}</p>
        <p v-else-if="hasInput" class="form-hint">
          Will be created as <code>{{ form.svcHost.trim() }}:{{ form.svcPort.trim() }}/{{ form.svcProtocol }}</code>
        </p>
      </template>

      <div v-else>
        <label class="form-label">{{ isNetwork ? 'CIDR' : 'Identifier' }}</label>
        <Textarea
          v-if="form.type === 'text_data'"
          :model-value="form.identifier"
          class="w-full"
          style="font-family:monospace; word-break:break-all;"
          rows="3"
          auto-resize
          :placeholder="identifierPlaceholder"
          :invalid="!!formatError"
          autofocus
          @update:model-value="(v: string | undefined) => form.identifier = (v ?? '').replace(/[\r\n]+/g, '')"
        />
        <InputText
          v-else
          v-model="form.identifier"
          class="w-full"
          style="font-family:monospace;"
          :placeholder="identifierPlaceholder"
          :invalid="!!formatError"
          autofocus
        />
        <p v-if="formatError" class="form-error">{{ formatError }}</p>
        <p v-else class="form-hint">
          {{ isNetwork ? 'CIDR notation. IPs will be auto-linked to the most specific matching network.' : identifierHint }}
        </p>
      </div>

      <div v-if="!isHost">
        <label class="form-label">Display name <span class="form-optional">(optional)</span></label>
        <InputText v-model="form.displayName" maxlength="200"
          :placeholder="isNetwork ? 'e.g. Office LAN, DMZ, Management' : 'e.g. Main mail server'" class="w-full" />
      </div>

      <!-- Host: optional subtype/hostname (more hostnames can be added on the detail page) -->
      <template v-if="isHost">
        <div>
          <label class="form-label">Subtype</label>
          <Select v-model="form.hostSubtype" :options="SUBTYPE_OPTIONS" option-label="label" option-value="value" class="w-full" />
        </div>
        <div>
          <label class="form-label">Hostname <span class="form-optional">(optional)</span></label>
          <InputText v-model="form.hostHostname" placeholder="e.g. web01.internal" class="w-full" />
        </div>
      </template>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button type="button" label="Cancel" severity="secondary" size="small" @click="close" />
        <Button type="submit" icon="pi pi-plus" label="Create" size="small" :loading="saving" :disabled="!canSubmit" />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.form-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
  color: var(--ares-text-muted);
}
.form-optional { font-weight: 400; opacity: 0.6; }
.form-hint {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  margin: 0.35rem 0 0;
}
.form-error {
  font-size: 0.72rem;
  color: var(--p-red-400, #f87171);
  margin: 0.35rem 0 0;
}
.form-hint code {
  background: var(--ares-surface-sunken, rgba(0,0,0,0.15));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.05em 0.4em;
  color: var(--ares-accent);
}
</style>
