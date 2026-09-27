<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import {
  presentationsApi, type PresentationSummary, type PresentationDto, type PresentationItemDto,
} from '@/api/dashboardPresentations';
import { dashboardsApi, type DashboardBrowseEntry } from '@/api/dashboards';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router = useRouter();
const toast = useToast();

const presentations = ref<PresentationSummary[]>([]);
const loading = ref(false);

const selectedId = ref<number | null>(null);
const selected = ref<PresentationDto | null>(null);
const detailLoading = ref(false);

const newName = ref('');
const creating = ref(false);

const nameDraft = ref('');
const rotationDraft = ref(30);
const savingMeta = ref(false);

const searchQuery = ref('');
const searchResults = ref<DashboardBrowseEntry[]>([]);
const searching = ref(false);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

function errorDetail(e: any): string {
  return e?.response?.data?.detail ?? e?.message ?? 'Something went wrong';
}

async function load() {
  loading.value = true;
  try { presentations.value = await presentationsApi.list(); }
  finally { loading.value = false; }
}

async function selectPresentation(p: PresentationSummary) {
  selectedId.value = p.id;
  searchQuery.value = '';
  searchResults.value = [];
  detailLoading.value = true;
  try {
    selected.value = await presentationsApi.get(p.id);
    nameDraft.value = selected.value.name;
    rotationDraft.value = selected.value.rotationSeconds;
  } finally {
    detailLoading.value = false;
  }
}

async function createPresentation() {
  if (!newName.value.trim()) return;
  creating.value = true;
  try {
    const created = await presentationsApi.create(newName.value.trim());
    newName.value = '';
    await load();
    const p = presentations.value.find((x) => x.id === created.id);
    if (p) await selectPresentation(p);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Create failed', detail: errorDetail(e), life: 4000 });
  } finally {
    creating.value = false;
  }
}

async function deletePresentation(p: PresentationSummary) {
  const ok = await confirmDialog({ header: 'Delete presentation', message: `Delete "${p.name}"? This can't be undone.` });
  if (!ok) return;
  try {
    await presentationsApi.remove(p.id);
    presentations.value = presentations.value.filter((x) => x.id !== p.id);
    if (selectedId.value === p.id) { selectedId.value = null; selected.value = null; }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: errorDetail(e), life: 4000 });
  }
}

async function saveMeta() {
  if (!selected.value || !nameDraft.value.trim()) return;
  savingMeta.value = true;
  try {
    await presentationsApi.update(selected.value.id, { name: nameDraft.value.trim(), rotationSeconds: rotationDraft.value });
    selected.value.name = nameDraft.value.trim();
    selected.value.rotationSeconds = rotationDraft.value;
    await load();
    toast.add({ severity: 'success', summary: 'Saved', life: 2000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: errorDetail(e), life: 4000 });
  } finally {
    savingMeta.value = false;
  }
}

async function persistItems() {
  if (!selected.value) return;
  try {
    await presentationsApi.saveItems(selected.value.id, selected.value.items.map((i) => i.dashboardId));
    await load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: errorDetail(e), life: 4000 });
    if (selectedId.value) {
      const p = presentations.value.find((x) => x.id === selectedId.value);
      if (p) await selectPresentation(p); // reload to undo the optimistic local edit
    }
  }
}

function moveItem(index: number, dir: -1 | 1) {
  if (!selected.value) return;
  const items = selected.value.items;
  const target = index + dir;
  if (target < 0 || target >= items.length) return;
  const [a, b] = [items[index], items[target]];
  items.splice(index, 1, b);
  items.splice(target, 1, a);
  persistItems();
}

function removeItem(dashboardId: number) {
  if (!selected.value) return;
  selected.value.items = selected.value.items.filter((i) => i.dashboardId !== dashboardId);
  persistItems();
}

