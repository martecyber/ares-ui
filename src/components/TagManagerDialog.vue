<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import TagBadge from '@/components/TagBadge.vue';
import { tagsApi, type Tag } from '@/api/tags';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { useToast } from 'primevue/usetoast';

const props = defineProps<{ visible: boolean; orgId: number }>();
const emit = defineEmits<{
  'update:visible': [v: boolean];
  /** Emitted whenever a tag is created, edited or deleted, so the caller can refresh chips. */
  changed: [];
}>();

const toast = useToast();

const DEFAULT_COLOR = '#4F46E5';

const loading = ref(false);
const tags = ref<Tag[]>([]);
const error = ref('');

const newName = ref('');
const newColor = ref(DEFAULT_COLOR);
const creating = ref(false);

const editingId = ref<number | null>(null);
const editName = ref('');
const editColor = ref('');
const saving = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    tags.value = await tagsApi.list(props.orgId);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load tags';
  } finally {
    loading.value = false;
  }
}

watch(() => props.visible, (open) => {
  if (open) {
    newName.value = '';
    newColor.value = DEFAULT_COLOR;
    editingId.value = null;
    load();
  }
}, { immediate: true });

async function createTag() {
  if (!newName.value.trim()) return;
  creating.value = true;
  error.value = '';
  try {
    const created = await tagsApi.create(props.orgId, newName.value.trim(), newColor.value);
    tags.value = [...tags.value, created].sort((a, b) => a.name.localeCompare(b.name));
    newName.value = '';
    newColor.value = DEFAULT_COLOR;
    emit('changed');
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create tag';
  } finally {
    creating.value = false;
  }
}

function startEdit(tag: Tag) {
  editingId.value = tag.id;
  editName.value = tag.name;
  editColor.value = tag.color;
}
function cancelEdit() { editingId.value = null; }

async function saveEdit(id: number) {
  if (!editName.value.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    const updated = await tagsApi.update(id, { name: editName.value.trim(), color: editColor.value });
    tags.value = tags.value.map((t) => (t.id === id ? updated : t)).sort((a, b) => a.name.localeCompare(b.name));
    editingId.value = null;
    emit('changed');
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to save tag';
  } finally {
    saving.value = false;
  }
}

async function deleteTag(tag: Tag) {
  const ok = await confirmDialog({
    header: 'Delete tag',
    message: `Delete "${tag.name}"? It will be removed from every asset it's applied to.`,
  });
  if (!ok) return;
  try {
    await tagsApi.delete(tag.id);
    tags.value = tags.value.filter((t) => t.id !== tag.id);
    emit('changed');
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to delete tag', detail: e?.response?.data?.detail ?? e?.message, life: 5000 });
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Manage tags"
    modal
    style="width:32rem;"
  >
    <div style="display:flex; flex-direction:column; gap:1rem;">
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <input type="color" v-model="newColor" style="width:2.2rem; height:2.2rem; padding:0; border:1px solid var(--ares-border); border-radius: var(--ares-radius); background:none; cursor:pointer;" />
        <InputText v-model="newName" placeholder="New tag name…" style="flex:1;" @keyup.enter="createTag" />
        <Button label="Add" icon="pi pi-plus" size="small" :loading="creating" :disabled="!newName.trim()" @click="createTag" />
      </div>

      <div v-if="loading" style="display:flex; justify-content:center; padding:1.5rem;">
        <ProgressSpinner style="width:2.2rem; height:2.2rem;" />
      </div>

      <div v-else style="display:flex; flex-direction:column; gap:0.4rem; max-height:20rem; overflow-y:auto;">
        <div v-for="tag in tags" :key="tag.id" style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0.2rem; border-bottom:1px solid var(--ares-border);">
          <template v-if="editingId === tag.id">
            <input type="color" v-model="editColor" style="width:2.2rem; height:2.2rem; padding:0; border:1px solid var(--ares-border); border-radius: var(--ares-radius); background:none; cursor:pointer;" />
            <InputText v-model="editName" style="flex:1;" @keyup.enter="saveEdit(tag.id)" @keyup.escape="cancelEdit" autofocus />
            <Button icon="pi pi-check" size="small" severity="success" text :loading="saving" @click="saveEdit(tag.id)" />
            <Button icon="pi pi-times" size="small" severity="secondary" text @click="cancelEdit" />
          </template>
          <template v-else>
            <TagBadge :name="tag.name" :color="tag.color" />
            <span style="flex:1;"></span>
            <Button icon="pi pi-pencil" size="small" severity="secondary" text @click="startEdit(tag)" />
            <Button icon="pi pi-trash" size="small" severity="danger" text @click="deleteTag(tag)" />
          </template>
        </div>
        <p v-if="!tags.length" style="font-size:0.82rem; color:var(--ares-text-muted); margin:0.5rem 0;">
          No tags yet. Add one above.
        </p>
      </div>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; justify-content:flex-end;">
        <Button label="Close" severity="secondary" @click="emit('update:visible', false)" />
      </div>
    </div>
  </Dialog>
</template>
