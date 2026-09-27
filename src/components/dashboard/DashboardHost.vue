<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { GridLayout } from 'grid-layout-plus';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/auth';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { saveAsTemplate as saveAsTemplateFlow } from '@/composables/useSaveAsTemplate';
import {
  dashboardsApi, type DashboardLevel, type DashboardSummary, type DashboardDto,
  type DashboardWidgetDto, type DashboardWidgetType, type AqlCountData, type AqlChartData, type AqlListData,
  type WidgetInput,
} from '@/api/dashboards';
import { widgetCatalogEntry } from '@/constants/dashboardWidgets';
import DashboardWidgetRenderer from './DashboardWidgetRenderer.vue';
import DashboardEditorAddWidgetDialog from './DashboardEditorAddWidgetDialog.vue';

const props = defineProps<{
  level: DashboardLevel;
  scopeId: number | null;
  /** Only meaningful (and required for click-through navigation) at PROJECT level, whose list
   *  routes are nested under an organization id the dashboard's own scopeId doesn't carry. */
  orgId?: number | null;
  /** Pins the host to one specific dashboard instead of the scope's default/switcher-selected one
   *  — used by the presentation player to show an exact dashboard per rotation slot. When set,
   *  the scope's dashboard list (which only exists to back the switcher) is never fetched, and
   *  reactively changing this prop swaps the displayed dashboard in place without unmounting this
   *  component — which is what lets fullscreen state survive across a presentation's rotations.
   *  The three existing host pages never pass this, so their behavior is unaffected. */
  dashboardId?: number | null;
}>();

const auth = useAuthStore();
const toast = useToast();

const COL_NUM = 12;
const ROW_HEIGHT = 34;

