<script setup lang="ts">
// Read-only tree visualization for SsvcTreeNodeEditor.vue. Rendered as a single table
// with each decision point as one column (header shown once, at the top) and answers
// merged (rowspan) across every row that shares the same path prefix — the classic
// "merged-cell tree table" pattern, so consecutive branches read as a real tree
// (narrowing left to right) without nested boxes. Stretches to fill the available
// width; the wrapper scrolls horizontally only once there are too many columns to fit.
import { computed } from 'vue';
import { PRIORITY_SCALE } from '@/utils/cvss';

export interface DiagramColumn {
  decisionPointName: string;
  decisionPointHelp?: string | null;
  options: { code: string; label: string; helpText?: string | null }[];
}
export interface DiagramOutcome { code: string; label: string; description?: string | null; priorityLevel: string | null }

const props = defineProps<{
  columns: DiagramColumn[];
  combinations: string[][];
  outcomes: Record<string, DiagramOutcome>;
  usesPriorityMapping: boolean;
  /** When true: column headers become clickable (emits editColumn), a trailing
   *  "+ New Question" header appears (emits addColumn), and outcome cells become a
   *  dropdown sourced from knownOutcomes (emits setOutcome) instead of plain text. */
  editable?: boolean;
  /** The reusable, named outcome set to pick from — managed elsewhere (the role
   *  settings modal), not edited here. Only used when editable. */
  knownOutcomes?: DiagramOutcome[];
}>();

const emit = defineEmits<{
  editColumn: [colIndex: number];
  addColumn: [];
  setOutcome: [combo: string[], outcomeCode: string];
}>();

function onOutcomeSelect(combo: string[], e: Event) {
  const code = (e.target as HTMLSelectElement).value;
  if (code) emit('setOutcome', combo, code);
}

function optionAt(combo: string[], colIdx: number) {
  return props.columns[colIdx]?.options.find((o) => o.code === combo[colIdx]);
}
function labelAt(combo: string[], colIdx: number): string {
  return optionAt(combo, colIdx)?.label || combo[colIdx];
}
function helpAt(combo: string[], colIdx: number): string | undefined {
  return optionAt(combo, colIdx)?.helpText ?? undefined;
}
function outcomeFor(combo: string[]): DiagramOutcome | undefined {
  return props.outcomes[combo.join('|')];
}
function priorityColor(o: DiagramOutcome | undefined): string | null {
  if (!o?.priorityLevel) return null;
  return PRIORITY_SCALE.find((p) => p.label === o.priorityLevel)?.color ?? null;
}

function prefixEqual(a: string[], b: string[], uptoInclusive: number): boolean {
  for (let k = 0; k <= uptoInclusive; k++) if (a[k] !== b[k]) return false;
  return true;
}

/** spans[c][i] = how many rows this column's cell at row i should span (rowspan);
 *  0 means the cell is covered by an earlier row's span and shouldn't be rendered. */
const rowSpans = computed<number[][]>(() => {
  const combos = props.combinations;
  const nCols = props.columns.length;
  const spans: number[][] = Array.from({ length: nCols }, () => new Array(combos.length).fill(0));
  for (let c = 0; c < nCols; c++) {
    let i = 0;
    while (i < combos.length) {
      let j = i + 1;
      while (j < combos.length && prefixEqual(combos[i], combos[j], c)) j++;
      spans[c][i] = j - i;
      i = j;
    }
  }
  return spans;
});
</script>

