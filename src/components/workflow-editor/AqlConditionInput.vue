<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import { aqlApi, type AqlFieldInfo } from '@/api/aql';
import { computeAqlSuggestions, applyAqlSuggestion, type AqlSuggestion, type AqlVariableRef } from '@/utils/aqlAutocomplete';

const props = defineProps<{ modelValue: string; entityType: string; variables?: AqlVariableRef[] }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const inputRef = ref<any>(null);
const fields = ref<AqlFieldInfo[]>([]);
const suggestions = ref<AqlSuggestion[]>([]);
const showSuggestions = ref(false);

watch(() => props.entityType, async (t) => {
  if (!t) { fields.value = []; return; }
  try { fields.value = await aqlApi.fields(t); } catch { fields.value = []; }
}, { immediate: true });

function inputEl(): HTMLInputElement | null {
  const comp = inputRef.value;
  return (comp?.$el as HTMLInputElement | undefined) ?? null;
}

function recompute() {
  const el = inputEl();
  const cursor = el?.selectionStart ?? props.modelValue.length;
  suggestions.value = computeAqlSuggestions(props.modelValue, cursor, fields.value, props.variables ?? []);
  showSuggestions.value = suggestions.value.length > 0;
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  recompute();
}

function onFocus() { recompute(); }

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showSuggestions.value = false;
}

function onBlur() { showSuggestions.value = false; }

function apply(s: AqlSuggestion) {
  const { text, cursor } = applyAqlSuggestion(props.modelValue, s);
  emit('update:modelValue', text);
  nextTick(() => {
    const el = inputEl();
    if (el) {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    }
    recompute();
  });
}
</script>

<template>
  <div class="aql-input-wrap">
    <InputText ref="inputRef" :model-value="modelValue"
      placeholder="e.g. priority == P0"
      style="width:100%; font-family:monospace; font-size:0.8rem;"
      @input="onInput" @focus="onFocus" @keydown="onKeydown" @blur="onBlur" />
    <div v-if="showSuggestions" class="aql-input-suggestions">
      <button v-for="(s, i) in suggestions" :key="i" type="button" class="aql-input-suggestion" @mousedown.prevent="apply(s)">
        <span class="aql-input-suggestion__label">{{ s.label }}</span>
        <span v-if="s.detail" class="aql-input-suggestion__detail">{{ s.detail }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.aql-input-wrap { position: relative; }
.aql-input-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  margin-top: 0.2rem;
  max-height: 220px;
  overflow-y: auto;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 4px 12px rgba(0,0,0,0.35);
}
.aql-input-suggestion {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.6rem;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-family: monospace;
  font-size: 0.76rem;
  color: var(--ares-text-1);
}
.aql-input-suggestion:hover { background: var(--ares-surface-2); }
.aql-input-suggestion__detail { color: var(--ares-text-muted); font-size: 0.7rem; }
</style>
