<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { ssvcMethodologiesApi, type SsvcRoleOutcome, type SsvcTreeNode, type SsvcTreeNodeInput, type SsvcTreeNodeOption } from '@/api/ssvcMethodologies';
import SsvcTreeDiagramTable from './SsvcTreeDiagramTable.vue';
import SsvcQuestionEditDialog, { type EditorColumn } from './SsvcQuestionEditDialog.vue';
import type { KnownOutcome } from './SsvcRoleSettingsDialog.vue';

const props = defineProps<{
  roleId: number;
  usesPriorityMapping: boolean;
  initialTree: SsvcTreeNode | null;
  /** The role's persisted outcome palette (SsvcRole.outcomes) — authoritative, edited via
   *  SsvcRoleSettingsDialog. Independent of the tree itself, so an outcome survives even
   *  before it's assigned to any leaf. */
  initialOutcomes: SsvcRoleOutcome[];
  readonly?: boolean;
}>();

const emit = defineEmits<{ saved: [] }>();

const columns = ref<EditorColumn[]>([]);
const outcomes = ref<Record<string, KnownOutcome>>({});
/** The reusable, named outcome palette leaves pick from via dropdown — seeded from the
 *  role's persisted outcomes (props.initialOutcomes); any leaf whose code isn't in that
 *  list falls back to its own embedded data (covers trees saved before the palette had
 *  its own storage). */
const knownOutcomes = ref<KnownOutcome[]>([]);
const saving = ref(false);
const showValidationModal = ref(false);
const validationModalMessage = ref('');

function loadFromTree() {
  const tree = props.initialTree;
  const cols: EditorColumn[] = [];
  const outcomeMap: Record<string, KnownOutcome> = {};
  const known = new Map<string, KnownOutcome>(
    props.initialOutcomes.map((o) => [o.code, { code: o.code, label: o.label, description: o.description ?? '', priorityLevel: o.priorityLevel }]),
  );
  if (tree) {
    let node: SsvcTreeNode | null = tree;
    while (node && node.nodeType === 'branch') {
      cols.push({
        decisionPointCode: node.decisionPointCode ?? '',
        decisionPointName: node.decisionPointName ?? '',
        decisionPointHelp: node.decisionPointHelp ?? '',
        options: (node.options ?? []).map((o) => ({ code: o.code, label: o.label, helpText: o.helpText ?? '' })),
      });
      node = node.options?.[0]?.child ?? null;
    }
    const walk = (n: SsvcTreeNode | null, path: string[]) => {
      if (!n) return;
      if (n.nodeType === 'leaf') {
        const entry: KnownOutcome = {
          code: n.outcomeCode ?? '', label: n.outcomeLabel ?? '',
          description: n.outcomeDescription ?? '', priorityLevel: n.priorityLevel,
        };
        outcomeMap[path.join('|')] = entry;
        if (entry.code && !known.has(entry.code)) known.set(entry.code, entry);
        return;
      }
      for (const opt of n.options ?? []) walk(opt.child, [...path, opt.code]);
    };
    walk(tree, []);
  }
  columns.value = cols;
  outcomes.value = outcomeMap;
  knownOutcomes.value = [...known.values()];
}

/** Refreshes just the outcome palette (e.g. after SsvcRoleSettingsDialog saves) without
 *  touching columns/outcomes — a full loadFromTree() rebuild would silently discard any
 *  in-progress, unsaved structural edits (added/edited questions, leaf assignments) the
 *  user has made to the tree in this same edit session, since it re-derives everything
 *  from the last-*persisted* tree. Cascades label/description/priority changes into any
 *  leaf already assigned a code that's still in the fresh palette. */
function refreshKnownOutcomes() {
  const byCode = new Map<string, KnownOutcome>(
    props.initialOutcomes.map((o) => [o.code, { code: o.code, label: o.label, description: o.description ?? '', priorityLevel: o.priorityLevel }]),
  );
  knownOutcomes.value = [...byCode.values()];
  for (const key of Object.keys(outcomes.value)) {
    const fresh = byCode.get(outcomes.value[key].code);
    if (fresh) outcomes.value[key] = { ...fresh };
  }
}

