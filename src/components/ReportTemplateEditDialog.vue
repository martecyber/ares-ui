<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Message from 'primevue/message';
import { reportTemplatesApi, SYSTEM_FIELDS, type ReportTemplate, type PriorityColor } from '@/api/reports';
import { projectTypesApi, type ProjectType } from '@/api/project-types';
import { findingFieldTypesApi, type FindingFieldType } from '@/api/finding-field-types';
import { severityToPriorityLabel } from '@/utils/cvss';

const props = defineProps<{ visible: boolean; template: ReportTemplate }>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  updated: [template: ReportTemplate];
}>();

const saving = ref(false);
const error = ref('');
const engTypes = ref<ProjectType[]>([]);
const fieldTypes = ref<FindingFieldType[]>([]);

const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'] as const;
const DEFAULT_PRIORITY_COLORS: Record<string, PriorityColor> = {
  critical: { bgColor: '8B0000', textColor: 'FFFFFF', label: '' },
  high:     { bgColor: 'E53935', textColor: 'FFFFFF', label: '' },
  medium:   { bgColor: 'FB8C00', textColor: 'FFFFFF', label: '' },
  low:      { bgColor: '1E88E5', textColor: 'FFFFFF', label: '' },
  info:     { bgColor: '757575', textColor: 'FFFFFF', label: '' },
};

/** What actually gets stamped into the generated report: the author's custom label if
 *  set, else the P0-P4 default — mirrors the backend's PriorityLabels fallback. */
function resolvedLabel(sev: string): string {
  return form.value.priorityColors[sev]?.label?.trim() || severityToPriorityLabel(sev);
}

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const uploadingFile = ref(false);

const form = ref({
  name: '',
  description: '',
  isGeneric: false,
  isActive: true,
  projectTypeIds: [] as number[],
  variables: [] as Array<{
    variableName: string;
    sourceType: 'system' | 'field_type';
    systemField: string | undefined;
    fieldTypeId: number | undefined;
  }>,
  magicColor: 'FF00FF',
  priorityColors: { ...DEFAULT_PRIORITY_COLORS } as Record<string, PriorityColor>,
});

watch(
  () => props.visible,
  (val) => {
    if (val) {
      form.value = {
        name: props.template.name,
        description: props.template.description ?? '',
        isGeneric: props.template.isGeneric,
        isActive: props.template.isActive,
        projectTypeIds: [...props.template.projectTypeIds],
        variables: props.template.variables.map((v) => ({
          variableName: v.variableName,
          sourceType: v.sourceType,
          systemField: v.systemField ?? undefined,
          fieldTypeId: v.fieldTypeId ?? undefined,
        })),
        magicColor: props.template.magicColor ?? 'FF00FF',
        priorityColors: props.template.priorityColors
          ? { ...DEFAULT_PRIORITY_COLORS, ...props.template.priorityColors }
          : { ...DEFAULT_PRIORITY_COLORS },
      };
      selectedFile.value = null;
      error.value = '';
    }
  },
  { immediate: true },
);

function addVariable() {
  form.value.variables.push({ variableName: '', sourceType: 'system', systemField: undefined, fieldTypeId: undefined });
}

function removeVariable(idx: number) {
  form.value.variables.splice(idx, 1);
}

