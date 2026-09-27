<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import InputText from 'primevue/inputtext';
import { reportsApi, reportTemplatesApi, reportStatusLabel, reportStatusSeverity, type Report, type ReportTemplate } from '@/api/reports';
import { kbEmailTemplatesApi, type EmailTemplate } from '@/api/kb-email-templates';
import { messagingApi, type MessagingIntegration } from '@/api/messaging';
import { projectsApi, isMonitoring } from '@/api/projects';
import { useContextStore } from '@/stores/context';
import GenerateReportDialog from '@/components/GenerateReportDialog.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';

const route = useRoute();
const context = useContextStore();
const toast = useToast();

const engId = computed(() => Number(route.params.engId));
const orgId = computed(() => Number(route.params.orgId));
const isMonitorProject = computed(() => isMonitoring(context.project?.typeCode, context.project?.supertypeCode));

const reports = ref<Report[]>([]);
const loading = ref(true);
const showCreate = ref(false);
const uploadingId = ref<number | null>(null);
const downloadingId = ref<number | null>(null);
const exportingId = ref<number | null>(null);

// ── Sort / filter state ────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterStatus = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const reportStatusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Completed', value: 'completed' },
  { label: 'Published', value: 'published' },
];

const processedReports = computed(() => {
  let data = [...reports.value];
  if (filterStatus.value.length) data = data.filter((r) => filterStatus.value.includes(r.status));
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

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Generate document / send email dialog ────────────────────────────────────
const showGenDocDialog = ref(false);
const genDocTarget = ref<Report | null>(null);
const genDocTemplateId = ref<number | null>(null);
const templates = ref<ReportTemplate[]>([]);
const generatingDoc = ref(false);

const genDocMode = ref<'document' | 'email'>('document');
const deliveryModeOptions = [
  { label: 'Document', value: 'document' },
  { label: 'Email', value: 'email' },
];
const emailTemplates = ref<EmailTemplate[]>([]);
const emailIntegrations = ref<MessagingIntegration[]>([]);
const genEmailTemplateId = ref<number | null>(null);
const genEmailIntegrationId = ref<number | null>(null);
const genEmailTo = ref('');
const genEmailCc = ref('');
const genEmailBcc = ref('');
const sendingEmail = ref(false);

async function openGenDoc(r: Report) {
  genDocTarget.value = r;
  genDocTemplateId.value = null;
  genDocMode.value = 'document';
  genEmailTemplateId.value = null;
  genEmailIntegrationId.value = null;
  genEmailTo.value = '';
  genEmailCc.value = '';
  genEmailBcc.value = '';
  showGenDocDialog.value = true;
  if (!templates.value.length) {
    templates.value = await reportTemplatesApi.list().catch(() => []);
  }
  if (templates.value.length === 1) {
    genDocTemplateId.value = templates.value[0].id;
  }
  if (!emailTemplates.value.length) {
    emailTemplates.value = await kbEmailTemplatesApi.list({ size: 200 }).then((r) => r.items).catch(() => []);
  }
  if (!emailIntegrations.value.length) {
    emailIntegrations.value = await messagingApi.list().then((list) => list.filter((i) => i.kind === 'email')).catch(() => []);
  }
}

async function submitGenDoc() {
  if (!genDocTarget.value) return;
  generatingDoc.value = true;
  try {
    const updated = await reportsApi.generateDocument(genDocTarget.value.id, genDocTemplateId.value ?? undefined);
    const idx = reports.value.findIndex((x) => x.id === genDocTarget.value!.id);
    if (idx !== -1) reports.value[idx] = updated;
    showGenDocDialog.value = false;
    toast.add({ severity: 'success', summary: 'Document generated', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Generation failed', detail: e?.response?.data?.detail ?? e?.response?.data?.message ?? e.message, life: 8000 });
  } finally {
    generatingDoc.value = false;
  }
}

function splitAddresses(raw: string): string[] {
  return raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

async function submitSendEmail() {
  if (!genDocTarget.value || !genEmailTemplateId.value || !genEmailIntegrationId.value) return;
  sendingEmail.value = true;
  try {
    await reportsApi.sendEmail(genDocTarget.value.id, {
      emailTemplateId: genEmailTemplateId.value,
      integrationId: genEmailIntegrationId.value,
      to: splitAddresses(genEmailTo.value),
      cc: splitAddresses(genEmailCc.value),
      bcc: splitAddresses(genEmailBcc.value),
    });
    showGenDocDialog.value = false;
    toast.add({ severity: 'success', summary: 'Report emailed', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Send failed', detail: e?.response?.data?.detail ?? e?.response?.data?.message ?? e.message, life: 8000 });
  } finally {
    sendingEmail.value = false;
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

function onReportCreated(r: Report) {
  reports.value.unshift(r);
  toast.add({ severity: 'success', summary: 'Report created', detail: r.title, life: 4000 });
}

async function publish(r: Report) {
  try {
    const updated = await reportsApi.publish(r.id);
    const idx = reports.value.findIndex((x) => x.id === r.id);
    if (idx !== -1) reports.value[idx] = updated;
    toast.add({ severity: 'success', summary: 'Report published', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to publish', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

async function uploadDocument(r: Report) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    uploadingId.value = r.id;
    try {
      const updated = await reportsApi.uploadDocument(r.id, file);
      const idx = reports.value.findIndex((x) => x.id === r.id);
      if (idx !== -1) reports.value[idx] = updated;
      toast.add({ severity: 'success', summary: 'Document uploaded', life: 3000 });
    } catch (e: any) {
      toast.add({ severity: 'error', summary: 'Upload failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
    } finally {
      uploadingId.value = null;
    }
  };
  input.click();
}

async function downloadDocument(r: Report) {
  downloadingId.value = r.id;
  try {
    const blob = await reportsApi.download(r.id);
    triggerBlobDownload(blob, `report_${r.id}.docx`);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Download failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    downloadingId.value = null;
  }
}

async function exportJson(r: Report) {
  exportingId.value = r.id;
  try {
    const blob = await reportsApi.exportJson(r.id);
    triggerBlobDownload(blob, `report_${r.id}.json`);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Export failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    exportingId.value = null;
  }
}

async function deleteReport(r: Report) {
  try {
    await reportsApi.delete(r.id);
    reports.value = reports.value.filter((x) => x.id !== r.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to delete', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

onMounted(async () => {
  try {
    const eng = await projectsApi.get(engId.value);
    if (eng) context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
  } catch { /* silent */ }

  try {
    const res = await reportsApi.list({ projectId: engId.value });
    reports.value = res.items;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Reports</h2>
        <p class="ares-page-subtitle">Create and manage audit reports for this project.</p>
      </div>
      <Button icon="pi pi-plus" text v-tooltip.top="'New report'" @click="showCreate = true" />
    </div>

    <div v-if="loading" style="display:flex; justify-content:center; padding:3rem;">
      <ProgressSpinner />
    </div>

    <div v-else class="ares-card" style="padding:0; overflow:hidden;">
      <table class="ares-table">
        <thead>
          <tr>
            <th>
              <ColumnHeader label="Title" :sortable="true"
                :sort-dir="sortCol === 'title' ? sortDir : null"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                @update:sort-dir="onSort('title', $event)" />
            </th>
            <th style="width:100px;">
              <ColumnHeader label="Status" :sortable="true"
                :sort-dir="sortCol === 'status' ? sortDir : null"
                :filter-options="reportStatusOptions"
                :filter-value="filterStatus"
                @update:sort-dir="onSort('status', $event)"
                @update:filter-value="filterStatus = $event" />
            </th>
            <th style="width:70px;">Findings</th>
            <th style="width:110px;">
              <ColumnHeader label="Created" :sortable="true"
                :sort-dir="sortCol === 'createdAt' ? sortDir : null"
                sort-asc-label="Oldest first" sort-desc-label="Newest first"
                @update:sort-dir="onSort('createdAt', $event)" />
            </th>
            <th style="width:200px; text-align:right; padding-right:0.75rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in processedReports" :key="r.id">
            <td>
              <div style="font-weight:500;">{{ r.title }}</div>
              <div v-if="r.error" style="font-size:0.72rem; color:var(--ares-error); margin-top:0.1rem;">
                <i class="pi pi-exclamation-triangle" /> {{ r.error }}
              </div>
            </td>
            <td><AresBadge :value="reportStatusLabel(r.status)" :severity="reportStatusSeverity(r.status)" /></td>
            <td style="font-size:0.82rem; color:var(--ares-text-muted);">{{ r.findingCount }}</td>
            <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ r.createdAt.slice(0, 10) }}</td>
            <td>
              <div style="display:flex; align-items:center; gap:0.2rem; justify-content:flex-end; padding-right:0.5rem;">
                <!-- Generate document -->
                <Button icon="pi pi-file-word" size="small" severity="secondary" text
                  title="Generate document from template"
                  style="padding:0.25rem;"
                  @click="openGenDoc(r)" />
                <!-- Download DOCX -->
                <Button v-if="r.downloadable" icon="pi pi-download" size="small" severity="secondary" text
                  title="Download document" style="padding:0.25rem;"
                  :loading="downloadingId === r.id"
                  @click="downloadDocument(r)" />
                <!-- Export JSON -->
                <Button icon="pi pi-code" size="small" severity="secondary" text
                  title="Export data as JSON" style="padding:0.25rem;"
                  :loading="exportingId === r.id"
                  @click="exportJson(r)" />
                <!-- Upload document -->
                <Button icon="pi pi-upload" size="small" severity="secondary" text
                  title="Upload document (DOCX or PDF)"
                  :loading="uploadingId === r.id"
                  style="padding:0.25rem;"
                  @click="uploadDocument(r)" />
                <!-- Publish -->
                <Button v-if="r.status === 'draft' || r.status === 'completed'"
                  icon="pi pi-send" size="small" severity="success" text
                  title="Publish report" style="padding:0.25rem;"
                  @click="publish(r)" />
                <!-- Delete -->
                <Button icon="pi pi-trash" size="small" severity="danger" text
                  title="Delete" style="padding:0.25rem;"
                  @click="deleteReport(r)" />
              </div>
            </td>
          </tr>
          <tr v-if="!processedReports.length">
            <td colspan="5" class="ares-table-empty">No reports yet. Click "New report" to create one.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create report dialog -->
    <GenerateReportDialog
      v-model:visible="showCreate"
      :project-id="engId"
      :org-id="orgId"
      :is-monitor="isMonitorProject"
      @generated="onReportCreated"
    />

    <!-- Generate document / send email dialog -->
    <Dialog v-model:visible="showGenDocDialog" header="Deliver report" modal
      :style="{ width: 'min(460px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">Delivery</label>
          <Select v-model="genDocMode" :options="deliveryModeOptions" option-label="label" option-value="value" style="width:100%;" />
        </div>

        <template v-if="genDocMode === 'document'">
          <p style="margin:0; font-size:0.85rem; color:var(--ares-text-2);">
            Select a template to generate a DOCX from the saved report data.
            Leave empty to auto-select the best available template.
          </p>
          <div>
            <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">Template</label>
            <Select
              v-model="genDocTemplateId"
              :options="templates"
              option-label="name"
              option-value="id"
              placeholder="Auto-select"
              show-clear
              style="width:100%;"
            />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
            <Button label="Cancel" severity="secondary" size="small" @click="showGenDocDialog = false" />
            <Button label="Generate" icon="pi pi-file-word" size="small"
              :loading="generatingDoc" @click="submitGenDoc" />
          </div>
        </template>

        <template v-else>
          <p v-if="genDocTarget && genDocTarget.findingCount !== 1"
            style="margin:0; font-size:0.85rem; color:var(--ares-error);">
            Email delivery is only available for a report with exactly one finding
            (this report has {{ genDocTarget.findingCount }}).
          </p>
          <template v-else>
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">Email template</label>
              <Select v-model="genEmailTemplateId" :options="emailTemplates" option-label="name" option-value="id"
                placeholder="Select a template" style="width:100%;" />
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">Integration</label>
              <Select v-model="genEmailIntegrationId" :options="emailIntegrations" option-label="name" option-value="id"
                placeholder="Select an email integration" style="width:100%;" />
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">To</label>
              <InputText v-model="genEmailTo" style="width:100%;" placeholder="soc@example.com" />
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">CC (optional)</label>
              <InputText v-model="genEmailCc" style="width:100%;" />
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.35rem;">BCC (optional)</label>
              <InputText v-model="genEmailBcc" style="width:100%;" />
            </div>
          </template>
          <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
            <Button label="Cancel" severity="secondary" size="small" @click="showGenDocDialog = false" />
            <Button label="Send" icon="pi pi-send" size="small"
              :disabled="!genDocTarget || genDocTarget.findingCount !== 1 || !genEmailTemplateId || !genEmailIntegrationId || !genEmailTo.trim()"
              :loading="sendingEmail" @click="submitSendEmail" />
          </div>
        </template>
      </div>
    </Dialog>
  </div>
</template>
