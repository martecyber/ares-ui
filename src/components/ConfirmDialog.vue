<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { confirmState, resolveConfirmDialog } from '@/composables/useConfirmDialog';

// Focusing the accept button on open means Enter activates it via the browser's own native
// button semantics — no separate keydown/preventDefault plumbing needed, and it composes
// correctly with focus already sitting on Cancel (Enter there still cancels, as it should).
const acceptBtn = ref<InstanceType<typeof Button> | null>(null);
watch(() => confirmState.visible, (visible) => {
  if (visible) nextTick(() => (acceptBtn.value as any)?.$el?.focus());
});
</script>

<template>
  <Dialog
    :visible="confirmState.visible"
    @update:visible="(v) => { if (!v) resolveConfirmDialog(false); }"
    :header="confirmState.header"
    modal
    style="width:26rem;"
  >
    <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.25rem;">
      <p style="margin:0; color:var(--ares-text-2); font-size:0.88rem; line-height:1.5;">{{ confirmState.message }}</p>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button :label="confirmState.rejectLabel" severity="secondary" size="small" @click="resolveConfirmDialog(false)" />
        <Button
          ref="acceptBtn"
          :label="confirmState.acceptLabel"
          :severity="confirmState.acceptSeverity"
          :icon="confirmState.acceptIcon"
          size="small"
          @click="resolveConfirmDialog(true)"
        />
      </div>
    </div>
  </Dialog>
</template>
