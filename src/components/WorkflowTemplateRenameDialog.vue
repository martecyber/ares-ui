<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Button from 'primevue/button';
import { workflowTemplatesApi, type WorkflowTemplate } from '@/api/workflow-templates';
import type { WorkflowScopeKind } from '@/api/workflows';

const props = defineProps<{
  visible: boolean;
  template: WorkflowTemplate | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  saved: [template: WorkflowTemplate];
}>();

const SCOPE_OPTIONS: { label: string; value: WorkflowScopeKind }[] = [
  { label: 'Platform', value: 'platform' },
  { label: 'Organization', value: 'organization' },
  { label: 'Project', value: 'project' },
];

const name = ref('');
const description = ref('');
const scopeKind = ref<WorkflowScopeKind>('platform');
const saving = ref(false);
const err = ref<string | null>(null);

watch(() => props.visible, (open) => {
  if (open && props.template) {
    name.value = props.template.name;
    description.value = props.template.description ?? '';
    scopeKind.value = props.template.scopeKind;
    err.value = null;
  }
});

function close() { emit('update:visible', false); }

async function save() {
  if (!props.template || !name.value.trim()) return;
  saving.value = true;
  err.value = null;
  try {
    const updated = await workflowTemplatesApi.update(props.template.id, {
      name: name.value.trim(),
      description: description.value || undefined,
      scopeKind: scopeKind.value,
      graphDefinition: props.template.graphDefinition,
    });
    emit('saved', updated);
    close();
  } catch {
    err.value = 'Failed to save changes.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)" modal
    header="Template details" :style="{ width: 'min(480px, 95vw)' }">
    <div style="display:flex; flex-direction:column; gap:1rem;">
      <div v-if="err" class="ares-alert ares-alert--error">{{ err }}</div>
      <div>
        <label class="ares-field-label">Name</label>
        <InputText v-model="name" style="width:100%;" />
      </div>
      <div>
        <label class="ares-field-label">Description (optional)</label>
        <Textarea v-model="description" rows="2" class="w-full" auto-resize />
      </div>
      <div>
        <label class="ares-field-label">Scope</label>
        <Select v-model="scopeKind" :options="SCOPE_OPTIONS" option-label="label" option-value="value" style="width:100%;" />
        <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0.35rem 0 0;">
          Changing this can invalidate node types the graph already uses (e.g. an agent-task node
          only makes sense at project scope) — fix those in the graph editor if saving here fails.
        </p>
      </div>
      <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0;">
        Open the template (click its row) to edit the graph itself in the workflow editor.
      </p>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <Button label="Cancel" severity="secondary" size="small" @click="close" />
        <Button label="Save" size="small" :loading="saving" :disabled="!name.trim()" @click="save" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.ares-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
