<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { priorityLevelScore, scoreToSeverity } from '@/utils/cvss';
import type { SsvcTreeNode } from '@/api/ssvcMethodologies';

export interface SsvcResolution {
  leafNodeId: number;
  outcomeCode: string;
  outcomeLabel: string;
  outcomeDescription: string | null;
  priorityLevel: string | null;
  /** Human-readable "Question: Answer / Question: Answer -> Outcome" summary, stored
   *  as the score's `vector` for display anywhere the tree isn't loaded. */
  breadcrumb: string;
  /** Synthetic score derived from priorityLevel via the same P0-P4 scale Manual/CVSS
   *  scores use — 0 when the role doesn't use priority mapping. */
  score: number;
}

const props = defineProps<{
  tree: SsvcTreeNode | null;
  /** When editing an existing score, the leaf node id to restore the wizard's path to. */
  initialLeafNodeId?: number | null;
}>();

const emit = defineEmits<{
  resolved: [value: SsvcResolution | null];
}>();

interface TrailEntry {
  node: SsvcTreeNode;
  chosenOptionCode?: string;
  chosenOptionLabel?: string;
}

function findPath(node: SsvcTreeNode, targetId: number, acc: string[]): string[] | null {
  if (node.id === targetId) return acc;
  if (node.nodeType === 'leaf') return null;
  for (const opt of node.options ?? []) {
    if (!opt.child) continue;
    const found = findPath(opt.child, targetId, [...acc, opt.code]);
    if (found) return found;
  }
  return null;
}

const selectedCodes = ref<string[]>([]);

function resetFromInitial() {
  if (props.tree && props.initialLeafNodeId) {
    selectedCodes.value = findPath(props.tree, props.initialLeafNodeId, []) ?? [];
  } else {
    selectedCodes.value = [];
  }
}
watch(() => [props.tree, props.initialLeafNodeId], resetFromInitial, { immediate: true });

const trail = computed<TrailEntry[]>(() => {
  const entries: TrailEntry[] = [];
  const root = props.tree;
  if (!root) return entries;
  entries.push({ node: root });
  let current: SsvcTreeNode = root;
  for (const code of selectedCodes.value) {
    if (current.nodeType !== 'branch') break;
    const opt = current.options?.find((o) => o.code === code);
    if (!opt || !opt.child) break;
    const child: SsvcTreeNode = opt.child;
    entries[entries.length - 1].chosenOptionCode = opt.code;
    entries[entries.length - 1].chosenOptionLabel = opt.label;
    current = child;
    entries.push({ node: current });
  }
  return entries;
});

const currentNode = computed<SsvcTreeNode | null>(() =>
  trail.value.length ? trail.value[trail.value.length - 1].node : null
);
const isResolved = computed(() => currentNode.value?.nodeType === 'leaf');
const answeredSoFar = computed(() => trail.value.slice(0, -1));

const resolution = computed<SsvcResolution | null>(() => {
  const leaf = currentNode.value;
  if (!leaf || leaf.nodeType !== 'leaf' || !leaf.outcomeCode || !leaf.outcomeLabel) return null;
  const breadcrumb =
    answeredSoFar.value.map((t) => `${t.node.decisionPointName}: ${t.chosenOptionLabel}`).join(' / ')
    + ' -> ' + leaf.outcomeLabel;
  return {
    leafNodeId: leaf.id,
    outcomeCode: leaf.outcomeCode,
    outcomeLabel: leaf.outcomeLabel,
    outcomeDescription: leaf.outcomeDescription,
    priorityLevel: leaf.priorityLevel,
    breadcrumb,
    score: leaf.priorityLevel ? priorityLevelScore(leaf.priorityLevel) : 0,
  };
});
watch(resolution, (r) => emit('resolved', r), { immediate: true });

function choose(code: string) {
  selectedCodes.value = [...selectedCodes.value, code];
}
function goBack() {
  selectedCodes.value = selectedCodes.value.slice(0, -1);
}
function restart() {
  selectedCodes.value = [];
}

function severityClass(level: string | null): string {
  if (!level) return 'info';
  const scoreForLevel = priorityLevelScore(level);
  return scoreToSeverity(scoreForLevel);
}
</script>

