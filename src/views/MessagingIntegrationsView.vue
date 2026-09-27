<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import StatusCheckIcon from '@/components/StatusCheckIcon.vue';
import IntegrationPickerDialog from '@/components/IntegrationPickerDialog.vue';
import MessagingIntegrationFormDialog from '@/components/MessagingIntegrationFormDialog.vue';
import {
  messagingApi, MESSAGING_PLATFORM_TYPES, messagingPlatformLabel,
  type MessagingIntegration, type MessagingKind,
} from '@/api/messaging';
import discordIcon  from '@/assets/icons/discord.svg';
import slackIcon    from '@/assets/icons/slack.svg';
import teamsIcon    from '@/assets/icons/teams.svg';
import telegramIcon from '@/assets/icons/telegram.svg';
import webhookIcon  from '@/assets/icons/webhook.svg';
import matrixIcon   from '@/assets/icons/matrix.svg';
import emailIcon    from '@/assets/icons/email.svg';
import { confirmDialog } from '@/composables/useConfirmDialog';

const toast = useToast();
const items   = ref<MessagingIntegration[]>([]);
const loading = ref(true);

// ── Picker + create/edit dialogs ──────────────────────────────────────
const showPicker = ref(false);
const pickedType = ref('discord');
const showForm   = ref(false);
const editing    = ref<MessagingIntegration | null>(null);

const kindLabel = messagingPlatformLabel;

const KIND_ICONS: Record<string, string> = {
  discord:  discordIcon,
  slack:    slackIcon,
  teams:    teamsIcon,
  telegram: telegramIcon,
  webhook:  webhookIcon,
  matrix:   matrixIcon,
  email:    emailIcon,
};

function kindIcon(k: MessagingKind): string {
  return KIND_ICONS[k] ?? webhookIcon;
}

function openCreate() {
  editing.value = null;
  showPicker.value = true;
}

function onTypePicked(type: string) {
  pickedType.value = type;
  showForm.value = true;
}

function openEdit(i: MessagingIntegration) {
  editing.value = i;
  showForm.value = true;
}

async function remove(i: MessagingIntegration) {
  const ok = await confirmDialog({ header: 'Delete integration', message: `Delete "${i.name}"? Bindings using it will be removed too.` });
  if (!ok) return;
  try {
    await messagingApi.delete(i.id);
    items.value = items.value.filter((x) => x.id !== i.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  }
}

// Email has no built-in destination (unlike every other kind, whose config already points
// somewhere) — "Send test" prompts for an address first instead of firing immediately.
const showTestAddress = ref(false);
const testAddressTarget = ref<MessagingIntegration | null>(null);
const testAddress = ref('');
const testSending = ref(false);

function sendTest(i: MessagingIntegration) {
  if (i.kind === 'email') {
    testAddressTarget.value = i;
    testAddress.value = '';
    showTestAddress.value = true;
    return;
  }
  runTest(i, {});
}

async function confirmTestAddress() {
  const i = testAddressTarget.value;
  if (!i || !testAddress.value.trim()) return;
  testSending.value = true;
  try {
    await runTest(i, { to: [testAddress.value.trim()] });
    showTestAddress.value = false;
  } finally {
    testSending.value = false;
  }
}

async function runTest(i: MessagingIntegration, extra: { to?: string[] }) {
  try {
    await messagingApi.test(i.id, {
      title: 'Ares test message',
      body: `Test from integration "${i.name}". If you see this, delivery works.`,
      severity: 'info',
      ...extra,
    });
    toast.add({ severity: 'success', summary: 'Test sent', detail: `Message delivered to ${i.name}.`, life: 3500 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Test failed',
      detail: e?.response?.data?.message ?? e.message, life: 6000 });
  }
}

async function load() {
  loading.value = true;
  try { items.value = await messagingApi.list(); }
  finally { loading.value = false; }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Notifications</h2>
        <p class="ares-page-subtitle">
          Outbound notification channels (Discord, Slack, Microsoft Teams, Telegram, Matrix, Generic Webhook, Email).
          Bind them to events from a project (detection created) or an organization (SLA due soon).
        </p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New integration'" @click="openCreate" />
    </div>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th>Name</th>
              <th style="width:170px;">Platform</th>
              <th style="width:100px;">Status</th>
              <th style="width:160px;">Created</th>
              <th style="width:196px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in items" :key="i.id">
              <td>
                <div style="font-weight:600;">{{ i.name }}</div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <img :src="kindIcon(i.kind)" :alt="kindLabel(i.kind)" class="kind-icon" />
                  <span style="font-size:0.85rem;">{{ kindLabel(i.kind) }}</span>
                </div>
              </td>
              <td>
                <StatusCheckIcon :status="i.enabled ? 'ok' : 'error'" :tooltip="i.enabled ? 'Enabled' : 'Disabled'" />
              </td>
              <td style="font-size:0.8rem; color:var(--ares-text-muted);">
                {{ new Date(i.createdAt).toLocaleString() }}
              </td>
              <td>
                <div style="display:flex; gap:0.4rem; justify-content:flex-end;">
                  <Button icon="pi pi-send" size="small" severity="secondary" text
                    v-tooltip.left="'Send test'" @click="sendTest(i)" />
                  <Button icon="pi pi-pencil" size="small" severity="secondary" text
                    v-tooltip.left="'Edit'" @click="openEdit(i)" />
                  <Button icon="pi pi-trash" size="small" severity="danger" text
                    v-tooltip.left="'Delete'" @click="remove(i)" />
                </div>
              </td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="5" class="ares-table-empty">No integrations yet. Click "New integration" to add one.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <IntegrationPickerDialog
      v-model:visible="showPicker"
      header="Select messaging platform"
      :options="MESSAGING_PLATFORM_TYPES"
      @select="onTypePicked"
    />

    <MessagingIntegrationFormDialog
      v-model:visible="showForm"
      :integration="editing"
      :preselected-type="pickedType"
      @saved="load"
    />

    <Dialog v-model:visible="showTestAddress" header="Send test email" modal :style="{ width: 'min(420px, 96vw)' }"
      :pt="{ content: { style: 'padding: 1.25rem' } }">
      <div>
        <label class="dlg-label">Send to</label>
        <InputText v-model="testAddress" style="width:100%;" placeholder="you@example.com"
          @keyup.enter="confirmTestAddress" autofocus />
      </div>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:1.1rem;">
        <Button label="Cancel" severity="secondary" size="small" text @click="showTestAddress = false" />
        <Button label="Send" icon="pi pi-send" size="small"
          :loading="testSending" :disabled="!testAddress.trim()" @click="confirmTestAddress" />
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.kind-icon {
  width: 22px;
  height: 22px;
  display: inline-block;
  vertical-align: middle;
  object-fit: contain;
}
.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