<template>
  <table class="tree-table">
    <thead>
      <tr>
        <th
          v-for="(col, c) in columns" :key="c"
          :class="{ 'tree-th--editable': editable }"
          :title="col.decisionPointHelp ?? undefined"
          @click="editable && emit('editColumn', c)"
        >{{ col.decisionPointName || '—' }}</th>
        <th v-if="editable" class="tree-th--add" @click="emit('addColumn')">+ New Question</th>
        <th>Outcome</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(combo, i) in combinations" :key="i">
        <template v-for="(_col, c) in columns" :key="c">
          <td v-if="rowSpans[c][i] > 0" :rowspan="rowSpans[c][i]" class="tree-cell" :title="helpAt(combo, c)">
            {{ labelAt(combo, c) }}
          </td>
        </template>
        <td v-if="editable" class="tree-cell tree-cell--blank" />
        <td
          v-if="editable"
          class="tree-cell tree-cell--outcome"
          :title="outcomeFor(combo)?.description ?? undefined"
          :style="usesPriorityMapping && priorityColor(outcomeFor(combo))
            ? { color: priorityColor(outcomeFor(combo))!, background: `color-mix(in srgb, ${priorityColor(outcomeFor(combo))} 16%, transparent)` }
            : {}"
        >
          <select class="tree-outcome-select" :value="outcomeFor(combo)?.code ?? ''" @change="onOutcomeSelect(combo, $event)">
            <option value="" disabled>Select outcome…</option>
            <option v-for="ko in knownOutcomes ?? []" :key="ko.code" :value="ko.code">{{ ko.label }}</option>
          </select>
          <span v-if="usesPriorityMapping && outcomeFor(combo)?.priorityLevel" class="tree-priority-badge">{{ outcomeFor(combo)!.priorityLevel }}</span>
        </td>
        <td
          v-else
          class="tree-cell tree-cell--outcome"
          :title="outcomeFor(combo)?.description ?? undefined"
          :style="usesPriorityMapping && priorityColor(outcomeFor(combo))
            ? { color: priorityColor(outcomeFor(combo))!, background: `color-mix(in srgb, ${priorityColor(outcomeFor(combo))} 16%, transparent)` }
            : {}"
        >
          <span v-if="outcomeFor(combo)">{{ outcomeFor(combo)!.label }}</span>
          <span v-else class="tree-cell--unset">Unset</span>
          <span v-if="usesPriorityMapping && outcomeFor(combo)?.priorityLevel" class="tree-priority-badge">{{ outcomeFor(combo)!.priorityLevel }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.tree-table {
  width: 100%;
  /* separate (not collapse) + zero spacing: border-collapse breaks position:sticky
     header rendering in most browsers (cells detach/misalign while scrolling). */
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.75rem;
}
.tree-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  text-align: left;
  font-weight: 700;
  color: var(--p-primary-300);
  /* Opaque background (var(--ares-bg), not a transparent surface token) so scrolled
     rows don't show through the sticky header. */
  background: color-mix(in srgb, var(--p-primary-500) 20%, var(--ares-bg));
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--ares-border);
  white-space: nowrap;
}
.tree-th--editable { cursor: pointer; }
.tree-th--editable:hover { text-decoration: underline; }
.tree-th--add {
  cursor: pointer;
  color: var(--ares-text-muted) !important;
  background: transparent !important;
  border: 1px dashed var(--ares-border) !important;
}
.tree-th--add:hover { color: var(--p-primary-400) !important; border-color: var(--p-primary-400) !important; }
.tree-cell--blank { background: transparent; border-style: dashed; }
.tree-cell {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--ares-border);
  background: var(--ares-surface-sunken, rgba(0,0,0,0.15));
  color: var(--ares-text-2);
  font-weight: 600;
  vertical-align: middle;
  white-space: nowrap;
}
.tree-cell--outcome {
  font-weight: 700;
  background: var(--ares-surface-raised);
}
.tree-cell--unset { color: var(--ares-text-muted); font-style: italic; font-weight: 500; }
.tree-priority-badge {
  margin-left: 0.4rem;
  font-size: 0.62rem;
  padding: 0.05rem 0.3rem;
  border-radius: var(--ares-radius);
  background: rgba(255,255,255,0.12);
}
.tree-outcome-select {
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.15rem 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: inherit;
  outline: none;
}
.tree-outcome-select:focus { border-color: var(--p-primary-500); }
</style>
