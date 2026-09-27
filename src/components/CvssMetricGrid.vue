<script setup lang="ts">
// Renders one CVSS metric group (Base, Temporal/Threat, or Environmental) as a grid of
// labeled button rows. Extracted because ScoreDialog.vue and ScoreEditorDialog.vue each
// render this same grid shape 6 times over (Base/Temporal-or-Threat/Environmental x
// 4.0/3.1/2.0) and would otherwise duplicate the markup+styling verbatim.
import type { MetricDef } from '@/utils/scoreMetrics';

const props = defineProps<{
  metrics: MetricDef<string>[];
  /** The reactive metrics object (e.g. c40/c31/c20) this grid reads/writes into. */
  state: Record<string, string>;
}>();

function select(key: string, value: string) {
  props.state[key] = value;
}
</script>

<template>
  <div class="metric-grid">
    <div v-for="m in metrics" :key="m.key" class="metric-row">
      <span class="metric-label">{{ m.label }}<span class="metric-help" :title="m.description">?</span></span>
      <div class="metric-btns">
        <button
          v-for="opt in m.options"
          :key="opt.value"
          type="button"
          :class="['metric-btn', { 'metric-btn--active': state[m.key] === opt.value }]"
          :title="opt.title"
          @click="select(m.key, opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metric-grid { display: flex; flex-direction: column; gap: 0.45rem; }
.metric-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.metric-label {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
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
.metric-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 14%, transparent);
  color: var(--p-primary-300);
  font-weight: 700;
}
</style>
