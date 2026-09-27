<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import AresBadge from '@/components/AresBadge.vue';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const props = defineProps<{
  modelValue: string[];
  saving?: boolean;
  placeholder?: string;
  validate?: (v: string) => string | null;
  chipColor?: (v: string) => Severity | undefined;
}>();

const emit = defineEmits<{
  save: [value: string[]];
}>();

const editing = ref(false);
const draft = ref<string[]>([]);
const newValue = ref('');
const error = ref<string | null>(null);

function startEdit() {
  draft.value = [...props.modelValue];
  newValue.value = '';
  error.value = null;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  error.value = null;
}

function addValue() {
  const v = newValue.value.trim();
  if (!v) return;
  if (props.validate) {
    const msg = props.validate(v);
    if (msg) { error.value = msg; return; }
  }
  if (draft.value.includes(v)) { error.value = 'This value is already in the list.'; return; }
  draft.value.push(v);
  newValue.value = '';
  error.value = null;
}

function removeValue(idx: number) {
  draft.value.splice(idx, 1);
}

function commit() {
  if (props.validate) {
    for (const v of draft.value) {
      const msg = props.validate(v.trim());
      if (msg) { error.value = msg; return; }
    }
  }
  error.value = null;
  emit('save', draft.value.map((v) => v.trim()).filter((v) => v.length > 0));
}

// Close the editor once the parent confirms the save finished (saving flips false again).
watch(() => props.saving, (isSaving, wasSaving) => {
  if (wasSaving && !isSaving && !error.value) editing.value = false;
});
</script>

<template>
  <div class="chip-list-field">
    <Transition name="ef-fade" mode="out-in">
      <div v-if="!editing" key="display" class="chip-list-field__display">
        <div class="chip-list-field__chips">
          <template v-if="modelValue.length">
            <AresBadge
              v-for="v in modelValue"
              :key="v"
              :value="v"
              :severity="chipColor?.(v) ?? 'secondary'"
            />
          </template>
          <span v-else class="chip-list-field__empty">—</span>
        </div>
        <Button
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          class="chip-list-field__edit-btn"
          v-tooltip.top="'Edit'"
          @click="startEdit"
        />
      </div>
      <div v-else key="edit">
        <div v-for="(_, idx) in draft" :key="idx" class="chip-list-row">
          <InputText v-model="draft[idx]" class="chip-list-row__input" />
          <Button icon="pi pi-trash" text severity="danger" size="small" @click="removeValue(idx)" />
        </div>
        <div class="chip-list-row chip-list-row--add">
          <InputText
            v-model="newValue"
            :placeholder="placeholder"
            class="chip-list-row__input"
            @keyup.enter="addValue"
          />
          <Button icon="pi pi-plus" text severity="secondary" size="small" :disabled="!newValue.trim()" @click="addValue" />
        </div>
        <p v-if="error" class="chip-list-field__error">{{ error }}</p>
        <div class="chip-list-field__actions">
          <Button icon="pi pi-check" label="Save" size="small" severity="success" :loading="saving" @click="commit" />
          <Button icon="pi pi-times" label="Cancel" size="small" severity="secondary" text :disabled="saving" @click="cancelEdit" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chip-list-field {
  min-width: 0;
}
.chip-list-field__display {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.chip-list-field__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}
.chip-list-field__empty {
  color: var(--ares-text-muted);
}
.chip-list-field__edit-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}
dd:hover .chip-list-field__edit-btn,
.chip-list-field:hover .chip-list-field__edit-btn {
  opacity: 1;
}
.chip-list-field__error {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: #ef4444;
}
.chip-list-field__actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.chip-list-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}
.chip-list-row__input {
  flex: 1;
  min-width: 0;
}
.chip-list-row--add {
  opacity: 0.85;
}
</style>
