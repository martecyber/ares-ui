import { computed, type Ref } from 'vue';
import type { ProjectRule } from '@/api/project-rules';

/**
 * Derives the same three "locked field" values from a project's active Rules of Engagement that
 * {@code EngagementRuleEnforcer#applyToTaskArgs} injects server-side (headers/rate-limit/
 * max-concurrency) — shared between `AgentTaskFormDialog.vue` (manual task creation) and
 * `NodeConfigPanel.vue`'s `ACTION_AGENT_TASK` section (the workflow editor), so a rule change
 * only ever needs updating in one place instead of two hand-copies drifting apart. Both callers
 * pass the same shape into the same per-tool config panels
 * (`:locked-rate-limit`/`:locked-rate`/`:locked-headers`/`:locked-concurrency`, prop name varies
 * per panel — see either caller's template for the exact wiring) — those panels render the
 * lock-badge-plus-"Override rule"-checkbox UI, this composable only computes the values.
 *
 * @param activeRules Already filtered to `enabled` rows — callers fetch via
 *   `projectRulesApi.list(projectId)` and filter themselves (fetch timing/caching differs enough
 *   between the two callers that owning the fetch here wouldn't simplify anything).
 */
export function useEngagementRuleLocks(activeRules: Ref<ProjectRule[]>) {
  const ruleRateLimitRps = computed<number | null>(() => {
    let min: number | null = null;
    for (const r of activeRules.value) {
      if (r.ruleType !== 'rate_limit') continue;
      const val = Number(r.config.value ?? 0);
      if (val <= 0) continue;
      const rps = r.config.unit === 'rpm' ? Math.max(1, Math.floor(val / 60)) : val;
      if (min === null || rps < min) min = rps;
    }
    return min;
  });

  const ruleMaxConcurrency = computed<number | null>(() => {
    let min: number | null = null;
    for (const r of activeRules.value) {
      if (r.ruleType !== 'max_concurrency') continue;
      const val = Number(r.config.value ?? 0);
      if (val <= 0) continue;
      if (min === null || val < min) min = val;
    }
    return min;
  });

  const ruleHeadersRecord = computed<Record<string, string> | null>(() => {
    const out: Record<string, string> = {};
    for (const r of activeRules.value) {
      if (r.ruleType === 'required_header') {
        const name = String(r.config.name ?? '').trim();
        const value = String(r.config.value ?? '');
        if (name) out[name] = value;
      } else if (r.ruleType === 'required_user_agent') {
        const ua = String(r.config.userAgent ?? '').trim();
        if (ua) out['User-Agent'] = ua;
      }
    }
    return Object.keys(out).length ? out : null;
  });

  return { ruleRateLimitRps, ruleMaxConcurrency, ruleHeadersRecord };
}
