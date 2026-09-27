<script setup lang="ts">
/**
 * Reusable editor for HTTP headers as a list of name/value rows.
 * Emits Record<string, string> — only rows with both name and value filled are included.
 * Used by ToolConfigForm.vue for any AgentToolSpec.Field with ruleBinding: 'headers'.
 */
import { ref, watch } from 'vue';
import InputText from 'primevue/inputtext';

const props = defineProps<{ modelValue?: Record<string, string> }>();
const emit  = defineEmits<{ (e: 'update:modelValue', v: Record<string, string> | undefined): void }>();

interface Row { name: string; value: string; }

const rows = ref<Row[]>(toRows(props.modelValue));

function toRows(obj: Record<string, string> | undefined): Row[] {
  if (!obj || !Object.keys(obj).length) return [];
  return Object.entries(obj).map(([name, value]) => ({ name, value }));
}

function addRow() { rows.value.push({ name: '', value: '' }); }
function removeRow(i: number) { rows.value.splice(i, 1); }

function emitState() {
  const obj: Record<string, string> = {};
  for (const r of rows.value) {
    const n = r.name.trim();
    const v = r.value.trim();
    if (n && v) obj[n] = v;
  }
  emit('update:modelValue', Object.keys(obj).length ? obj : undefined);
}

watch(rows, emitState, { deep: true, immediate: true });

watch(() => props.modelValue, (v) => {
  const current: Record<string, string> = {};
  for (const r of rows.value) {
    const n = r.name.trim(); const val = r.value.trim();
    if (n && val) current[n] = val;
  }
  if (JSON.stringify(current) === JSON.stringify(v ?? {})) return;
  rows.value = toRows(v);
}, { deep: true });
</script>

<template>
  <div class="headers-editor">
    <div v-if="rows.length" class="headers-list">
      <div v-for="(row, i) in rows" :key="i" class="header-row">
        <InputText v-model="row.name"  placeholder="X-Header-Name"
          class="header-name" style="font-family:monospace; font-size:0.8rem;" />
        <span class="header-colon">:</span>
        <InputText v-model="row.value" placeholder="value"
          class="header-value" style="font-family:monospace; font-size:0.8rem;" />
        <button type="button" class="header-remove" @click="removeRow(i)"
          v-tooltip.top="'Remove header'">×</button>
      </div>
    </div>
    <button type="button" class="add-header-btn" @click="addRow">
      <span>+</span> Add header
    </button>
  </div>
</template>

<style scoped>
.headers-editor {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.headers-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.header-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.header-name  { flex: 0 0 38%; min-width: 0; }
.header-colon { color: var(--ares-text-muted); font-size: 0.8rem; flex-shrink: 0; }
.header-value { flex: 1; min-width: 0; }
.header-remove {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  line-height: 1;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: transparent;
  color: var(--ares-text-muted);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
}
.header-remove:hover {
  background: color-mix(in srgb, var(--ares-error) 12%, transparent);
  color: var(--ares-error);
  border-color: var(--ares-error);
}
.add-header-btn {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border: 1px dashed var(--ares-border);
  border-radius: var(--ares-radius);
  background: transparent;
  color: var(--ares-text-muted);
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.add-header-btn:hover { border-color: var(--p-primary-400); color: var(--ares-text-2); }
.add-header-btn span { font-size: 0.9rem; line-height: 1; }
</style>
