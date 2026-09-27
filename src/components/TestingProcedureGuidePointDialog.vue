<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { kbTestingGuidesApi, type TestingGuide, type TestingGuidePoint } from '@/api/kb-testing-guides';
import type { TestingProcedureGuidePointRef } from '@/api/kb-testing-procedures';

const props = defineProps<{
  visible: boolean;
  modelValue: TestingProcedureGuidePointRef[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:modelValue': [refs: TestingProcedureGuidePointRef[]];
}>();

const selected = ref<TestingProcedureGuidePointRef[]>([]);

// Guides list
const guides     = ref<TestingGuide[]>([]);
const guideSearch = ref('');
const activeGuide = ref<TestingGuide | null>(null);
const points     = ref<TestingGuidePoint[]>([]);
const pointSearch = ref('');
const loading    = ref(false);

const filteredGuides = computed(() => {
  const q = guideSearch.value.trim().toLowerCase();
  return q ? guides.value.filter(g => g.name.toLowerCase().includes(q)) : guides.value;
});

const filteredPoints = computed(() => {
  const q = pointSearch.value.trim().toLowerCase();
  return q ? points.value.filter(p => p.title.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)) : points.value;
});

watch(() => props.visible, async (open) => {
  if (!open) return;
  selected.value = props.modelValue.map(r => ({ ...r }));
  if (!guides.value.length) {
    loading.value = true;
    try { const r = await kbTestingGuidesApi.list({ size: 200 }); guides.value = (r.items ?? []).filter(g => g.enabled); }
    finally { loading.value = false; }
  }
});

watch(activeGuide, async (g) => {
  points.value = [];
  pointSearch.value = '';
  if (!g) return;
  const full = await kbTestingGuidesApi.get(g.id);
  points.value = full.points ?? [];
});

function isLinked(pointId: number) {
  return selected.value.some(r => r.guidePointId === pointId);
}

function toggle(p: TestingGuidePoint) {
  if (!activeGuide.value) return;
  if (isLinked(p.id)) {
    selected.value = selected.value.filter(r => r.guidePointId !== p.id);
  } else {
    selected.value.push({
      guidePointId: p.id,
      pointTitle: p.title,
      guideId: activeGuide.value.id,
      guideName: activeGuide.value.name,
    });
  }
}

function removeChip(r: TestingProcedureGuidePointRef) {
  selected.value = selected.value.filter(x => x.guidePointId !== r.guidePointId);
}

function apply() {
  emit('update:modelValue', [...selected.value]);
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Link guide points"
    modal
    :style="{ width: 'min(860px, 96vw)', maxHeight: '90vh' }"
    :pt="{ content: { style: 'padding:1.25rem; display:flex; flex-direction:column; gap:1rem;' } }"
    @update:visible="emit('update:visible', false)"
  >
    <!-- Selected chips -->
    <div v-if="selected.length" class="chips-bar">
      <span class="chips-label">Selected</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem; flex:1;">
        <div v-for="r in selected" :key="r.guidePointId" class="ref-chip">
          <span class="ref-chip-guide">{{ r.guideName }}</span>
          <span>{{ r.pointTitle }}</span>
          <button type="button" class="ref-chip-x" @click="removeChip(r)">×</button>
        </div>
      </div>
    </div>

    <!-- Two-panel browser -->
    <div class="panel-body">
      <!-- Left: guides list -->
      <div class="panel-left">
        <InputText v-model="guideSearch" placeholder="Filter guides…" class="w-full" style="font-size:0.82rem;" />
        <div v-if="loading" class="list-hint">Loading…</div>
        <div v-else-if="!filteredGuides.length" class="list-hint">No guides found.</div>
        <div v-else class="guide-list">
          <div v-for="g in filteredGuides" :key="g.id"
            class="guide-row"
            :class="{ 'guide-row--active': activeGuide?.id === g.id }"
            @click="activeGuide = g">
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ g.name }}</span>
            <span class="point-count">{{ g.pointCount }}</span>
          </div>
        </div>
      </div>

      <!-- Right: points list -->
      <div class="panel-right">
        <template v-if="!activeGuide">
          <div class="list-hint" style="margin:auto;">← Select a guide</div>
        </template>
        <template v-else>
          <InputText v-model="pointSearch" placeholder="Filter points…" class="w-full" style="font-size:0.82rem;" />
          <div v-if="!filteredPoints.length" class="list-hint">No points.</div>
          <div v-else class="points-list">
            <div v-for="p in filteredPoints" :key="p.id"
              class="point-row"
              :class="{ 'point-row--linked': isLinked(p.id) }"
              @click="toggle(p)">
              <div style="flex:1; min-width:0;">
                <div style="font-size:0.85rem; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ p.title }}</div>
                <div v-if="p.description" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  {{ p.description }}
                </div>
              </div>
              <i v-if="isLinked(p.id)" class="pi pi-check" style="color:var(--p-primary-400); font-size:0.85rem; flex-shrink:0;" />
            </div>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
      <Button label="Apply" size="small" @click="apply" />
    </template>
  </Dialog>
</template>

<style scoped>
.chips-bar {
  display: flex; align-items: flex-start; gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
}
.chips-label {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--ares-text-muted);
  white-space: nowrap; padding-top: 0.2rem;
}
.ref-chip {
  display: inline-flex; align-items: center; gap: 0.35rem;
  background: var(--ares-surface-2); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.15rem 0.45rem;
  font-size: 0.78rem; max-width: 320px;
}
.ref-chip-guide {
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--p-primary-400);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  padding: 0.05rem 0.3rem; border-radius: var(--ares-radius);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;
}
.ref-chip-x {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); font-size: 1rem; line-height: 1; padding: 0;
}
.ref-chip-x:hover { color: var(--p-red-400); }

.panel-body {
  display: flex; gap: 0; height: 400px;
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius); overflow: hidden;
}
.panel-left {
  width: 280px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.5rem;
  padding: 0.65rem; border-right: 1px solid var(--ares-border);
  background: var(--ares-surface);
}
.guide-list { flex: 1; overflow-y: auto; }
.guide-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.5rem; border-radius: var(--ares-radius); cursor: pointer;
  font-size: 0.83rem; color: var(--ares-text-2);
}
.guide-row:hover { background: var(--ares-surface-raised); }
.guide-row--active { background: color-mix(in srgb, var(--p-primary-500) 10%, transparent); color: var(--ares-text); font-weight: 500; }
.point-count {
  font-size: 0.7rem; color: var(--ares-text-muted);
  background: var(--ares-surface-2); border-radius: var(--ares-radius);
  padding: 0.05rem 0.35rem; flex-shrink: 0;
}

.panel-right {
  flex: 1; display: flex; flex-direction: column; gap: 0.5rem;
  padding: 0.65rem; overflow: hidden;
}
.points-list { flex: 1; overflow-y: auto; }
.point-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.5rem 0.55rem; border-radius: var(--ares-radius); cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 40%, transparent);
}
.point-row:last-child { border-bottom: none; }
.point-row:hover { background: var(--ares-surface-raised); }
.point-row--linked { background: color-mix(in srgb, var(--p-primary-500) 6%, transparent); }

.list-hint {
  font-size: 0.82rem; color: var(--ares-text-muted);
  font-style: italic; padding: 0.5rem;
}
</style>
