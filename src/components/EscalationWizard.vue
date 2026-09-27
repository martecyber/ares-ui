<script setup lang="ts">
// The escalation wizard: a plain (non-dialog) orchestrator holding step state, rendering exactly
// one step dialog at a time (each toggled via :visible so PrimeVue's own dialog transition still
// plays between steps). Replaces EscalateDialog (direct detection escalation),
// EscalationTargetDialog (Research Board escalation) and FindingFormDialog's standalone use (the
// plain "New Finding" button) with one shared flow — same finding/affection resolution regardless
// of entry point, see the plan for the full design rationale.
import { computed, ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import FindingTargetStepDialog from '@/components/FindingTargetStepDialog.vue';
import NewFindingStepDialog from '@/components/NewFindingStepDialog.vue';
import AffectionTargetStepDialog from '@/components/AffectionTargetStepDialog.vue';
import AffectionDialog from '@/components/AffectionDialog.vue';
import { detectionsApi, type Detection } from '@/api/detections';
import type { Finding, FindingAffection } from '@/api/findings';
import { researchBoardsApi } from '@/api/researchBoards';

const props = defineProps<{
  visible: boolean;
  projectId: number;
  orgId: number;
  /** Detections being escalated — direct-escalate (one or many) or a Research Board's current
   *  detections. Absent/empty for the standalone "New Finding" entry point. */
  detections?: Detection[];
  /** Present only when escalating from a Research Board — swaps the final step's side panel to
   *  the board's notes, and archives the board (verdict "affected") once escalation succeeds. */
  researchBoard?: { id: number; title: string; notes: string | null } | null;
  /** Skip straight to the new-finding form — the plain "New Finding" button's entry point. */
  standaloneNewFinding?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  done: [finding: Finding];
}>();

const toast = useToast();

type Step = 'finding-target' | 'new-finding' | 'affection-target' | 'affection-edit';
const step = ref<Step>('finding-target');

const findingId = ref<number | null>(null);
/** null → AffectionDialog opens in create mode (new affection); set → edit mode. */
const affection = ref<FindingAffection | null>(null);

watch(() => props.visible, (open) => {
  if (!open) return;
  step.value = props.standaloneNewFinding ? 'new-finding' : 'finding-target';
  findingId.value = null;
  affection.value = null;
});

function close() { emit('update:visible', false); }

// ── Step 1: finding target ──────────────────────────────────────────────────
function onFindingTargetNext(target: { mode: 'new_finding' } | { mode: 'existing_finding'; findingId: number }) {
  if (target.mode === 'new_finding') {
    step.value = 'new-finding';
  } else {
    findingId.value = target.findingId;
    step.value = 'affection-target';
  }
}

// ── Step 2a: new finding ────────────────────────────────────────────────────
function onNewFindingNext(newFindingId: number) {
  findingId.value = newFindingId;
  affection.value = null;
  step.value = 'affection-edit';
}
function onNewFindingBack() {
  // Standalone entry starts here — there's no earlier step to return to, so Back means abandon.
  if (props.standaloneNewFinding) { close(); return; }
  step.value = 'finding-target';
}

// ── Step 2b: affection target (existing-finding path only) ─────────────────
function onAffectionTargetNext(target: { mode: 'new_affection' } | { mode: 'existing_affection'; affection: FindingAffection }) {
  affection.value = target.mode === 'existing_affection' ? target.affection : null;
  step.value = 'affection-edit';
}
function onAffectionTargetBack() {
  step.value = 'finding-target';
}

// ── Step 3: affection edit — the shared AffectionDialog, driven by onEscalate ──
const sideContext = computed(() => {
  if (props.researchBoard) return { kind: 'notes' as const, boardTitle: props.researchBoard.title, notes: props.researchBoard.notes };
  if (props.detections?.length) return { kind: 'detections' as const, detections: props.detections };
  return null;
});

// No escalation context (standalone new-finding) → AffectionDialog behaves as a plain
// create-affection save, no detection linking/board archiving afterward.
const hasEscalationContext = computed(() => !!(props.researchBoard || props.detections?.length));

// Auto-populate detected-at from the escalating detections' own assets — same dedup EscalateDialog
// used to do inline before AffectionDialog merges this with any existing affection's own set.
const preselectedDetectedAtIds = computed<number[]>(() => {
  const seen = new Set<number>();
  for (const d of props.detections ?? []) if (d.assetId != null) seen.add(d.assetId);
  return [...seen];
});
const preselectedAssets = computed(() => {
  const seen = new Set<number>();
  const assets: Array<{ id: number; identifier: string }> = [];
  for (const d of props.detections ?? []) {
    if (d.assetId != null && d.assetIdentifier && !seen.has(d.assetId)) {
      seen.add(d.assetId);
      assets.push({ id: d.assetId, identifier: d.assetIdentifier });
    }
  }
  return assets;
});

async function handleEscalate(affectionId: number) {
  const detectionIds = (props.detections ?? []).map((d) => d.id);
  if (detectionIds.length) {
    await detectionsApi.escalateBatch({
      detectionIds,
      findingMode: 'existing_finding',
      findingId: findingId.value!,
      affectionMode: 'existing_affection',
      affectionId,
    });
  }
  if (props.researchBoard) {
    await researchBoardsApi.escalate(props.projectId, props.researchBoard.id, affectionId);
  }
  toast.add({ severity: 'success', summary: 'Escalated', detail: `${detectionIds.length} detection${detectionIds.length !== 1 ? 's' : ''} now Affected.`, life: 4000 });
}

async function onSaved(finding: Finding) {
  emit('done', finding);
}
</script>

<template>
  <FindingTargetStepDialog
    :visible="visible && step === 'finding-target'"
    :project-id="projectId"
    @update:visible="close"
    @next="onFindingTargetNext"
  />

  <NewFindingStepDialog
    :visible="visible && step === 'new-finding'"
    :project-id="projectId"
    :context-detections="detections"
    @update:visible="close"
    @back="onNewFindingBack"
    @next="onNewFindingNext"
  />

  <AffectionTargetStepDialog
    v-if="findingId"
    :visible="visible && step === 'affection-target'"
    :finding-id="findingId"
    @update:visible="close"
    @back="onAffectionTargetBack"
    @next="onAffectionTargetNext"
  />

  <AffectionDialog
    v-if="findingId"
    :visible="visible && step === 'affection-edit'"
    :finding-id="findingId"
    :project-id="projectId"
    :org-id="orgId"
    :affection="affection"
    :preselected-detected-at-ids="preselectedDetectedAtIds"
    :preselected-assets="preselectedAssets"
    :side-context="sideContext"
    :on-escalate="hasEscalationContext ? handleEscalate : undefined"
    @update:visible="close"
    @saved="onSaved"
  />
</template>
