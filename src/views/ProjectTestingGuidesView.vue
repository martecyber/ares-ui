<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import {
  projectTestingGuidesApi,
  ITEM_STATUSES,
  type ProjectTestingGuide,
  type ProjectTestingGuideItem,
  type ProjectTestingGuideItemStatus,
} from '@/api/project-testing-guides';
import { kbTestingGuidesApi, type TestingGuide } from '@/api/kb-testing-guides';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { kbTestingProceduresApi, type TestingProcedure } from '@/api/kb-testing-procedures';

const route = useRoute();
const engId = computed(() => Number(route.params.engId));

const assignments  = ref<ProjectTestingGuide[]>([]);
const loading      = ref(true);
const err          = ref<string | null>(null);

// Assign dialog
const showAssign   = ref(false);
const assigning    = ref(false);
const assignErr    = ref('');
const availGuides  = ref<TestingGuide[]>([]);
const selectedGuid = ref<number | null>(null);
const guidesLoading = ref(false);

// Expanded panels (by assignment id)
const expanded = ref<Set<number>>(new Set());
function toggle(id: number) {
  const s = new Set(expanded.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expanded.value = s;
}

// Per-item notes (debounced save)
const noteDrafts: Map<number, string> = new Map();
const noteTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

function onNotesInput(item: ProjectTestingGuideItem, value: string) {
  const old = noteTimers.get(item.id);
  if (old) clearTimeout(old);
  noteDrafts.set(item.id, value);
  item.notes = value;
  const t = setTimeout(() => {
    patchItem(item.projectTestingGuideId, item.id, { notes: value });
    noteTimers.delete(item.id);
  }, 800);
  noteTimers.set(item.id, t);
}

async function setStatus(item: ProjectTestingGuideItem, status: ProjectTestingGuideItemStatus) {
  if (item.status === status) return;
  item.status = status;
  await patchItem(item.projectTestingGuideId, item.id, { status });
}

async function patchItem(ptgId: number, itemId: number, body: { status?: string; notes?: string }) {
  try {
    const updated = await projectTestingGuidesApi.updateItem(engId.value, ptgId, itemId, body);
    const ptg = assignments.value.find((a) => a.id === ptgId);
    if (ptg) {
      const idx = ptg.items.findIndex((i) => i.id === itemId);
      if (idx !== -1) ptg.items[idx] = updated;
    }
  } catch (e: any) {
    err.value = e?.response?.data?.message ?? 'Failed to update item';
  }
}

// Procedures popover per item
const proceduresOpen  = ref<Map<number, boolean>>(new Map());
const proceduresCache = ref<Map<number, TestingProcedure[]>>(new Map());
const proceduresLoad  = ref<Set<number>>(new Set());

async function openProcedures(item: ProjectTestingGuideItem) {
  if (!item.guidePointId) return;
  const m = new Map(proceduresOpen.value);
  const wasOpen = m.get(item.id);
  m.set(item.id, !wasOpen);
  proceduresOpen.value = m;
  if (!wasOpen && !proceduresCache.value.has(item.id)) {
    const l = new Set(proceduresLoad.value);
    l.add(item.id);
    proceduresLoad.value = l;
    try {
      const procs = await kbTestingProceduresApi.listByGuidePoint(item.guidePointId);
      const c = new Map(proceduresCache.value);
      c.set(item.id, procs);
      proceduresCache.value = c;
    } finally {
      const l2 = new Set(proceduresLoad.value);
      l2.delete(item.id);
      proceduresLoad.value = l2;
    }
  }
}

function proceduresFor(item: ProjectTestingGuideItem): TestingProcedure[] {
  return proceduresCache.value.get(item.id) ?? [];
}

async function load() {
  loading.value = true;
  err.value = null;
  try {
    assignments.value = await projectTestingGuidesApi.list(engId.value);
    // Expand the first assignment by default
    if (assignments.value.length) expanded.value = new Set([assignments.value[0].id]);
  } catch {
    err.value = 'Failed to load testing checklists.';
  } finally {
    loading.value = false;
  }
}

async function openAssign() {
  selectedGuid.value = null;
  assignErr.value = '';
  showAssign.value = true;
  if (!availGuides.value.length) {
    guidesLoading.value = true;
    try {
      const r = await kbTestingGuidesApi.list({ size: 200 });
      availGuides.value = (r.items ?? []).filter((g) => g.enabled);
    } finally {
      guidesLoading.value = false;
    }
  }
}

async function assign() {
  if (!selectedGuid.value) return;
  assigning.value = true;
  assignErr.value = '';
  try {
    const ptg = await projectTestingGuidesApi.assign(engId.value, selectedGuid.value);
    assignments.value.push(ptg);
    expanded.value = new Set([...expanded.value, ptg.id]);
    showAssign.value = false;
  } catch (e: any) {
    assignErr.value = e?.response?.data?.message ?? e?.message ?? 'Failed to assign guide';
  } finally {
    assigning.value = false;
  }
}

async function resync(ptgId: number) {
  try {
    const updated = await projectTestingGuidesApi.resync(engId.value, ptgId);
    const idx = assignments.value.findIndex((a) => a.id === ptgId);
    if (idx !== -1) assignments.value[idx] = updated;
  } catch (e: any) {
    err.value = e?.response?.data?.message ?? 'Failed to re-sync guide';
  }
}

async function remove(ptgId: number) {
  const ok = await confirmDialog({ header: 'Remove guide checklist', message: 'Remove this guide checklist from the project?', acceptLabel: 'Remove' });
  if (!ok) return;
  try {
    await projectTestingGuidesApi.remove(engId.value, ptgId);
    assignments.value = assignments.value.filter((a) => a.id !== ptgId);
  } catch {
    err.value = 'Failed to remove guide.';
  }
}

function progress(ptg: ProjectTestingGuide) {
  const done = ptg.items.filter((i) => i.status === 'done' || i.status === 'not_applicable').length;
  return { done, total: ptg.items.length, pct: ptg.items.length ? Math.round((done / ptg.items.length) * 100) : 0 };
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Testing Guides</h2>
        <p class="ares-page-subtitle">Track test coverage for this assessment.</p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'Assign guide'" @click="openAssign" />
    </div>

    <div v-if="err" class="ares-alert ares-alert--error" style="margin-bottom:0.75rem;">{{ err }}</div>

    <div v-if="loading" class="ares-table-empty">Loading…</div>

    <template v-else-if="!assignments.length">
      <div class="ares-table-empty" style="margin-top:3rem;">
        <i class="pi pi-list-check" style="font-size:2rem; margin-bottom:0.75rem; display:block;" />
        No guides assigned yet. Click <strong>Assign guide</strong> to start.
      </div>
    </template>

    <div v-else style="display:flex; flex-direction:column; gap:1.25rem;">
      <div v-for="ptg in assignments" :key="ptg.id" class="ares-card" style="padding:0;">

        <!-- Guide header -->
        <div class="guide-header" @click="toggle(ptg.id)">
          <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
            <i :class="['pi', expanded.has(ptg.id) ? 'pi-chevron-down' : 'pi-chevron-right']"
               style="font-size:0.8rem; color:var(--ares-text-muted);" />
            <span class="guide-name">{{ ptg.name }}</span>
            <span style="font-size:0.75rem; color:var(--ares-text-muted);">
              {{ progress(ptg).done }}/{{ progress(ptg).total }} complete
            </span>
          </div>
          <!-- Progress bar -->
          <div style="width:120px; height:6px; border-radius: var(--ares-radius); background:var(--ares-surface-2); overflow:hidden; flex-shrink:0;">
            <div :style="{
              height: '100%', borderRadius: '3px',
              width: progress(ptg).pct + '%',
              background: progress(ptg).pct === 100 ? 'var(--ares-success)' : 'var(--ares-accent)',
              transition: 'width 0.3s',
            }" />
          </div>
          <!-- Actions -->
          <div style="display:flex; gap:0.25rem;" @click.stop>
            <Button v-if="ptg.guideId" icon="pi pi-refresh" text size="small" severity="secondary"
              title="Re-sync from KB guide" @click="resync(ptg.id)" />
            <Button icon="pi pi-times" text size="small" severity="danger"
              title="Remove from project" @click="remove(ptg.id)" />
          </div>
        </div>

        <!-- Checklist items -->
        <template v-if="expanded.has(ptg.id)">
          <div v-if="!ptg.items.length" class="ares-table-empty">
            This guide has no points.
          </div>
          <div v-else style="border-top: 1px solid var(--ares-border);">
            <div v-for="item in ptg.items" :key="item.id" class="item-row">
              <!-- Status buttons -->
              <div class="item-status">
                <button v-for="s in ITEM_STATUSES" :key="s.value"
                  :class="['status-btn', item.status === s.value ? `status-btn--${s.severity}` : '']"
                  :title="s.label"
                  @click="setStatus(item, s.value)">
                  {{ s.label }}
                </button>
              </div>

              <!-- Title + description + notes -->
              <div class="item-body">
                <div style="font-weight:500; font-size:0.87rem;">{{ item.title }}</div>
                <div v-if="item.description"
                  style="font-size:0.8rem; color:var(--ares-text-muted); margin-top:0.15rem;">
                  {{ item.description }}
                </div>
                <Textarea
                  :model-value="item.notes ?? ''"
                  rows="1"
                  auto-resize
                  placeholder="Notes…"
                  style="margin-top:0.4rem; font-size:0.82rem; resize:none; width:100%;"
                  @input="(e: Event) => onNotesInput(item, (e.target as HTMLTextAreaElement).value)"
                />
              </div>

              <!-- Procedures -->
              <div class="item-procs">
                <template v-if="item.guidePointId">
                  <Button icon="pi pi-book" text size="small" severity="secondary"
                    title="View linked procedures"
                    @click="openProcedures(item)" />
                  <div v-if="proceduresOpen.get(item.id)" class="procs-panel">
                    <div v-if="proceduresLoad.has(item.id)"
                      style="font-size:0.78rem; color:var(--ares-text-muted); padding:0.5rem;">
                      Loading…
                    </div>
                    <template v-else-if="proceduresFor(item).length">
                      <router-link
                        v-for="p in proceduresFor(item)" :key="p.id"
                        :to="{ name: 'kb-testing-procedure-detail', params: { id: p.id } }"
                        class="proc-link">
                        {{ p.title }}
                      </router-link>
                    </template>
                    <div v-else style="font-size:0.78rem; color:var(--ares-text-muted); padding:0.5rem;">
                      No procedures linked.
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Assign dialog -->
    <Dialog v-model:visible="showAssign" header="Assign a testing guide" modal
      :style="{ width: 'min(480px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.5rem;">
        <div class="form-field">
          <label>Guide *</label>
          <Select v-model="selectedGuid"
            :options="availGuides"
            option-label="name"
            option-value="id"
            placeholder="Select a testing guide"
            class="w-full"
            filter
            :loading="guidesLoading"
          >
            <template #option="{ option }">
              <div>
                <div style="font-weight:500;">{{ option.name }}</div>
                <div style="font-size:0.75rem; color:var(--ares-text-muted);">
                  {{ option.pointCount }} point{{ option.pointCount !== 1 ? 's' : '' }}
                </div>
              </div>
            </template>
          </Select>
        </div>
        <Message v-if="assignErr" severity="error" :closable="false">{{ assignErr }}</Message>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" @click="showAssign = false" />
          <Button label="Assign" :loading="assigning" :disabled="!selectedGuid" @click="assign" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.form-field { display: flex; flex-direction: column; gap: 0.35rem; }
.form-field label { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-muted); }

