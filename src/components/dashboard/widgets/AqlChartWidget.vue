<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Chart, ArcElement, BarElement, BarController, DoughnutController, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, type ChartData, type ChartOptions, type ActiveElement, type ChartEvent } from 'chart.js';
import type { DashboardLevel, DashboardWidgetDto, AqlChartData, AqlChartBucket } from '@/api/dashboards';
import { dashboardEntityListRoute } from '@/utils/dashboardNavigation';
import { statusLabel, statusSeverity } from '@/api/findings';
import { detectionStatusLabel, detectionStatusSeverity } from '@/api/detections';
import { useThemeStore } from '@/stores/theme';
import WidgetLoading from './WidgetLoading.vue';

// BarController/DoughnutController/LineController (the chart-type drivers, not just their
// elements) must be registered too, or Chart.js throws "X is not a registered controller" the
// moment a chart of that type is constructed — DoughnutController also covers 'pie' (PieController
// extends it, but registering the base class is enough for both cutout values this widget ever
// passes).
Chart.register(ArcElement, BarElement, BarController, DoughnutController, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const props = defineProps<{
  widget: DashboardWidgetDto;
  data: AqlChartData | null;
  loading?: boolean;
  error?: string | null;
  level: DashboardLevel;
  scopeId: number | null;
  orgId: number | null;
}>();

const router = useRouter();
const themeStore = useThemeStore();
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const entity = computed<string>(() => props.widget.config?.entity ?? '');
const aql = computed<string>(() => props.widget.config?.aql ?? '');
const groupByField = computed<string>(() => props.widget.config?.groupByField ?? '');
const chartType = computed<'bar' | 'bar_grouped' | 'bar_stacked' | 'line' | 'pie' | 'donut'>(() => props.widget.config?.chartType ?? 'bar');
// Set when groupByField is DATE-typed and bucketed server-side via date_trunc (dashboards
// remodel Phase 13), OR when "iteration" — grouped by the entity's MONITOR iteration label
// instead (Finding.iterationLabel directly, Detection via a DetectionIterationStat join; see
// FindingService/DetectionService#countGroupedByAql). In both cases buckets.label reads
// left-to-right through time rather than as unordered categories, so display formatting and
// click-through both need a time-aware path — but only the date_trunc case is an ISO timestamp
// that needs parsing; an iteration label ("26-Q2", "26-W08", ...) is already the display string.
const dateBucket = computed<'' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'iteration'>(() => props.widget.config?.dateBucket ?? '');
// Second grouping dimension (Excel-style "series by") — splits each category into multiple bars/
// points instead of one. Null/'' means the single-series shape every pre-existing widget already
// used.
const seriesField = computed<string>(() => props.widget.config?.seriesField ?? '');

// Matches AqlGroupCountSupport.OTHER_LABEL exactly — the synthetic bucket a configured "limit
// categories" (topN) folds every category beyond the top N into.
const OTHER_LABEL = '(Other)';

// Fallback palette for any groupByField/seriesField without a semantic color scheme below.
const PALETTE = ['#60a5fa', '#f87171', '#fbbf24', '#4ade80', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c', '#94a3b8'];
// Neutral color for the synthetic "(Other)" bucket — deliberately outside the categorical
// palette so it always reads as "everything else", not as just another category.
const OTHER_COLOR = '#64748b';

// AqlGroupCountSupport (backend) returns each bucket's raw column value via String.valueOf — for
// `priority` that's the underlying smallint ("0".."4"), not the "P0".."P4" literal syntax AQL
// queries and the rest of the UI use. Same translation is needed for the display label AND for
// building a valid click-through AQL comparison (a bare "0" is rejected by the PRIORITY field
// type, only "P0".."P4" is accepted).
const PRIORITY_RAW_TO_CODE: Record<string, string> = { '0': 'P0', '1': 'P1', '2': 'P2', '3': 'P3', '4': 'P4' };
// Mirrors SeverityTag.vue's priority palette exactly (P0=critical .. P4=info).
const PRIORITY_HEX: Record<string, string> = { P0: '#ef4444', P1: '#f97316', P2: '#ca8a04', P3: '#16a34a', P4: '#3b82f6' };
// Mirrors AresBadge.vue's severity palette exactly, so a status bucket gets the same color the
// status badge for that value would render with anywhere else in the app.
const SEVERITY_HEX: Record<string, string> = {
  success: '#4ade80', info: '#60a5fa', warn: '#fb923c', danger: '#f87171',
  secondary: '#94a3b8', contrast: '#e2e8f0',
};

/** Formats a date-bucket's ISO start-instant (backend sends {@code date_trunc}'s output, e.g.
 *  "2026-06-01T00:00Z") into a granularity-appropriate label. Quarter has no native
 *  Intl/date_trunc label of its own — Postgres truncates to the quarter's first month, so the
 *  quarter number is derived from that month. Never called for dateBucket === 'iteration' — an
 *  iteration label isn't a date at all (see {@link displayLabel}). */
function formatBucketDate(raw: string, bucket: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  switch (bucket) {
    case 'year': return `${d.getUTCFullYear()}`;
    case 'quarter': return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
    case 'month': return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    default: return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
}

/** Adds one bucket-width to a date-bucket's ISO start-instant — the exclusive upper bound of that
 *  bucket, used to build a `>= start AND < end` click-through range (a bucketed timestamp can't be
 *  matched with plain equality). Calendar-aware (UTC) so month/quarter/year buckets land on the
 *  next bucket's actual start regardless of how many days the current one has. */
function addBucketWidth(raw: string, bucket: string): string {
  const d = new Date(raw);
  switch (bucket) {
    case 'day': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'week': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'month': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarter': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'year': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString();
}

/** Translates a raw grouped-count value (from `field`'s column) into the label a human should
 *  see — shared between the primary category axis and a series' legend entry, since both can be
 *  any groupable field (priority/status get semantic translation, everything else passes through
 *  unchanged). */
function friendlyValue(raw: string, field: string): string {
  if (field === 'priority') return PRIORITY_RAW_TO_CODE[raw] ?? raw;
  if (field === 'status') {
    if (entity.value === 'finding') return statusLabel(raw);
    if (entity.value === 'detection') return detectionStatusLabel(raw);
  }
  return raw;
}

/** Same semantic-color mapping as {@link friendlyValue}, shared between per-category bar colors
 *  (single-series mode) and per-series colors (series mode) — both key off whichever field
 *  produced the raw value (`groupByField` or `seriesField` respectively). */
function semanticColor(raw: string, field: string, fallbackIndex: number): string {
  if (field === 'priority') {
    const code = PRIORITY_RAW_TO_CODE[raw];
    return (code && PRIORITY_HEX[code]) || PALETTE[fallbackIndex % PALETTE.length];
  }
  if (field === 'status') {
    if (entity.value === 'finding') return SEVERITY_HEX[statusSeverity(raw)] ?? PALETTE[fallbackIndex % PALETTE.length];
    if (entity.value === 'detection') return SEVERITY_HEX[detectionStatusSeverity(raw)] ?? PALETTE[fallbackIndex % PALETTE.length];
  }
  return PALETTE[fallbackIndex % PALETTE.length];
}

function displayLabel(rawLabel: string): string {
  if (rawLabel === OTHER_LABEL) return rawLabel;
  if (dateBucket.value === 'iteration') return rawLabel;
  if (dateBucket.value) return formatBucketDate(rawLabel, dateBucket.value);
  return friendlyValue(rawLabel, groupByField.value);
}

function bucketColor(rawLabel: string, index: number): string {
  if (rawLabel === OTHER_LABEL) return OTHER_COLOR;
  // A time/iteration series is one continuous trend, not distinct categories — every bar shares
  // one accent color instead of cycling the categorical palette per bar.
  if (dateBucket.value) return PALETTE[0];
  return semanticColor(rawLabel, groupByField.value, index);
}

function seriesLabel(raw: string | null): string {
  if (raw === null) return props.widget.title || `${entity.value} count`;
  return friendlyValue(raw, seriesField.value);
}

function seriesColor(raw: string | null, index: number): string {
  if (raw === null) return PALETTE[0];
  return semanticColor(raw, seriesField.value, index);
}

/** Canvas fillStyle doesn't resolve `var(--x)` CSS custom-property syntax the way DOM/CSS
 *  rendering does — Chart.js was silently getting an unusable color string and falling back to
 *  black text, which is why axis/legend/tooltip text had no contrast (especially in dark mode).
 *  Resolve to the actual computed value instead, and rebuild whenever the theme toggles (see the
 *  themeStore watcher below) since these values differ between light/dark. */
function resolveCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Builds the click-through AQL clause for one (bucket, series) bar/point — or returns null when
 *  no valid clause can be expressed, in which case the click is a no-op rather than navigating
 *  somewhere wrong: the synthetic "(Other)" topN bucket isn't a real value to filter on, and
 *  entity === 'detection' with dateBucket === 'iteration' has no AQL field at all for iteration
 *  membership (it only exists via a DetectionIterationStat join server-side — see
 *  DetectionService#countGroupedByIteration). */
function bucketAql(rawLabel: string, series: string | null): string | null {
  if (rawLabel === OTHER_LABEL) return null;
  let base: string;
  if (dateBucket.value === 'iteration') {
    if (entity.value !== 'finding') return null;
    base = `iterationLabel == '${rawLabel.replace(/'/g, "\\'")}'`;
  } else if (dateBucket.value) {
    const end = addBucketWidth(rawLabel, dateBucket.value);
    base = `${groupByField.value} >= '${rawLabel}' AND ${groupByField.value} < '${end}'`;
  } else {
    const value = groupByField.value === 'priority' ? (PRIORITY_RAW_TO_CODE[rawLabel] ?? rawLabel) : rawLabel;
    base = `${groupByField.value} == '${value.replace(/'/g, "\\'")}'`;
  }
  let clause = aql.value ? `${aql.value} AND ${base}` : base;
  if (series !== null && seriesField.value) {
    const sValue = seriesField.value === 'priority' ? (PRIORITY_RAW_TO_CODE[series] ?? series) : series;
    clause += ` AND ${seriesField.value} == '${sValue.replace(/'/g, "\\'")}'`;
  }
  return clause;
}

function goToBucket(rawLabel: string, series: string | null) {
  const clause = bucketAql(rawLabel, series);
  if (!clause) return;
  const target = dashboardEntityListRoute(entity.value, props.level, props.scopeId, props.orgId, clause);
  if (target) router.push(target);
}

/** Pivots the flat, backend-returned `{label, series, count}[]` into a shared category axis
 *  (unique labels, first-seen order — already chronological for a bucketed query, count-desc
 *  otherwise, per AqlGroupCountSupport) and one number[] per unique series (also first-seen
 *  order), 0-filled for any (label, series) pair that didn't come back. `series` is `[null]`
 *  when the widget has no seriesField configured — a single implicit series. */
function pivot(buckets: AqlChartBucket[]): { labels: string[]; series: (string | null)[]; datasets: number[][] } {
  const labels: string[] = [];
  const labelIndex = new Map<string, number>();
  for (const b of buckets) {
    if (!labelIndex.has(b.label)) { labelIndex.set(b.label, labels.length); labels.push(b.label); }
  }
  const series: (string | null)[] = [];
  const seriesIndex = new Map<string | null, number>();
  for (const b of buckets) {
    if (!seriesIndex.has(b.series)) { seriesIndex.set(b.series, series.length); series.push(b.series); }
  }
  const datasets: number[][] = series.map(() => new Array(labels.length).fill(0));
  for (const b of buckets) {
    datasets[seriesIndex.get(b.series)!][labelIndex.get(b.label)!] = b.count;
  }
  return { labels, series, datasets };
}

function buildChart() {
  if (chart) { chart.destroy(); chart = null; }
  if (!canvas.value) return;
  const buckets = props.data?.buckets ?? [];
  if (!buckets.length) return; // template shows the empty-state message instead of a canvas

  const { labels: rawLabels, series: seriesValues, datasets: rawDatasets } = pivot(buckets);
  const labels = rawLabels.map(displayLabel);
  const inSeriesMode = !!seriesField.value;

  const textColor = resolveCssVar('--ares-text-muted');
  const gridColor = resolveCssVar('--ares-border');
  const tooltipBg = resolveCssVar('--ares-surface-raised');
  const tooltipText = resolveCssVar('--ares-text');
  const isLine = chartType.value === 'line';
  const isPieLike = chartType.value === 'pie' || chartType.value === 'donut';

  const sharedOptions: ChartOptions<any> = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_evt: ChartEvent, elements: ActiveElement[]) => {
      if (!elements.length) return;
      const el = elements[0];
      const rawLabel = rawLabels[el.index];
      if (rawLabel === undefined) return;
      goToBucket(rawLabel, isPieLike ? null : (seriesValues[el.datasetIndex] ?? null));
    },
    plugins: {
      legend: { display: isPieLike || inSeriesMode, labels: { color: textColor, boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        enabled: true,
        backgroundColor: tooltipBg, titleColor: tooltipText, bodyColor: tooltipText,
        borderColor: gridColor, borderWidth: 1,
      },
    },
  };

  if (isPieLike) {
    const colors = rawLabels.map((l, i) => bucketColor(l, i));
    const data: ChartData<'doughnut'> = {
      labels,
      datasets: [{ data: rawDatasets[0] ?? [], backgroundColor: colors, borderColor: colors, borderWidth: 1.5 }],
    };
    chart = new Chart(canvas.value, {
      type: 'doughnut',
      data,
      options: { ...sharedOptions, cutout: chartType.value === 'donut' ? '55%' : '0%' },
    });
    return;
  }

  const datasetsBuilt = inSeriesMode
    ? seriesValues.map((s, si) => {
        const color = seriesColor(s, si);
        return isLine
          ? { label: seriesLabel(s), data: rawDatasets[si], borderColor: color, backgroundColor: color + '33',
              borderWidth: 2, tension: 0.25, pointRadius: 3, pointBackgroundColor: color, fill: false }
          : { label: seriesLabel(s), data: rawDatasets[si], backgroundColor: color + 'cc', borderColor: color,
              borderWidth: 1.5, borderRadius: 4 };
      })
    : (() => {
        const colors = rawLabels.map((l, i) => bucketColor(l, i));
        return [isLine
          ? { label: seriesLabel(null), data: rawDatasets[0] ?? [], borderColor: colors[0], backgroundColor: colors[0] + '33',
              borderWidth: 2, tension: 0.25, pointRadius: 3, pointBackgroundColor: colors[0], fill: false }
          : { label: seriesLabel(null), data: rawDatasets[0] ?? [], backgroundColor: colors.map((c) => c + 'cc'), borderColor: colors,
              borderWidth: 1.5, borderRadius: 4 }];
      })();

  const stacked = chartType.value === 'bar_stacked';
  const scales = {
    y: { beginAtZero: true, stacked, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } },
    x: { stacked, ticks: { color: textColor }, grid: { color: gridColor } },
  };

  chart = new Chart(canvas.value, {
    type: isLine ? 'line' : 'bar',
    data: { labels, datasets: datasetsBuilt } as ChartData<any>,
    options: { ...sharedOptions, scales },
  });
}

watch(() => props.data, buildChart, { deep: true });
watch(chartType, buildChart);
watch(() => themeStore.theme, buildChart);
onMounted(buildChart);
onUnmounted(() => { chart?.destroy(); });
</script>

<template>
  <div class="aql-chart-widget">
    <div class="aql-chart-title">{{ widget.title || `${entity} by ${groupByField || 'iteration'}` }}</div>
    <WidgetLoading v-if="loading" />
    <div v-else-if="error" class="aql-chart-message widget-error" v-tooltip.top="error">
      <i class="pi pi-exclamation-triangle" /><span>Failed to load</span>
    </div>
    <div v-else-if="data === null" class="aql-chart-message">Couldn't load this chart — check its filter and fields.</div>
    <div v-else-if="!data.buckets.length" class="aql-chart-message">No data for the current filter.</div>
    <div v-else class="aql-chart-canvas-wrap">
      <canvas ref="canvas" />
    </div>
  </div>
</template>

<style scoped>
.aql-chart-widget { height: 100%; display: flex; flex-direction: column; gap: 0.4rem; }
.aql-chart-title { font-size: 0.78rem; font-weight: 600; color: var(--ares-text-2); flex-shrink: 0; }
.aql-chart-canvas-wrap { position: relative; flex: 1; min-height: 0; }
.aql-chart-message {
  flex: 1; display: flex; align-items: center; justify-content: center; text-align: center;
  padding: 1rem; font-size: 0.8rem; color: var(--ares-text-muted);
}
.aql-chart-message.widget-error { gap: 0.4rem; color: var(--ares-error); }
</style>