interface EditableWidget {
  id: number | null;
  tempKey: string;
  /** Null for a widget whose stored type isn't a current DashboardWidgetType — see
   *  DashboardWidgetDto.type. `typeName` still carries the raw stored string for display. */
  type: DashboardWidgetType | null;
  typeName: string;
  title: string | null;
  config: Record<string, any>;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

const dashboards = ref<DashboardSummary[]>([]);
const activeDashboardId = ref<number | null>(props.dashboardId ?? null);
const dashboard = ref<DashboardDto | null>(null);
const widgets = ref<EditableWidget[]>([]);
const widgetData = ref<Record<number, AqlCountData | AqlChartData | AqlListData>>({});
// Per-widget loading/error state for the server-computed types (AQL_COUNT/AQL_CHART/AQL_LIST) —
// each fetches its own data independently (see loadWidgetsData) so one slow/broken widget can't
// block or fail the rest of the dashboard. Bespoke widget types (calendar, project lists, etc.)
// fetch their own data client-side and never appear in these maps.
const widgetLoading = ref<Record<number, boolean>>({});
const widgetErrors = ref<Record<number, string>>({});
const loading = ref(true);
const loadError = ref<string | null>(null);
const editMode = ref(false);
const editingName = ref('');
const editingPresentable = ref(false);
const saving = ref(false);
const showAddDialog = ref(false);
const showNameDialog = ref(false);
const nameDraft = ref('');
const templateOptions = ref<DashboardSummary[]>([]);
const templateIdDraft = ref<number | null>(null);
const showSaveTemplateDialog = ref(false);
const templateNameDraft = ref('');
const templateDescDraft = ref('');
const savingTemplate = ref(false);
let tempKeySeq = 0;

const canEdit = computed(() => {
  if (props.level === 'PLATFORM') return auth.isAdmin || auth.isOperator;
  return auth.isAdmin || auth.isOperator || auth.isClientAdmin;
});
// Templates are staff-only server-side (see DashboardService.isStaff) — CLIENT_ADMIN can edit a
// dashboard but never save it as a reusable template.
const canSaveTemplate = computed(() => auth.isAdmin || auth.isOperator);
// Dashboard Presentations are entirely staff-only (DashboardPresentationController) — a
// CLIENT_ADMIN can edit a dashboard but would have no use for (and should never see) a control
// that only matters for a feature they can never reach.
const canTogglePresentable = computed(() => auth.isAdmin || auth.isOperator);

const layout = computed({
  // Most widget types are fixed-size (min=max=their own current w/h — a widget can never end up
  // at a size its own layout wasn't built to render) — only position is editable for those. A
  // few types declare a real minW/maxW/minH/maxH range in the catalog (checked against their own
  // CSS to still look right across it); those get a real resize handle, clamped to that range.
  get: () => widgets.value.map((w) => {
    const entry = widgetCatalogEntry(w.type);
    const minW = entry.minW ?? w.width;
    const maxW = entry.maxW ?? w.width;
    const minH = entry.minH ?? w.height;
    const maxH = entry.maxH ?? w.height;
    return {
      i: w.tempKey, x: w.posX, y: w.posY,
      w: Math.min(Math.max(w.width, minW), maxW),
      h: Math.min(Math.max(w.height, minH), maxH),
      minW, maxW, minH, maxH,
      isResizable: minW !== maxW || minH !== maxH,
    };
  }),
  set: applyLayoutChanges,
});

/** grid-layout-plus does NOT emit `update:layout` after a drag or resize (only on mount and on
 *  a responsive breakpoint change) — the actual per-drag/resize signal is the separate
 *  `layout-updated` event, so `v-model:layout`'s own two-way binding alone never sees a widget
 *  move. Both are wired to this same sync so `widgets` (the real source of truth `saveLayout`
 *  reads from) reflects whichever one actually fires. Without the `layout-updated` listener,
 *  dragging/resizing looked like a no-op and Save silently persisted the pre-drag positions —
 *  the exact bug this fixes. */
function applyLayoutChanges(items: { i: string | number; x: number; y: number; w: number; h: number }[]) {
  for (const item of items) {
    const w = widgets.value.find((w) => w.tempKey === String(item.i));
    if (w) { w.posX = item.x; w.posY = item.y; w.width = item.w; w.height = item.h; }
  }
}

function widgetByKey(key: string | number): EditableWidget | undefined {
  return widgets.value.find((w) => w.tempKey === String(key));
}

function toDto(w: EditableWidget): DashboardWidgetDto {
  return { id: w.id ?? -1, type: w.type, typeName: w.typeName, title: w.title, config: w.config, posX: w.posX, posY: w.posY, width: w.width, height: w.height };
}

async function loadDashboardList() {
  if (props.dashboardId) return; // pinned to one dashboard — the switcher's list isn't needed
  dashboards.value = await dashboardsApi.list(props.level, props.scopeId ?? undefined);
  if (!activeDashboardId.value) {
    activeDashboardId.value = dashboards.value.find((d) => d.isDefault)?.id ?? dashboards.value[0]?.id ?? null;
  }
}

watch(() => props.dashboardId, (id) => { if (id) activeDashboardId.value = id; });

// The only widget types with server-computed data (DashboardWidgetDataService.dataFor on the
// backend) — every other type fetches its own data client-side and is never touched here.
const SERVER_DATA_WIDGET_TYPES = new Set<DashboardWidgetType>(['AQL_COUNT', 'AQL_CHART', 'AQL_LIST']);

// Aborts the previous batch's still-in-flight widget-data requests whenever a new load starts
// (dashboard switched, or — in the presentation player — rotated to the next slide) so a slow
// widget from an already-abandoned dashboard can't keep piling up in the browser's per-origin
// connection queue behind the current dashboard's own requests. Without this, a rotating
// presentation whose widgets have real (slower) data to return could look like it never finishes
// loading: each rotation added another never-cancelled request competing for the same handful of
// connections, so the backlog only ever grew.
let widgetAbortController: AbortController | null = null;

async function loadDashboard() {
  if (!activeDashboardId.value) return;
  widgetAbortController?.abort();
  loading.value = true;
  loadError.value = null;
  widgetData.value = {};
  widgetLoading.value = {};
  widgetErrors.value = {};
  try {
    dashboard.value = await dashboardsApi.get(activeDashboardId.value);
    widgets.value = dashboard.value.widgets.map((w) => ({
      id: w.id, tempKey: String(w.id), type: w.type, typeName: w.typeName, title: w.title, config: w.config,
      posX: w.posX, posY: w.posY, width: w.width, height: w.height,
    }));
  } catch (e: any) {
    loadError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load dashboard';
    loading.value = false;
    return;
  }
  // The structure (widget grid/positions) is up — render it now instead of waiting on data too;
  // each widget shows its own loading spinner until loadWidgetsData resolves it independently.
  loading.value = false;
  await loadWidgetsData();
}

/** Fires one data request per server-backed widget, in parallel — a timeout or error on one
 *  widget only sets that widget's own error state (rendered inline by AqlCountWidget/
 *  AqlChartWidget/AqlListWidget), it never affects the others or the rest of the dashboard. */
async function loadWidgetsData() {
  const dashboardId = activeDashboardId.value;
  if (!dashboardId) return;
  const controller = new AbortController();
  widgetAbortController = controller;
  const targets = widgets.value.filter(
    (w): w is EditableWidget & { id: number } => w.id != null && w.type !== null && SERVER_DATA_WIDGET_TYPES.has(w.type));
  for (const w of targets) widgetLoading.value[w.id] = true;
  await Promise.allSettled(targets.map(async (w) => {
    try {
      const data = await dashboardsApi.widgetData(dashboardId, w.id, controller.signal);
      if (data != null) widgetData.value[w.id] = data;
    } catch (e: any) {
      if (controller.signal.aborted) return; // superseded by a newer load — not this widget's error to show
      widgetErrors.value[w.id] = e?.response?.data?.detail ?? e?.message ?? 'Failed to load';
    } finally {
      if (!controller.signal.aborted) widgetLoading.value[w.id] = false;
    }
  }));
}

watch(activeDashboardId, () => { editMode.value = false; loadDashboard(); });

onMounted(async () => {
  try {
    await loadDashboardList();
    await loadDashboard();
  } catch (e: any) {
    loading.value = false;
    loadError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load dashboard';
  }
});
onUnmounted(() => widgetAbortController?.abort());

function retryLoad() {
  loadDashboardList().then(loadDashboard).catch((e: any) => {
    loadError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load dashboard';
  });
}

function toggleEditMode() {
  if (editMode.value) {
    // Leaving edit mode without saving discards in-progress drag/resize/add/remove changes.
    loadDashboard();
  } else {
    editingName.value = dashboard.value?.name ?? '';
    editingPresentable.value = dashboard.value?.presentable ?? false;
  }
  editMode.value = !editMode.value;
}

function freeY(): number {
  return widgets.value.reduce((max, w) => Math.max(max, w.posY + w.height), 0);
}

function onAddWidget(input: Pick<WidgetInput, 'type' | 'title' | 'config'>) {
  const entry = widgetCatalogEntry(input.type);
  widgets.value.push({
    id: null,
    tempKey: `new-${++tempKeySeq}`,
    type: input.type,
    typeName: input.type,
    title: input.title ?? null,
    config: input.config,
    posX: 0,
    posY: freeY(),
    width: entry.defaultW,
    height: entry.defaultH,
  });
}

function removeWidget(key: string) {
  widgets.value = widgets.value.filter((w) => w.tempKey !== key);
}

// Reconfiguring a widget already on the dashboard (AQL_COUNT/AQL_CHART only — see
// widgetCatalogEntry(...).configurable) reuses the same add-widget dialog in "edit" mode: type
// grid hidden, fields pre-filled, confirm updates this widget's title/config in place instead of
// pushing a new one.
const editingWidgetKey = ref<string | null>(null);
const editingWidgetInfo = computed(() => {
  const w = editingWidgetKey.value ? widgetByKey(editingWidgetKey.value) : null;
  // w.type is only ever null for an unsupported/broken widget, and those never reach here — the
  // "Configure" button that calls openEditWidgetDialog only renders when
  // widgetCatalogEntry(...).configurable is true, which UNKNOWN_WIDGET_ENTRY always reports false.
  return w && w.type ? { type: w.type, title: w.title, config: w.config } : null;
});

function openEditWidgetDialog(key: string) {
  editingWidgetKey.value = key;
  showAddDialog.value = true;
}

function onDialogVisibleChange(v: boolean) {
  showAddDialog.value = v;
  if (!v) editingWidgetKey.value = null;
}

function onUpdateWidget(input: Pick<WidgetInput, 'title' | 'config'>) {
  const w = editingWidgetKey.value ? widgetByKey(editingWidgetKey.value) : null;
  if (!w) return;
  w.title = input.title ?? null;
  w.config = input.config;
  editingWidgetKey.value = null;
}

async function saveLayout() {
  if (!dashboard.value) return;
  const trimmedName = editingName.value.trim();
  if (!trimmedName) {
    toast.add({ severity: 'error', summary: 'Dashboard name cannot be empty', life: 4000 });
    return;
  }
  saving.value = true;
  try {
    // Widgets with an unrecognized type (null — see EditableWidget.type) have nothing valid to
    // send back; dropping them here is how a broken widget actually gets cleaned up (the
    // dashboard-widgets save endpoint deletes any row not present in the request), same effect
    // as the operator removing it by hand.
    const inputs: WidgetInput[] = widgets.value
      .filter((w): w is EditableWidget & { type: DashboardWidgetType } => w.type !== null)
      .map((w) => ({
        id: w.id, type: w.type, title: w.title, config: w.config,
        posX: w.posX, posY: w.posY, width: w.width, height: w.height,
      }));
    // The name and "Presentable" fields live inline in the edit-mode header now (no separate
    // rename/settings dialog) — a single "Save" persists them together with the widget layout.
    if (trimmedName !== dashboard.value.name || editingPresentable.value !== dashboard.value.presentable) {
      await dashboardsApi.update(dashboard.value.id, {
        name: trimmedName !== dashboard.value.name ? trimmedName : undefined,
        presentable: canTogglePresentable.value ? editingPresentable.value : undefined,
      });
    }
    await dashboardsApi.saveWidgets(dashboard.value.id, inputs);
    toast.add({ severity: 'success', summary: 'Dashboard saved', life: 2500 });
    editMode.value = false;
    await loadDashboardList();
    await loadDashboard();
  } catch {
    toast.add({ severity: 'error', summary: 'Failed to save dashboard', life: 4000 });
  } finally {
    saving.value = false;
  }
}

// ── Dashboard-level management (switch/create/set-default/delete) ──────────
// Renaming no longer goes through this dialog — see `editingName`/`saveLayout`: the name is now
// an inline field in the edit-mode header, saved together with the widget layout.

function openCreateDialog() {
  nameDraft.value = '';
  templateIdDraft.value = null;
  showNameDialog.value = true;
  // Best-effort — templates are staff-only server-side, so a non-staff caller (e.g. a
  // CLIENT_ADMIN creating an org dashboard) just sees an empty picklist and creates blank.
  dashboardsApi.listTemplates(props.level).then((t) => { templateOptions.value = t; }).catch(() => { templateOptions.value = []; });
}

async function confirmCreate() {
  const name = nameDraft.value.trim();
  if (!name) return;
  const created = templateIdDraft.value != null
    ? await dashboardsApi.createFromTemplate(templateIdDraft.value, { scopeId: props.scopeId, name })
    : await dashboardsApi.create(props.level, props.scopeId, name);
  showNameDialog.value = false;
  await loadDashboardList();
  activeDashboardId.value = created.id;
}

function openSaveAsTemplateDialog() {
  if (!dashboard.value) return;
  templateNameDraft.value = dashboard.value.name;
  templateDescDraft.value = '';
  showSaveTemplateDialog.value = true;
}

async function confirmSaveAsTemplate() {
  if (!dashboard.value) return;
  const name = templateNameDraft.value.trim();
  if (!name) return;
  savingTemplate.value = true;
  try {
    await saveAsTemplateFlow(
      (overwrite) => dashboardsApi.saveAsTemplate(dashboard.value!.id,
        { name, description: templateDescDraft.value.trim() || undefined }, overwrite),
      name, 'dashboard template');
    toast.add({ severity: 'success', summary: 'Saved as template', life: 2500 });
    showSaveTemplateDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: e?.response?.data?.detail ?? 'Failed to save template', life: 4000 });
  } finally {
    savingTemplate.value = false;
  }
}