.guide-header {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.85rem 1rem; cursor: pointer;
  border-radius: var(--ares-radius) var(--ares-radius) 0 0;
  transition: background 0.1s;
}
.guide-header:hover { background: var(--ares-surface-raised); }
.guide-name { font-weight: 600; font-size: 0.95rem; }

.item-row {
  display: flex; align-items: flex-start; gap: 1rem;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);
}
.item-row:last-child { border-bottom: none; }

.item-status {
  display: flex; gap: 0.25rem; flex-shrink: 0; padding-top: 0.1rem;
}
.item-body { flex: 1; min-width: 0; }
.item-procs { flex-shrink: 0; position: relative; }

.status-btn {
  padding: 0.15rem 0.45rem;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  background: var(--ares-surface-raised);
  font-size: 0.7rem; font-weight: 600;
  cursor: pointer; font-family: inherit;
  color: var(--ares-text-muted);
  transition: border-color 0.1s, color 0.1s;
  white-space: nowrap;
}
.status-btn:hover { border-color: var(--p-primary-400); color: var(--p-primary-400); }
.status-btn--success { border-color: var(--p-green-500); color: var(--p-green-400); background: color-mix(in srgb, var(--p-green-500) 8%, var(--ares-surface)); }
.status-btn--warn    { border-color: var(--p-orange-400); color: var(--p-orange-400); background: color-mix(in srgb, var(--p-orange-400) 8%, var(--ares-surface)); }

.procs-panel {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 50;
  min-width: 220px; max-width: 320px;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  padding: 0.35rem 0;
}
.proc-link {
  display: block; padding: 0.35rem 0.75rem;
  font-size: 0.82rem; color: var(--ares-accent);
  text-decoration: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.proc-link:hover { background: var(--ares-surface-raised); }
</style>
