<script setup lang="ts">
// The "Investigate" counterpart to EscalateDialog — moves one or more detections into a Research
// Board (existing or brand new) instead of straight to Affected. Self-contained (unlike
// EscalationTargetDialog, a pure picker): it performs the add/create call itself, since both
// call sites (bulk bar, detection detail) just need "pick a board, go".
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { researchBoardsApi, type ResearchBoardSummary } from '@/api/researchBoards';

const props = defineProps<{ visible: boolean; projectId: number; detectionIds: number[] }>();
const emit = defineEmits<{ 'update:visible': [boolean]; done: [] }>();

const toast = useToast();
const boards = ref<ResearchBoardSummary[]>([]);
const targetBoardId = ref<number | null>(null);
const newTitle = ref('');
const saving = ref(false);
const error = ref('');

watch(() => props.visible, async (v) => {
  if (!v) return;
  targetBoardId.value = null;
  newTitle.value = '';
  error.value = '';
  boards.value = await researchBoardsApi.list(props.projectId, false);
});

async function confirm() {
  if (!targetBoardId.value && !newTitle.value.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    if (targetBoardId.value) {
      await researchBoardsApi.addDetections(props.projectId, targetBoardId.value, props.detectionIds);
    } else {
      await researchBoardsApi.create(props.projectId, { title: newTitle.value.trim(), detectionIds: props.detectionIds });
    }
    toast.add({
      severity: 'success', summary: 'Under investigation',
      detail: `${props.detectionIds.length} detection${props.detectionIds.length !== 1 ? 's' : ''} moved to a Research Board.`,
      life: 4000,
    });
    emit('done');
    emit('update:visible', false);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e.message ?? 'Failed to start the investigation';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)" header="Investigate" modal style="width:26rem;">
    <div style="display:flex; flex-direction:column; gap:0.85rem;">
      <p style="margin:0; font-size:0.82rem; color:var(--ares-text-muted);">
        Move {{ detectionIds.length }} detection{{ detectionIds.length !== 1 ? 's' : '' }} to a Research Board to investigate
        before deciding whether assets are affected.
      </p>

      <div>
        <label style="font-size:0.72rem; font-weight:600; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:0.05em;">Existing board</label>
        <Select
          v-model="targetBoardId" :options="boards" option-label="title" option-value="id"
          placeholder="Pick a board…" show-clear style="width:100%; margin-top:0.3rem;"
          @update:model-value="newTitle = ''"
        />
      </div>
      <span style="font-size:0.72rem; color:var(--ares-text-muted); text-align:center;">or</span>
      <div>
        <label style="font-size:0.72rem; font-weight:600; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:0.05em;">New board title</label>
        <InputText v-model="newTitle" placeholder="Board title…" style="width:100%; margin-top:0.3rem;" @update:model-value="targetBoardId = null" />
      </div>

      <p v-if="error" style="margin:0; font-size:0.8rem; color:var(--ares-danger, #ef4444);">{{ error }}</p>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
        <Button label="Investigate" icon="pi pi-search" :disabled="!targetBoardId && !newTitle.trim()" :loading="saving" @click="confirm" />
      </div>
    </div>
  </Dialog>
</template>
