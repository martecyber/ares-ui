<script setup lang="ts">
import { ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import { cveApi, type CveEntry } from '@/api/kb';

const props = defineProps<{ modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [string[]] }>();

const query = ref('');
const results = ref<CveEntry[]>([]);
const loading = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(query, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(search, 350);
});

async function search() {
  const q = query.value.trim();
  if (!q) { results.value = []; return; }
  loading.value = true;
  try {
    const res = await cveApi.list({ q, size: 20 });
    results.value = res.items;
  } finally {
    loading.value = false;
  }
}

function isSelected(cveId: string) {
  return props.modelValue.includes(cveId);
}

function toggle(cveId: string) {
  if (isSelected(cveId)) {
    emit('update:modelValue', props.modelValue.filter(id => id !== cveId));
  } else {
    emit('update:modelValue', [...props.modelValue, cveId]);
  }
}

function remove(cveId: string) {
  emit('update:modelValue', props.modelValue.filter(id => id !== cveId));
}
</script>

<template>
  <div>
    <div v-if="modelValue.length" class="selected-chips">
      <span v-for="id in modelValue" :key="id" class="cve-chip">
        {{ id }}
        <i class="pi pi-times" @click="remove(id)" />
      </span>
    </div>

    <InputText v-model="query" placeholder="Search by CVE-ID or keyword…" style="width:100%;" />

    <div v-if="query.trim()" class="results-list">
      <div v-if="loading" class="list-hint">Searching…</div>
      <div v-else-if="!results.length" class="list-hint">No results</div>
      <div
        v-for="e in results"
        :key="e.id"
        class="result-row"
        :class="{ 'result-row--selected': isSelected(e.cveId) }"
        @click="toggle(e.cveId)"
      >
        <span class="entry-code">{{ e.cveId }}</span>
        <span class="entry-name">{{ (e.description ?? '').slice(0, 70) }}</span>
        <i v-if="isSelected(e.cveId)" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem; flex-shrink:0;" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.selected-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
.cve-chip {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-family: monospace; font-size: 0.72rem; font-weight: 600;
  background: var(--ares-surface-raised); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.15em 0.5em;
}
.cve-chip .pi { cursor: pointer; font-size: 0.65rem; color: var(--ares-text-muted); }
.cve-chip .pi:hover { color: var(--ares-error); }

.results-list {
  margin-top: 0.4rem; max-height: 220px; overflow-y: auto;
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
}
.list-hint { padding: 0.6rem 0.75rem; font-size: 0.78rem; color: var(--ares-text-muted); }
.result-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.75rem; cursor: pointer; border-top: 1px solid var(--ares-border);
}
.result-row:first-child { border-top: none; }
.result-row:hover { background: color-mix(in srgb, var(--ares-text) 4%, transparent); }
.result-row--selected { background: color-mix(in srgb, var(--p-primary-500) 10%, transparent); }
.entry-code { font-family: monospace; font-size: 0.75rem; font-weight: 700; color: var(--ares-text-2); flex-shrink: 0; }
.entry-name { font-size: 0.78rem; color: var(--ares-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
</style>
