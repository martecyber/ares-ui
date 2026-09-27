<script setup lang="ts">
import { toolIconSrc, whiteBackingSrc, toolLabel } from '@/utils/tool-icons';

defineProps<{ source: string | null }>();

// Curated names for agent-run scan tools — these have no backend registry to self-describe (they
// aren't integrations/plugins, just binaries the agent invokes), so they can't come from
// toolLabel() the way an integration or Bug Hunting platform's name can. Kept only for that
// residual set; an entry here for something that DOES have a dynamic label just adds a fallback
// that's never reached (toolLabel() is checked first below).
const LABELS: Record<string, string> = {
  nmap:         'Nmap',
  burp:         'Burp Suite',
  wpscan:       'WPScan',
  ffuf:         'ffuf',
  testssl:      'testssl.sh',
  pingcastle:   'PingCastle',
  purpleknight: 'PurpleKnight',
  nuclei:       'Nuclei',
  katana:       'Katana',
  dnsx:         'dnsx',
  httpx:        'httpx',
  subfinder:    'Subfinder',
  masscan:      'Masscan',
  naabu:        'Naabu',
  trivy:        'Trivy',
  zap:          'OWASP ZAP',
};

function label(source: string | null) {
  if (!source) return '—';
  const key = source.toLowerCase();
  return toolLabel(key) ?? LABELS[key] ?? source;
}
</script>

<template>
  <span v-if="!source" style="color:var(--ares-text-muted);">—</span>
  <span v-else v-tooltip.top="label(source)" class="source-badge">
    <!-- White backing layer stacked behind icons whose colored path carves an inner glyph out
         as a transparent hole (e.g. Qualys's Q) — see tool-icons.ts's whiteBackingSrc. -->
    <span v-if="toolIconSrc(source)" class="source-img-stack">
      <img v-if="whiteBackingSrc(source)" :src="whiteBackingSrc(source)" class="source-img" alt="" aria-hidden="true" />
      <img :src="toolIconSrc(source)" :alt="label(source)" class="source-img" />
    </span>
    <i v-else class="pi pi-wrench source-icon-fallback" />
  </span>
</template>

<style scoped>
.source-badge {
  display: inline-flex;
  align-items: center;
  cursor: default;
  color: var(--ares-text-muted);
}
.source-badge:hover {
  opacity: 0.8;
}
.source-img-stack {
  position: relative;
  width: 20px;
  height: 20px;
}
.source-img {
  width: 20px;
  height: 20px;
  display: block;
  object-fit: contain;
  border-radius: var(--ares-radius);
}
.source-img-stack .source-img {
  position: absolute;
  inset: 0;
}
.source-icon-fallback {
  font-size: 0.85rem;
}
</style>
