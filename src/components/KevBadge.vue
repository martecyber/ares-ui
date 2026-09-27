<script setup lang="ts">
import { computed, ref } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

interface GenericKevStatus {
  vulnerabilityName?: string | null;
  dateAdded: string | null;
  dueDate: string | null;
  knownRansomwareCampaignUse: boolean;
  reportedExploitedByCanaries?: boolean | null;
  requiredAction?: string | null;
  notes?: string | null;
  vendorProject?: string | null;
  product?: string | null;
  xdbUrls?: string[];
  reportedExploitationUrls?: string[];
}

const props = withDefaults(defineProps<{
  status: GenericKevStatus | null | undefined;
  source?: 'cisa' | 'vulncheck';
}>(), {
  source: 'cisa',
});

const SOURCE_META = {
  cisa:      { label: 'CISA KEV',      name: 'CISA Known Exploited Vulnerabilities',      color: '#ef4444' },
  vulncheck: { label: 'VulnCheck KEV', name: 'VulnCheck Known Exploited Vulnerabilities', color: '#8b5cf6' },
} as const;

const meta = computed(() => SOURCE_META[props.source]);

const tooltip = computed(() => {
  const s = props.status;
  if (!s) return '';
  const parts: string[] = ['Click for details'];
  if (s.dueDate) parts.push(`Remediation due ${s.dueDate}`);
  if (s.knownRansomwareCampaignUse) parts.push('Known ransomware campaign use');
  return parts.join(' · ');
});

const showModal = ref(false);

function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}
</script>

<template>
  <span
    v-if="status"
    class="kev-badge"
    :style="{ borderColor: meta.color, background: meta.color + '22', color: meta.color }"
    v-tooltip.top="tooltip"
    @click.stop="showModal = true"
  >
    <i class="pi pi-exclamation-triangle" />
    {{ meta.label }}
  </span>

  <Dialog v-if="status" v-model:visible="showModal" modal style="width:32rem;">
    <template #header>
      <span style="display:flex; align-items:center; gap:0.5rem;">
        <i class="pi pi-exclamation-triangle" :style="{ color: meta.color }" />
        <strong>{{ meta.name }}</strong>
      </span>
    </template>

    <p v-if="status.vulnerabilityName" class="kev-modal-title">{{ status.vulnerabilityName }}</p>

    <div class="kev-facts">
      <div class="kev-fact">
        <span class="kev-fact-label">Added to catalog</span>
        <span class="kev-fact-value">{{ fmtDate(status.dateAdded) }}</span>
      </div>
      <div class="kev-fact">
        <span class="kev-fact-label">Remediation due</span>
        <span class="kev-fact-value">{{ fmtDate(status.dueDate) }}</span>
      </div>
      <div class="kev-fact">
        <span class="kev-fact-label">Ransomware use</span>
        <span class="kev-fact-value" :style="status.knownRansomwareCampaignUse ? `color:${meta.color}; font-weight:700;` : ''">
          {{ status.knownRansomwareCampaignUse ? 'Known' : 'Unknown' }}
        </span>
      </div>
      <div v-if="source === 'vulncheck'" class="kev-fact">
        <span class="kev-fact-label">Canary exploitation</span>
        <span class="kev-fact-value" :style="status.reportedExploitedByCanaries ? `color:${meta.color}; font-weight:700;` : ''">
          {{ status.reportedExploitedByCanaries ? 'Observed' : 'None observed' }}
        </span>
      </div>
      <div v-if="status.vendorProject || status.product" class="kev-fact">
        <span class="kev-fact-label">Vendor / Product</span>
        <span class="kev-fact-value">{{ [status.vendorProject, status.product].filter(Boolean).join(' / ') }}</span>
      </div>
    </div>

    <p v-if="status.requiredAction" class="kev-modal-text">
      <strong>Required action:</strong> {{ status.requiredAction }}
    </p>
    <p v-if="status.notes" class="kev-modal-text kev-modal-text--muted">{{ status.notes }}</p>

    <div v-if="status.xdbUrls?.length || status.reportedExploitationUrls?.length" class="kev-modal-links">
      <a v-if="status.xdbUrls?.length" :href="status.xdbUrls[0]" target="_blank" rel="noopener noreferrer" class="kev-modal-link" :style="{ color: meta.color }">
        <i class="pi pi-external-link" /> {{ status.xdbUrls.length }} exploit reference{{ status.xdbUrls.length > 1 ? 's' : '' }}
      </a>
      <a v-if="status.reportedExploitationUrls?.length" :href="status.reportedExploitationUrls[0]" target="_blank" rel="noopener noreferrer" class="kev-modal-link" :style="{ color: meta.color }">
        <i class="pi pi-external-link" /> {{ status.reportedExploitationUrls.length }} exploitation report{{ status.reportedExploitationUrls.length > 1 ? 's' : '' }}
      </a>
    </div>

    <template #footer>
      <Button label="Close" severity="secondary" size="small" @click="showModal = false" />
    </template>
  </Dialog>
</template>

<style scoped>
.kev-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 0.15em 0.55em;
  border-radius: var(--ares-radius);
  border: 1px solid;
  white-space: nowrap;
  cursor: pointer;
}
.kev-badge .pi { font-size: 0.65rem; }

.kev-modal-title { font-size: 0.9rem; font-weight: 600; color: var(--ares-text-2); margin: 0 0 0.85rem; }

.kev-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
}
.kev-fact { display: flex; flex-direction: column; gap: 0.15rem; }
.kev-fact-label { font-size: 0.68rem; font-weight: 600; color: var(--ares-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.kev-fact-value { font-size: 0.85rem; font-weight: 600; color: var(--ares-text-2); }

.kev-modal-text { font-size: 0.85rem; line-height: 1.6; color: var(--ares-text-2); margin: 0.85rem 0 0; }
.kev-modal-text--muted { color: var(--ares-text-muted); font-size: 0.8rem; margin-top: 0.5rem; }

.kev-modal-links { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.85rem; }
.kev-modal-link { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; text-decoration: none; }
.kev-modal-link:hover { text-decoration: underline; }
</style>