async function submit() {
  if (!form.value.name.trim()) return;
  error.value = '';
  saving.value = true;
  try {
    const updated = await reportTemplatesApi.update(props.template.id, {
      name: form.value.name.trim(),
      description: form.value.description || undefined,
      isGeneric: form.value.isGeneric,
      isActive: form.value.isActive,
      projectTypeIds: form.value.isGeneric ? [] : form.value.projectTypeIds,
      variables: form.value.variables.filter((v) => v.variableName.trim()),
      magicColor: form.value.magicColor.replace('#', '').toUpperCase(),
      priorityColors: form.value.priorityColors,
    });
    emit('updated', updated);
    emit('update:visible', false);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Update failed';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  [engTypes.value, fieldTypes.value] = await Promise.all([
    projectTypesApi.list(),
    findingFieldTypesApi.list(),
  ]);
});
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Edit report template"
    modal
    style="width:50rem;"
  >
    <div style="display:flex; flex-direction:column; gap:0.9rem; padding-top:0.5rem;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-field">
          <label>Name *</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div style="display:flex; align-items:flex-end; gap:1.5rem; padding-bottom:0.1rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <ToggleSwitch v-model="form.isGeneric" input-id="edit-generic" />
            <label for="edit-generic" style="cursor:pointer; font-size:0.85rem;">Generic</label>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <ToggleSwitch v-model="form.isActive" input-id="edit-active" />
            <label for="edit-active" style="cursor:pointer; font-size:0.85rem;">Active</label>
          </div>
        </div>
      </div>

      <div class="form-field">
        <label>Description</label>
        <Textarea v-model="form.description" class="w-full" rows="2" />
      </div>

      <div v-if="!form.isGeneric" class="form-field">
        <label>Project types</label>
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.25rem;">
          <label
            v-for="et in engTypes"
            :key="et.id"
            style="display:flex; align-items:center; gap:0.35rem; font-size:0.85rem; cursor:pointer;"
          >
            <input
              type="checkbox"
              :value="et.id"
              :checked="form.projectTypeIds.includes(et.id)"
              @change="(e) => {
                const v = et.id;
                const checked = (e.target as HTMLInputElement).checked;
                if (checked) form.projectTypeIds.push(v);
                else form.projectTypeIds = form.projectTypeIds.filter(x => x !== v);
              }"
            />
            {{ et.name }}
          </label>
        </div>
      </div>

      <!-- Variable mappings -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <label style="font-size:0.85rem; font-weight:600; color:var(--ares-text-muted);">Template variables</label>
          <Button icon="pi pi-plus" label="Add variable" size="small" severity="secondary" @click="addVariable" />
        </div>
        <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0 0 0.5rem;">
          Map template placeholders like <code>&#123;&#123;variable_name&#125;&#125;</code> to system fields or custom finding fields.
        </p>

        <div
          v-for="(v, idx) in form.variables"
          :key="idx"
          style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:0.5rem; align-items:flex-end; margin-bottom:0.5rem;"
        >
          <div class="form-field" style="margin:0;">
            <label style="font-size:0.75rem;">Variable name</label>
            <InputText v-model="v.variableName" placeholder="e.g. description" style="width:100%;" />
          </div>
          <div class="form-field" style="margin:0;">
            <label style="font-size:0.75rem;">Source</label>
            <Select
              v-model="v.sourceType"
              :options="[{ label: 'System field', value: 'system' }, { label: 'Custom field', value: 'field_type' }]"
              option-label="label"
              option-value="value"
              style="width:100%;"
              @change="() => { v.systemField = undefined; v.fieldTypeId = undefined; }"
            />
          </div>
          <div class="form-field" style="margin:0;">
            <label style="font-size:0.75rem;">Field</label>
            <Select
              v-if="v.sourceType === 'system'"
              v-model="v.systemField"
              :options="SYSTEM_FIELDS"
              option-label="label"
              option-value="value"
              placeholder="Select…"
              style="width:100%;"
            />
            <Select
              v-else
              v-model="v.fieldTypeId"
              :options="fieldTypes"
              option-label="title"
              option-value="id"
              placeholder="Select…"
              style="width:100%;"
            />
          </div>
          <Button icon="pi pi-times" severity="danger" text size="small" style="padding:0.25rem; margin-bottom:0.1rem;" @click="removeVariable(idx)" />
        </div>

        <p v-if="!form.variables.length" style="font-size:0.8rem; color:var(--ares-text-muted); font-style:italic;">
          No variables defined. Add at least one to map template placeholders to data.
        </p>
      </div>

      <!-- Priority colors -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <label style="font-size:0.85rem; font-weight:600; color:var(--ares-text-muted);">Priority colors</label>
          <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.78rem; color:var(--ares-text-muted);">
            <span>Magic color:</span>
            <div style="display:flex; align-items:center; gap:0.35rem;">
              <input type="color" :value="'#' + form.magicColor"
                style="width:24px; height:24px; border:none; cursor:pointer; background:none;"
                @input="(e) => form.magicColor = (e.target as HTMLInputElement).value.replace('#', '').toUpperCase()" />
              <code style="font-size:0.75rem;">#{{ form.magicColor }}</code>
            </div>
          </div>
        </div>
        <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0 0 0.5rem;">
          Template elements using the magic color will be replaced with the corresponding finding's priority color.
          The text shown for each priority is also configurable — leave it blank to use the default value (P0-P4).
        </p>
        <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:0.5rem;">
          <div v-for="sev in SEVERITY_LEVELS" :key="sev" style="display:flex; flex-direction:column; gap:0.3rem; align-items:center;">
            <div :style="{ background:'#'+form.priorityColors[sev]?.bgColor, color:'#'+form.priorityColors[sev]?.textColor,
              padding:'0.25rem 0.4rem', borderRadius:'4px', fontSize:'0.7rem', fontWeight:700, width:'100%', textAlign:'center' }">
              {{ resolvedLabel(sev) }}
            </div>
            <input
              type="text"
              :value="form.priorityColors[sev]?.label ?? ''"
              :placeholder="severityToPriorityLabel(sev)"
              maxlength="30"
              style="width:100%; font-size:0.72rem; text-align:center; padding:0.15rem 0.25rem; border-radius: var(--ares-radius); border:1px solid var(--ares-border); background:var(--ares-surface-raised); color:var(--ares-text);"
              @input="(e) => { if (form.priorityColors[sev]) form.priorityColors[sev].label = (e.target as HTMLInputElement).value }"
            />
            <div style="display:flex; gap:0.25rem; align-items:center;">
              <div style="display:flex; flex-direction:column; align-items:center; gap:0.1rem;">
                <span style="font-size:0.6rem; color:var(--ares-text-muted);">BG</span>
                <input type="color" :value="'#'+(form.priorityColors[sev]?.bgColor??'888888')"
                  style="width:22px; height:22px; border:none; cursor:pointer; background:none;"
                  @input="(e) => { if(form.priorityColors[sev]) form.priorityColors[sev].bgColor = (e.target as HTMLInputElement).value.replace('#','').toUpperCase() }" />
              </div>
              <div style="display:flex; flex-direction:column; align-items:center; gap:0.1rem;">
                <span style="font-size:0.6rem; color:var(--ares-text-muted);">Text</span>
                <input type="color" :value="'#'+(form.priorityColors[sev]?.textColor??'FFFFFF')"
                  style="width:22px; height:22px; border:none; cursor:pointer; background:none;"
                  @input="(e) => { if(form.priorityColors[sev]) form.priorityColors[sev].textColor = (e.target as HTMLInputElement).value.replace('#','').toUpperCase() }" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Replace template file -->
      <div style="border-top:1px solid var(--ares-border); padding-top:0.75rem;">
        <label style="font-size:0.85rem; font-weight:600; color:var(--ares-text-muted); display:block; margin-bottom:0.4rem;">Replace template file</label>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <input ref="fileInput" type="file" accept=".docx" style="display:none;" @change="(e) => selectedFile = (e.target as HTMLInputElement).files?.[0] ?? null" />
          <Button icon="pi pi-paperclip" label="Select file" size="small" severity="secondary" @click="fileInput?.click()" />
          <span v-if="selectedFile" style="font-size:0.8rem; color:var(--ares-text-muted);">{{ selectedFile.name }}</span>
          <Button v-if="selectedFile" icon="pi pi-upload" label="Upload" size="small" :loading="uploadingFile"
            @click="async () => {
              if (!selectedFile) return;
              uploadingFile = true;
              try {
                const updated = await reportTemplatesApi.updateFile(props.template.id, selectedFile);
                emit('updated', updated);
                selectedFile = null;
              } catch { error = 'File upload failed'; }
              finally { uploadingFile = false; }
            }" />
        </div>
        <p v-if="selectedFile" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
          The current file will be replaced. The template's metadata and variables are preserved.
        </p>
      </div>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.25rem;">
        <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
        <Button label="Save" :loading="saving" :disabled="!form.name.trim()" @click="submit" />
      </div>
    </div>
  </Dialog>
</template>
