<script setup lang="ts">
// Modeled on MergeAssetDialog.vue's source(deleted)/target(survives) strip — simpler here since
// there's no field-by-field reconciliation: the backend unions detections/members and
// concatenates notes automatically, this dialog only needs the merge target and the new title.
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { researchBoardsApi, type ResearchBoardSummary } from '@/api/researchBoards';

const props = defineProps<{ visible: boolean; projectId: number; sourceBoard: { id: number; title: string } }>();
const emit = defineEmits<{ 'update:visible': [boolean]; merged: [targetBoardId: number] }>();

const toast = useToast();
const candidates = ref<ResearchBoardSummary[]>([]);
const targetId = ref<number | null>(null);
const title = ref('');
const titleTouched = ref(false);
const saving = ref(false);

const target = computed(() => candidates.value.find((b) => b.id === targetId.value) ?? null);

watch(() => props.visible, async (v) => {
  if (!v) return;
  targetId.value = null;
  title.value = '';
  titleTouched.value = false;
  candidates.value = (await researchBoardsApi.list(props.projectId, false))
    .filter((b) => b.id !== props.sourceBoard.id);
});

watch(targetId, () => {
  if (!titleTouched.value && target.value) {
    title.value = `${props.sourceBoard.title} / ${target.value.title}`;
  }
});

async function doMerge() {
  if (!targetId.value || !title.value.trim()) return;
  saving.value = true;
  try {
    await researchBoardsApi.merge(props.projectId, props.sourceBoard.id, targetId.value, title.value.trim());
    emit('merged', targetId.value);
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Merge failed', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)" header="Merge Research Boards" modal :style="{ width: 'min(560px, 96vw)' }">
    <div class="merge-dialog">
      <div class="merge-strip">
        <div class="merge-strip-side merge-strip-source">
          <span class="merge-strip-role">Source — will be deleted</span>
          <div class="merge-strip-main">{{ sourceBoard.title }}</div>
        </div>
        <i class="pi pi-arrow-right merge-strip-arrow" />
        <div class="merge-strip-side merge-strip-target">
          <span class="merge-strip-role">Target — will survive</span>
          <Select
            v-model="targetId"
            :options="candidates"
            option-label="title" option-value="id"
            placeholder="Pick a board…"
            style="width:100%;"
          />
        </div>
      </div>

      <div style="padding:0 1.25rem;">
        <label style="font-size:0.72rem; font-weight:600; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:0.05em;">New title</label>
        <InputText v-model="title" style="width:100%; margin-top:0.3rem;" @input="titleTouched = true" />
      </div>

      <div v-if="target" class="merge-warning">
        <i class="pi pi-exclamation-triangle" style="color:#f59e0b;" />
        <div>
          All detections and assigned users on <strong>{{ sourceBoard.title }}</strong> move to
          <strong>{{ target.title }}</strong>; their notes are concatenated (each under its own
          heading). <strong>{{ sourceBoard.title }}</strong> is then permanently deleted.
        </div>
      </div>

      <div class="merge-footer">
        <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
        <Button label="Merge" icon="pi pi-arrows-h" size="small" :disabled="!targetId || !title.trim()" :loading="saving" @click="doMerge" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.merge-dialog { display: flex; flex-direction: column; gap: 1rem; }

.merge-strip { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem 0; }
.merge-strip-side { flex: 1; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.6rem 0.75rem; border-radius: var(--ares-radius); }
.merge-strip-source { background: color-mix(in srgb, #ef4444 6%, transparent); }
.merge-strip-target { background: color-mix(in srgb, #22c55e 6%, transparent); }
.merge-strip-role { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ares-text-muted); }
.merge-strip-main { font-size: 0.85rem; color: var(--ares-text-1); font-weight: 600; }
.merge-strip-arrow { color: var(--ares-text-muted); flex-shrink: 0; }

.merge-warning {
  display: flex; gap: 0.6rem; align-items: flex-start;
  margin: 0 1.25rem;
  padding: 0.75rem;
  background: color-mix(in srgb, #f59e0b 8%, transparent);
  border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
  border-radius: var(--ares-radius);
  font-size: 0.8rem;
  color: var(--ares-text-2);
  line-height: 1.5;
}

.merge-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0 1.25rem 1.25rem; }
</style>
