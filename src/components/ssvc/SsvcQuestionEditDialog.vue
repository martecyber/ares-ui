<script setup lang="ts">
// Modal editor for a single decision point (a "question" column of the tree) and its
// answers, opened by clicking a question in SsvcTreeDiagramTable.vue's header (edit)
// or the "+ Add question" button (create) inside SsvcTreeNodeEditor.vue.
import { reactive, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

export interface EditorOption { code: string; label: string; helpText: string; }
export interface EditorColumn { decisionPointCode: string; decisionPointName: string; decisionPointHelp: string; options: EditorOption[]; }

const props = defineProps<{
  visible: boolean;
  /** The column being edited, or null when adding a new one. */
  column: EditorColumn | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [column: EditorColumn];
  delete: [];
}>();

const draft = reactive<EditorColumn>({ decisionPointCode: '', decisionPointName: '', decisionPointHelp: '', options: [] });
const error = ref('');

watch(() => props.visible, (open) => {
  if (!open) return;
  error.value = '';
  if (props.column) {
    draft.decisionPointCode = props.column.decisionPointCode;
    draft.decisionPointName = props.column.decisionPointName;
    draft.decisionPointHelp = props.column.decisionPointHelp;
    draft.options = props.column.options.map((o) => ({ ...o }));
  } else {
    draft.decisionPointCode = '';
    draft.decisionPointName = '';
    draft.decisionPointHelp = '';
    draft.options = [{ code: '', label: '', helpText: '' }];
  }
});

function addOption() { draft.options.push({ code: '', label: '', helpText: '' }); }
function removeOption(idx: number) { draft.options.splice(idx, 1); }

function close() { emit('update:visible', false); }

function save() {
  if (!draft.decisionPointCode.trim()) { error.value = 'The question needs a key.'; return; }
  if (!draft.decisionPointName.trim()) { error.value = 'The question needs a value (name).'; return; }
  if (!draft.options.length) { error.value = 'Add at least one answer.'; return; }
  const codes = new Set<string>();
  for (const opt of draft.options) {
    if (!opt.code.trim()) { error.value = 'Every answer needs a key.'; return; }
    if (!opt.label.trim()) { error.value = 'Every answer needs a value.'; return; }
    if (codes.has(opt.code)) { error.value = `Duplicate answer key "${opt.code}".`; return; }
    codes.add(opt.code);
  }
  error.value = '';
  emit('save', { ...draft, options: draft.options.map((o) => ({ ...o })) });
}

function remove() { emit('delete'); }
</script>

<template>
  <Dialog
    :visible="visible"
    :header="column ? 'Edit question' : 'New question'"
    modal
    :style="{ width: 'min(560px, 96vw)' }"
    @update:visible="close"
  >
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <div style="display:flex; gap:0.5rem;">
        <div style="flex:0 0 120px;">
          <label class="field-label">Key</label>
          <input v-model="draft.decisionPointCode" class="mini-input mini-input--code" placeholder="e.g. E" />
        </div>
        <div style="flex:1;">
          <label class="field-label">Value</label>
          <input v-model="draft.decisionPointName" class="mini-input" placeholder="e.g. Exploitation" />
        </div>
      </div>
      <div>
        <label class="field-label">Description</label>
        <textarea v-model="draft.decisionPointHelp" class="mini-textarea" rows="2" placeholder="Shown on hover" />
      </div>

      <label class="field-label" style="margin-top:0.25rem;">Answers</label>
      <div v-for="(opt, idx) in draft.options" :key="idx" class="answer-row">
        <input v-model="opt.code" class="mini-input mini-input--code" placeholder="Key (L)" />
        <input v-model="opt.label" class="mini-input" placeholder="Value (Low)" />
        <input v-model="opt.helpText" class="mini-input" placeholder="Description" />
        <button type="button" class="remove-btn" title="Remove answer" @click="removeOption(idx)">×</button>
      </div>
      <button type="button" class="add-btn" @click="addOption">+ Add answer</button>

      <p v-if="error" class="editor-error">{{ error }}</p>
    </div>

    <template #footer>
      <Button v-if="column" label="Delete question" severity="danger" text size="small" style="margin-right:auto;" @click="remove" />
      <Button label="Cancel" severity="secondary" size="small" @click="close" />
      <Button label="Save" icon="pi pi-check" size="small" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  margin-bottom: 0.3rem;
}
.mini-input {
  width: 100%;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.3rem 0.5rem;
  font-size: 0.8rem;
  color: var(--ares-text-2);
  outline: none;
}
.mini-input:focus { border-color: var(--p-primary-500); }
.mini-input--code { font-family: monospace; }
.mini-textarea {
  width: 100%;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.3rem 0.5rem;
  font-size: 0.78rem;
  color: var(--ares-text-2);
  outline: none;
  resize: vertical;
}
.answer-row { display: flex; gap: 0.3rem; align-items: center; }
.answer-row .mini-input--code { flex: 0 0 60px; }
.answer-row .mini-input:not(.mini-input--code) { flex: 1; }
.remove-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  background: transparent;
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
}
.remove-btn:hover { color: #ef4444; border-color: #ef4444; }
.add-btn {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-400);
  background: none;
  border: 1px dashed var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}
.add-btn:hover { border-color: var(--p-primary-400); }
.editor-error { font-size: 0.78rem; color: #ef4444; margin: 0; }
</style>
