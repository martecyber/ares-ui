<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  level: string | null | undefined;
  short?: boolean;
  displayLabel?: string;
  /** 'text' (default) shows Critical/High/Medium/Low/Info — CVSS/CVE/CWE/etc. keep
   *  their own vocabulary. 'priority' shows Ares's unified P0-P4 internal priority
   *  scale instead (same colors, just a different label) — used for Finding and
   *  Detection severity, which are meant to read the same way regardless of which
   *  methodology (CVSS, SSVC, a scanner's own rating) produced them. */
  scale?: 'text' | 'priority';
}>();

type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';

const normalized = computed((): SeverityLevel => {
  switch (props.level?.toLowerCase()) {
    case 'critical':
    case 'very high': return 'critical';
    case 'high':      return 'high';
    case 'medium':    return 'medium';
    case 'low':
    case 'very low':  return 'low';
    case 'info':
    case 'informational': return 'info';
    default: return props.level ? 'info' : 'unknown';
  }
});

const TEXT_LABELS: Record<SeverityLevel, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info', unknown: 'Unknown',
};

// Ares's internal priority scale: P0=Critical, P1=High, P2=Medium, P3=Low, P4=Info.
// P? is the "no default score yet" placeholder — not a real 5th level.
const PRIORITY_LABELS: Record<SeverityLevel, string> = {
  critical: 'P0', high: 'P1', medium: 'P2', low: 'P3', info: 'P4', unknown: 'P?',
};

const label = computed(() => {
  if (props.displayLabel) return props.displayLabel;
  if (props.scale === 'priority') return PRIORITY_LABELS[normalized.value];
  return props.short
    ? TEXT_LABELS[normalized.value].slice(0, 4).toUpperCase()
    : TEXT_LABELS[normalized.value];
});
</script>

<template>
  <span :class="['sev-tag', `sev-tag--${normalized}`]">{{ label }}</span>
</template>

<style scoped>
.sev-tag {
  display: inline-block;
  padding: 0.15em 0.55em;
  border-radius: var(--ares-radius);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid transparent;
  white-space: nowrap;
}

.sev-tag--critical {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.35);
}
.sev-tag--high {
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
  border-color: rgba(249, 115, 22, 0.35);
}
.sev-tag--medium {
  background: rgba(234, 179, 8, 0.15);
  color: #ca8a04;
  border-color: rgba(234, 179, 8, 0.35);
}
.sev-tag--low {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
  border-color: rgba(34, 197, 94, 0.35);
}
.sev-tag--info {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border-color: rgba(59, 130, 246, 0.35);
}
.sev-tag--unknown {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
  border-color: rgba(107, 114, 128, 0.35);
}
</style>
