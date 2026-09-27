<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { tagsApi, type Tag } from '@/api/tags';
import { projectsApi } from '@/api/projects';
import type { WorkflowScopeKind } from '@/api/workflows';

// Generic "create a tag" modal, droppable into any tag picker — mirrors the inline create-tag
// form EntityTagEditDialog.vue/TagManagerDialog.vue each already embed, but as a standalone
// component that just emits the created Tag rather than also assigning it to something.
const props = defineProps<{
  visible: boolean;
  scopeKind: WorkflowScopeKind;
  /** organization id when scopeKind is 'organization'; project id when scopeKind is 'project'
   *  (resolved to that project's own organization before creating — tags are always org- or
   *  platform-scoped, never project-scoped). Ignored when scopeKind is 'platform'. */
  scopeId?: number;
  /** Fallback project id when scopeId isn't set yet (mirrors callers' own resolution order). */
  projectId?: number;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  created: [tag: Tag];
}>();

const name = ref('');
const color = ref('#4F46E5');
const creating = ref(false);
const error = ref('');

watch(() => props.visible, (open) => {
  if (!open) return;
  name.value = '';
  color.value = '#4F46E5';
  error.value = '';
});

function close() {
  emit('update:visible', false);
}

async function resolveOrgId(): Promise<number> {
  if (props.scopeKind === 'organization') return props.scopeId!;
  const projectId = props.scopeId ?? props.projectId;
  const project = await projectsApi.get(projectId!);
  return project.organizationId;
}

async function submit() {
  if (!name.value.trim()) return;
  creating.value = true;
  error.value = '';
  try {
    const created = props.scopeKind === 'platform'
      ? await tagsApi.createPlatform(name.value.trim(), color.value)
      : await tagsApi.create(await resolveOrgId(), name.value.trim(), color.value);
    emit('created', created);
    close();
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create tag';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)" modal
    header="New tag" :style="{ width: 'min(360px, 95vw)' }">
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <p v-if="error" style="font-size:0.8rem; color:var(--ares-danger, #e5484d); margin:0;">{{ error }}</p>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <input type="color" v-model="color"
          style="width:2.2rem; height:2.2rem; padding:0; border:1px solid var(--ares-border); border-radius:var(--ares-radius); background:none; cursor:pointer;" />
        <InputText v-model="name" placeholder="Tag name…" style="flex:1;" autofocus @keyup.enter="submit" />
      </div>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <Button label="Cancel" severity="secondary" size="small" @click="close" />
        <Button label="Create" size="small" :loading="creating" :disabled="!name.trim()" @click="submit" />
      </div>
    </div>
  </Dialog>
</template>
