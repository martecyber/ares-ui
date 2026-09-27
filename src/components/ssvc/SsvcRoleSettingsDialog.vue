<script setup lang="ts">
// Modal for a role's own metadata (code/name/description) plus its reusable named
// outcome set (code/label/description/priority) — the palette that SsvcTreeDiagramTable
// leaf dropdowns pick from, edited here once instead of retyped per path. Opened from
// the role chip's edit icon in KbSsvcMethodologyDetailView.vue.
import { reactive, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { PRIORITY_SCALE } from '@/utils/cvss';

export interface KnownOutcome { code: string; label: string; description: string; priorityLevel: string | null; }
export interface RoleMeta { code: string; name: string; description: string; }

const props = defineProps<{
  visible: boolean;
  role: RoleMeta | null;
  outcomes: KnownOutcome[];
  usesPriorityMapping: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [payload: { role: RoleMeta; outcomes: KnownOutcome[] }];
}>();

const draftRole = reactive<RoleMeta>({ code: '', name: '', description: '' });
const draftOutcomes = ref<KnownOutcome[]>([]);
const error = ref('');

watch(() => props.visible, (open) => {
  if (!open) return;
  error.value = '';
  draftRole.code = props.role?.code ?? '';
  draftRole.name = props.role?.name ?? '';
  draftRole.description = props.role?.description ?? '';
  draftOutcomes.value = props.outcomes.map((o) => ({ ...o }));
});

function addOutcome() {
  draftOutcomes.value.push({ code: '', label: '', description: '', priorityLevel: null });
}
function removeOutcome(idx: number) { draftOutcomes.value.splice(idx, 1); }

function close() { emit('update:visible', false); }

function save() {
  if (!draftRole.code.trim()) { error.value = 'The role needs a key.'; return; }
  if (!draftRole.name.trim()) { error.value = 'The role needs a name.'; return; }
  const codes = new Set<string>();
  for (const o of draftOutcomes.value) {
    if (!o.code.trim()) { error.value = 'Every outcome needs a key.'; return; }
    if (!o.label.trim()) { error.value = 'Every outcome needs a value.'; return; }
    if (codes.has(o.code)) { error.value = `Duplicate outcome key "${o.code}".`; return; }
    codes.add(o.code);
    if (props.usesPriorityMapping && !o.priorityLevel) { error.value = `Outcome "${o.label}" needs a priority.`; return; }
  }
  error.value = '';
  emit('save', {
    role: { ...draftRole },
    outcomes: draftOutcomes.value.map((o) => ({ ...o })),
  });
}
</script>

<template>
  <Dialog :visible="visible" header="Role settings" modal :style="{ width: 'min(640px, 96vw)' }" @update:visible="close">
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <div style="display:flex; gap:0.5rem;">
        <div style="flex:0 0 140px;">
          <label class="field-label">Key</label>
          <InputText v-model="draftRole.code" style="width:100%;" placeholder="e.g. deployer" />
        </div>
        <div style="flex:1;">
          <label class="field-label">Name</label>
          <InputText v-model="draftRole.name" style="width:100%;" placeholder="e.g. Deployer" />
        </div>
      </div>
      <div>
        <label class="field-label">Description</label>
        <Textarea v-model="draftRole.description" rows="2" style="width:100%;" />
      </div>

      <label class="field-label" style="margin-top:0.25rem;">Outcomes</label>
      <div class="outcomes-scroll">
        <table class="outcomes-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Description</th>
              <th v-if="usesPriorityMapping">Priority</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(o, idx) in draftOutcomes" :key="idx">
              <td><input v-model="o.code" class="mini-input mini-input--code" placeholder="e.g. immediate" /></td>
              <td><input v-model="o.label" class="mini-input" placeholder="e.g. Immediate" /></td>
              <td><input v-model="o.description" class="mini-input" placeholder="Description" /></td>
              <td v-if="usesPriorityMapping">
                <div class="priority-picker">
                  <button
                    v-for="p in PRIORITY_SCALE"
                    :key="p.label"
                    type="button"
                    :class="['priority-chip', { 'priority-chip--active': o.priorityLevel === p.label }]"
                    :style="{ '--priority-color': p.color }"
                    @click="o.priorityLevel = p.label"
                  >{{ p.label }}</button>
                </div>
              </td>
              <td><button type="button" class="remove-btn" title="Remove outcome" @click="removeOutcome(idx)">×</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" class="add-btn" @click="addOutcome">+ Add outcome</button>

      <p v-if="error" class="editor-error">{{ error }}</p>
    </div>

    <template #footer>
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
  padding: 0.25rem 0.45rem;
  font-size: 0.75rem;
  color: var(--ares-text-2);
  outline: none;
}
.mini-input:focus { border-color: var(--p-primary-500); }
.mini-input--code { font-family: monospace; }

.outcomes-scroll { overflow-x: auto; }
.outcomes-table { border-collapse: collapse; font-size: 0.72rem; width: 100%; }
.outcomes-table th, .outcomes-table td {
  border: 1px solid var(--ares-border);
  padding: 0.3rem 0.4rem;
  text-align: left;
}
.outcomes-table th { color: var(--ares-text-muted); font-weight: 600; background: var(--ares-surface-sunken, rgba(0,0,0,0.18)); }

.priority-picker { display: flex; gap: 0.2rem; }
.priority-chip {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.35rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-2);
  cursor: pointer;
}
.priority-chip:hover { border-color: var(--priority-color); color: var(--priority-color); }
.priority-chip--active {
  border-color: var(--priority-color);
  background: color-mix(in srgb, var(--priority-color) 18%, transparent);
  color: var(--priority-color);
}

.remove-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  background: transparent;
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}
.remove-btn:hover { color: #ef4444; border-color: #ef4444; }

.add-btn {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--p-primary-400);
  background: none;
  border: 1px dashed var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
.add-btn:hover { border-color: var(--p-primary-400); }

.editor-error { font-size: 0.78rem; color: #ef4444; margin: 0; }
</style>
