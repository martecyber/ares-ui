<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import AssetPickerDialog from '@/components/AssetPickerDialog.vue';
import DetectionPreviewPanel from '@/components/DetectionPreviewPanel.vue';
import MarkdownView from '@/components/MarkdownView.vue';
import { findingsApi, type Finding, type FindingAffection } from '@/api/findings';
import { affectionsApi } from '@/api/affections';
import { assetsApi, type Asset, ASSET_TYPE_LABELS } from '@/api/assets';
import { type Detection, detectionsApi, detectionStatusLabel, DETECTION_STATUS_TRANSITIONS } from '@/api/detections';
import { severityToPriorityLabel } from '@/utils/cvss';

/** The escalation wizard's own context for its final step — a right-hand preview panel next
 *  to the form (detections being escalated directly, or a Research Board's notes when
 *  escalating from there instead). Independent from the left-hand `detection`/`detections`
 *  props below, which belonged to the now-retired EscalateDialog's nesting — no current caller
 *  passes them, left in place rather than ripped out along with everything downstream of them. */
type AffectionSideContext =
  | { kind: 'detections'; detections: Detection[] }
  | { kind: 'notes'; boardTitle: string; notes: string | null };

const props = defineProps<{
  visible: boolean;
  findingId: number;
  projectId: number;
  orgId: number;
  affection?: FindingAffection | null;
  /** Single detection being escalated (single mode). */
  detection?: Detection | null;
  /** All detections being escalated (batch mode) — enables navigation in side panel. */
  detections?: Detection[];
  /** Asset IDs to pre-select as detected-at (from escalated detections). */
  preselectedDetectedAtIds?: number[];
  /** Asset info for the preselected IDs, used for display before allAssets loads. */
  preselectedAssets?: Array<{ id: number; identifier: string; type?: string }>;
  /** Escalation wizard's step-3 context — see {@link AffectionSideContext}. */
  sideContext?: AffectionSideContext | null;
  /** When set, this dialog is the wizard's final step: the submit button reads "Escalate", and
   *  after the normal create/edit-affection + affects-sync work, this is called with the
   *  resolved affection id (before the dialog closes) to link+transition the escalating
   *  detections (and, for a Research Board, archive it). */
  onEscalate?: (affectionId: number) => Promise<void>;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  /** Emits the fresh finding and, when creating, the new affection's id. */
  'saved': [finding: Finding, newAffectionId?: number];
}>();

const toast = useToast();

// ── Form state ────────────────────────────────────────────────────────────────
const title = ref('');
const description = ref('');
// Pre-fill detected-at from preselected IDs immediately on creation (before any watch fires)
const detectedAtIds = ref<number[]>([...(props.preselectedDetectedAtIds ?? [])]);
/** Per-detected-at affects: { detectedAssetId → [affectsAssetId, ...] }. */
const affectsByDetected = ref<Record<number, number[]>>({});
const saving = ref(false);

// Originals for diff (edit mode only)
const origDetectedAtIds = ref<number[]>([]);
const origAffectsByDetected = ref<Record<number, number[]>>({});

const isEdit = computed(() => !!props.affection);
const dialogTitle = computed(() => props.onEscalate ? 'Escalate to Finding' : (isEdit.value ? 'Edit affection' : 'Add affection'));
const submitLabel = computed(() => props.onEscalate ? 'Escalate' : (isEdit.value ? 'Save' : 'Add'));
const submitIcon = computed(() => props.onEscalate ? 'pi pi-arrow-up-right' : (isEdit.value ? 'pi pi-check' : 'pi pi-plus'));

// ── Edit mode: live-persisted copy of the affection (refreshed after every
// immediate API call) — source of truth for detections/observedAt lookups
// so the dialog reflects reality without needing a Save button. ────────────
const localAffection = ref<FindingAffection | null>(null);

function applyFreshFinding(fresh: Finding) {
  emit('saved', fresh);
  const aff = fresh.affections.find((a) => a.id === props.affection?.id);
  if (!aff) return;
  localAffection.value = aff;
  detectedAtIds.value = aff.detectedAt.map((d) => Number(d.id));
  const nested: Record<number, number[]> = {};
  for (const d of aff.detectedAt) nested[Number(d.id)] = (d.affects ?? []).map((a) => Number(a.id));
  affectsByDetected.value = nested;
  title.value = aff.title ?? '';
  description.value = aff.description ?? '';
}

