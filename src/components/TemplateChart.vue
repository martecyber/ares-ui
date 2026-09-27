<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, type ChartData, type ChartOptions } from 'chart.js';
import { SEVERITY_ORDER, PLATFORM_SEVERITY_COLORS } from '@/utils/templateVars';

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const props = defineProps<{
  type: 'pie' | 'bar';
  /** Map of severity (lowercase) → count */
  data: Record<string, number>;
  /** Override colors (for report rendering). Falls back to platform colors. */
  colors?: Record<string, string>;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const LABELS: Record<string, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info',
};

function buildChart() {
  if (!canvas.value) return;
  const activeColors = props.colors ?? PLATFORM_SEVERITY_COLORS;

  const labels = SEVERITY_ORDER.filter(s => (props.data[s] ?? 0) > 0).map(s => LABELS[s]);
  const values = SEVERITY_ORDER.filter(s => (props.data[s] ?? 0) > 0).map(s => props.data[s] ?? 0);
  const bgColors = SEVERITY_ORDER.filter(s => (props.data[s] ?? 0) > 0).map(s => activeColors[s] ?? '#888');
  const borderColors = bgColors.map(c => c);

  if (chart) { chart.destroy(); chart = null; }

  const isDark = document.documentElement.classList.contains('dark') ||
    getComputedStyle(document.documentElement).getPropertyValue('--ares-bg').trim() !== '';
  const textColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';

  const sharedOptions: ChartOptions<any> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: textColor,
          font: { size: 11 },
          boxWidth: 12,
          padding: 10,
        },
      },
      tooltip: { enabled: true },
    },
  };

  if (props.type === 'pie') {
    const data: ChartData<'doughnut'> = {
      labels,
      datasets: [{ data: values, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1.5 }],
    };
    chart = new Chart(canvas.value, {
      type: 'doughnut',
      data,
      options: {
        ...sharedOptions,
        cutout: '55%',
      },
    });
  } else {
    const data: ChartData<'bar'> = {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors.map(c => c + 'cc'),
        borderColor: bgColors,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    };
    chart = new Chart(canvas.value, {
      type: 'bar',
      data,
      options: {
        ...sharedOptions,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: textColor, precision: 0 },
            grid: { color: 'rgba(255,255,255,0.08)' },
          },
          x: {
            ticks: { color: textColor },
            grid: { display: false },
          },
        },
        plugins: { ...sharedOptions.plugins, legend: { display: false } },
      },
    });
  }
}

watch(() => [props.data, props.colors, props.type], buildChart, { deep: true });

onMounted(buildChart);
onUnmounted(() => { chart?.destroy(); });
</script>

<template>
  <div class="tpl-chart-wrap">
    <div class="tpl-chart-label">
      <i :class="type === 'pie' ? 'pi pi-chart-pie' : 'pi pi-chart-bar'" />
      Findings by severity
    </div>
    <canvas ref="canvas" class="tpl-chart-canvas" />
  </div>
</template>

<style scoped>
.tpl-chart-wrap {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  padding: 0.75rem;
  margin: 0.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.tpl-chart-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.tpl-chart-canvas {
  height: 220px;
  max-height: 220px;
}
</style>
