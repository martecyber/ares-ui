<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import TagBadge from '@/components/TagBadge.vue';
import { tagsApi, type Tag } from '@/api/tags';

const props = defineProps<{
  visible: boolean;
  /** Omit (or pass null) together with `platform: true` for entities with no organization of
   *  their own (Exploit, FindingTemplate) — the picker then shows/creates platform tags instead
   *  of this org's own catalog. */
  orgId?: number | null;
  /** Platform tags only — no organization of their own, the only tier assignable to Exploit/
   *  FindingTemplate. Creating one requires MSSP_ADMIN (enforced server-side). */
  platform?: boolean;
  /** Tags currently assigned to the entity being edited. */
  assignedTags: Tag[] | undefined;
  assign: (tagId: number) => Promise<void>;
  unassign: (tagId: number) => Promise<void>;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  /** Fired after every successful assign/unassign, so the caller can refresh the entity. */
  changed: [];
}>();

const loading = ref(false);
const orgTags = ref<Tag[]>([]);
const assignedIds = ref<Set<number>>(new Set());
const busyTagId = ref<number | null>(null);
const error = ref('');

const newName = ref('');
const newColor = ref('#4F46E5');
const creating = ref(false);

const isAssigned = (id: number) => assignedIds.value.has(id);

watch(() => props.visible, async (open) => {
  if (!open) return;
  error.value = '';
  newName.value = '';
  newColor.value = '#4F46E5';
  assignedIds.value = new Set((props.assignedTags ?? []).map((t) => t.id));
  loading.value = true;
  try {
    orgTags.value = props.platform ? await tagsApi.listPlatform() : await tagsApi.list(props.orgId!);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load tags';
  } finally {
    loading.value = false;
  }
}, { immediate: true });

async function toggle(tag: Tag) {
  busyTagId.value = tag.id;
  error.value = '';
  try {
    if (isAssigned(tag.id)) {
      await props.unassign(tag.id);
      const next = new Set(assignedIds.value);
      next.delete(tag.id);
      assignedIds.value = next;
    } else {
      await props.assign(tag.id);
      assignedIds.value = new Set(assignedIds.value).add(tag.id);
    }
    emit('changed');
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to update tag';
  } finally {
    busyTagId.value = null;
  }
}

async function createAndAssign() {
  if (!newName.value.trim()) return;
  creating.value = true;
  error.value = '';
  try {
    const created = props.platform
      ? await tagsApi.createPlatform(newName.value.trim(), newColor.value)
      : await tagsApi.create(props.orgId!, newName.value.trim(), newColor.value);
    orgTags.value = [...orgTags.value, created].sort((a, b) => a.name.localeCompare(b.name));
    newName.value = '';
    newColor.value = '#4F46E5';
    await toggle(created);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create tag';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Edit tags"
    modal
    style="width:30rem;"
  >
    <div style="display:flex; flex-direction:column; gap:1rem;">
      <div v-if="loading" style="display:flex; justify-content:center; padding:1.5rem;">
        <ProgressSpinner style="width:2.2rem; height:2.2rem;" />
      </div>

      <template v-else>
        <p style="margin:0; font-size:0.8rem; color:var(--ares-text-muted);">
          Click a tag to add or remove it.
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
          <button
            v-for="tag in orgTags"
            :key="tag.id"
            type="button"
            class="tag-toggle"
            :class="{ 'tag-toggle--off': !isAssigned(tag.id) }"
            :disabled="busyTagId === tag.id"
            @click="toggle(tag)"
          >
            <TagBadge :name="tag.name" :color="tag.color" />
            <i v-if="isAssigned(tag.id)" class="pi pi-check" style="font-size:0.65rem;" />
          </button>
          <p v-if="!orgTags.length" style="font-size:0.82rem; color:var(--ares-text-muted); margin:0;">
            {{ platform ? 'No platform tags yet — create one below.' : 'No tags in this organization yet — create one below.' }}
          </p>
        </div>

        <div style="display:flex; align-items:center; gap:0.5rem; padding-top:0.5rem; border-top:1px solid var(--ares-border);">
          <input type="color" v-model="newColor" style="width:2.2rem; height:2.2rem; padding:0; border:1px solid var(--ares-border); border-radius: var(--ares-radius); background:none; cursor:pointer;" />
          <InputText v-model="newName" placeholder="New tag name…" style="flex:1;" @keyup.enter="createAndAssign" />
          <Button label="Add" icon="pi pi-plus" size="small" :loading="creating" :disabled="!newName.trim()" @click="createAndAssign" />
        </div>
      </template>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; justify-content:flex-end;">
        <Button label="Done" @click="emit('update:visible', false)" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.tag-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: var(--ares-radius);
}
.tag-toggle--off { opacity: 0.45; }
.tag-toggle:hover { opacity: 0.8; }
.tag-toggle--off:hover { opacity: 0.7; }
.tag-toggle:disabled { cursor: default; opacity: 0.3; }
</style>
