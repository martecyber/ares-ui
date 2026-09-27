<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import { cveApi, cisaKevApi, vulncheckKevApi, type CveSeverityDto, type CisaKevStatusDto, type VulnCheckKevStatusDto } from '@/api/kb';
import { exploitsApi, type ExploitCountDto } from '@/api/kb-exploits';
import { referencesApi } from '@/api/references';
import KevBadge from '@/components/KevBadge.vue';
import ExploitBadge from '@/components/ExploitBadge.vue';

interface RefItem {
  id: number;
  catalogId?: number;
  catalogCode: string;
  title: string;
  description?: string | null;
  url?: string | null;
  faviconUrl?: string | null;
}

const props = defineProps<{ references: RefItem[]; removable?: boolean }>();

const emit = defineEmits<{ remove: [item: RefItem] }>();

const router = useRouter();
const cveSeverities = ref<Map<string, string>>(new Map());
const cveKevStatus = ref<Map<string, CisaKevStatusDto>>(new Map());
const cveVulncheckKevStatus = ref<Map<string, VulnCheckKevStatusDto>>(new Map());
const cveExploitCount = ref<Map<string, number>>(new Map());

const grouped = computed(() => {
  const map = new Map<string, RefItem[]>();
  for (const r of props.references) {
    const list = map.get(r.catalogCode) ?? [];
    list.push(r);
    map.set(r.catalogCode, list);
  }
  return Array.from(map.entries());
});

// ── URL favicons ─────────────────────────────────────────────────────────────
// The favicon endpoint is authenticated, so it can't be used directly as an
// <img :src>; fetch each as a blob once and cache the object URL locally.
const faviconSrcs = ref<Map<number, string>>(new Map());

// `references` is a prop on an already-mounted component (e.g. after adding one more
// reference via the dialog, the parent just refetches the finding/template/detection
// and passes a new array down) — onMounted alone would only ever load data for
// whatever was present the first time this component appeared, so this has to watch
// the prop instead of running once.
watch(
  () => props.references,
  async (refs) => {
    const cveIds = refs.filter(r => r.catalogCode === 'CVE').map(r => r.title);
    if (cveIds.length) {
      // Four independent lookups keyed on the same cveIds — awaited in parallel instead of one
      // after another so a detection/finding with many CVE references pays one round trip's
      // worth of latency here, not four (real cost on a slow deployment: see DetectionDetailView).
      const [list, kevList, vcKevList, exploitList] = await Promise.all([
        cveApi.severities(cveIds).catch(() => [] as CveSeverityDto[]),
        cisaKevApi.status(cveIds).catch(() => [] as CisaKevStatusDto[]),
        vulncheckKevApi.status(cveIds).catch(() => [] as VulnCheckKevStatusDto[]),
        exploitsApi.status(cveIds).catch(() => [] as ExploitCountDto[]),
      ]);
      cveSeverities.value = new Map(list.map(d => [d.id, d.severity ?? '']));
      cveKevStatus.value = new Map(kevList.map(d => [d.id, d]));
      cveVulncheckKevStatus.value = new Map(vcKevList.map(d => [d.id, d]));
      cveExploitCount.value = new Map(exploitList.map(d => [d.cveId, d.count]));
    }

    // Only fetch favicons we don't already have cached — re-running this on every
    // reference-list change (e.g. someone else's CVE reference got added) shouldn't
    // re-fetch and leak a fresh blob URL for favicons we already resolved.
    const withFavicons = refs.filter(r => r.catalogCode === 'URL' && r.faviconUrl && !faviconSrcs.value.has(r.id));
    await Promise.all(withFavicons.map(async (r) => {
      try {
        const blobUrl = await referencesApi.faviconBlobUrl(r.id);
        faviconSrcs.value.set(r.id, blobUrl);
        faviconSrcs.value = new Map(faviconSrcs.value);
      } catch { /* generic icon fallback stays */ }
    }));
  },
  { immediate: true },
);

onUnmounted(() => {
  for (const url of faviconSrcs.value.values()) URL.revokeObjectURL(url);
});