// Split so an outcomes-only change (role settings save) never triggers the destructive
// full rebuild that props.initialTree changing does (see loadFromTree/refreshKnownOutcomes docs).
watch(() => props.initialTree, loadFromTree, { immediate: true });
watch(() => props.initialOutcomes, refreshKnownOutcomes);

// ── Question edit modal — questions (+ their answers) are edited there; the tree
// view itself is read-only-shaped, just with clickable headers. ──────────────────
const showQuestionModal = ref(false);
const editingColumnIndex = ref<number | null>(null); // null = adding a new question
const editingColumn = computed<EditorColumn | null>(() =>
  editingColumnIndex.value != null ? columns.value[editingColumnIndex.value] : null
);

function openAddQuestion() {
  editingColumnIndex.value = null;
  showQuestionModal.value = true;
}
function openEditQuestion(colIdx: number) {
  editingColumnIndex.value = colIdx;
  showQuestionModal.value = true;
}
function onQuestionSaved(col: EditorColumn) {
  if (editingColumnIndex.value != null) columns.value[editingColumnIndex.value] = col;
  else columns.value.push(col);
  showQuestionModal.value = false;
}
function onQuestionDeleted() {
  if (editingColumnIndex.value != null) columns.value.splice(editingColumnIndex.value, 1);
  showQuestionModal.value = false;
}

// ── Cross product of every column's answers = every path through the tree ────
const combinations = computed<string[][]>(() => {
  if (!columns.value.length) return [];
  let result: string[][] = [[]];
  for (const col of columns.value) {
    if (!col.options.length) return [];
    const next: string[][] = [];
    for (const prefix of result) for (const opt of col.options) next.push([...prefix, opt.code]);
    result = next;
  }
  return result;
});

function comboLabel(combo: string[]): string[] {
  return combo.map((code, i) => columns.value[i]?.options.find((o) => o.code === code)?.label || code);
}

function outcomeFor(combo: string[]): KnownOutcome | undefined {
  return outcomes.value[combo.join('|')];
}

/** Applies a picked palette entry (by code) to a specific leaf's path. */
function setOutcome(combo: string[], code: string) {
  const known = knownOutcomes.value.find((o) => o.code === code);
  if (!known) return;
  outcomes.value[combo.join('|')] = { ...known };
}

const diagramColumns = computed(() => columns.value.map((c) => ({
  decisionPointName: c.decisionPointName || c.decisionPointCode,
  decisionPointHelp: c.decisionPointHelp,
  options: c.options.map((o) => ({ code: o.code, label: o.label || o.code, helpText: o.helpText })),
})));

// ── Validation ────────────────────────────────────────────────────────────────
const validationError = computed<string | null>(() => {
  if (!columns.value.length) return 'Add at least one question.';
  for (const combo of combinations.value) {
    const o = outcomes.value[combo.join('|')];
    if (!o || !o.code.trim() || !o.label.trim()) return `Missing outcome for path: ${comboLabel(combo).join(' / ')}. Complete the tree before saving.`;
    if (props.usesPriorityMapping && !o.priorityLevel) return `Missing priority for path: ${comboLabel(combo).join(' / ')}. Complete the tree before saving.`;
  }
  return null;
});

function buildNode(colIndex: number, path: string[]): SsvcTreeNodeInput {
  if (colIndex === columns.value.length) {
    const o = outcomeFor(path) ?? { code: '', label: '', description: '', priorityLevel: null };
    return {
      nodeType: 'leaf',
      outcomeCode: o.code,
      outcomeLabel: o.label,
      outcomeDescription: o.description || undefined,
      priorityLevel: props.usesPriorityMapping && o.priorityLevel ? (o.priorityLevel as 'P0' | 'P1' | 'P2' | 'P3' | 'P4') : undefined,
    };
  }
  const col = columns.value[colIndex];
  return {
    nodeType: 'branch',
    decisionPointCode: col.decisionPointCode,
    decisionPointName: col.decisionPointName,
    decisionPointHelp: col.decisionPointHelp || undefined,
    options: col.options.map((opt) => ({
      code: opt.code,
      label: opt.label,
      helpText: opt.helpText || undefined,
      child: buildNode(colIndex + 1, [...path, opt.code]),
    })),
  };
}

