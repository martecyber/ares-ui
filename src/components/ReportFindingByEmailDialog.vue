<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { findingsApi, type SuggestedRecipient } from '@/api/findings';
import { kbEmailTemplatesApi, type EmailTemplate } from '@/api/kb-email-templates';
import { messagingApi, type MessagingIntegration } from '@/api/messaging';
import { projectsApi } from '@/api/projects';
import { organizationContactsApi } from '@/api/organizationContacts';
import RecipientChipInput, { type RecipientChip, type RecipientSuggestion } from '@/components/RecipientChipInput.vue';

const props = defineProps<{ visible: boolean; findingId: number; projectId?: number | null }>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; sent: [] }>();

const toast = useToast();

const emailTemplates = ref<EmailTemplate[]>([]);
const emailIntegrations = ref<MessagingIntegration[]>([]);
const templateId = ref<number | null>(null);
const integrationId = ref<number | null>(null);
const to = ref<RecipientChip[]>([]);
const cc = ref<RecipientChip[]>([]);
const bcc = ref<RecipientChip[]>([]);
const loadingRecipients = ref(false);
const sending = ref(false);
const err = ref('');
const suggestions = ref<RecipientSuggestion[]>([]);

const showPreview = ref(false);
const previewing = ref(false);
const previewSubject = ref('');
const previewHtml = ref('');

function toChips(recipients: SuggestedRecipient[]): RecipientChip[] {
  return recipients.map((r) => ({ email: r.email, label: r.label, locked: true, ruleNote: r.ruleNote }));
}

/** Autocomplete source for the "+" add box: the project's own members plus the organization's
 *  saved contacts (e.g. a ticketing tool) — same two pools an "email_recipients" Rule of
 *  Engagement can pick from, just offered here for ad-hoc, unrestricted additions too. */
async function loadSuggestions() {
  if (!props.projectId) { suggestions.value = []; return; }
  try {
    const project = await projectsApi.get(props.projectId);
    const memberSuggestions: RecipientSuggestion[] = (project.members ?? [])
      .map((m) => ({ name: m.userDisplayName || m.userEmail, email: m.userEmail }));
    const contacts = await organizationContactsApi.list(project.organizationId).catch(() => []);
    const contactSuggestions: RecipientSuggestion[] = contacts.map((c) => ({ name: c.name, email: c.email }));
    // Dedup by email — a contact's curated name wins over a member's display name when both exist.
    const byEmail = new Map<string, RecipientSuggestion>();
    for (const s of memberSuggestions) byEmail.set(s.email.toLowerCase(), s);
    for (const s of contactSuggestions) byEmail.set(s.email.toLowerCase(), s);
    suggestions.value = [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    suggestions.value = [];
  }
}

watch(() => props.visible, async (v) => {
  if (!v) return;
  templateId.value = null;
  integrationId.value = null;
  to.value = [];
  cc.value = [];
  bcc.value = [];
  err.value = '';
  loadingRecipients.value = true;
  findingsApi.suggestedRecipients(props.findingId)
    .then((r) => { to.value = toChips(r.to); cc.value = toChips(r.cc); bcc.value = toChips(r.bcc); })
    .catch(() => { /* rule resolution is best-effort — an empty start is a safe fallback */ })
    .finally(() => { loadingRecipients.value = false; });
  loadSuggestions();
  if (!emailTemplates.value.length) {
    emailTemplates.value = await kbEmailTemplatesApi.list({ size: 200 }).then((r) => r.items).catch(() => []);
  }
  if (!emailIntegrations.value.length) {
    emailIntegrations.value = await messagingApi.list().then((list) => list.filter((i) => i.kind === 'email')).catch(() => []);
  }
});

async function openPreview() {
  if (!templateId.value) return;
  previewing.value = true;
  err.value = '';
  try {
    const r = await findingsApi.previewEmail(props.findingId, templateId.value);
    previewSubject.value = r.subject;
    previewHtml.value = r.html;
    showPreview.value = true;
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? e?.response?.data?.message ?? e.message ?? 'Failed to render preview.';
  } finally {
    previewing.value = false;
  }
}

async function submit() {
  if (!templateId.value || !integrationId.value) return;
  sending.value = true;
  err.value = '';
  try {
    await findingsApi.sendEmail(props.findingId, {
      emailTemplateId: templateId.value,
      integrationId: integrationId.value,
      to: to.value.map((c) => c.email),
      cc: cc.value.map((c) => c.email),
      bcc: bcc.value.map((c) => c.email),
    });
    emit('update:visible', false);
    emit('sent');
    toast.add({ severity: 'success', summary: 'Finding emailed', life: 3000 });
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? e?.response?.data?.message ?? e.message ?? 'Failed to send.';
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)"
    header="Report finding by email" modal :style="{ width: 'min(460px, 96vw)' }">
    <div style="display:flex; flex-direction:column; gap:1rem;">
      <div>
        <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">Email template</label>
        <div style="display:flex; gap:0.4rem;">
          <Select v-model="templateId" :options="emailTemplates" option-label="name" option-value="id"
            placeholder="Select a template" style="flex:1;" />
          <Button label="Preview" icon="pi pi-eye" severity="secondary" outlined
            :disabled="!templateId" :loading="previewing" @click="openPreview" />
        </div>
      </div>
      <div>
        <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">Integration</label>
        <Select v-model="integrationId" :options="emailIntegrations" option-label="name" option-value="id"
          placeholder="Select an email integration" style="width:100%;" />
      </div>
      <div>
        <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">
          To <i v-if="loadingRecipients" class="pi pi-spin pi-spinner" style="font-size:0.7rem; margin-left:0.3rem;" />
        </label>
        <RecipientChipInput v-model="to" :suggestions="suggestions" placeholder="soc@example.com" />
      </div>
      <div>
        <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">CC (optional)</label>
        <RecipientChipInput v-model="cc" :suggestions="suggestions" />
      </div>
      <div>
        <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">BCC (optional)</label>
        <RecipientChipInput v-model="bcc" :suggestions="suggestions" />
      </div>

      <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>

      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
        <Button label="Send" icon="pi pi-send" size="small"
          :disabled="!templateId || !integrationId || !to.length"
          :loading="sending" @click="submit" />
      </div>
    </div>
  </Dialog>

  <!-- How this finding's email would actually render, for the selected template -->
  <Dialog v-model:visible="showPreview" header="Email preview" modal :style="{ width: 'min(680px, 96vw)' }">
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <div>
        <label style="display:block; font-size:0.75rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.2rem;">Subject</label>
        <div style="font-size:0.9rem;">{{ previewSubject }}</div>
      </div>
      <iframe :srcdoc="previewHtml" sandbox=""
        style="width:100%; height:60vh; border:1px solid var(--ares-border); border-radius:var(--ares-radius); background:#fff;" />
    </div>
  </Dialog>
</template>