async function setActiveAsDefault() {
  if (!dashboard.value || dashboard.value.isDefault) return;
  await dashboardsApi.setDefault(dashboard.value.id);
  // loadDashboardList() alone refreshes the dropdown's summaries, but `dashboard` is a separate
  // object (from dashboardsApi.get()) that isn't kept in sync with it — without this, the "Set as
  // default" star in DashboardControls.vue (which checks `dashboard.isDefault`) kept showing until
  // the user switched dashboards or reloaded the page.
  dashboard.value.isDefault = true;
  await loadDashboardList();
}

async function deleteActive() {
  if (!dashboard.value) return;
  const ok = await confirmDialog({
    message: `Delete dashboard "${dashboard.value.name}"? This can't be undone.`,
    header: 'Delete dashboard',
  });
  if (!ok) return;
  try {
    await dashboardsApi.remove(dashboard.value.id);
    activeDashboardId.value = null;
    await loadDashboardList();
    await loadDashboard();
  } catch {
    toast.add({ severity: 'error', summary: "Can't delete the only dashboard for this scope", life: 4000 });
  }
}

// Fullscreens this component's own root element (see the template — it contains ONLY the grid,
// no page title/controls), so no markup restructuring is needed: the native Fullscreen API
// already strips everything outside the fullscreened element from the rendered viewport. No
// custom "exit" affordance either — browsers show their own "Press Esc to exit" hint. Also reused
// as-is by the presentation player (toggled via the same exposed method) since `hostRoot` never
// unmounts across a presentation's rotations (see the `dashboardId` prop/watch above).
const hostRoot = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  hostRoot.value?.requestFullscreen();
}
function onFullscreenChange() { isFullscreen.value = document.fullscreenElement === hostRoot.value; }
onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange));
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange));

