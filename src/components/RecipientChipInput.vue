<script setup lang="ts">
/**
 * Email-recipient chip input for To/CC/BCC — replaces a free-text field with stacked chips.
 * Chips with `locked: true` (added by an "email_recipients" Rule of Engagement) render amber
 * (see LockedChip.vue) and require confirming an override before they can be removed; anything
 * else (typed or picked from `suggestions`) removes immediately.
 */
import { ref } from 'vue';
import AutoComplete from 'primevue/autocomplete';
import Button from 'primevue/button';
import LockedChip from './LockedChip.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';

export interface RecipientChip {
  email: string;
  label?: string | null;
  locked?: boolean;
  ruleNote?: string | null;
}

export interface RecipientSuggestion {
  name: string;
  email: string;
}

const props = defineProps<{
  modelValue: RecipientChip[];
  suggestions?: RecipientSuggestion[];
  placeholder?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: RecipientChip[]] }>();

const draft = ref('');
const filtered = ref<RecipientSuggestion[]>([]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function filterSuggestions(query: string) {
  const q = query.toLowerCase();
  const existing = new Set(props.modelValue.map((c) => c.email.toLowerCase()));
  filtered.value = (props.suggestions ?? [])
    .filter((s) => !existing.has(s.email.toLowerCase()))
    .filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
}

function onAutocompleteUpdate(val: unknown) {
  // AutoComplete emits either the typed string or (on selection) the chosen suggestion object —
  // item-select below handles the latter, so only ever let plain typed text land in `draft`.
  draft.value = typeof val === 'string' ? val : '';
}

function addChip(email: string, label?: string | null) {
  const trimmed = email.trim();
  if (!trimmed || !EMAIL_RE.test(trimmed)) return;
  if (props.modelValue.some((c) => c.email.toLowerCase() === trimmed.toLowerCase())) { draft.value = ''; return; }
  emit('update:modelValue', [...props.modelValue, { email: trimmed, label: label ?? null }]);
  draft.value = '';
}

function onSelect(event: { value: RecipientSuggestion }) {
  addChip(event.value.email, event.value.name);
}

async function removeChip(chip: RecipientChip) {
  if (chip.locked) {
    const ok = await confirmDialog({
      header: 'Override Rule of Engagement',
      message: `"${chip.email}" was added automatically by a Report Email Recipients rule`
        + (chip.ruleNote ? ` ("${chip.ruleNote}")` : '') + `. Remove it anyway?`,
      acceptLabel: 'Remove anyway',
      acceptSeverity: 'warn',
      acceptIcon: 'pi pi-exclamation-triangle',
    });
    if (!ok) return;
  }
  emit('update:modelValue', props.modelValue.filter((c) => c !== chip));
}
</script>

<template>
  <div class="recipient-chip-input">
    <template v-for="chip in modelValue" :key="chip.email">
      <LockedChip
        v-if="chip.locked" :label="chip.email"
        :tooltip="`Added automatically by a rule${chip.ruleNote ? ': ' + chip.ruleNote : ''}`"
      >
        <button type="button" class="recipient-chip-input__remove" title="Remove" @click="removeChip(chip)">
          <i class="pi pi-times" />
        </button>
      </LockedChip>
      <span v-else class="recipient-chip">
        <span>{{ chip.email }}</span>
        <button type="button" class="recipient-chip-input__remove" title="Remove" @click="removeChip(chip)">
          <i class="pi pi-times" />
        </button>
      </span>
    </template>

    <div class="recipient-chip-input__add">
      <AutoComplete
        :model-value="draft" :suggestions="filtered" option-label="name"
        :placeholder="placeholder ?? 'email@example.com'" size="small"
        @update:model-value="onAutocompleteUpdate"
        @complete="filterSuggestions($event.query)"
        @item-select="onSelect"
      >
        <template #option="{ option }">
          <div>
            <div style="font-size:0.83rem;">{{ option.name }}</div>
            <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ option.email }}</div>
          </div>
        </template>
      </AutoComplete>
      <Button icon="pi pi-plus" size="small" text v-tooltip.top="'Add'" :disabled="!draft.trim()" @click="addChip(draft)" />
    </div>
  </div>
</template>

<style scoped>
.recipient-chip-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
  min-height: 2.4rem;
}
.recipient-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  font-size: 0.78rem;
  color: var(--ares-text);
}
.recipient-chip-input__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  padding: 0;
  font-size: 0.68rem;
}
.recipient-chip-input__remove:hover {
  opacity: 1;
}
.recipient-chip-input__add {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex: 1;
  min-width: 160px;
}
.recipient-chip-input__add :deep(.p-autocomplete) {
  flex: 1;
}
.recipient-chip-input__add :deep(.p-autocomplete-input) {
  width: 100%;
  border: none;
  background: transparent;
  box-shadow: none;
  font-size: 0.82rem;
  padding: 0.2rem 0.3rem;
}
</style>
