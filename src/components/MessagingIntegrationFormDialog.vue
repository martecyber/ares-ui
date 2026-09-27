<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import { useToast } from 'primevue/usetoast';
import {
  messagingApi,
  messagingPlatformLabel,
  type MessagingIntegration, type MessagingKind, type CreateIntegrationRequest,
} from '@/api/messaging';
import MessagingGrantsPanel from '@/components/MessagingGrantsPanel.vue';

const props = defineProps<{
  visible: boolean;
  integration: MessagingIntegration | null;
  preselectedType?: string;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  saved: [];
}>();

const toast = useToast();

const name    = ref('');
const kind    = ref<MessagingKind>('discord');
const cfg     = ref<Record<string, string>>({});
// Generic-webhook only — operators paste a small JSON object for custom headers.
const headersJson = ref('');
// Email (SMTP) only.
const emailUseTls = ref(false);
const enabled = ref(true);
const saving  = ref(false);
const activeTab = ref('general');

const isEdit = computed(() => !!props.integration);
const title  = computed(() => isEdit.value
  ? 'Edit messaging integration'
  : `New ${messagingPlatformLabel(kind.value)} integration`);

watch(() => props.visible, (open) => {
  if (!open) return;
  activeTab.value = 'general';
  const i = props.integration;
  name.value  = i?.name ?? '';
  kind.value  = (props.preselectedType as MessagingKind) ?? i?.kind ?? 'discord';
  headersJson.value = '';
  // Every other kind's config is genuinely write-only (never echoed back) — blank fields
  // legitimately mean "leave unchanged". Email is the exception: host/port/username/fromAddress/
  // useTls aren't secrets and the backend returns them (see EmailConfigDto), so prefill them for
  // real editing instead of showing a blank form that always looked empty even when configured.
  const ec = i?.kind === 'email' ? i.emailConfig : null;
  cfg.value = ec ? {
    host: ec.host ?? '', port: ec.port != null ? String(ec.port) : '',
    username: ec.username ?? '', fromAddress: ec.fromAddress ?? '',
  } : {};
  emailUseTls.value = ec?.useTls ?? false;
  enabled.value = i?.enabled ?? true;
});

const canSubmit = computed(() => {
  if (!name.value.trim()) return false;
  // On edit, blank config fields mean "keep existing" — always submittable.
  if (isEdit.value) return true;
  switch (kind.value) {
    case 'discord':
    case 'slack':
    case 'teams':    return !!cfg.value.webhookUrl;
    case 'telegram': return !!cfg.value.botToken && !!cfg.value.chatId;
    case 'webhook':  return !!cfg.value.url;
    case 'matrix':   return !!cfg.value.homeserverUrl && !!cfg.value.accessToken && !!cfg.value.roomId;
    case 'email':    return !!cfg.value.host && !!cfg.value.fromAddress;
  }
  return false;
});

function buildConfig(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  switch (kind.value) {
    case 'discord':
    case 'slack':
    case 'teams':
      if (cfg.value.webhookUrl) out.webhookUrl = cfg.value.webhookUrl.trim();
      break;
    case 'telegram':
      if (cfg.value.botToken) out.botToken = cfg.value.botToken.trim();
      if (cfg.value.chatId)   out.chatId   = cfg.value.chatId.trim();
      break;
    case 'webhook':
      if (cfg.value.url) out.url = cfg.value.url.trim();
      if (headersJson.value.trim()) {
        try { out.headers = JSON.parse(headersJson.value); }
        catch {
          toast.add({ severity: 'error', summary: 'Headers must be valid JSON', life: 4000 });
          throw new Error('invalid headers');
        }
      }
      break;
    case 'matrix':
      if (cfg.value.homeserverUrl) out.homeserverUrl = cfg.value.homeserverUrl.trim();
      if (cfg.value.accessToken)   out.accessToken   = cfg.value.accessToken.trim();
      if (cfg.value.roomId)        out.roomId        = cfg.value.roomId.trim();
      break;
    case 'email':
      if (cfg.value.host)        out.host        = cfg.value.host.trim();
      if (cfg.value.port)        out.port        = Number.parseInt(cfg.value.port, 10);
      if (cfg.value.username)    out.username    = cfg.value.username.trim();
      if (cfg.value.password)    out.password    = cfg.value.password;
      if (cfg.value.fromAddress) out.fromAddress = cfg.value.fromAddress.trim();
      out.useTls = emailUseTls.value;
      break;
  }
  return out;
}

