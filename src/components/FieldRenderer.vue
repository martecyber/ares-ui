<script setup lang="ts">
/**
 * Renders a report field template with support for:
 *  - {{variable}}        → resolved to project/findings/detections values
 *  - {{chart:pie}}       → pie chart of findings by severity
 *  - {{chart:bar}}       → bar chart of findings by severity
 *  - {{?findings}}...{{/findings}}     → loop over project findings
 *  - {{?detections}}...{{/detections}} → loop over project detections
 */
import { computed, onMounted, ref, watch } from 'vue';
import TemplateChart from '@/components/TemplateChart.vue';
import {
  resolveVars, CHART_TOKENS,
  type TemplateVarContext,
} from '@/utils/templateVars';
import { findingsApi, type Finding } from '@/api/findings';
import { detectionsApi, detectionStatusLabel, type Detection } from '@/api/detections';
import { projectsApi, type Project } from '@/api/projects';
import { useContextStore } from '@/stores/context';

const props = defineProps<{
  html: string;
  /** If provided the renderer fetches project findings and resolves charts/tables/counts */
  projectId?: number | null;
  /** Pre-computed context (overrides auto-fetch when provided) */
  context?: TemplateVarContext;
  /** Colors override for charts (for report-mode preview) */
  chartColors?: Record<string, string>;
}>();

const contextStore = useContextStore();

// ── Data fetching ───────────────────────────────────────────────────
const findings   = ref<Finding[]>([]);
const detections = ref<Detection[]>([]);
const project    = ref<Project | null>(null);
const loading    = ref(false);

