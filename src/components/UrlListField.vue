<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import AresBadge from '@/components/AresBadge.vue';
import { validateUrl } from '@/utils/validators';

const props = withDefaults(defineProps<{
  modelValue: string[];
  saving?: boolean;
  /** Per-item validator. Defaults to URL validation (this component's original use). */
  validate?: (v: string) => string | null;
  placeholder?: string;
  /** Minimum number of items required — the last one can't be removed below this. */
  minItems?: number;
}>(), {
  validate: undefined,
  placeholder: 'https://www.example.com',
  minItems: 1,
});

const emit = defineEmits<{
  save: [value: string[]];
}>();

const validateItem = (v: string) => (props.validate ?? validateUrl)(v);

const editing = ref(false);
const draft = ref<string[]>([]);
const newUrl = ref('');
const error = ref<string | null>(null);
const dragIndex = ref<number | null>(null);

function startEdit() {
  draft.value = [...props.modelValue];
  newUrl.value = '';
  error.value = null;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  error.value = null;
}

function addUrl() {
  const v = newUrl.value.trim();
  if (!v) return;
  const msg = validateItem(v);
  if (msg) { error.value = msg; return; }
  if (draft.value.includes(v)) { error.value = 'This value is already in the list.'; return; }
  draft.value.push(v);
  newUrl.value = '';
  error.value = null;
}

function removeUrl(idx: number) {
  if (draft.value.length <= props.minItems) return;
  draft.value.splice(idx, 1);
}

function onDragStart(idx: number) {
  dragIndex.value = idx;
}

function onDrop(idx: number) {
  if (dragIndex.value === null || dragIndex.value === idx) return;
  const [moved] = draft.value.splice(dragIndex.value, 1);
  draft.value.splice(idx, 0, moved);
  dragIndex.value = null;
}

function commit() {
  const seen = new Set<string>();
  for (const raw of draft.value) {
    const v = raw.trim();
    const msg = validateItem(v);
    if (msg) { error.value = msg; return; }
    if (seen.has(v)) { error.value = 'Duplicate values are not allowed.'; return; }
    seen.add(v);
  }
  if (draft.value.length < props.minItems) {
    error.value = props.minItems === 1 ? 'At least one value is required.' : `At least ${props.minItems} values are required.`;
    return;
  }
  error.value = null;
  emit('save', draft.value.map((v) => v.trim()));
}

// Close the editor once the parent confirms the save finished (saving flips false again).
watch(() => props.saving, (isSaving, wasSaving) => {
  if (wasSaving && !isSaving && !error.value) editing.value = false;
});
</script>

<template>
  <div class="url-list-field">
    <Transition name="ef-fade" mode="out-in">
      <div v-if="!editing" key="display" class="url-list-field__display">
        <div class="url-list-field__list">
          <div v-for="(url, idx) in modelValue" :key="url" class="url-list-field__item">
            <code class="url-list-field__chip">{{ url }}</code>
            <AresBadge v-if="idx === 0" value="Primary" severity="info" style="font-size:0.68rem;" />
          </div>
        </div>
        <Button
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          class="url-list-field__edit-btn"
          v-tooltip.top="'Edit'"
          @click="startEdit"
        />
      </div>
      <div v-else key="edit">
        <div
          v-for="(_, idx) in draft"
          :key="idx"
          class="url-list-row"
          draggable="true"
          @dragstart="onDragStart(idx)"
          @dragover.prevent
          @drop="onDrop(idx)"
        >
          <i class="pi pi-bars url-list-row__handle" v-tooltip.top="'Drag to reorder'" />
          <InputText v-model="draft[idx]" class="url-list-row__input" />
          <AresBadge v-if="idx === 0" value="Primary" severity="info" style="font-size:0.68rem; flex-shrink:0;" />
          <Button icon="pi pi-trash" text severity="danger" size="small" :disabled="draft.length <= props.minItems" @click="removeUrl(idx)" />
        </div>
        <div class="url-list-row url-list-row--add">
          <i class="pi pi-plus url-list-row__handle" style="opacity:0.4;" />
          <InputText
            v-model="newUrl"
            :placeholder="props.placeholder"
            class="url-list-row__input"
            @keyup.enter="addUrl"
          />
          <Button icon="pi pi-plus" text severity="secondary" size="small" :disabled="!newUrl.trim()" @click="addUrl" />
        </div>
        <p v-if="error" class="url-list-field__error">{{ error }}</p>
        <div class="url-list-field__actions">
          <Button icon="pi pi-check" label="Save" size="small" severity="success" :loading="saving" @click="commit" />
          <Button icon="pi pi-times" label="Cancel" size="small" severity="secondary" text :disabled="saving" @click="cancelEdit" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.url-list-field {
  min-width: 0;
}
.url-list-field__display {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.url-list-field__list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}
.url-list-field__item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.url-list-field__chip {
  flex: 1;
  font-size: 0.82rem;
  padding: 0.3rem 0.65rem;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  color: var(--ares-text-2);
  word-break: break-all;
}
.url-list-field__edit-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}
dd:hover .url-list-field__edit-btn,
.url-list-field:hover .url-list-field__edit-btn {
  opacity: 1;
}
.url-list-field__error {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: #ef4444;
}
.url-list-field__actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.url-list-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}
.url-list-row__handle {
  cursor: grab;
  color: var(--ares-text-muted);
  font-size: 0.8rem;
  flex-shrink: 0;
}
.url-list-row__input {
  flex: 1;
  min-width: 0;
}
.url-list-row--add {
  opacity: 0.85;
}
</style>