<template>
  <div v-if="!tree" class="ssvc-empty">This role has no decision tree yet.</div>
  <div v-else class="ssvc-wizard">
    <!-- Breadcrumb of answers so far -->
    <div v-if="answeredSoFar.length" class="ssvc-breadcrumb">
      <span v-for="(t, i) in answeredSoFar" :key="i" class="ssvc-breadcrumb-item">
        {{ t.node.decisionPointName }}: <strong>{{ t.chosenOptionLabel }}</strong>
      </span>
      <button type="button" class="ssvc-back-btn" @click="goBack">&larr; Back</button>
    </div>

    <!-- Resolved: show the outcome -->
    <div v-if="isResolved && resolution" class="score-display">
      <span
        class="score-value score-value--text"
        :class="'sev-' + severityClass(resolution.priorityLevel)"
        :title="resolution.outcomeDescription ?? undefined"
      >{{ resolution.outcomeLabel }}</span>
      <span class="score-sev">{{ resolution.priorityLevel ?? 'Informational' }}</span>
      <span class="score-vector">{{ resolution.breadcrumb }}</span>
      <button type="button" class="ssvc-back-btn" @click="restart">Start over</button>
    </div>

    <!-- Mid-tree: ask the current question -->
    <div v-else-if="currentNode && currentNode.nodeType === 'branch'" class="metric-grid">
      <div class="metric-row metric-row--wizard">
        <span class="metric-label metric-label--wizard">
          {{ currentNode.decisionPointName }}
          <span v-if="currentNode.decisionPointHelp" class="metric-help" :title="currentNode.decisionPointHelp">?</span>
        </span>
        <div class="metric-btns">
          <button
            v-for="opt in currentNode.options ?? []"
            :key="opt.code"
            type="button"
            class="metric-btn"
            :title="opt.helpText ?? undefined"
            @click="choose(opt.code)"
          >{{ opt.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ssvc-empty {
  font-size: 0.82rem;
  color: var(--ares-text-muted);
}

.ssvc-wizard { display: flex; flex-direction: column; gap: 0.85rem; }

.ssvc-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--ares-text-muted);
}
.ssvc-breadcrumb-item::after {
  content: '/';
  margin-left: 0.5rem;
  color: var(--ares-border);
}
.ssvc-breadcrumb-item strong { color: var(--ares-text-2); font-weight: 600; }

.ssvc-back-btn {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--ares-text-muted);
  background: none;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.15rem 0.55rem;
  cursor: pointer;
  white-space: nowrap;
  margin-left: auto;
}
.ssvc-back-btn:hover { color: var(--p-primary-400); border-color: var(--p-primary-400); }

.metric-row--wizard { align-items: flex-start; }
.metric-label--wizard {
  width: auto;
  min-width: 165px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ares-text-1, var(--ares-text-2));
}

/* ── Reused visual language from ScoreDialog.vue's calculators ─────────────── */
.score-display {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.25));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.75rem 1rem;
}
.score-value { font-size: 2rem; font-weight: 800; line-height: 1; min-width: 3.5rem; }
.score-value--text { font-size: 1.3rem; min-width: 0; text-transform: none; letter-spacing: normal; }
.score-sev { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; color: var(--ares-text-muted); }
.score-vector { font-family: monospace; font-size: 0.68rem; color: var(--ares-text-muted); word-break: break-word; flex: 1; }

.sev-critical { color: #ef4444; }
.sev-high     { color: #f97316; }
.sev-medium   { color: #ca8a04; }
.sev-low      { color: #16a34a; }
.sev-info     { color: #6b7280; }

.metric-grid { display: flex; flex-direction: column; gap: 0.45rem; }
.metric-row { display: flex; align-items: center; gap: 0.75rem; }
.metric-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  width: 165px;
  flex-shrink: 0;
  text-align: right;
}
.metric-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--ares-text-muted);
  color: var(--ares-text-muted);
  font-size: 0.62rem;
  font-weight: 700;
  cursor: help;
  flex-shrink: 0;
}
.metric-help:hover { border-color: var(--p-primary-400); color: var(--p-primary-400); }
.metric-btns { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.metric-btn {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.22rem 0.65rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s, color 0.1s;
  color: var(--ares-text-2);
}
.metric-btn:hover { border-color: var(--p-primary-400); color: var(--p-primary-400); }
</style>
