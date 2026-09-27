<script setup lang="ts">
// Escalation wizard — step 1: pick a target Finding (new, or an existing one to add an affection
// to). No per-mode fields live here — a chosen "new finding" just proceeds to the full creation
// form (NewFindingStepDialog) on Next, which already has its own title field; this step is purely
// the choice + (when existing) the search list. Mirrors EscalationTargetDialog's markup/styling,
// split out as its own step per the wizard redesign.
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { findingsApi, type Finding } from '@/api/findings';

const props = defineProps<{
  visible: boolean;
  projectId: number;
}>();
const emit = defineEmits<{
  'update:visible': [boolean];
  next: [target: { mode: 'new_finding' } | { mode: 'existing_finding'; findingId: number }];
}>();

const mode = ref<'new_finding' | 'existing_finding'>('existing_finding');

const allFindings = ref<Finding[]>([]);
const findingSearch = ref('');
const loadingFindings = ref(false);
const selectedFinding = ref<Finding | null>(null);

const filteredFindings = computed(() => {
  const q = findingSearch.value.trim().toLowerCase();
  if (!q) return allFindings.value;
  return allFindings.value.filter((f) =>
    f.title.toLowerCase().includes(q) || (f.code && f.code.toLowerCase().includes(q)));
});

const canNext = computed(() => mode.value === 'new_finding' || !!selectedFinding.value);

watch(() => props.visible, async (v) => {
  if (!v) return;
  mode.value = 'existing_finding';
  findingSearch.value = '';
  selectedFinding.value = null;
  loadingFindings.value = true;
  try {
    const res = await findingsApi.list({ projectId: props.projectId, includeDrafts: true, size: 200 });
    allFindings.value = res.items;
  } finally {
    loadingFindings.value = false;
  }
});

function next() {
  if (!canNext.value) return;
  emit('next', mode.value === 'new_finding'
    ? { mode: 'new_finding' }
    : { mode: 'existing_finding', findingId: selectedFinding.value!.id });
}
</script>

<template>
  <Dialog
    :visible="visible" modal :draggable="false"
    :style="{ width: 'min(900px, 96vw)' }"
    :pt="{ content: { style: 'padding:0;' } }"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header><span style="font-weight:600;">Escalate to Finding</span></template>

    <div class="stp-body">
      <div class="stp-mode-row">
        <button :class="['ares-format-btn', { 'ares-format-btn--active': mode === 'new_finding' }]" style="flex:1;" @click="mode = 'new_finding'">
          <span>New finding</span>
        </button>
        <button :class="['ares-format-btn', { 'ares-format-btn--active': mode === 'existing_finding' }]" style="flex:1;" @click="mode = 'existing_finding'">
          <span>Existing finding</span>
        </button>
      </div>

      <template v-if="mode === 'existing_finding'">
        <InputText v-model="findingSearch" placeholder="Search by code or title…" style="width:100%;" />
        <div class="stp-list">
          <div v-if="loadingFindings" class="stp-empty">Loading findings…</div>
          <div v-else-if="!filteredFindings.length" class="stp-empty">No findings found.</div>
          <button
            v-for="f in filteredFindings" :key="f.id"
            class="stp-row" :class="{ 'stp-row--active': selectedFinding?.id === f.id }"
            @click="selectedFinding = f"
          >
            <span class="stp-row-title">{{ f.title }}</span>
            <span v-if="f.code" class="stp-row-code">{{ f.code }}</span>
          </button>
        </div>
      </template>

      <div class="stp-footer">
        <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
        <Button label="Next" icon="pi pi-arrow-right" icon-pos="right" size="small" :disabled="!canNext" @click="next" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.stp-body { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; }

.stp-mode-row { display: flex; gap: 0.5rem; }
.ares-format-btn {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem;
  background: var(--ares-surface-raised); border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
  padding: 0.5rem 0.85rem; cursor: pointer; font-size: 0.85rem; font-family: inherit; color: inherit;
  transition: border-color 0.12s, background 0.12s;
}
.ares-format-btn:hover { border-color: var(--p-primary-400); }
.ares-format-btn--active { border-color: var(--p-primary-500); background: color-mix(in srgb, var(--p-primary-500) 10%, transparent); }

.stp-list { border: 1px solid var(--ares-border); border-radius: var(--ares-radius); max-height: 260px; overflow-y: auto; }
.stp-row {
  display: flex; align-items: center; gap: 0.6rem; width: 100%;
  padding: 0.5rem 0.75rem; background: transparent; border: none; border-bottom: 1px solid var(--ares-border);
  cursor: pointer; text-align: left; font-family: inherit; color: inherit; transition: background 0.12s;
}
.stp-row:last-child { border-bottom: none; }
.stp-row:hover { background: var(--ares-surface-2); }
.stp-row--active { background: color-mix(in srgb, var(--ares-accent) 10%, transparent); }
.stp-row-title { flex: 1; min-width: 0; font-size: 0.83rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stp-row-code { font-size: 0.72rem; font-family: monospace; color: var(--ares-text-muted); }

.stp-empty { padding: 1rem; text-align: center; font-size: 0.82rem; color: var(--ares-text-muted); }

.stp-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--ares-border); }
</style>