function addItem(entry: DashboardBrowseEntry) {
  if (!selected.value) return;
  if (selected.value.items.some((i) => i.dashboardId === entry.id)) return;
  // organizationId isn't in the browse-picker payload (only needed by the play view, fetched
  // separately) — left null here; it's not read anywhere in this management view's own rendering,
  // and persistItems()'s subsequent list() reload doesn't refetch full item detail either, but the
  // next time this presentation is opened, get() resolves it correctly server-side regardless.
  const item: PresentationItemDto = {
    dashboardId: entry.id, dashboardName: entry.name, level: entry.level,
    scopeId: entry.scopeId, scopeLabel: entry.scopeLabel, organizationId: null,
  };
  selected.value.items = [...selected.value.items, item];
  searchQuery.value = '';
  searchResults.value = [];
  persistItems();
}

watch(searchQuery, (q) => {
  if (searchDebounce) clearTimeout(searchDebounce);
  if (!q.trim()) { searchResults.value = []; return; }
  searchDebounce = setTimeout(async () => {
    searching.value = true;
    try { searchResults.value = await dashboardsApi.browse(q.trim()); }
    finally { searching.value = false; }
  }, 300);
});

function play(p: PresentationSummary) {
  const target = router.resolve({ name: 'dashboard-presentation-play', params: { id: p.id } });
  window.open(target.href, '_blank');
}

const LEVEL_LABEL: Record<string, string> = { PLATFORM: 'Platform', ORGANIZATION: 'Org', PROJECT: 'Project' };

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Dashboard Presentations</h2>
        <p class="ares-page-subtitle">
          Rotating playlists of existing dashboards — mix platform, organization, and project
          dashboards freely — meant for a SOC's big screen. Click "Play" to open the fullscreen-capable rotation.
        </p>
      </div>
    </div>

    <div class="layout">
      <!-- ── Presentations list (left) ──────────────────────────────── -->
      <section class="ares-card" style="padding:0;">
        <div class="card-head"><h3>Presentations</h3></div>
        <div class="add-form">
          <InputText v-model="newName" placeholder="e.g. SOC Rotation" @keyup.enter="createPresentation" />
          <Button label="Create" icon="pi pi-plus" size="small" :loading="creating" :disabled="!newName.trim()" @click="createPresentation" />
        </div>
        <div v-if="loading" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">Loading…</div>
        <div v-else-if="!presentations.length" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">
          No presentations yet — create the first one above.
        </div>
        <div v-else class="pres-list">
          <div v-for="p in presentations" :key="p.id" class="pres-row" :class="{ 'pres-row--active': p.id === selectedId }" @click="selectPresentation(p)">
            <div class="pres-row__main">
              <div class="pres-row__name">{{ p.name }}</div>
              <div class="pres-row__meta">{{ p.dashboardCount }} dashboard{{ p.dashboardCount === 1 ? '' : 's' }} · every {{ p.rotationSeconds }}s</div>
            </div>
            <Button icon="pi pi-play" text size="small" v-tooltip.left="'Play'" :disabled="p.dashboardCount === 0" @click.stop="play(p)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.left="'Delete presentation'" @click.stop="deletePresentation(p)" />
          </div>
        </div>
      </section>

      <!-- ── Selected presentation editor (right) ───────────────────── -->
      <section class="ares-card" style="padding:0;">
        <div class="card-head"><h3>{{ selected ? selected.name : 'Select a presentation to edit it' }}</h3></div>

        <template v-if="detailLoading">
          <div style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">Loading…</div>
        </template>
        <template v-else-if="selected">
          <div class="meta-form">
            <InputText v-model="nameDraft" placeholder="Name" style="flex:2;" />
            <div style="display:flex; align-items:center; gap:0.4rem; flex:1;">
              <InputNumber v-model="rotationDraft" :min="5" :max="3600" show-buttons style="width:100%;" />
              <span style="font-size:0.75rem; color:var(--ares-text-muted); white-space:nowrap;">seconds/dashboard</span>
            </div>
            <Button label="Save" icon="pi pi-check" size="small" :loading="savingMeta" @click="saveMeta" />
          </div>

          <div class="card-head" style="border-top:1px solid var(--ares-border);"><h3>Dashboards in rotation</h3></div>
          <div v-if="!selected.items.length" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">
            No dashboards yet — search below to add some.
          </div>
          <div v-else class="item-list">
            <div v-for="(item, i) in selected.items" :key="item.dashboardId" class="item-row">
              <span class="item-row__index">{{ i + 1 }}</span>
              <div class="item-row__main">
                <div class="item-row__name">{{ item.dashboardName }}</div>
                <div class="item-row__scope">
                  <span class="level-badge">{{ LEVEL_LABEL[item.level] }}</span>
                  {{ item.scopeLabel }}
                </div>
              </div>
              <Button icon="pi pi-chevron-up" text size="small" :disabled="i === 0" @click="moveItem(i, -1)" />
              <Button icon="pi pi-chevron-down" text size="small" :disabled="i === selected.items.length - 1" @click="moveItem(i, 1)" />
              <Button icon="pi pi-times" text severity="danger" size="small" v-tooltip.left="'Remove'" @click="removeItem(item.dashboardId)" />
            </div>
          </div>

          <div class="card-head" style="border-top:1px solid var(--ares-border);"><h3>Add a dashboard</h3></div>
          <div class="add-form">
            <InputText v-model="searchQuery" placeholder="Search by dashboard, organization, or project name…" style="flex:1;" />
          </div>
          <div v-if="searching" style="padding:0 1rem 1rem; color:var(--ares-text-muted); font-size:0.8rem;">Searching…</div>
          <div v-else-if="searchQuery.trim() && !searchResults.length" style="padding:0 1rem 1rem; color:var(--ares-text-muted); font-size:0.8rem;">No matches.</div>
          <div v-else-if="searchResults.length" class="item-list">
            <div v-for="entry in searchResults" :key="entry.id" class="item-row item-row--pickable" @click="addItem(entry)">
              <div class="item-row__main">
                <div class="item-row__name">{{ entry.name }}<i v-if="entry.isDefault" class="pi pi-star-fill" style="margin-left:0.4rem; font-size:0.7rem; color:var(--ares-accent);" /></div>
                <div class="item-row__scope"><span class="level-badge">{{ LEVEL_LABEL[entry.level] }}</span>{{ entry.scopeLabel }}</div>
              </div>
              <i class="pi pi-plus" style="color:var(--ares-text-muted);" />
            </div>
          </div>
        </template>
        <div v-else style="padding:1.5rem; color:var(--ares-text-muted); font-size:0.85rem;">
          Pick a presentation from the left, or create a new one.
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 1rem; }
@media (max-width: 1024px) { .layout { grid-template-columns: 1fr; } }

