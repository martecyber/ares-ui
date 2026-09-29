<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { aqlApi, type AqlFieldInfo } from '@/api/aql';
import { computeAqlSuggestions, applyAqlSuggestion, type AqlSuggestion, type AqlVariableRef } from '@/utils/aqlAutocomplete';

/**
 * A bare AQL text field with the same cursor-aware field/operator/value autocomplete as
 * QueryBar.vue, minus its BASIC/AQL mode toggle and debounced search-emit — for AQL filter fields
 * inside forms (dashboard widget config) where the field's own :model-value is the source of
 * truth and the parent drives its own validate-on-blur, not a live search.
 */
const props = withDefaults(defineProps<{
  modelValue: string;
  entity: string;
  placeholder?: string;
  /** Scope for {{...}} context-variable autocomplete (AQL context-variables initiative) — which
   *  of current_iteration_start/current_iteration_end/pX_sla_period apply, if any, depends on
   *  this. `now` is always offered regardless. Omit both when there's no meaningful scope (a
   *  platform-wide catalog view); autocomplete then only offers `now`. */
  projectId?: number | null;
  organizationId?: number | null;
}>(), {
  placeholder: 'priority == "P0" AND isOpen == true',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [];
}>();

const text = ref(props.modelValue);
watch(() => props.modelValue, (v) => { if (v !== text.value) text.value = v; });

const fields = ref<AqlFieldInfo[]>([]);
const variables = ref<AqlVariableRef[]>([]);
const inputRef = ref<HTMLInputElement | null>(null);
const suggestions = ref<AqlSuggestion[]>([]);
const activeIndex = ref(0);
const showSuggestions = ref(false);
const suggestionsStyle = ref<Record<string, string>>({});

async function loadFields() {
  fields.value = props.entity ? await aqlApi.fields(props.entity).catch(() => []) : [];
}
async function loadVariables() {
  variables.value = await aqlApi.variables(props.projectId, props.organizationId);
}
watch(() => props.entity, loadFields, { immediate: true });
watch([() => props.projectId, () => props.organizationId], loadVariables, { immediate: true });

function refreshSuggestions() {
  if (!inputRef.value) { suggestions.value = []; return; }
  const cursor = inputRef.value.selectionStart ?? text.value.length;
  suggestions.value = computeAqlSuggestions(text.value, cursor, fields.value, variables.value);
  activeIndex.value = 0;
  showSuggestions.value = suggestions.value.length > 0;
  if (showSuggestions.value) positionSuggestions();
}

function positionSuggestions() {
  if (!inputRef.value) return;
  const rect = inputRef.value.getBoundingClientRect();
  suggestionsStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: '1200',
  };
}

function onInput() {
  emit('update:modelValue', text.value);
  nextTick(refreshSuggestions);
}

function onKeydown(e: KeyboardEvent) {
  if (showSuggestions.value && suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex.value = (activeIndex.value + 1) % suggestions.value.length; return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length; return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectSuggestion(suggestions.value[activeIndex.value]);
      return;
    }
    if (e.key === 'Escape') { showSuggestions.value = false; return; }
  }
}

function selectSuggestion(s: AqlSuggestion) {
  const { text: newText, cursor } = applyAqlSuggestion(text.value, s);
  text.value = newText;
  emit('update:modelValue', text.value);
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.setSelectionRange(cursor, cursor);
    refreshSuggestions();
  });
}

function onFocus() { Promise.all([loadFields(), loadVariables()]).then(refreshSuggestions); }
function onBlur() {
  // Let a click on the dropdown register before it disappears.
  setTimeout(() => { showSuggestions.value = false; }, 150);
  emit('blur');
}

const kindIcon: Record<string, string> = {
  field: 'pi-sliders-h',
  operator: 'pi-code',
  value: 'pi-tag',
  keyword: 'pi-link',
  variable: 'pi-hashtag',
};
</script>

<template>
  <div class="aql-filter-input">
    <input
      ref="inputRef"
      v-model="text"
      type="text"
      class="aql-filter-input__field"
      :placeholder="placeholder"
      spellcheck="false"
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
      @click="refreshSuggestions"
    />

    <Teleport to="body">
      <div v-if="showSuggestions" class="aql-filter-input__suggestions" :style="suggestionsStyle">
        <button
          v-for="(s, i) in suggestions"
          :key="s.kind + s.label + i"
          type="button"
          class="aql-filter-input__suggestion"
          :class="{ 'aql-filter-input__suggestion--active': i === activeIndex }"
          @mousedown.prevent="selectSuggestion(s)"
          @mouseenter="activeIndex = i"
        >
          <i class="pi aql-filter-input__suggestion-icon" :class="kindIcon[s.kind]" />
          <span class="aql-filter-input__suggestion-label">{{ s.label }}</span>
          <span v-if="s.detail" class="aql-filter-input__suggestion-detail">{{ s.detail }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.aql-filter-input { width: 100%; }
.aql-filter-input__field {
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.65rem;
  font-size: 0.85rem;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
  color: var(--ares-text-1);
}
.aql-filter-input__field:focus {
  outline: none;
  border-color: var(--ares-accent);
}

.aql-filter-input__suggestions {
  max-height: 280px;
  overflow-y: auto;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  padding: 0.25rem;
}

.aql-filter-input__suggestion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.55rem;
  background: none;
  border: none;
  border-radius: calc(var(--ares-radius) - 2px);
  text-align: left;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--ares-text-1);
}
.aql-filter-input__suggestion--active,
.aql-filter-input__suggestion:hover {
  background: color-mix(in srgb, var(--ares-accent) 12%, transparent);
}

.aql-filter-input__suggestion-icon {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
}

.aql-filter-input__suggestion-label {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-weight: 500;
}

.aql-filter-input__suggestion-detail {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--ares-text-muted);
  white-space: nowrap;
}
</style>
