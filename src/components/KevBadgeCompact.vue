<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps<{
  cveId: string;
  kevListed: boolean | null | undefined;
  /** CVEs contributing to an aggregated badge; the click opens the first one. */
  cveIds?: string[];
}>();

const router = useRouter();

const tooltip = computed(() =>
  props.cveIds && props.cveIds.length > 1
    ? `Listed in a Known Exploited Vulnerabilities catalog: ${props.cveIds.join(', ')} — click for the first`
    : 'Listed in a Known Exploited Vulnerabilities catalog — click for details');

function open() {
  router.push({ name: 'kb-cve-detail', params: { id: props.cveId } });
}
</script>

<template>
  <span
    v-if="kevListed"
    class="kev-badge-compact"
    v-tooltip.top="tooltip"
    @click.stop="open"
  >
    <i class="pi pi-exclamation-triangle" />
    KEV
  </span>
</template>

<style scoped>
.kev-badge-compact {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 0.15em 0.55em;
  border-radius: var(--ares-radius);
  border: 1px solid #ef4444;
  background: #ef444422;
  color: #ef4444;
  white-space: nowrap;
  cursor: pointer;
}
.kev-badge-compact .pi { font-size: 0.65rem; }
</style>
