<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { projectRulesApi, RULE_TYPE_LABELS, type ProjectRule } from '@/api/project-rules';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null }>();
const router = useRouter();
const rules = ref<ProjectRule[]>([]);
const loading = ref(true);

function ruleSummary(r: ProjectRule): string {
  const c = r.config as Record<string, any>;
  switch (r.ruleType) {
    case 'time_window': {
      const s = c.startTime ?? (String(Number(c.startHour ?? 0)).padStart(2, '0') + ':00');
      const e = c.endTime   ?? (String(Number(c.endHour   ?? 0)).padStart(2, '0') + ':00');
      return `${s} – ${e}`;
    }
    case 'rate_limit':          return `${c.value} req/${c.unit === 'rpm' ? 'min' : 'sec'}`;
    case 'required_header':     return `${c.name}: ${c.value}`;
    case 'required_user_agent': return String(c.userAgent ?? '');
    case 'severity_override':   return `${c.vulnType} → ${c.severity}`;
    case 'max_concurrency':     return `Max ${c.value} threads`;
    case 'excluded_vuln_type':  return String(c.vulnType ?? '');
    default:                    return '';
  }
}

onMounted(async () => {
  if (!props.scopeId) { loading.value = false; return; }
  try { rules.value = await projectRulesApi.list(props.scopeId); }
  finally { loading.value = false; }
});
</script>

<template>
  <div class="ares-card widget-card">
    <div class="ares-card-section-header">
      <span>Rules of Engagement</span>
      <a v-if="scopeId" class="widget-link" @click="router.push({ name: 'org-project-rules', params: { engId: scopeId } })">Manage</a>
    </div>
    <div class="widget-body">
      <WidgetLoading v-if="loading" />
      <table v-else class="ares-table">
        <thead>
          <tr><th>Type</th><th>Summary</th><th style="width:60px; text-align:center;">Active</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rules" :key="r.id" :style="r.enabled ? '' : 'opacity:0.45;'">
            <td style="font-size:0.8rem;">{{ RULE_TYPE_LABELS[r.ruleType] }}</td>
            <td style="font-family:monospace; font-size:0.78rem;">{{ ruleSummary(r) }}</td>
            <td style="text-align:center;">
              <span v-if="r.enabled" style="color:var(--ares-success);">●</span>
              <span v-else style="color:var(--ares-text-muted);">○</span>
            </td>
          </tr>
          <tr v-if="!rules.length"><td colspan="3" class="ares-table-empty">No rules configured.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.widget-card { height: 100%; padding: 0; display: flex; flex-direction: column; }
.widget-body { flex: 1; min-height: 0; overflow: auto; }
.widget-link { font-size: 0.75rem; color: var(--ares-accent-muted); cursor: pointer; }
.widget-link:hover { text-decoration: underline; }
</style>