const hasTemplateContent = computed(() =>
  props.html.includes('{{chart:') ||
  props.html.includes('{{?findings}}') ||
  props.html.includes('{{?detections}}') ||
  /\{\{findings_/.test(props.html) ||
  /\{\{detections/.test(props.html) ||
  /\{\{project_/.test(props.html) ||
  /\{\{org_/.test(props.html)
);

async function fetchData() {
  if (!props.projectId || !hasTemplateContent.value) return;
  loading.value = true;
  try {
    const [findingsRes, detectionsRes, proj] = await Promise.all([
      findingsApi.list({ projectId: props.projectId, size: 500 }),
      detectionsApi.list({ projectId: props.projectId, size: 500 }),
      projectsApi.get(props.projectId).catch(() => null),
    ]);
    findings.value   = findingsRes.items;
    detections.value = detectionsRes.items;
    project.value    = proj;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);
watch(() => props.projectId, fetchData);
watch(() => props.html, fetchData);

// ── Derived context ─────────────────────────────────────────────────
const ctx = computed((): TemplateVarContext => {
  if (props.context) return props.context;
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings.value) {
    const s = f.severity?.toLowerCase() as keyof typeof counts;
    if (s in counts) counts[s]++;
  }
  const dCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const d of detections.value) {
    const s = d.severity?.toLowerCase() as keyof typeof dCounts;
    if (s in dCounts) dCounts[s]++;
  }
  return {
    projectName:      project.value?.name             ?? contextStore.project?.name  ?? undefined,
    projectCode:      project.value?.code             ?? contextStore.project?.code  ?? undefined,
    orgName:          project.value?.organizationName ?? contextStore.org?.name      ?? undefined,
    findingsCount:         findings.value.length,
    findingsCountCritical: counts.critical,
    findingsCountHigh:     counts.high,
    findingsCountMedium:   counts.medium,
    findingsCountLow:      counts.low,
    findingsCountInfo:     counts.info,
    detectionsCount:         detections.value.length,
    detectionsCountCritical: dCounts.critical,
    detectionsCountHigh:     dCounts.high,
    detectionsCountMedium:   dCounts.medium,
    detectionsCountLow:      dCounts.low,
    detectionsCountInfo:     dCounts.info,
  };
});

const severityData = computed(() => ({
  critical: ctx.value.findingsCountCritical ?? 0,
  high:     ctx.value.findingsCountHigh     ?? 0,
  medium:   ctx.value.findingsCountMedium   ?? 0,
  low:      ctx.value.findingsCountLow      ?? 0,
  info:     ctx.value.findingsCountInfo     ?? 0,
}));

// ── Findings loop resolution ────────────────────────────────────────
const LOOP_RE = /\{\{\?findings\}\}([\s\S]*?)\{\{\/findings\}\}/g;

function resolveLoops(html: string): string {
  return html.replace(LOOP_RE, (_match, innerTemplate: string) => {
    if (!findings.value.length) return '';
    return findings.value.map((f) =>
      innerTemplate
        .replace(/\{\{code\}\}/g,     f.code       ?? '—')
        .replace(/\{\{title\}\}/g,    f.title      ?? '')
        .replace(/\{\{severity\}\}/g, f.severity?.toUpperCase() ?? '')
        .replace(/\{\{status\}\}/g,   f.statusName ?? '')
        // RETEST-only in the real report; preview has no history to draw from
        .replace(/\{\{retestNote\}\}/g, '')
    ).join('');
  });
}

// ── Detections loop resolution ───────────────────────────────────────
const DETECTIONS_LOOP_RE = /\{\{\?detections\}\}([\s\S]*?)\{\{\/detections\}\}/g;

function resolveDetectionLoops(html: string): string {
  return html.replace(DETECTIONS_LOOP_RE, (_match, innerTemplate: string) => {
    if (!detections.value.length) return '';
    return detections.value.map((d) =>
      innerTemplate
        .replace(/\{\{id\}\}/g,              String(d.id))
        .replace(/\{\{title\}\}/g,           d.title       ?? '')
        .replace(/\{\{severity\}\}/g,        d.severity?.toUpperCase() ?? '')
        .replace(/\{\{status\}\}/g,          detectionStatusLabel(d.status))
        .replace(/\{\{sourceType\}\}/g,      d.sourceType  ?? '')
        .replace(/\{\{occurrenceCount\}\}/g, String(d.occurrenceCount))
    ).join('');
  });
}

// ── HTML segmentation ───────────────────────────────────────────────
type Segment =
  | { kind: 'html';  content: string }
  | { kind: 'chart'; chartType: 'pie' | 'bar' };

const MARKER_RE = /(\{\{chart:(?:pie|bar)\}\})/g;

const segments = computed((): Segment[] => {
  // 1. Resolve loops first (needs findings/detections data)
  const looped   = resolveDetectionLoops(resolveLoops(props.html ?? ''));
  // 2. Resolve scalar variables
  const resolved = resolveVars(looped, ctx.value);

  const parts: Segment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;
  while ((match = MARKER_RE.exec(resolved)) !== null) {
    if (match.index > last) parts.push({ kind: 'html', content: resolved.slice(last, match.index) });
    const token = match[0];
    if (token === CHART_TOKENS.PIE) parts.push({ kind: 'chart', chartType: 'pie' });
    else if (token === CHART_TOKENS.BAR) parts.push({ kind: 'chart', chartType: 'bar' });
    last = match.index + token.length;
  }
  if (last < resolved.length) parts.push({ kind: 'html', content: resolved.slice(last) });
  return parts;
});

</script>

<template>
  <div class="field-renderer">
    <div v-if="loading" style="font-size:0.78rem; color:var(--ares-text-muted); padding:0.25rem 0;">Loading data…</div>
    <template v-for="(seg, i) in segments" :key="i">

      <!-- Regular HTML with resolved variables -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="seg.kind === 'html'" class="rich-text" v-html="seg.content" />

      <!-- Chart -->
      <TemplateChart
        v-else-if="seg.kind === 'chart'"
        :type="seg.chartType"
        :data="severityData"
        :colors="chartColors"
      />

    </template>
  </div>
</template>

<style scoped>
.field-renderer { display: flex; flex-direction: column; gap: 0; }
</style>