function refCode(ref: RefItem): string {
  const t = ref.title;
  switch (ref.catalogCode) {
    // Bare-numeric ("79") gets the prefix added; already-prefixed titles are normalized to
    // uppercase rather than passed through as-is — a title stored lowercase (e.g. CveEntry.cwes'
    // "cwe-79", CveEntry#setCwes lowercases at write time) must still display as "CWE-79".
    case 'CAPEC': { const bare = t.replace(/^capec-/i, ''); return /^\d+$/.test(bare) ? `CAPEC-${bare}` : t.toUpperCase(); }
    case 'CWE':   { const bare = t.replace(/^cwe-/i, '');   return /^\d+$/.test(bare) ? `CWE-${bare}`   : t.toUpperCase(); }
    case 'OWASP': {
      const [id, year] = t.split(':');
      return year ? `${id} (${year})` : t;
    }
    default: return t;
  }
}

function refRoute(ref: RefItem) {
  switch (ref.catalogCode) {
    case 'CWE':    return { name: 'kb-cwe-detail',              params: { id: ref.title.replace(/^CWE-/i, '') } };
    case 'CAPEC':  return { name: 'kb-capec-detail',            params: { id: ref.title.replace(/^CAPEC-/i, '') } };
    case 'ATT&CK': return { name: 'kb-attack-technique-detail', params: { id: ref.title } };
    case 'CVE':    return { name: 'kb-cve-detail',              params: { id: ref.title } };
    case 'OWASP': {
      const [owaspId, year] = ref.title.split(':');
      if (owaspId && year) return { name: 'kb-owasp-detail', params: { owaspId, year } };
      return { name: 'kb-owasp' };
    }
    default: return null;
  }
}

/** URL references have no internal KB page — "open" navigates to the external site
 *  itself instead of pushing a router route. */
function openRef(item: RefItem) {
  if (item.catalogCode === 'URL') {
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const route = refRoute(item);
  if (route) router.push(route);
}

const CATALOG_COLORS: Record<string, string> = {
  'CWE':    '#8b5cf6',
  'CAPEC':  '#ec4899',
  'ATT&CK': '#f97316',
  'OWASP':  '#3b82f6',
  'CVE':    '#ef4444',
  'URL':    '#64748b',
};

function catalogColor(code: string) {
  return CATALOG_COLORS[code] ?? '#6b7280';
}

function truncateUrl(url: string, n = 60): string {
  if (!url) return '';
  return url.length > n ? url.slice(0, n) + '…' : url;
}

/** "{Title} - {truncated URL}", or just the truncated URL when there's no title. */
function urlLabel(item: RefItem): string {
  const url = truncateUrl(item.url ?? '');
  return item.title ? `${item.title} - ${url}` : url;
}

const CVE_SEV_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#22c55e',
};

function cveSevColor(sev: string): string {
  return CVE_SEV_COLORS[sev?.toUpperCase()] ?? '#6b7280';
}
</script>

<template>
  <div v-if="references.length" class="ref-block">
    <div v-for="[catalog, items] in grouped" :key="catalog" class="ref-group">
      <div class="ref-group-header" :style="{ background: catalogColor(catalog) + '18', borderColor: catalogColor(catalog) + '40' }">
        <span class="ref-group-title" :style="{ color: catalogColor(catalog) }">{{ catalog }}</span>
        <span class="ref-group-count">{{ items.length }}</span>
      </div>
      <div class="ref-group-items">
        <div v-for="item in items" :key="item.id" class="ref-item">
          <span v-if="catalog === 'URL'" class="ref-item-icon">
            <img v-if="faviconSrcs.get(item.id)" :src="faviconSrcs.get(item.id)" class="ref-item-favicon" alt="" />
            <i v-else class="pi pi-globe" />
          </span>
          <span v-else class="ref-item-code">{{ refCode(item) }}</span>
          <span class="ref-item-main">
            <span v-if="catalog === 'URL'" class="ref-item-name">{{ urlLabel(item) }}</span>
            <span v-else-if="item.description" class="ref-item-name">{{ item.description }}</span>
            <span class="ref-item-badges">
              <span
                v-if="catalog === 'CVE' && cveSeverities.get(item.title)"
                class="ref-item-sev"
                :style="{ background: cveSevColor(cveSeverities.get(item.title)!) + '22', color: cveSevColor(cveSeverities.get(item.title)!), borderColor: cveSevColor(cveSeverities.get(item.title)!) + '55' }"
              >{{ cveSeverities.get(item.title)!.toUpperCase() }}</span>
              <KevBadge v-if="catalog === 'CVE'" :status="cveKevStatus.get(item.title)" source="cisa" />
              <KevBadge v-if="catalog === 'CVE'" :status="cveVulncheckKevStatus.get(item.title)" source="vulncheck" />
              <ExploitBadge v-if="catalog === 'CVE'" :cve-id="item.title" :count="cveExploitCount.get(item.title)" />
            </span>
          </span>
          <Button v-if="refRoute(item) || catalog === 'URL'" icon="pi pi-arrow-up-right" text size="small"
            class="ref-item-arrow" v-tooltip.top="'Open'" @click="openRef(item)" />
          <Button v-if="removable" icon="pi pi-trash" text size="small" severity="danger"
            class="ref-item-remove" @click="emit('remove', item)" />
        </div>
      </div>
    </div>
  </div>
  <p v-else class="empty-hint">No references linked.</p>
