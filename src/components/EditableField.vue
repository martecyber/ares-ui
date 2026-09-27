<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import AresBadge from '@/components/AresBadge.vue';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const props = defineProps<{
  modelValue: string;
  editor?: 'text' | 'select' | 'readonly';
  options?: { label: string; value: string }[];
  validate?: (v: string) => string | null;
  saving?: boolean;
  placeholder?: string;
  /** When set, the display value renders as a colored AresBadge instead of plain text. */
  chipColor?: (v: string) => Severity;
}>();

const emit = defineEmits<{
  save: [value: string];
}>();

const editing = ref(false);
const draft = ref('');
const error = ref<string | null>(null);

function startEdit() {
  draft.value = props.modelValue;
  error.value = null;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  error.value = null;
}

function commit() {
  const next = draft.value.trim();
  if (props.validate) {
    const msg = props.validate(next);
    if (msg) { error.value = msg; return; }
  }
  error.value = null;
  if (next === props.modelValue) { editing.value = false; return; }
  emit('save', next);
}

// Close the editor once the parent confirms the save finished (saving flips false again).
watch(() => props.saving, (isSaving, wasSaving) => {
  if (wasSaving && !isSaving && !error.value) editing.value = false;
});
</script>

<template>
  <div class="editable-field">
    <Transition name="ef-fade" mode="out-in">
      <div v-if="!editing" key="display" class="editable-field__display">
        <AresBadge v-if="chipColor && modelValue" :value="modelValue" :severity="chipColor(modelValue)" />
        <span v-else class="editable-field__value">{{ modelValue || '—' }}</span>
        <Button
          v-if="editor !== 'readonly'"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          class="editable-field__edit-btn"
          v-tooltip.top="'Edit'"
          @click="startEdit"
        />
      </div>
      <div v-else key="edit">
        <div class="editable-field__edit-row">
          <Select
            v-if="editor === 'select'"
            v-model="draft"
            :options="options ?? []"
            option-label="label"
            option-value="value"
            class="editable-field__input"
            autofocus
            @keyup.enter="commit"
            @keyup.escape="cancelEdit"
          />
          <InputText
            v-else
            v-model="draft"
            :placeholder="placeholder"
            class="editable-field__input"
            autofocus
            @keyup.enter="commit"
            @keyup.escape="cancelEdit"
          />
          <Button icon="pi pi-check" size="small" severity="success" text
            :loading="saving" v-tooltip.top="'Save (Enter)'" @click="commit" />
          <Button icon="pi pi-times" size="small" severity="secondary" text
            :disabled="saving" v-tooltip.top="'Cancel (Esc)'" @click="cancelEdit" />
        </div>
        <p v-if="error" class="editable-field__error">{{ error }}</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.editable-field {
  min-width: 0;
}
.editable-field__display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.6rem;
}
.editable-field__value {
  word-break: break-all;
}
.editable-field__edit-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}
dd:hover .editable-field__edit-btn,
.editable-field:hover .editable-field__edit-btn {
  opacity: 1;
}
.editable-field__edit-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.editable-field__input {
  flex: 1;
  min-width: 0;
}
.editable-field__error {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: #ef4444;
}

/* Smooth crossfade between display and edit modes */
.ef-fade-enter-active,
.ef-fade-leave-active {
  transition: opacity 0.14s ease;
}
.ef-fade-enter-from,
.ef-fade-leave-to {
  opacity: 0;
}
</style>