async function save() {
  if (!canSubmit.value) return;
  saving.value = true;
  try {
    let built: Record<string, unknown>;
    try { built = buildConfig(); } catch { saving.value = false; return; }

    if (isEdit.value) {
      await messagingApi.update(props.integration!.id, {
        name: name.value.trim(),
        enabled: enabled.value,
        // Only send config if the operator actually filled in fields; empty = keep.
        ...(Object.keys(built).length ? { config: built } : {}),
      });
    } else {
      await messagingApi.create({
        name: name.value.trim(),
        kind: kind.value,
        config: built,
      } as CreateIntegrationRequest);
    }
    toast.add({ severity: 'success', summary: isEdit.value ? 'Integration updated' : 'Integration created', life: 3000 });
    emit('saved');
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
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
    <Tabs v-if="isEdit" v-model:value="activeTab">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="grants">Grants</Tab>
      </TabList>
    </Tabs>
    <form v-show="!isEdit || activeTab === 'general'" @submit.prevent="save"
      style="display:flex; flex-direction:column; gap:1.1rem;" :style="isEdit ? 'padding-top:1.25rem;' : ''">
      <div>
        <label class="dlg-label">Name *</label>
        <InputText v-model="name" style="width:100%;" placeholder="e.g. SOC channel — Slack" required />
      </div>

      <p v-if="isEdit" style="font-size:0.72rem; color:var(--ares-text-muted); margin:0;">
        Platform: {{ messagingPlatformLabel(kind) }} — immutable, delete + recreate to switch.
      </p>

      <div v-if="isEdit" style="display:flex; align-items:center; gap:0.6rem;">
        <ToggleSwitch v-model="enabled" input-id="messaging-enabled" />
        <label for="messaging-enabled" style="font-size:0.85rem; color:var(--ares-text-muted);">
          Enabled
        </label>
      </div>

      <!-- discord / slack / teams: single webhook URL -->
      <div v-if="['discord','slack','teams'].includes(kind)">
        <label class="dlg-label">Webhook URL *</label>
        <InputText v-model="cfg.webhookUrl" type="password" style="width:100%; font-family:monospace;"
          :placeholder="isEdit ? '(unchanged — enter to update)' : 'https://…'" />
      </div>

      <!-- telegram -->
      <template v-if="kind === 'telegram'">
        <div>
          <label class="dlg-label">Bot token *</label>
          <InputText v-model="cfg.botToken" type="password" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : '123456:ABCDEF…'" />
        </div>
        <div>
          <label class="dlg-label">Chat ID *</label>
          <InputText v-model="cfg.chatId" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : '-1001234567890'" />
        </div>
      </template>

      <!-- matrix -->
      <template v-if="kind === 'matrix'">
        <div>
          <label class="dlg-label">Homeserver URL *</label>
          <InputText v-model="cfg.homeserverUrl" style="width:100%;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'https://matrix.org'" />
        </div>
        <div>
          <label class="dlg-label">Access token *</label>
          <InputText v-model="cfg.accessToken" type="password" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'syt_…'" />
        </div>
        <div>
          <label class="dlg-label">Room ID *</label>
          <InputText v-model="cfg.roomId" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : '!roomid:matrix.org'" />
        </div>
      </template>

      <!-- email (SMTP) -->
      <template v-if="kind === 'email'">
        <div style="display:flex; gap:0.75rem;">
          <div style="flex:2;">
            <label class="dlg-label">SMTP host *</label>
            <InputText v-model="cfg.host" style="width:100%; font-family:monospace;"
              :placeholder="isEdit ? '(unchanged — enter to update)' : 'smtp.example.com'" />
          </div>
          <div style="flex:1;">
            <label class="dlg-label">Port *</label>
            <InputText v-model="cfg.port" style="width:100%; font-family:monospace;" placeholder="587" />
          </div>
        </div>
        <div>
          <label class="dlg-label">Username <span style="opacity:0.6; font-weight:400;">(optional — no auth if blank)</span></label>
          <InputText v-model="cfg.username" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : ''" />
        </div>
        <div>
          <label class="dlg-label">Password</label>
          <InputText v-model="cfg.password" type="password" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : ''" />
        </div>
        <div>
          <label class="dlg-label">From address *</label>
          <InputText v-model="cfg.fromAddress" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'ares@example.com'" />
        </div>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <ToggleSwitch v-model="emailUseTls" input-id="messaging-email-tls" />
          <label for="messaging-email-tls" style="font-size:0.85rem; color:var(--ares-text-muted);">
            Use STARTTLS
          </label>
        </div>
      </template>

      <!-- generic webhook -->
      <template v-if="kind === 'webhook'">
        <div>
          <label class="dlg-label">URL *</label>
          <InputText v-model="cfg.url" style="width:100%; font-family:monospace;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'https://example.com/hook'" />
        </div>
        <div>
          <label class="dlg-label">Headers <span style="opacity:0.6; font-weight:400;">(JSON, optional)</span></label>
          <Textarea v-model="headersJson" rows="3" class="w-full" auto-resize
            placeholder='{ "X-Auth-Token": "secret" }' />
        </div>
      </template>

      <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
        <Button type="button" label="Cancel" severity="secondary" size="small"
          @click="$emit('update:visible', false)" />
        <Button type="submit" :label="isEdit ? 'Save' : 'Create'" icon="pi pi-check"
          size="small" :loading="saving" :disabled="!canSubmit" />
      </div>
    </form>
    <div v-if="isEdit && activeTab === 'grants'" style="padding-top:1.25rem;">
      <MessagingGrantsPanel v-if="integration" :integration="integration" />
    </div>
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
