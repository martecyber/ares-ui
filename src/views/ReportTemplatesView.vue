<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { reportTemplatesApi, type ReportTemplate } from '@/api/reports';
import ReportTemplateEditDialog from '@/components/ReportTemplateEditDialog.vue';

const router = useRouter();
const toast = useToast();
const items = ref<ReportTemplate[]>([]);
const loading = ref(true);

// ── Upload dialog ───────────────���────────────────────────────────────────────
const showUpload = ref(false);
const uploading = ref(false);
const uploadError = ref('');
const uploadForm = ref({ name: '', description: '', isGeneric: false });
const selectedFile = ref<File | null>(null);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
}

async function submitUpload() {
  if (!selectedFile.value || !uploadForm.value.name.trim()) return;
  uploading.value = true;
  uploadError.value = '';
  try {
    const created = await reportTemplatesApi.upload(
      selectedFile.value,
      uploadForm.value.name.trim(),
      uploadForm.value.description,
      uploadForm.value.isGeneric,
    );
    items.value.unshift(created);
    showUpload.value = false;
    selectedFile.value = null;
    toast.add({ severity: 'success', summary: 'Template uploaded', life: 3000 });
  } catch (e: any) {
    uploadError.value = e?.response?.data?.detail ?? e?.message ?? 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

// ── Edit dialog ──────────────────────────────────────────────────────────────
const editTarget = ref<ReportTemplate | null>(null);

function onUpdated(t: ReportTemplate) {
  const idx = items.value.findIndex((i) => i.id === t.id);
  if (idx !== -1) items.value[idx] = t;
  editTarget.value = null;
}

// ── Analyze ────────────────────────────────────────────────────────────────
import { type TemplateVariable } from '@/api/reports';
const analyzeTarget = ref<ReportTemplate | null>(null);
const analyzeVars = ref<TemplateVariable[]>([]);
const analyzing = ref(false);

async function openAnalyze(t: ReportTemplate) {
  analyzeTarget.value = t;
  analyzeVars.value = [];
  analyzing.value = true;
  try {
    analyzeVars.value = await reportTemplatesApi.analyze(t.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Analysis failed', detail: e?.message, life: 4000 });
    analyzeTarget.value = null;
  } finally {
    analyzing.value = false;
  }
}

function analyzeVarSeverity(type: string) {
  switch (type) {
    case 'system': return 'success';
    case 'report_field': return 'info';
    case 'mapped': return 'secondary';
    default: return 'warn';
  }
}
function analyzeVarLabel(type: string) {
  switch (type) {
    case 'system': return 'System';
    case 'report_field': return 'Report field';
    case 'mapped': return 'Mapped';
    default: return 'Unknown';
  }
}

function wrapBraces(v: string) { return '{{' + v + '}}'; }

// ── Download ──────────────────────────────────────────────────────────────────
async function downloadTemplate(t: ReportTemplate) {
  try {
    const blob = await reportTemplatesApi.download(t.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t.originalFilename || `template_${t.id}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.add({ severity: 'error', summary: 'Download failed', life: 3000 });
  }
}

// ── Delete ─────────────────────────────────���──────────────────────────��──────
const deleteTarget = ref<ReportTemplate | null>(null);
const deleting = ref(false);

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await reportTemplatesApi.delete(deleteTarget.value.id);
    items.value = items.value.filter((i) => i.id !== deleteTarget.value!.id);
    toast.add({ severity: 'success', summary: 'Template deleted', life: 3000 });
    deleteTarget.value = null;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.message, life: 4000 });
  } finally {
    deleting.value = false;
  }
}

onMounted(async () => {
  try {
    items.value = await reportTemplatesApi.list();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Report Templates</h2>
        <p class="ares-page-subtitle">Manage DOCX templates for report generation. Use <code>&#123;&#123;variable&#125;&#125;</code> placeholders.</p>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button icon="pi pi-book" text severity="secondary" v-tooltip.top="'Authoring guide'" @click="router.push({ name: 'report-templates-help' })" />
        <Button icon="pi pi-upload" text v-tooltip.top="'Upload template'" @click="showUpload = true" />
      </div>
    </div>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <div v-else class="ares-table-wrap">
      <table class="ares-table">
        <thead>
          <tr>
            <th>Name</th>
            <th style="width:80px;">Format</th>
            <th style="width:80px;">Generic</th>
            <th style="width:70px;">Active</th>
            <th style="width:100px;">Types</th>
            <th style="width:120px;">Variables</th>
            <th style="width:110px;">Uploaded</th>
            <th style="width:100px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in items" :key="t.id">
            <td>
              <span style="font-weight:500;">{{ t.name }}</span>
              <div v-if="t.description" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.15rem;">{{ t.description }}</div>
              <div style="font-size:0.7rem; color:var(--ares-text-muted);">{{ t.originalFilename }}</div>
            </td>
            <td><AresBadge value="DOCX" severity="secondary" /></td>
            <td>
              <AresBadge v-if="t.isGeneric" value="Yes" severity="info" />
              <span v-else style="color:var(--ares-text-muted);">—</span>
            </td>
            <td>
              <AresBadge v-if="t.isActive" value="Active" severity="success" />
              <AresBadge v-else value="Inactive" severity="secondary" />
            </td>
            <td style="color:var(--ares-text-muted); font-size:0.8rem;">
              {{ t.isGeneric ? 'All' : (t.projectTypeIds.length || '—') }}
            </td>
            <td style="color:var(--ares-text-muted); font-size:0.8rem;">{{ t.variables.length }}</td>
            <td style="font-size:0.8rem;">{{ t.createdAt.slice(0, 10) }}</td>
            <td style="white-space:nowrap; display:flex; gap:0.25rem;">
              <Button icon="pi pi-search" size="small" severity="secondary" text style="padding:0.25rem;" title="Analyze variables" :loading="analyzing && analyzeTarget?.id === t.id" @click="openAnalyze(t)" />
              <Button icon="pi pi-download" size="small" severity="secondary" text style="padding:0.25rem;" title="Download template" @click="downloadTemplate(t)" />
              <Button icon="pi pi-pencil" size="small" severity="secondary" text style="padding:0.25rem;" @click="editTarget = t" />
              <Button icon="pi pi-trash" size="small" severity="danger" text style="padding:0.25rem;" @click="deleteTarget = t" />
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="8" class="ares-table-empty">No report templates yet. Upload a DOCX file to get started.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Upload dialog -->
    <Dialog v-model:visible="showUpload" header="Upload report template" modal style="width:36rem;">
      <div style="display:flex; flex-direction:column; gap:0.9rem; padding-top:0.5rem;">
        <div class="form-field">
          <label>Name *</label>
          <InputText v-model="uploadForm.name" class="w-full" placeholder="e.g. ASSESS Generic Report" />
        </div>
        <div class="form-field">
          <label>Description</label>
          <Textarea v-model="uploadForm.description" class="w-full" rows="2" />
        </div>
        <div class="form-field">
          <label>Template file (.docx) *</label>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <input ref="fileInputRef" type="file" accept=".docx" style="display:none;" @change="onFileChange" />
            <Button icon="pi pi-paperclip" label="Choose file" size="small" severity="secondary"
              @click="($refs.fileInputRef as HTMLInputElement).click()" />
            <span style="font-size:0.82rem; color:var(--ares-text-muted);">
              {{ selectedFile ? selectedFile.name : 'No file selected' }}
            </span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <ToggleSwitch v-model="uploadForm.isGeneric" input-id="isGeneric" />
          <label for="isGeneric" style="cursor:pointer; font-size:0.85rem;">
            Generic (applies to all project types)
          </label>
        </div>
        <Message v-if="uploadError" severity="error" :closable="false">{{ uploadError }}</Message>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.25rem;">
          <Button label="Cancel" severity="secondary" @click="showUpload = false" />
          <Button
            label="Upload"
            :loading="uploading"
            :disabled="!selectedFile || !uploadForm.name.trim()"
            @click="submitUpload"
          />
        </div>
      </div>
    </Dialog>

    <!-- Edit dialog -->
    <ReportTemplateEditDialog
      v-if="editTarget"
      :visible="!!editTarget"
      :template="editTarget"
      @update:visible="(v) => { if (!v) editTarget = null; }"
      @updated="onUpdated"
    />

    <!-- Delete confirm dialog -->
    <Dialog :visible="!!deleteTarget" @update:visible="(v) => { if (!v) deleteTarget = null; }" header="Delete template" modal style="width:28rem;">
      <p style="margin:0.5rem 0 1.5rem;">
        Delete template <strong>{{ deleteTarget?.name }}</strong>? The DOCX file will be removed from storage.
      </p>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" @click="deleteTarget = null" />
        <Button label="Delete" severity="danger" :loading="deleting" @click="confirmDelete" />
      </div>
    </Dialog>

    <!-- Analyze dialog -->
    <Dialog :visible="!!analyzeTarget" @update:visible="(v) => { if (!v) analyzeTarget = null; }"
      :header="'Variables — ' + (analyzeTarget?.name ?? '')" modal style="width:min(560px,96vw)">
      <div v-if="analyzing" style="text-align:center; padding:1rem; color:var(--ares-text-muted);">Analyzing…</div>
      <div v-else>
        <p style="font-size:0.8rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">
          Variables found in the template with their resolution status.
        </p>
        <div style="display:flex; flex-direction:column; gap:0.4rem;">
          <div v-for="v in analyzeVars" :key="v.variable"
            style="display:flex; align-items:center; gap:0.65rem; padding:0.4rem 0.75rem; border:1px solid var(--ares-border); border-radius: var(--ares-radius); background:var(--ares-surface-raised);">
            <code style="font-size:0.8rem; font-weight:600; color:var(--ares-accent); flex:1;">{{ wrapBraces(v.variable) }}</code>
            <span v-if="v.fieldLabel" style="font-size:0.75rem; color:var(--ares-text-muted);">{{ v.fieldLabel }}</span>
            <AresBadge :value="analyzeVarLabel(v.type)" :severity="analyzeVarSeverity(v.type)" style="font-size:0.65rem;" />
          </div>
          <p v-if="!analyzeVars.length" style="font-size:0.82rem; color:var(--ares-text-muted); padding:0.5rem;">
            No <code v-pre>{{'...'}}</code> variables found in the template.
          </p>
        </div>
        <div v-if="analyzeVars.some(v => v.type === 'unknown')" style="margin-top:0.75rem; padding:0.65rem 0.85rem; background:color-mix(in srgb,#f97316 10%,transparent); border:1px solid color-mix(in srgb,#f97316 30%,transparent); border-radius: var(--ares-radius); font-size:0.78rem; color:#f97316;">
          ⚠ Some variables are unknown — they won't be filled in unless you add a mapping in the template editor.
        </div>
      </div>
    </Dialog>
  </div>
</template>