.card-head { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ares-border); }
.card-head h3 { margin: 0; font-size: 0.9rem; color: var(--ares-text-1); }
.add-form { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--ares-border); flex-wrap: wrap; }
.add-form > * { flex: 1; min-width: 140px; }
.add-form > .p-button { flex: 0 0 auto; min-width: auto; }

.meta-form { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--ares-border); flex-wrap: wrap; align-items: center; }

.pres-list, .item-list { max-height: 540px; overflow-y: auto; }
.pres-row, .item-row {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 60%, transparent);
}
.pres-row:last-child, .item-row:last-child { border-bottom: none; }
.pres-row { cursor: pointer; }
.pres-row:hover { background: var(--ares-surface-2); }
.pres-row--active { background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); }
.item-row--pickable { cursor: pointer; }
.item-row--pickable:hover { background: var(--ares-surface-2); }

.pres-row__main, .item-row__main { flex: 1; min-width: 0; }
.pres-row__name, .item-row__name { font-size: 0.88rem; font-weight: 600; color: var(--ares-text-1); }
.pres-row__meta, .item-row__scope { font-size: 0.72rem; color: var(--ares-text-muted); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.4rem; }

.item-row__index { font-size: 0.75rem; color: var(--ares-text-muted); width: 1.2rem; text-align: center; flex-shrink: 0; }

.level-badge {
  font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;
  padding: 0.05rem 0.35rem; border-radius: 3px;
  background: var(--ares-surface-2); color: var(--ares-text-2);
}
</style>