</template>

<style scoped>
.ref-block { display: flex; flex-direction: column; }

/* .ref-group itself has no padding/border — the colored header band below
   is the only divider between groups, so rows flow directly from one band
   into the next with no dead space in between. */
.ref-group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 -1.25rem;
  padding: 0.4rem 1.25rem;
  border-top: 1px solid transparent;
  border-bottom: 1px solid transparent;
}
/* Flush the very first band against the section header above (cancels the
   card body's own top padding — 1rem in every consuming view). */
.ref-block > .ref-group:first-child .ref-group-header { margin-top: -1rem; }
/* Flush the very last row against the card's bottom edge (cancels the card
   body's own bottom padding — 1.25rem in every consuming view). Consuming
   views add overflow:hidden on the card so this doesn't poke past the
   rounded bottom corners. */
.ref-block > .ref-group:last-child .ref-group-items .ref-item:last-child { margin-bottom: -1.25rem; }
.ref-group-title {
  display: inline-flex;
  align-items: center;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ref-group-count {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ares-text-muted);
}

.ref-group-items { display: flex; flex-direction: column; }

.ref-item {
  display: flex;
  align-items: center;
  gap: 0;
  border-top: 1px solid var(--ares-border);
  min-width: 0;
  margin: 0 -1.25rem;
  padding: 0 1.25rem;
  transition: background 0.1s;
}
.ref-group-items .ref-item:first-child { border-top: none; }
.ref-item:hover { background: color-mix(in srgb, var(--ares-text) 4%, transparent); }

.ref-item-main {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex: 1;
  padding: 0.4rem 0;
  min-width: 0;
  overflow: hidden;
}
.ref-item-badges {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.ref-item-arrow,
.ref-item-remove {
  flex-shrink: 0;
}

.ref-item-code {
  font-family: monospace;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ares-text-2);
  flex: 0 0 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.4rem 0.75rem 0.4rem 0;
  margin-right: 0.75rem;
  border-right: 1px solid var(--ares-border);
  transition: color 0.15s;
}
.ref-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 2.25rem;
  padding: 0.4rem 0.5rem 0.4rem 0;
  margin-right: 0.5rem;
  border-right: 1px solid var(--ares-border);
}
.ref-item-icon .pi-globe {
  font-size: 0.9rem;
  color: var(--ares-text-muted);
}
.ref-item-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: var(--ares-radius);
}
.ref-item-sev {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0.15em 0.5em;
  border-radius: var(--ares-radius);
  border: 1px solid;
  flex-shrink: 0;
  white-space: nowrap;
}
.ref-item-name {
  font-size: 0.82rem;
  color: var(--ares-text-muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ref-item-arrow {
  font-size: 0.65rem;
  color: var(--ares-text-muted);
  flex-shrink: 0;
  margin-left: auto;
}

.empty-hint { font-size: 0.83rem; color: var(--ares-text-muted); padding: 0.75rem 0; margin: 0; }
</style>
