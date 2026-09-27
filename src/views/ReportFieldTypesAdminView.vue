<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import Popover from 'primevue/popover';
import AresBadge from '@/components/AresBadge.vue';
import { useToast } from 'primevue/usetoast';
import { reportFieldTypesApi, type ReportFieldType, type ReportFieldTemplate } from '@/api/reports';
import {
  TEMPLATE_VARS, FINDING_VARS, DETECTION_VARS, CHART_TOKENS,
  FINDINGS_LOOP_TEMPLATE, DETECTIONS_LOOP_TEMPLATE,
} from '@/utils/templateVars';

const toast = useToast();
const items = ref<ReportFieldType[]>([]);
const loading = ref(true);

// ── Field type form ───────────────────────────────────────────────────────────
const showTypeDialog = ref(false);
const editingType = ref<ReportFieldType | null>(null);
const typeForm = ref({ name: '', label: '', description: '', sortOrder: 0, required: false });
const savingType = ref(false);

function openCreateType() {
  editingType.value = null;
  typeForm.value = { name: '', label: '', description: '', sortOrder: items.value.length, required: false };
  showTypeDialog.value = true;
}

function openEditType(t: ReportFieldType) {
  editingType.value = t;
  typeForm.value = { name: t.name, label: t.label, description: t.description ?? '', sortOrder: t.sortOrder, required: t.required };
  showTypeDialog.value = true;
}

async function saveType() {
  savingType.value = true;
  try {
    if (editingType.value) {
      const updated = await reportFieldTypesApi.update(editingType.value.id, {
        label: typeForm.value.label,
        description: typeForm.value.description,
        sortOrder: typeForm.value.sortOrder,
        required: typeForm.value.required,
      });
      const idx = items.value.findIndex((x) => x.id === editingType.value!.id);
      if (idx !== -1) items.value[idx] = { ...items.value[idx], ...updated };
    } else {
      const created = await reportFieldTypesApi.create(typeForm.value);
      items.value.push(created);
    }
    showTypeDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    savingType.value = false;
  }
}