// The dashboard/edit-mode picker + action buttons render inline in the host page's own header
// (next to whatever other action buttons it already has — Complete/Reopen, etc.) instead of a
// toolbar row inside this component, so everything a page's header needs is exposed here rather
// than rendered by this component itself. Only the two dialogs (add-widget, name-prompt) stay
// owned by this component, since they're triggered by these same exposed methods either way.
defineExpose({
  dashboards, activeDashboardId, dashboard, editMode, editingName, editingPresentable, saving,
  canEdit, canSaveTemplate, canTogglePresentable,
  toggleEditMode, openCreateDialog, setActiveAsDefault, deleteActive, saveLayout,
  showAddDialog, isFullscreen, toggleFullscreen, openSaveAsTemplateDialog,
});
</script>

<template>
  <div class="dashboard-host" ref="hostRoot">
    <div v-if="loading" style="color:var(--ares-text-muted); padding:2rem 0;">Loading dashboard…</div>
    <div v-else-if="loadError" style="display:flex; flex-direction:column; align-items:flex-start; gap:0.6rem; padding:2rem 0; color:var(--ares-text-muted);">
      <span><i class="pi pi-exclamation-triangle" style="color:var(--ares-error); margin-right:0.4rem;" />Failed to load dashboard: {{ loadError }}</span>
      <Button label="Retry" icon="pi pi-refresh" size="small" severity="secondary" @click="retryLoad" />
    </div>

    <GridLayout
      v-else-if="dashboard"
      v-model:layout="layout"
      :col-num="COL_NUM"
      :row-height="ROW_HEIGHT"
      :is-draggable="editMode"
      :is-resizable="editMode"
      :margin="[10, 10]"
      :vertical-compact="true"
      :use-css-transforms="true"
      @layout-updated="applyLayoutChanges"
    >
      <template #item="{ item }">
        <div class="widget-shell" :class="{ editing: editMode }">
          <!-- A dedicated strip (not an overlay) so edit-mode controls never sit on top of a
               widget's own header/buttons — e.g. the schedule calendar's own month-nav arrows,
               which an absolutely-positioned remove button used to cover. -->
          <div v-if="editMode" class="widget-edit-bar">
            <i class="pi pi-arrows-alt widget-drag-handle" v-tooltip.top="'Drag to move'" />
            <span class="widget-edit-title">{{ widgetByKey(item.i)?.title || (widgetByKey(item.i)?.type ? widgetCatalogEntry(widgetByKey(item.i)!.type).label : `Unsupported: ${widgetByKey(item.i)?.typeName}`) }}</span>
            <Button
              v-if="widgetCatalogEntry(widgetByKey(item.i)!.type).configurable"
              icon="pi pi-cog" text rounded size="small" class="widget-remove"
              v-tooltip.top="'Configure'" @click="openEditWidgetDialog(String(item.i))"
            />
            <Button icon="pi pi-times" text rounded size="small" class="widget-remove" @click="removeWidget(String(item.i))" />
          </div>
          <div class="widget-content">
            <DashboardWidgetRenderer
              v-if="widgetByKey(item.i)"
              :widget="toDto(widgetByKey(item.i)!)"
              :data="widgetByKey(item.i)!.id != null ? (widgetData[widgetByKey(item.i)!.id!] ?? null) : null"
              :loading="widgetByKey(item.i)!.id != null ? !!widgetLoading[widgetByKey(item.i)!.id!] : false"
              :error="widgetByKey(item.i)!.id != null ? (widgetErrors[widgetByKey(item.i)!.id!] ?? null) : null"
              :level="level"
              :scope-id="scopeId"
              :org-id="orgId ?? null"
            />
          </div>
        </div>
      </template>
    </GridLayout>

    <p v-if="!loading && !widgets.length" style="color:var(--ares-text-muted); font-size:0.85rem;">
      This dashboard has no widgets yet.<span v-if="canEdit"> Click "Edit dashboard" to add some.</span>
    </p>

    <DashboardEditorAddWidgetDialog
      :visible="showAddDialog" @update:visible="onDialogVisibleChange"
      :level="level" :editing-widget="editingWidgetInfo"
      :scope-id="scopeId" :org-id="orgId ?? null"
      @add="onAddWidget" @update="onUpdateWidget"
    />

    <Dialog :visible="showNameDialog" @update:visible="(v) => showNameDialog = v" modal header="New dashboard" style="width: 380px;">
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <InputText v-model="nameDraft" style="width:100%;" placeholder="Dashboard name" @keyup.enter="confirmCreate" />
        <div v-if="templateOptions.length">
          <label style="display:block; font-size:0.78rem; color:var(--ares-text-muted); margin-bottom:0.3rem;">
            Start from template (optional)
          </label>
          <Select
            v-model="templateIdDraft" :options="templateOptions" option-label="name" option-value="id"
            filter show-clear placeholder="Blank dashboard" style="width:100%;"
          >
            <template #option="{ option }">
              <div>
                <div style="font-size:0.85rem;">{{ option.name }}</div>
                <div v-if="option.description" style="font-size:0.72rem; color:var(--ares-text-muted);">{{ option.description }}</div>
              </div>
            </template>
          </Select>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showNameDialog = false" />
        <Button label="Create" :disabled="!nameDraft.trim()" @click="confirmCreate" />
      </template>
    </Dialog>

    <Dialog :visible="showSaveTemplateDialog" @update:visible="(v) => showSaveTemplateDialog = v" modal header="Save as template" style="width: 420px;">
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <p style="margin:0; font-size:0.82rem; color:var(--ares-text-muted);">
          Saves this dashboard's current widget layout as a new, reusable template. The dashboard itself is left unchanged.
        </p>
        <div>
          <label style="display:block; font-size:0.78rem; color:var(--ares-text-muted); margin-bottom:0.3rem;">Name</label>
          <InputText v-model="templateNameDraft" style="width:100%;" placeholder="Template name" @keyup.enter="confirmSaveAsTemplate" />
        </div>
        <div>
          <label style="display:block; font-size:0.78rem; color:var(--ares-text-muted); margin-bottom:0.3rem;">Description (optional)</label>
          <InputText v-model="templateDescDraft" style="width:100%;" placeholder="What this template is for" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showSaveTemplateDialog = false" />
        <Button label="Save" :loading="savingTemplate" :disabled="!templateNameDraft.trim()" @click="confirmSaveAsTemplate" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.dashboard-host { display: flex; flex-direction: column; gap: 1rem; }
.dashboard-host:fullscreen {
  background: var(--ares-bg);
  padding: 1.25rem;
  overflow-y: auto;
}

.widget-shell {
  height: 100%; box-sizing: border-box; display: flex; flex-direction: column;
}
.widget-content { flex: 1; min-height: 0; overflow: hidden; }
.widget-shell.editing {
  outline: 1px dashed var(--ares-border);
  border-radius: var(--ares-radius);
}

.widget-edit-bar {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.15rem 0.15rem 0.15rem 0.5rem;
  background: var(--ares-surface-2);
  border-bottom: 1px solid var(--ares-border);
  border-radius: var(--ares-radius) var(--ares-radius) 0 0;
  cursor: move;
}
.widget-drag-handle { font-size: 0.7rem; color: var(--ares-text-muted); flex-shrink: 0; }
.widget-edit-title {
  flex: 1; min-width: 0; font-size: 0.72rem; color: var(--ares-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.widget-remove { width: 22px !important; height: 22px !important; flex-shrink: 0; }
</style>
