<script setup lang="ts">
// Minimal title-only prompt — the board is created empty, then opened on its own page
// (ProjectResearchBoardView) where detections/notes/members are added through the same actions
// an existing board uses.
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { researchBoardsApi } from '@/api/researchBoards';

const props = defineProps<{ visible: boolean; projectId: number }>();
const emit = defineEmits<{ 'update:visible': [boolean]; created: [boardId: number] }>();

const title = ref('');
const creating = ref(false);

watch(() => props.visible, (v) => { if (v) title.value = ''; });

async function create() {
  if (!title.value.trim()) return;
  creating.value = true;
  try {
    const board = await researchBoardsApi.create(props.projectId, { title: title.value.trim(), detectionIds: [] });
    emit('created', board.id);
    emit('update:visible', false);
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)" header="New Research Board" modal style="width:26rem;">
    <div style="display:flex; flex-direction:column; gap:0.85rem;">
      <InputText v-model="title" placeholder="Board title…" autofocus @keyup.enter="create" />
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
        <Button label="Create" :disabled="!title.trim()" :loading="creating" @click="create" />
      </div>
    </div>
  </Dialog>
</template>