function detectionsFor(id: number) {
  return localAffection.value?.detectedAt.find((d) => Number(d.id) === id)?.detections ?? [];
}

// ── Title / description — always editable; committed via the footer
// Save button (or discarded via Cancel), unlike the Assets section below
// whose actions persist immediately. ────────────────────────────────────────
async function saveAffectionFields() {
  if (!isEdit.value) return;
  saving.value = true;
  try {
    const updated = await affectionsApi.update(props.affection!.id, {
      title: title.value.trim() || null,
      description: description.value || null,
    });
    applyFreshFinding(updated);
    // Assets already persisted immediately (edit mode) — the wizard's linking step only needs
    // the affection id, resolved here, before the dialog closes.
    if (props.onEscalate) await props.onEscalate(props.affection!.id);
    emit('update:visible', false);
    toast.add({ severity: 'success', summary: props.onEscalate ? 'Escalated' : 'Affection updated', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}
function cancelEditAffection() {
  // Discard unsaved title/description edits; asset changes already persisted
  // immediately and can't be undone by cancelling.
  const aff = localAffection.value ?? props.affection;
  title.value = aff?.title ?? '';
  description.value = aff?.description ?? '';
  emit('update:visible', false);
}

// ── Batch detection navigation ─────────────────────────────────────────────
const detIdx = ref(0);
const isBatch = computed(() => (props.detections?.length ?? 0) > 1);
const activeDetection = computed<Detection | null>(() => {
  if (props.detections?.length) return props.detections[detIdx.value] ?? null;
  return props.detection ?? null;
});

watch(() => props.visible, (v) => { if (v) detIdx.value = 0; });

// ── Wizard side-context navigation (detections preview only — notes has no nav) ─────────────
const sideCtxIdx = ref(0);
const sideCtxDetection = computed<Detection | null>(() =>
  props.sideContext?.kind === 'detections' ? (props.sideContext.detections[sideCtxIdx.value] ?? null) : null);
watch(() => props.visible, (v) => { if (v) sideCtxIdx.value = 0; });

// ── Asset lists ───────────────────────────────────────────────────────────────
const allAssets = ref<Asset[]>([]);
const reachableAffects = ref<Asset[]>([]);
const loadingReachable = ref(false);

// When detected-at changes, recompute which affects-type assets are reachable
watch(detectedAtIds, async (ids) => {
  if (!ids.length) {
    reachableAffects.value = [];
    return;
  }
  loadingReachable.value = true;
  try {
    reachableAffects.value = await assetsApi.reachable(props.orgId, ids);
  } catch {
    reachableAffects.value = [];
  } finally {
    loadingReachable.value = false;
  }
}, { deep: true });

// Fallback when no reachable result (e.g. no relationships recorded yet): show every asset in
// the org — no type restriction, and assets already linked (detected_at/affects) are included
// rather than omitted, so the picker shows them pre-selected instead of hiding them.
const affectsAssets = computed(() =>
  reachableAffects.value.length ? reachableAffects.value : allAssets.value
);

async function loadAssets() {
  if (!allAssets.value.length) {
    const res = await assetsApi.list({ organizationId: props.orgId, size: 500 }).catch(() => null);
    if (res) allAssets.value = res.items;
  }
  // Individually fetch any preselected asset not found in the list (may be beyond size limit)
  for (const id of props.preselectedDetectedAtIds ?? []) {
    if (!allAssets.value.find((a) => a.id === id)) {
      const a = await assetsApi.get(id).catch(() => null);
      if (a) allAssets.value = [...allAssets.value, a];
    }
  }
}

// ── Asset picker dialogs ──────────────────────────────────────────────────────
// Add-only, not pre-populated (matches the References/Scores dialog convention):
// opening either picker always starts empty, so checking an item only ever adds it.
const showDetectedAtPicker = ref(false);
const detectedAtPickerDraft = ref<number[]>([]);

function openDetectedAtPicker() {
  detectedAtPickerDraft.value = [];
  showDetectedAtPicker.value = true;
}
async function confirmDetectedAtPicker(newIds: number[]) {
  showDetectedAtPicker.value = false;
  const toAdd = newIds.filter((id) => !detectedAtIds.value.includes(id));
  if (!toAdd.length) return;
  if (!isEdit.value) {
    detectedAtIds.value = [...detectedAtIds.value, ...toAdd];
    return;
  }
  for (const id of toAdd) {
    try {
      const updated = await affectionsApi.addDetectedAt(props.affection!.id, id);
      applyFreshFinding(updated);
    } catch (e: any) {
      toast.add({ severity: 'error', summary: 'Failed to add asset', detail: e?.response?.data?.message ?? e.message, life: 5000 });
    }
  }
}

/** When non-null, the affects picker is open and editing this detected_at id. */
const affectsPickerForDetected = ref<number | null>(null);
/** Working copy passed to the picker; add-only, so it always starts empty. */
const affectsPickerDraftIds = ref<number[]>([]);

function openAffectsPicker(detectedId: number) {
  affectsPickerForDetected.value = detectedId;
  affectsPickerDraftIds.value = [];
}
const affectsGraphConfig = computed(() => {
  const id = affectsPickerForDetected.value;
  if (id == null) return null;
  return { orgId: props.orgId, centerAssetId: id, centerLabel: assetLabel(id) };
});
async function confirmAffectsPicker(newIds: number[]) {
  const det = affectsPickerForDetected.value;
  affectsPickerForDetected.value = null;
  if (det == null || !newIds.length) return;
  const merged = [...new Set([...(affectsByDetected.value[det] ?? []), ...newIds])];
  if (!isEdit.value) {
    affectsByDetected.value = { ...affectsByDetected.value, [det]: merged };
    return;
  }
  try {
    const updated = await affectionsApi.setAffectsForDetected(props.affection!.id, det, merged);
    applyFreshFinding(updated);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to add affect', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}
/** Whether a detected-at asset is already in its own affects list — hides the shortcut below
 *  once it's already been added, same as any other already-linked asset. */
function isDetectedAlsoAffected(detectedId: number): boolean {
  return (affectsByDetected.value[detectedId] ?? []).includes(detectedId);
}

/** One-click "this same asset is also affected" — skips the picker entirely for the common
 *  case where the detected-at asset is itself the affected one. */
async function addDetectedAssetAsAffected(detectedId: number) {
  if (isDetectedAlsoAffected(detectedId)) return;
  const merged = [...new Set([...(affectsByDetected.value[detectedId] ?? []), detectedId])];
  if (!isEdit.value) {
    affectsByDetected.value = { ...affectsByDetected.value, [detectedId]: merged };
    return;
  }
  try {
    const updated = await affectionsApi.setAffectsForDetected(props.affection!.id, detectedId, merged);
    applyFreshFinding(updated);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to add affect', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

async function removeAffectFromDetected(detectedId: number, affectId: number) {
  const list = (affectsByDetected.value[detectedId] ?? []).filter((id) => id !== affectId);
  if (!isEdit.value) {
    affectsByDetected.value = { ...affectsByDetected.value, [detectedId]: list };
    return;
  }
  try {
    const updated = await affectionsApi.setAffectsForDetected(props.affection!.id, detectedId, list);
    applyFreshFinding(updated);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to remove affect', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

// ── Remove a detected-at asset — if it has escalated detections attached,
// require transitioning them to a legal status first (see requestRemoveDetected). ──
const showTransitionDialog = ref(false);
const transitionAssetId = ref<number | null>(null);
const transitionRows = ref<{ id: number; title: string; status: string; newStatus: string | null }[]>([]);
const transitioning = ref(false);

/** Sentinel value for "leave this detection's status as-is". */
const NO_TRANSITION = '__no_transition__';
function transitionOptions(status: string) {
  const next = (DETECTION_STATUS_TRANSITIONS[status] ?? []).map((s) => ({ label: detectionStatusLabel(s), value: s }));
  return [{ label: "Don't transition", value: NO_TRANSITION }, ...next];
}
const canConfirmTransition = computed(() =>
  transitionRows.value.every((d) => d.newStatus != null || !(DETECTION_STATUS_TRANSITIONS[d.status] ?? []).length)
);

function requestRemoveDetected(id: number) {
  const dets = isEdit.value ? detectionsFor(id) : [];
  if (dets.length) {
    transitionAssetId.value = id;
    transitionRows.value = dets.map((d) => ({ id: d.id, title: d.title, status: d.status, newStatus: null }));
    showTransitionDialog.value = true;
    return;
  }
  doRemoveDetected(id);
}

async function doRemoveDetected(id: number) {
  if (!isEdit.value) {
    detectedAtIds.value = detectedAtIds.value.filter((x) => x !== id);
    affectsByDetected.value = (() => { const m = { ...affectsByDetected.value }; delete m[id]; return m; })();
    return;
  }
  try {
    const updated = await affectionsApi.removeDetectedAt(props.affection!.id, id);
    applyFreshFinding(updated);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to remove asset', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  }
}

async function confirmTransitionAndRemove() {
  if (transitionAssetId.value == null) return;
  transitioning.value = true;
  try {
    for (const row of transitionRows.value) {
      if (row.newStatus && row.newStatus !== NO_TRANSITION) await detectionsApi.updateStatus(row.id, row.newStatus);
    }
    await doRemoveDetected(transitionAssetId.value);
    showTransitionDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    transitioning.value = false;
  }
}

// ── Populate on open ──────────────────────────────────────────────────────────
watch(() => props.visible, async (open) => {
  if (!open) return;
  const aff = props.affection;
  localAffection.value = aff ?? null;
  title.value = aff?.title ?? '';
  description.value = aff?.description ?? '';
  const dat = aff?.detectedAt.map((a) => Number(a.id)) ?? [];
  const preselected = props.preselectedDetectedAtIds ?? [];
  const merged = [...new Set([...dat, ...preselected])];
  detectedAtIds.value = [...merged];
  // Hydrate the per-detected affects map from the server payload (nested form).
  const nested: Record<number, number[]> = {};
  for (const d of aff?.detectedAt ?? []) {
    nested[Number(d.id)] = (d.affects ?? []).map(a => Number(a.id));
  }
  affectsByDetected.value = nested;
  origDetectedAtIds.value = [...dat];
  origAffectsByDetected.value = JSON.parse(JSON.stringify(nested));
  await loadAssets();
  if (merged.length) {
    loadingReachable.value = true;
    try {
      reachableAffects.value = await assetsApi.reachable(props.orgId, merged);
    } catch {
      reachableAffects.value = [];
    } finally {
      loadingReachable.value = false;
    }
  } else {
    reachableAffects.value = [];
  }
}, { immediate: true });

// ── Asset chip helpers ─────────────────────────────────────────────────────────
function _affectionAsset(id: number) {
  const aff = localAffection.value ?? props.affection;
  return aff?.detectedAt.find((d) => Number(d.id) === id)
    ?? aff?.affects.find((d) => Number(d.id) === id)
    ?? props.preselectedAssets?.find((a) => a.id === id)
    ?? null;
}

function assetLabel(id: number): string {
  const a = allAssets.value.find((x) => x.id === id);
  if (a) return `${ASSET_TYPE_LABELS[a.type] ?? a.type} — ${a.identifier}`;
  const emb = _affectionAsset(id);
  if (emb) {
    const typeLabel = emb.type ? (ASSET_TYPE_LABELS[emb.type] ?? emb.type) : null;
    return typeLabel ? `${typeLabel} — ${emb.identifier}` : emb.identifier;
  }
  return `#${id}`;
}
function assetTypeLabel(id: number): string {
  const a = allAssets.value.find((x) => x.id === id);
  if (a) return ASSET_TYPE_LABELS[a.type] ?? a.type;
  const emb = _affectionAsset(id);
  return emb?.type ? (ASSET_TYPE_LABELS[emb.type] ?? emb.type) : '?';
}
function assetIdentifierOnly(id: number): string {
  const a = allAssets.value.find((x) => x.id === id);
  if (a) return a.identifier;
  return _affectionAsset(id)?.identifier ?? `#${id}`;
}
function detectedAtObservedAt(id: number): string | null {
  return (localAffection.value ?? props.affection)?.detectedAt.find((d) => Number(d.id) === id)?.observedAt ?? null;
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  saving.value = true;
  try {
    let updated: Finding;
    let affectionId: number;

    if (!isEdit.value) {
      // Create the affection with detected_at links only — the new per-detected
      // affects model is applied below via setAffectsForDetected calls.
      updated = await findingsApi.addAffection(props.findingId, props.projectId, {
        title: title.value.trim() || undefined,
        description: description.value || undefined,
        detectedAtIds: detectedAtIds.value,
      });
      // Identify the just-created affection (highest id linked to this finding).
      affectionId = updated.affections.reduce((max, a) => a.id > max ? a.id : max, 0);
    } else {
      const aff = props.affection!;
      affectionId = aff.id;
      updated = await affectionsApi.update(aff.id, {
        title: title.value,
        description: description.value,
      });
      // Sync detected_at — remove first to drop their associated affects links
      // (server cascades the cleanup), then add the new ones.
      for (const id of origDetectedAtIds.value) {
        if (!detectedAtIds.value.includes(id))
          updated = await affectionsApi.removeDetectedAt(aff.id, id);
      }
      for (const id of detectedAtIds.value) {
        if (!origDetectedAtIds.value.includes(id))
          updated = await affectionsApi.addDetectedAt(aff.id, id);
      }
    }

    // Apply per-detected-at affects (full replace per detected). Skip detected
    // whose list didn't change to avoid pointless writes + history noise.
    const origMap = origAffectsByDetected.value;
    for (const detIdStr of Object.keys(affectsByDetected.value)) {
      const detId = Number(detIdStr);
      if (!detectedAtIds.value.includes(detId)) continue; // dropped detected; skip
      const next = affectsByDetected.value[detId] ?? [];
      const prev = origMap[detId] ?? [];
      const sameSet = next.length === prev.length && next.every(id => prev.includes(id));
      if (sameSet && isEdit.value) continue;
      updated = await affectionsApi.setAffectsForDetected(affectionId, detId, next);
    }

    if (props.onEscalate) await props.onEscalate(affectionId);

    // Fetch fresh finding in a new transaction to avoid Hibernate L1-cache stale data
    const fresh = await findingsApi.get(props.findingId);
    const newAffectionId = !isEdit.value && fresh.affections.length
      ? fresh.affections.reduce((max, a) => a.id > max ? a.id : max, 0)
      : undefined;
    emit('saved', fresh, newAffectionId);
    emit('update:visible', false);
    toast.add({ severity: 'success', summary: props.onEscalate ? 'Escalated' : (isEdit.value ? 'Affection updated' : 'Affection added'), life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogTitle"
    modal
    :style="{ width: sideContext ? 'min(1100px, 96vw)' : (activeDetection ? 'min(900px, 96vw)' : 'min(660px, 96vw)') }"
    :pt="{ content: { style: 'padding:0;' } }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div
      class="aff-layout"
      :class="{ 'aff-layout--with-side': !!activeDetection, 'aff-layout--with-context': !!sideContext }"
    >

      <!-- ── Left: detection info ──────────────────────────────────── -->
      <div v-if="activeDetection" class="aff-side">
        <!-- Batch navigation -->
        <div v-if="isBatch" class="aff-nav">
          <button class="aff-nav-btn" :disabled="detIdx === 0" @click="detIdx--">
            <i class="pi pi-chevron-left" style="font-size:0.7rem;" />
          </button>
          <span class="aff-nav-label">{{ detIdx + 1 }} / {{ detections!.length }}</span>
          <button class="aff-nav-btn" :disabled="detIdx >= detections!.length - 1" @click="detIdx++">
            <i class="pi pi-chevron-right" style="font-size:0.7rem;" />
          </button>
        </div>

        <div class="aff-det-title">{{ activeDetection.title }}</div>
        <div class="aff-det-meta">
          <span class="aff-det-sev" :data-sev="activeDetection.severity">{{ severityToPriorityLabel(activeDetection.severity) }}</span>
          <span class="aff-det-status">{{ detectionStatusLabel(activeDetection.status) }}</span>
        </div>
        <div v-if="activeDetection.assetIdentifier" class="aff-det-asset">
          <i class="pi pi-server" />
          <span>{{ activeDetection.assetIdentifier }}</span>
        </div>
        <div v-if="activeDetection.description" class="aff-det-desc">
          {{ activeDetection.description.length > 300 ? activeDetection.description.slice(0, 300) + '…' : activeDetection.description }}
        </div>
      </div>

      <!-- ── Right: form ───────────────────────────────────────────── -->
      <form class="aff-form" @submit.prevent="isEdit ? saveAffectionFields() : save()">

        <!-- Title -->
        <div>
          <label class="dlg-label">Title <span class="dlg-opt">(optional)</span></label>
          <InputText v-model="title" style="width:100%;" placeholder="e.g. Authentication bypass on admin panel" />
        </div>

        <!-- Description -->
        <div>
          <label class="dlg-label">Details <span class="dlg-opt">(optional)</span></label>
          <MarkdownEditor v-model="description" editor-style="min-height:110px; max-height:280px; overflow-y:auto;" placeholder="Context, steps to reproduce, evidence notes…" />
        </div>

        <!-- Assets: detected (left) / affects (right), matching the finding page's table -->
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.45rem;">
            <label class="dlg-label" style="margin:0;">Assets</label>
            <Button type="button" icon="pi pi-plus" text size="small" severity="secondary"
              v-tooltip.left="'Add detected asset'" @click="openDetectedAtPicker" />
          </div>
          <p v-if="!detectedAtIds.length" class="empty-hint">
            No detected assets yet. Add one first; affected assets are linked to each one.
          </p>
          <div v-else class="asset-rel">
            <div class="asset-rel-head"><span>Detected</span><span>Affects</span></div>
            <div v-for="id in detectedAtIds" :key="id" class="asset-rel-row">
              <div class="asset-rel-col asset-rel-col--detected">
                <div class="asset-rel-asset">
                  <span class="asset-type-badge">{{ assetTypeLabel(id) }}</span>
                  <span class="asset-rel-ident">{{ assetIdentifierOnly(id) }}</span>
                  <span class="asset-rel-date">
                    {{ detectedAtObservedAt(id) ? new Date(detectedAtObservedAt(id)!).toLocaleDateString() : 'now' }}
                  </span>
                  <Button type="button" icon="pi pi-trash" text size="small" severity="danger"
                    @click="requestRemoveDetected(id)" />
                </div>
                <div v-if="detectionsFor(id).length" class="det-rows">
                  <div v-for="det in detectionsFor(id)" :key="det.id" class="det-row">
                    <i class="pi pi-search det-row-icon" />
                    <span class="det-row-code">#{{ det.id }}</span>
                    <span class="det-row-title">{{ det.title }}</span>
                    <span class="det-row-status" :class="'det-status--' + det.status">
                      {{ det.status.replace(/_/g, ' ') }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="asset-rel-col asset-rel-col--affects">
                <template v-if="(affectsByDetected[id]?.length ?? 0)">
                  <div v-for="affId in affectsByDetected[id]" :key="affId" class="asset-rel-asset">
                    <span class="asset-type-badge">{{ assetTypeLabel(affId) }}</span>
                    <span class="asset-rel-ident">{{ assetIdentifierOnly(affId) }}</span>
                    <Button type="button" icon="pi pi-times" text size="small" severity="danger"
                      @click="removeAffectFromDetected(id, affId)" />
                  </div>
                </template>
                <span v-else class="asset-rel-empty">No assets affected</span>
                <div style="display:flex; align-self:flex-start;">
                  <Button type="button" icon="pi pi-plus" text size="small" severity="secondary"
                    :loading="loadingReachable" :disabled="loadingReachable"
                    v-tooltip.top="'Add affect'" @click="openAffectsPicker(id)" />
                  <Button v-if="!isDetectedAlsoAffected(id)" type="button" icon="pi pi-clone" text size="small" severity="secondary"
                    v-tooltip.top="'Add this same asset as affected'" @click="addDetectedAssetAsAffected(id)" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer — Save/Cancel apply to Title/Details only; Assets changes
             above have already persisted immediately and aren't affected by Cancel. -->
        <div class="aff-footer">
          <Button type="button" label="Cancel" severity="secondary" size="small"
            @click="isEdit ? cancelEditAffection() : $emit('update:visible', false)" />
          <Button type="submit" :label="submitLabel" :icon="submitIcon" size="small" :loading="saving" />
        </div>
      </form>

      <!-- ── Right: wizard side-context — detections being escalated, or a Research
           Board's notes when escalating from there instead ────────────────────── -->
      <div v-if="sideContext" class="aff-context">
        <template v-if="sideContext.kind === 'detections'">
          <div v-if="sideContext.detections.length > 1" class="aff-nav" style="margin-bottom:0.5rem; padding-bottom:0.5rem;">
            <button class="aff-nav-btn" :disabled="sideCtxIdx === 0" @click="sideCtxIdx--">
              <i class="pi pi-chevron-left" style="font-size:0.7rem;" />
            </button>
            <span class="aff-nav-label">{{ sideCtxIdx + 1 }} / {{ sideContext.detections.length }}</span>
            <button class="aff-nav-btn" :disabled="sideCtxIdx >= sideContext.detections.length - 1" @click="sideCtxIdx++">
              <i class="pi pi-chevron-right" style="font-size:0.7rem;" />
            </button>
          </div>
          <DetectionPreviewPanel v-if="sideCtxDetection" :detection="sideCtxDetection" style="padding:0;" />
        </template>
        <template v-else>
          <div class="aff-context-notes-header">{{ sideContext.boardTitle }}</div>
          <MarkdownView :source="sideContext.notes" empty-text="No notes were recorded." style="flex:1; min-height:0; overflow-y:auto;" />
        </template>
      </div>
    </div>
  </Dialog>

  <!-- Detected at asset picker (add-only, not preselected) -->
  <AssetPickerDialog
    v-model:visible="showDetectedAtPicker"
    :model-value="detectedAtPickerDraft"
    @update:modelValue="confirmDetectedAtPicker"
    :assets="allAssets"
    title="Add detected-at assets"
  />

  <!-- Per-detected-at affects asset picker (add-only, not preselected). Reuses
       the same component; the selection is committed on confirm. -->
  <AssetPickerDialog
    :visible="affectsPickerForDetected !== null"
    @update:visible="(v) => { if (!v) affectsPickerForDetected = null; }"
    :model-value="affectsPickerDraftIds"
    @update:modelValue="confirmAffectsPicker"
    :assets="affectsAssets"
    :graph-config="affectsGraphConfig"
    title="Add affected assets"
  />

  <!-- Transition escalated detections before removing the detected-at asset -->
  <Dialog v-model:visible="showTransitionDialog" header="Transition detections" modal
    :style="{ width: 'min(520px, 96vw)' }">
    <div style="display:flex; flex-direction:column; gap:1.1rem;">
      <p style="font-size:0.85rem; color:var(--ares-text-muted); margin:0;">
        This asset was detected via one or more escalated detections. Choose where each one
        transitions to before removing it from this affection.
      </p>
      <div class="transition-list">
        <div v-for="row in transitionRows" :key="row.id" class="transition-row">
          <div class="transition-row__header">
            <span class="det-row-code">#{{ row.id }}</span>
            <span class="transition-row__title">{{ row.title }}</span>
            <span class="det-row-status" :class="'det-status--' + row.status">{{ detectionStatusLabel(row.status) }}</span>
          </div>
          <Select v-if="(DETECTION_STATUS_TRANSITIONS[row.status] ?? []).length" v-model="row.newStatus"
            :options="transitionOptions(row.status)" option-label="label" option-value="value"
            placeholder="Select new status" style="width:100%;" />
          <p v-else class="empty-hint" style="margin:0; font-style:italic;">No further transition available</p>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <Button label="Cancel" severity="secondary" size="small" @click="showTransitionDialog = false" />
        <Button label="Confirm & remove" icon="pi pi-check" size="small" :loading="transitioning"
          :disabled="!canConfirmTransition" @click="confirmTransitionAndRemove" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
/* ── Layout — CSS Grid with explicit tracks (not flex:1 + fixed-width siblings) so
   the side panel's width is never ambiguous: each column's size comes straight from
   grid-template-columns, with no flex-basis resolution to get wrong. Which columns
   exist is conditional (aff-side / aff-context are both v-if), so the track list
   itself is switched via a modifier class rather than assuming a fixed 2-3 column set. */
.aff-layout {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 420px;
}
.aff-layout--with-side { grid-template-columns: 240px 1fr; }
.aff-layout--with-context { grid-template-columns: 1fr 340px; }
.aff-layout--with-side.aff-layout--with-context { grid-template-columns: 240px 1fr 340px; }

.aff-side {
  min-width: 0;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.12));
  border-right: 1px solid var(--ares-border);
  padding: 0 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
}

.aff-nav {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--ares-border);
}
.aff-nav-btn {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); padding: 0.15rem 0.3rem;
  border-radius: var(--ares-radius); line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.aff-nav-btn:hover:not(:disabled) { background: var(--ares-surface-raised); color: var(--ares-text-1); }
.aff-nav-btn:disabled { opacity: 0.3; cursor: default; }
.aff-nav-label { font-family: monospace; font-size: 0.78rem; color: var(--ares-text-muted); }

.aff-det-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ares-text-1);
  line-height: 1.4;
}
.aff-det-meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.aff-det-sev {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--ares-radius);
  letter-spacing: 0.04em;
}
.aff-det-sev[data-sev="critical"] { background:#7f1d1d; color:#fca5a5; }
.aff-det-sev[data-sev="high"]     { background:#7c2d12; color:#fdba74; }
.aff-det-sev[data-sev="medium"]   { background:#78350f; color:#fcd34d; }
.aff-det-sev[data-sev="low"]      { background:#14532d; color:#86efac; }
.aff-det-sev[data-sev="info"]     { background:#1e3a5f; color:#93c5fd; }
.aff-det-status {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  text-transform: capitalize;
}
.aff-det-asset {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--ares-text-muted);
}
.aff-det-desc {
  font-size: 0.78rem;
  color: var(--ares-text-2, var(--ares-text-muted));
  line-height: 1.5;
}

.aff-form {
  min-width: 0;
  /* Top gap comes from the global .p-dialog-content padding-top (1.25rem,
     !important) — adding our own here would double it up. */
  padding: 0 1.25rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  overflow-y: auto;
}

.aff-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ares-border);
}

/* ── Right: wizard side-context panel ───────────────────────────────── */
.aff-context {
  min-width: 0;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.12));
  border-left: 1px solid var(--ares-border);
  padding: 1.1rem 1rem;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.aff-context-notes-header {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

/* ── Form internals ──────────────────────────────────────────────── */
.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  letter-spacing: 0.02em;
  margin-bottom: 0.35rem;
}
.dlg-opt { font-weight: 400; color: var(--ares-text-muted); }

.empty-hint {
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  margin: 0;
  padding: 0.25rem 0;
}

/* ── Assets: detected (left) / affects (right) two-column table ──────── */
.asset-rel { display: flex; flex-direction: column; }
.asset-rel-head {
  display: flex;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
  padding-bottom: 0.3rem;
}
.asset-rel-head span { flex: 1; }
.asset-rel-row {
  display: flex;
  border-top: 1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);
  padding: 0.55rem 0;
}
.asset-rel-row:first-child { border-top: none; padding-top: 0; }
.asset-rel-row:last-child { padding-bottom: 0; }
.asset-rel-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.asset-rel-col--detected { padding-right: 0.9rem; border-right: 1px solid var(--ares-border); }
.asset-rel-col--affects { padding-left: 0.9rem; }
.asset-rel-asset { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
.asset-rel-ident {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-1);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-rel-date { font-size: 0.68rem; color: var(--ares-text-muted); flex-shrink: 0; }
.asset-rel-empty { font-size: 0.76rem; color: var(--ares-text-muted); font-style: italic; }

.asset-type-badge {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15em 0.45em;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

/* ── Detection sub-rows (below a detected asset) ──────────────────────── */
.det-rows { display: flex; flex-direction: column; padding-left: 1rem; }
.det-row { display: flex; align-items: center; gap: 0.4rem; padding: 0.15rem 0; }
.det-row-icon { font-size: 0.58rem; color: var(--ares-text-muted); flex-shrink: 0; }
.det-row-code { font-size: 0.66rem; font-weight: 700; font-family: monospace; color: var(--ares-accent); flex-shrink: 0; }
.det-row-title {
  font-size: 0.72rem;
  color: var(--ares-text-2);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.det-row-status {
  font-size: 0.6rem;
  font-weight: 600;
  padding: 0.1rem 0.35rem;
  border-radius: var(--ares-radius);
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}
.det-status--new                 { background: color-mix(in srgb, #3b82f6 12%, transparent); color: #3b82f6; border-color: color-mix(in srgb, #3b82f6 30%, transparent); }
.det-status--under_investigation { background: color-mix(in srgb, #a855f7 12%, transparent); color: #a855f7; border-color: color-mix(in srgb, #a855f7 30%, transparent); }
.det-status--affected            { background: color-mix(in srgb, #f97316 12%, transparent); color: #f97316; border-color: color-mix(in srgb, #f97316 30%, transparent); }
.det-status--reopened            { background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444; border-color: color-mix(in srgb, #ef4444 30%, transparent); }
.det-status--fixed               { background: color-mix(in srgb, #22c55e 12%, transparent); color: #22c55e; border-color: color-mix(in srgb, #22c55e 30%, transparent); }
.det-status--not_affected,
.det-status--ignored             { background: color-mix(in srgb, var(--ares-text-muted) 10%, transparent); color: var(--ares-text-muted); border-color: color-mix(in srgb, var(--ares-text-muted) 20%, transparent); }

/* ── Transition-detections modal ──────────────────────────────────── */
.transition-list { display: flex; flex-direction: column; gap: 0.6rem; }
.transition-row {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.75rem 0.85rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
}
.transition-row__header { display: flex; align-items: center; gap: 0.55rem; }
.transition-row__title {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ares-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .aff-layout,
  .aff-layout--with-side,
  .aff-layout--with-context,
  .aff-layout--with-side.aff-layout--with-context {
    grid-template-columns: 1fr;
  }
  .aff-side { max-height: 180px; border-right: none; border-bottom: 1px solid var(--ares-border); overflow-y: auto; }
  .aff-context { max-height: 260px; border-left: none; border-top: 1px solid var(--ares-border); }
}
</style>