/** Read-shaped mirror of buildNode() (fake negative ids — never persisted, only walked by
 *  SsvcTreeWizard) so the "Simulate" feature can walk the tree exactly as currently
 *  configured in this editor, including any not-yet-saved structural edits — not just the
 *  last-persisted version. */
function buildPreviewNode(colIndex: number, path: string[], nextId: () => number): SsvcTreeNode {
  if (colIndex === columns.value.length) {
    const o = outcomeFor(path);
    return {
      id: nextId(), nodeType: 'leaf',
      decisionPointCode: null, decisionPointName: null, decisionPointHelp: null, options: null,
      outcomeCode: o?.code ?? null,
      outcomeLabel: o?.label ?? null,
      outcomeDescription: o?.description || null,
      priorityLevel: (props.usesPriorityMapping ? (o?.priorityLevel ?? null) : null) as SsvcTreeNode['priorityLevel'],
    };
  }
  const col = columns.value[colIndex];
  const options: SsvcTreeNodeOption[] = col.options.map((opt) => ({
    id: nextId(),
    code: opt.code,
    label: opt.label,
    helpText: opt.helpText || null,
    child: buildPreviewNode(colIndex + 1, [...path, opt.code], nextId),
  }));
  return {
    id: nextId(), nodeType: 'branch',
    decisionPointCode: col.decisionPointCode,
    decisionPointName: col.decisionPointName,
    decisionPointHelp: col.decisionPointHelp || null,
    options,
    outcomeCode: null, outcomeLabel: null, outcomeDescription: null, priorityLevel: null,
  };
}

/** Exposed for the parent's "Simulate" button — null when there are no questions yet. */
const previewTree = computed<SsvcTreeNode | null>(() => {
  if (!columns.value.length) return null;
  let id = -1;
  return buildPreviewNode(0, [], () => id--);
});

/** Exposed to the parent (KbSsvcMethodologyDetailView.vue), which now hosts the
 *  actual "Save" button (replacing New Role/Edit Roles while in edit mode). Returns
 *  whether the save succeeded, so the parent knows whether to exit edit mode. */
async function save(): Promise<boolean> {
  if (validationError.value) {
    validationModalMessage.value = validationError.value;
    showValidationModal.value = true;
    return false;
  }
  saving.value = true;
  try {
    await ssvcMethodologiesApi.replaceTree(props.roleId, buildNode(0, []));
    emit('saved');
    return true;
  } catch (e: any) {
    validationModalMessage.value = e?.response?.data?.detail ?? e.message ?? 'Failed to save decision tree';
    showValidationModal.value = true;
    return false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ save, saving, previewTree });
</script>

<template>
  <div class="ssvc-editor">
    <SsvcQuestionEditDialog
      v-model:visible="showQuestionModal"
      :column="editingColumn"
      @save="onQuestionSaved"
      @delete="onQuestionDeleted"
    />

    <Dialog v-model:visible="showValidationModal" header="Tree incomplete" modal :style="{ width: 'min(440px, 96vw)' }">
      <p style="margin:0; font-size:0.85rem;">{{ validationModalMessage }}</p>
      <template #footer>
        <Button label="OK" size="small" @click="showValidationModal = false" />
      </template>
    </Dialog>

    <div v-if="!columns.length && readonly" class="diagram-empty">No decision tree defined yet.</div>
    <div v-else class="diagram-scroll">
      <SsvcTreeDiagramTable
        :editable="!readonly"
        :columns="diagramColumns"
        :combinations="combinations"
        :outcomes="outcomes"
        :known-outcomes="knownOutcomes"
        :uses-priority-mapping="usesPriorityMapping"
        @edit-column="openEditQuestion"
        @add-column="openAddQuestion"
        @set-outcome="setOutcome"
      />
    </div>
  </div>
</template>

<style scoped>
.ssvc-editor { display: flex; flex-direction: column; }
.diagram-empty { font-size: 0.8rem; color: var(--ares-text-muted); }
.diagram-scroll { overflow: auto; max-height: 65vh; padding: 0; border: 1px solid var(--ares-border); border-radius: var(--ares-radius); }
</style>