async function deleteType(t: ReportFieldType) {
  try {
    await reportFieldTypesApi.delete(t.id);
    items.value = items.value.filter((x) => x.id !== t.id);
    toast.add({ severity: 'info', summary: 'Deleted', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

// ── Field template form ───────────────────────────────────────────────────────
const showTplDialog = ref(false);
const activeFt = ref<ReportFieldType | null>(null);
const editingTpl = ref<ReportFieldTemplate | null>(null);
const tplForm = ref({ name: '', content: '', isDefault: false });
const savingTpl = ref(false);

function openCreateTpl(ft: ReportFieldType) {
  activeFt.value = ft;
  editingTpl.value = null;
  tplForm.value = { name: '', content: '', isDefault: false };
  showTplDialog.value = true;
}

function openEditTpl(ft: ReportFieldType, tpl: ReportFieldTemplate) {
  activeFt.value = ft;
  editingTpl.value = tpl;
  tplForm.value = { name: tpl.name, content: tpl.content, isDefault: tpl.isDefault };
  showTplDialog.value = true;
}

async function saveTpl() {
  if (!activeFt.value) return;
  savingTpl.value = true;
  try {
    if (editingTpl.value) {
      const updated = await reportFieldTypesApi.updateTemplate(activeFt.value.id, editingTpl.value.id, tplForm.value);
      const ft = items.value.find((x) => x.id === activeFt.value!.id);
      if (ft) {
        const idx = ft.templates.findIndex((t) => t.id === editingTpl.value!.id);
        if (idx !== -1) ft.templates[idx] = updated as any;
        if (tplForm.value.isDefault) ft.templates.forEach((t, i) => { if (i !== idx) t.isDefault = false; });
      }
    } else {
      const created = await reportFieldTypesApi.createTemplate(activeFt.value.id, tplForm.value);
      const ft = items.value.find((x) => x.id === activeFt.value!.id);
      if (ft) {
        ft.templates.push(created as any);
        if (tplForm.value.isDefault) ft.templates.forEach((t) => { if (t.id !== (created as any).id) t.isDefault = false; });
      }
    }
    showTplDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    savingTpl.value = false;
  }
}

async function deleteTpl(ft: ReportFieldType, tpl: ReportFieldTemplate) {
  try {
    await reportFieldTypesApi.deleteTemplate(ft.id, tpl.id);
    ft.templates = ft.templates.filter((t) => t.id !== tpl.id);
    toast.add({ severity: 'info', summary: 'Deleted', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

// ── Template token insertion ──────────────────────────────────────
const varPopover = ref();

function openVarPicker(e: Event) {
  varPopover.value?.toggle(e);
}

function insertToken(token: string) {
  tplForm.value.content = (tplForm.value.content ?? '') + token;
  varPopover.value?.hide();
}

onMounted(async () => {
  try { items.value = await reportFieldTypesApi.list(); }
  finally { loading.value = false; }
});
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Report Field Types</h2>
        <p class="ares-page-subtitle">Configure custom fields that appear in the report creation dialog.</p>
      </div>
      <Button icon="pi pi-plus" text v-tooltip.top="'New field type'" @click="openCreateType" />
    </div>

    <div v-if="loading" style="display:flex; justify-content:center; padding:3rem;"><i class="pi pi-spin pi-spinner" /></div>

    <div v-else style="display:flex; flex-direction:column; gap:1rem;">
      <div v-for="ft in items" :key="ft.id" class="ares-card ft-card">
        <!-- Field type header -->
        <div class="ft-header">
          <div>
            <div style="display:flex; align-items:center; gap:0.6rem;">
              <span style="font-size:0.95rem; font-weight:600;">{{ ft.label }}</span>
              <code style="font-size:0.7rem; color:var(--ares-text-muted);">{{ ft.name }}</code>
              <AresBadge v-if="ft.required" value="Required" severity="warn" style="font-size:0.65rem;" />
            </div>
            <p v-if="ft.description" style="margin:0.2rem 0 0; font-size:0.78rem; color:var(--ares-text-muted);">{{ ft.description }}</p>
          </div>
          <div style="display:flex; gap:0.3rem; flex-shrink:0;">
            <Button icon="pi pi-pencil" size="small" severity="secondary" text @click="openEditType(ft)" />
            <Button icon="pi pi-trash" size="small" severity="danger" text @click="deleteType(ft)" />
          </div>
        </div>

        <!-- Templates sub-section -->
        <div class="ft-templates">
          <div class="ft-templates-header">
            <span style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ares-text-muted);">
              Content templates ({{ ft.templates.length }})
            </span>
            <Button icon="pi pi-plus" label="Add template" size="small" severity="secondary" text
              @click="openCreateTpl(ft)" />
          </div>
          <div v-if="ft.templates.length" style="display:flex; flex-wrap:wrap; gap:0.5rem; padding:0 1rem 0.85rem;">
            <div v-for="tpl in ft.templates" :key="tpl.id" class="tpl-chip">
              <i v-if="tpl.isDefault" class="pi pi-star-fill" style="font-size:0.65rem; color:#f59e0b;" />
              <span>{{ tpl.name }}</span>
              <button class="tpl-edit" @click="openEditTpl(ft, tpl)"><i class="pi pi-pencil" /></button>
              <button class="tpl-del" @click="deleteTpl(ft, tpl)"><i class="pi pi-times" /></button>
            </div>
          </div>
          <p v-else style="padding:0 1rem 0.85rem; margin:0; font-size:0.78rem; color:var(--ares-text-muted);">
            No templates yet. Add one to pre-fill this field during report creation.
          </p>
        </div>
      </div>

      <div v-if="!items.length" class="ares-card" style="padding:2rem; text-align:center; color:var(--ares-text-muted); font-size:0.85rem;">
        No field types yet.
      </div>
    </div>

    <!-- Field type dialog -->
    <Dialog v-model:visible="showTypeDialog" :header="editingType ? 'Edit field type' : 'New field type'"
      modal :style="{ width: 'min(480px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.9rem;">
        <div>
          <label class="dlg-label">Slug <span style="font-weight:400; color:var(--ares-text-muted);">(e.g. executive_summary)</span></label>
          <InputText v-model="typeForm.name" :disabled="!!editingType" style="width:100%;" placeholder="snake_case identifier" />
        </div>
        <div>
          <label class="dlg-label">Display label</label>
          <InputText v-model="typeForm.label" style="width:100%;" placeholder="Executive Summary" />
        </div>
        <div>
          <label class="dlg-label">Description <span style="font-weight:400; color:var(--ares-text-muted);">(optional)</span></label>
          <InputText v-model="typeForm.description" style="width:100%;" />
        </div>
        <div style="display:flex; gap:1rem;">
          <div style="flex:1;">
            <label class="dlg-label">Sort order</label>
            <InputNumber v-model="typeForm.sortOrder" :min="0" :max="999" style="width:100%;" />
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showTypeDialog = false" />
          <Button :label="editingType ? 'Save' : 'Create'" icon="pi pi-check" size="small"
            :loading="savingType" @click="saveType" />
        </div>
      </div>
    </Dialog>

    <!-- Field template dialog -->
    <Dialog v-model:visible="showTplDialog"
      :header="(editingTpl ? 'Edit' : 'New') + ' template for ' + (activeFt?.label ?? '')"
      modal :style="{ width: 'min(680px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.9rem;">
        <div style="display:flex; align-items:center; gap:1rem;">
          <div style="flex:1;">
            <label class="dlg-label">Template name</label>
            <InputText v-model="tplForm.name" style="width:100%;" placeholder="e.g. Web application assessment" />
          </div>
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; padding-top:1.5rem;">
            <input type="checkbox" v-model="tplForm.isDefault" style="cursor:pointer;" />
            <span style="font-size:0.82rem;">Set as default</span>
          </label>
        </div>
        <div>
          <label class="dlg-label">Content</label>
          <div class="tpl-toolbar">
            <Button size="small" text severity="secondary" icon="pi pi-code" label="Variable" @click="openVarPicker($event)" />
            <div class="tpl-toolbar-sep" />
            <Button size="small" text severity="secondary" icon="pi pi-chart-pie" label="Pie chart" @click="insertToken(CHART_TOKENS.PIE)" />
            <Button size="small" text severity="secondary" icon="pi pi-chart-bar" label="Bar chart" @click="insertToken(CHART_TOKENS.BAR)" />
            <div class="tpl-toolbar-sep" />
            <Button size="small" text severity="secondary" icon="pi pi-list-check" label="Findings loop" @click="insertToken(FINDINGS_LOOP_TEMPLATE)" />
            <Button size="small" text severity="secondary" icon="pi pi-list-check" label="Detections loop" @click="insertToken(DETECTIONS_LOOP_TEMPLATE)" />
          </div>
          <MarkdownEditor v-model="tplForm.content" editor-style="min-height:160px; max-height:340px; overflow-y:auto;" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showTplDialog = false" />
          <Button :label="editingTpl ? 'Save' : 'Create'" icon="pi pi-check" size="small"
            :loading="savingTpl" @click="saveTpl" />
        </div>
      </div>
    </Dialog>

    <!-- Variable picker popover -->
    <Popover ref="varPopover">
      <div class="var-picker">
        <div class="var-picker-title">Insert variable</div>
        <template v-for="group in ['project', 'findings', 'detections']" :key="group">
          <div class="var-group-label">
            {{ group === 'project' ? 'Project' : group === 'findings' ? 'Findings (counts)' : 'Detections (counts)' }}
          </div>
          <button
            v-for="v in TEMPLATE_VARS.filter(x => x.group === group)"
            :key="v.token"
            class="var-option"
            @click="insertToken(v.token)"
          >
            <code class="var-token">{{ v.token }}</code>
            <span class="var-desc">{{ v.description }}</span>
          </button>
        </template>
        <div class="var-group-label">Inside <code v-pre style="font-family:monospace;">{{#findings}}</code> loop</div>
        <button
          v-for="v in FINDING_VARS"
          :key="v.token"
          class="var-option"
          @click="insertToken(v.token)"
        >
          <code class="var-token">{{ v.token }}</code>
          <span class="var-desc">{{ v.description }}</span>
        </button>
        <div class="var-group-label">Inside <code v-pre style="font-family:monospace;">{{#detections}}</code> loop</div>
        <button
          v-for="v in DETECTION_VARS"
          :key="v.token"
          class="var-option"
          @click="insertToken(v.token)"
        >
          <code class="var-token">{{ v.token }}</code>
          <span class="var-desc">{{ v.description }}</span>
        </button>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
/* ── Template content toolbar ───────────────────────────────────── */
.tpl-toolbar {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.25rem 0.4rem;
  background: var(--ares-surface-2, rgba(255,255,255,0.04));
  border: 1px solid var(--ares-border);
  border-bottom: none;
  border-radius: var(--ares-radius) var(--ares-radius) 0 0;
}
.tpl-toolbar-sep { width:1px; height:16px; background:var(--ares-border); margin:0 0.2rem; flex-shrink:0; }
:deep(.tpl-toolbar .p-button) { padding: 0.2rem 0.45rem; font-size: 0.75rem; }

/* ── Variable picker popover ────────────────────────────────────── */
.var-picker { width: 300px; }
.var-picker-title {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--ares-text-muted); padding: 0.5rem 0.75rem 0.25rem;
}
.var-group-label {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--ares-text-muted);
  padding: 0.4rem 0.75rem 0.15rem;
  border-top: 1px solid var(--ares-border); margin-top: 0.25rem;
}
.var-option {
  display: flex; flex-direction: column; gap: 0.1rem;
  width: 100%; background: transparent; border: none; cursor: pointer;
  padding: 0.4rem 0.75rem; text-align: left; transition: background 0.1s;
}
.var-option:hover { background: var(--ares-surface-2); }
.var-token { font-size: 0.72rem; color: var(--p-primary-400); font-family: monospace; }
.var-desc  { font-size: 0.72rem; color: var(--ares-text-muted); }

.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.ft-card { padding: 0; overflow: hidden; }
.ft-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--ares-border);
}
.ft-templates { }
.ft-templates-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem 0.4rem;
}
.tpl-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--ares-surface-sunken);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.2rem 0.65rem;
  font-size: 0.78rem;
  color: var(--ares-text-2);
}
.tpl-edit, .tpl-del {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); font-size: 0.65rem; padding: 0;
}
.tpl-edit:hover { color: var(--p-primary-400); }
.tpl-del:hover  { color: #ef4444; }
</style>
