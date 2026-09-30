<script setup lang="ts">
// Escalation wizard — step 2b: only reached when step 1 picked an existing finding. Picks
// between a new affection or an existing one on that finding — visually mirrors
// FindingTargetStepDialog (step 1) per the wizard spec ("Esta sección visualmente deberá de
// ser lo más parecida a la primera").
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { findingsApi, type FindingAffection } from '@/api/findings';

const props = defineProps<{
  visible: boolean;
  findingId: number;
}>();
const emit = defineEmits<{
  'update:visible': [boolean];
  back: [];
  // Existing-affection carries the full object (already loaded here) — AffectionDialog's edit
  // mode needs it to pre-populate title/description/assets, not just the id.
  next: [target: { mode: 'new_affection' } | { mode: 'existing_affection'; affection: FindingAffection }];
}>();

const mode = ref<'new_affection' | 'existing_affection'>('existing_affection');

const affections = ref<FindingAffection[]>([]);
const affectionSearch = ref('');
const loading = ref(false);
const selectedAffection = ref<FindingAffection | null>(null);

const filteredAffections = computed(() => {
  const q = affectionSearch.value.trim().toLowerCase();
  if (!q) return affections.value;
  return affections.value.filter((a) =>
    (a.title ?? '').toLowerCase().includes(q) || (a.code ?? '').toLowerCase().includes(q));
});

const canNext = computed(() => mode.value === 'new_affection' || !!selectedAffection.value);

// immediate: true — this dialog is v-if-gated on findingId in EscalationWizard, and findingId
// flips to non-null in the same tick that step flips to 'affection-target', so it mounts with
// visible already true. A plain (non-immediate) watch only fires on a later false→true change,
// which never happens here, so without `immediate` this never ran and the finding's existing
// affections silently never loaded — every escalation looked like the target finding had none.
watch(() => props.visible, async (v) => {
  if (!v) return;
  affectionSearch.value = '';
  selectedAffection.value = null;
  loading.value = true;
  try {
    const finding = await findingsApi.get(props.findingId);
    affections.value = finding.affections;
    mode.value = affections.value.length ? 'existing_affection' : 'new_affection';
  } finally {
    loading.value = false;
  }
}, { immediate: true });

function affectionAssetSummary(aff: FindingAffection): string {
  return (aff.affects?.map((a) => a.identifier).slice(0, 3) ?? []).join(', ');
}

function next() {
  if (!canNext.value) return;
  emit('next', mode.value === 'new_affection'
    ? { mode: 'new_affection' }
    : { mode: 'existing_affection', affection: selectedAffection.value! });
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
        <button :class="['ares-format-btn', { 'ares-format-btn--active': mode === 'new_affection' }]" style="flex:1;" @click="mode = 'new_affection'">
          <span>New affection</span>
        </button>
        <button :class="['ares-format-btn', { 'ares-format-btn--active': mode === 'existing_affection' }]" style="flex:1;" @click="mode = 'existing_affection'">
          <span>Existing affection</span>
        </button>
      </div>

      <template v-if="mode === 'existing_affection'">
        <InputText v-model="affectionSearch" placeholder="Search by code or title…" style="width:100%;" />
        <div class="stp-list">
          <div v-if="loading" class="stp-empty">Loading affections…</div>
          <div v-else-if="!filteredAffections.length" class="stp-empty">No affections found.</div>
          <button
            v-for="a in filteredAffections" :key="a.id"
            class="stp-row" :class="{ 'stp-row--active': selectedAffection?.id === a.id }"
            @click="selectedAffection = a"
          >
            <span class="stp-row-code">{{ a.code }}</span>
            <span class="stp-row-title">{{ a.title ?? affectionAssetSummary(a) }}</span>
          </button>
        </div>
      </template>

      <div class="stp-footer">
        <Button label="Back" severity="secondary" text size="small" @click="emit('back')" />
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
