<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import ProgressSpinner from 'primevue/progressspinner';
import ReferencesBlock from '@/components/ReferencesBlock.vue';
import { cweApi, cveApi, capecApi, type CweEntry } from '@/api/kb';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { isMobile } = useBreakpoint();

const route  = useRoute();
const router = useRouter();
const entry  = ref<CweEntry | null>(null);
const loading = ref(true);
const err     = ref<string | null>(null);
const cweNames = ref<Map<string, string>>(new Map());
const cveDescriptions = ref<Map<string, string>>(new Map());
const capecNames = ref<Map<string, string>>(new Map());

const id = route.params.id as string;

// ── Helpers ────────────────────────────────────────────────────────

function externalUrl(code: string) {
  const num = code.replace(/^CWE-/i, '');
  return `https://cwe.mitre.org/data/definitions/${num}.html`;
}
function navCwe(idOrCode: string) {
  router.push({ name: 'kb-cwe-detail', params: { id: String(idOrCode).replace(/^CWE-/i, '') } });
}
function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function mappingTagSeverity(usage: string): string {
  if (usage === 'Allowed') return 'success';
  if (usage === 'Allowed-with-Review') return 'warn';
  if (usage === 'Discouraged') return 'warn';
  if (usage === 'Prohibited') return 'danger';
  return 'secondary';
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

// ── References card — Observed Examples (CVEs) + Related Attack Patterns
// (CAPEC) + URL references, all rendered through the same ReferencesBlock
// every Finding/Detection uses, so CWE gets identical grouped bands, the
// uppercase catalog code column, and (for the CVE group specifically) the
// severity/KEV/exploit badges for free. ──────────────────────────────────
interface RefItem { id: number; catalogCode: string; title: string; description?: string | null; url?: string | null }

const referenceItems = computed<RefItem[]>(() => {
  if (!entry.value) return [];
  const items: RefItem[] = [];
  let i = 0;
  for (const cve of entry.value.observedExamples ?? []) {
    const upper = cve.toUpperCase();
    items.push({ id: i++, catalogCode: 'CVE', title: upper, description: cveDescriptions.value.get(upper) });
  }
  for (const capecId of entry.value.relatedCapecIds ?? []) {
    items.push({ id: i++, catalogCode: 'CAPEC', title: capecId, description: capecNames.value.get(capecId) });
  }
  for (const r of entry.value.references ?? []) items.push({ id: i++, catalogCode: 'URL', title: r.name ?? '', url: r.url });
  return items;
});

// ── Related Weaknesses / Memberships — both are CWE-to-CWE relations,
// segregated by the View each edge was declared under (falling back to an
// "Ungrouped" bucket for view-agnostic edges/legacy rows). ───────────────
const NATURE_LABELS: Record<string, string> = {
  ChildOf: 'Parent',
  ParentOf: 'Child',
  PeerOf: 'Peer',
  CanAlsoBe: 'Can Also Be',
  CanPrecede: 'Can Precede',
  CanFollow: 'Can Follow',
  Requires: 'Requires',
  RequiredBy: 'Required By',
  StartsWith: 'Starts With',
};

interface ViewGroup<T> { key: string; label: string; items: T[] }

function groupByView<T extends { viewId: string | null; viewName: string | null }>(list: T[]): ViewGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const key = item.viewId ?? '__none__';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: key === '__none__' ? 'Ungrouped' : (items[0].viewName ? `${items[0].viewName} (CWE-${key})` : `View CWE-${key}`),
    items,
  }));
}

const relatedWeaknessGroups = computed(() => groupByView(entry.value?.relatedWeaknesses ?? []));
const membershipGroups = computed(() => groupByView(entry.value?.memberships ?? []));

onMounted(async () => {
  try {
    entry.value = await cweApi.get(id);
    const ids = new Set<string>();
    for (const rw of entry.value.relatedWeaknesses ?? []) ids.add(rw.cweId);
    for (const m of entry.value.memberships ?? []) ids.add(m.categoryId);
    if (ids.size) {
      const names = await cweApi.names([...ids]);
      cweNames.value = new Map(names.map(n => [n.id, n.name]));
    }

    const cveIds = (entry.value.observedExamples ?? []).map(c => c.toUpperCase());
    if (cveIds.length) {
      const descs = await cveApi.descriptions(cveIds).catch(() => []);
      cveDescriptions.value = new Map(descs.filter(d => d.description).map(d => [d.id, d.description!]));
    }

    const capecIds = entry.value.relatedCapecIds ?? [];
    if (capecIds.length) {
      const names = await capecApi.names(capecIds).catch(() => []);
      capecNames.value = new Map(names.map(n => [n.id, n.name]));
    }
  } catch { err.value = `CWE not found: ${id}`; }
  finally { loading.value = false; }
});
</script>

<template>
  <div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:4rem;">
      <ProgressSpinner />
    </div>

    <p v-else-if="err" class="empty-hint">{{ err }}</p>

    <template v-else-if="entry">

      <!-- ── Header ──────────────────────────────────────────────── -->
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.25rem;">
        <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
          <Button
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            @click="router.back()"
            style="flex-shrink:0;"
          />
          <div style="min-width:0;">
            <h2 class="ares-page-title" style="margin:0;">{{ entry.name }}</h2>
          </div>
        </div>
        <div style="display:flex; gap:0.5rem; flex-shrink:0;">
          <Button
            icon="pi pi-external-link"
            label="MITRE CWE"
            size="small"
            severity="secondary"
            @click="openExternal(externalUrl(entry.code))"
          />
        </div>
      </div>

      <!-- ── References (2/3, left) | Info + Related Weaknesses + Memberships + Applicable Platforms (1/3, right) ── -->
      <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <div class="detail-grid__data" style="display:flex; flex-direction:column; gap:1.25rem;">

          <!-- References (Observed Examples/CVEs + Related Attack Patterns/CAPEC + URLs) -->
          <div class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header"><span class="section-header-label">References</span></div>
            <div class="detail-grid__body">
              <ReferencesBlock :references="referenceItems" />
            </div>
          </div>
        </div>

        <!-- Info + Related Weaknesses + Memberships + Applicable Platforms -->
        <div class="detail-grid__meta" style="display:flex; flex-direction:column; gap:1.25rem;">
          <div class="ares-card" style="padding:0;">
            <div class="ares-card-section-header"><span class="section-header-label">Info</span></div>
            <div class="detail-grid__body">
              <dl class="ares-dl">
                <dt>ID</dt>
                <dd><span class="entry-code">{{ entry.code }}</span></dd>

                <dt>Type</dt>
                <dd>{{ entry.type ?? '—' }}</dd>

                <dt>Abstraction</dt>
                <dd>{{ entry.abstraction ?? '—' }}</dd>

                <dt>Status</dt>
                <dd>{{ entry.status ?? '—' }}</dd>

                <dt>Likelihood</dt>
                <dd>{{ entry.likelihoodOfExploit ?? '—' }}</dd>

                <dt>Vuln. Mapping</dt>
                <dd>
                  <AresBadge
                    v-if="entry.vulnerabilityMapping"
                    :value="entry.vulnerabilityMapping.usage"
                    :severity="(mappingTagSeverity(entry.vulnerabilityMapping.usage) as any)"
                  />
                  <span v-else style="color:var(--ares-text-muted);">—</span>
                  <p
                    v-if="entry.vulnerabilityMapping?.rationale"
                    class="body-text"
                    style="font-size:0.78rem; margin:0.35rem 0 0;"
                  >{{ entry.vulnerabilityMapping.rationale }}</p>
                </dd>

                <dt>Source</dt>
                <dd>
                  <span v-if="entry.sourceVersion">v{{ entry.sourceVersion }}</span>
                  <span v-else>—</span>
                  <span style="color:var(--ares-text-muted);"> · {{ fmtDate(entry.syncedAt) }}</span>
                </dd>
              </dl>
            </div>
          </div>

          <!-- Related Weaknesses (every Nature, segregated by View) -->
          <div v-if="entry.relatedWeaknesses?.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">Related Weaknesses <span class="section-badge">{{ entry.relatedWeaknesses.length }}</span></span>
            </div>
            <div class="detail-grid__body">
              <div class="ref-block">
                <div v-for="group in relatedWeaknessGroups" :key="group.key" class="ref-group">
                  <div class="ref-group-header">
                    <span class="ref-group-title">{{ group.label }}</span>
                    <span class="ref-group-count">{{ group.items.length }}</span>
                  </div>
                  <div class="ref-group-items">
                    <div
                      v-for="(item, i) in group.items"
                      :key="i"
                      class="ref-item ref-item--nav"
                      @click="navCwe(item.cweId)"
                    >
                      <span class="ref-item-code">CWE-{{ item.cweId }}</span>
                      <span class="ref-item-main">
                        <span v-if="cweNames.get(item.cweId)" class="ref-item-name">{{ cweNames.get(item.cweId) }}</span>
                        <span class="nature-badge">{{ NATURE_LABELS[item.nature] ?? item.nature }}</span>
                      </span>
                      <i class="pi pi-chevron-right ref-item-arrow" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Memberships (Category/View, segregated by View) -->
          <div v-if="entry.memberships?.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">Memberships <span class="section-badge">{{ entry.memberships.length }}</span></span>
            </div>
            <div class="detail-grid__body">
              <div class="ref-block">
                <div v-for="group in membershipGroups" :key="group.key" class="ref-group">
                  <div class="ref-group-header">
                    <span class="ref-group-title">{{ group.label }}</span>
                    <span class="ref-group-count">{{ group.items.length }}</span>
                  </div>
                  <div class="ref-group-items">
                    <div
                      v-for="(m, i) in group.items"
                      :key="i"
                      class="ref-item ref-item--nav"
                      @click="navCwe(m.categoryId)"
                    >
                      <span class="ref-item-code">CWE-{{ m.categoryId }}</span>
                      <span class="ref-item-main">
                        <span v-if="m.categoryName || cweNames.get(m.categoryId)" class="ref-item-name">{{ m.categoryName || cweNames.get(m.categoryId) }}</span>
                      </span>
                      <i class="pi pi-chevron-right ref-item-arrow" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Applicable Platforms -->
          <div v-if="entry.applicablePlatforms?.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">Applicable Platforms <span class="section-badge">{{ entry.applicablePlatforms.length }}</span></span>
            </div>
            <div class="detail-grid__body">
              <div class="badge-row">
                <AresBadge v-for="p in entry.applicablePlatforms" :key="p" :value="p" severity="secondary" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Description ────────────────────────────────────────── -->
      <div class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header"><span class="section-header-label">Description</span></div>
        <div class="detail-grid__body">
          <p class="body-text" style="margin:0;">{{ entry.description ?? 'No description available.' }}</p>
          <p v-if="entry.extendedDescription" class="body-text" style="margin-top:0.6rem; opacity:0.8; margin-bottom:0;">{{ entry.extendedDescription }}</p>
        </div>
      </div>

      <!-- ── Alternate Terms ────────────────────────────────────── -->
      <div v-if="entry.alternateTerms?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Alternate Terms <span class="section-badge">{{ entry.alternateTerms.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <div v-for="(a, i) in entry.alternateTerms" :key="i" class="consequence-item">
            <div style="font-weight:700; font-size:0.85rem; color:var(--ares-text-2);">{{ a.term }}</div>
            <p v-if="a.description" class="body-text" style="font-size:0.8rem; margin:0.2rem 0 0;">{{ a.description }}</p>
          </div>
        </div>
      </div>

      <!-- ── Consequences ───────────────────────────────────────── -->
      <div v-if="entry.consequences?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Consequences <span class="section-badge">{{ entry.consequences.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <div v-for="(c, i) in entry.consequences" :key="i" class="consequence-item">
            <div class="badge-row" style="margin-bottom:0.25rem;">
              <AresBadge v-for="s in c.scopes" :key="s" :value="s" severity="secondary" style="font-size:0.65rem;" />
              <AresBadge v-for="imp in c.impacts" :key="imp" :value="imp" severity="info" style="font-size:0.65rem;" />
              <span v-if="c.likelihood" style="font-size:0.72rem; color:var(--ares-text-muted); align-self:center;">{{ c.likelihood }}</span>
            </div>
            <p v-if="c.note" class="body-text note-text">{{ c.note }}</p>
          </div>
        </div>
      </div>

      <!-- ── Mitigations ────────────────────────────────────────── -->
      <div v-if="entry.mitigations?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Mitigations <span class="section-badge">{{ entry.mitigations.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <div v-for="(m, i) in entry.mitigations" :key="i" class="consequence-item">
            <div class="badge-row" style="margin-bottom:0.25rem;">
              <AresBadge v-for="ph in m.phases" :key="ph" :value="ph" severity="secondary" style="font-size:0.65rem;" />
              <AresBadge v-if="m.strategy" :value="m.strategy" severity="info" style="font-size:0.65rem;" />
              <AresBadge v-if="m.effectiveness" :value="m.effectiveness" severity="warn" style="font-size:0.65rem;" />
            </div>
            <p v-if="m.description" class="body-text" style="font-size:0.8rem; margin:0;">{{ m.description }}</p>
          </div>
        </div>
      </div>

      <!-- ── Detection Methods ──────────────────────────────────── -->
      <div v-if="entry.detectionMethods?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Detection Methods <span class="section-badge">{{ entry.detectionMethods.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <div v-for="(d, i) in entry.detectionMethods" :key="i" class="consequence-item">
            <div class="badge-row" style="margin-bottom:0.25rem;">
              <AresBadge v-if="d.method" :value="d.method" severity="secondary" style="font-size:0.65rem;" />
              <AresBadge v-if="d.effectiveness" :value="d.effectiveness" severity="warn" style="font-size:0.65rem;" />
            </div>
            <p v-if="d.description" class="body-text" style="font-size:0.8rem; margin:0;">{{ d.description }}</p>
          </div>
        </div>
      </div>

      <!-- ── Notes ──────────────────────────────────────────────── -->
      <div v-if="entry.notes?.length" class="ares-card" style="padding:0; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Notes <span class="section-badge">{{ entry.notes.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <div v-for="(n, i) in entry.notes" :key="i" class="consequence-item">
            <AresBadge v-if="n.type" :value="n.type" severity="secondary" style="font-size:0.65rem; margin-bottom:0.3rem;" />
            <p class="body-text" style="font-size:0.8rem; margin:0;">{{ n.text }}</p>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
/* ── Two-column layout (matches FindingDetailView/DetectionDetailView/CVE detail) ── */
.detail-grid { display: flex; gap: 1.25rem; align-items: flex-start; }
.detail-grid__data { flex: 2; order: 1; min-width: 0; }
.detail-grid__meta { flex: 1; order: 2; min-width: 0; }
.detail-grid--stacked { flex-direction: column; align-items: stretch; }
.detail-grid--stacked .detail-grid__meta { order: 1; }
.detail-grid--stacked .detail-grid__data { order: 2; }
.detail-grid__body { padding: 1rem 1.25rem 1.25rem; }

.section-header-label { display: inline-flex; align-items: center; gap: 0.45rem; }
.section-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--ares-radius);
  background: var(--ares-surface-raised); border: 1px solid var(--ares-border);
  font-size: 0.68rem; font-weight: 600; color: var(--ares-text-muted); line-height: 1;
}
.entry-code { font-family:monospace; font-size:0.78rem; font-weight:700; background:var(--ares-surface-raised); border:1px solid var(--ares-border); border-radius: var(--ares-radius); padding:0.1em 0.55em; color:var(--ares-text-2); }
.body-text { font-size:0.88rem; line-height:1.75; color:var(--ares-text-2); }
.badge-row { display:flex; flex-wrap:wrap; gap:0.4rem; }

.ares-dl { display: grid; grid-template-columns: 110px 1fr; gap: 0.4rem 1rem; font-size: 0.85rem; }
.ares-dl dt { color: var(--ares-text-muted); font-size: 0.8rem; padding-top: 0.1rem; }
.ares-dl dd { margin: 0; color: var(--ares-text-2); line-height: 1.5; }

.empty-hint { font-size:0.83rem; color:var(--ares-text-muted); padding:0.75rem 0; margin:0; }

.consequence-item {
  border-left: 2px solid var(--ares-border);
  padding-left: 0.75rem;
  margin-bottom: 0.6rem;
}
.consequence-item:last-child { margin-bottom: 0; }
.note-text {
  font-size: 0.8rem;
  font-style: italic;
  color: var(--ares-text-muted);
  margin: 0.3rem 0 0;
}
.note-text::before { content: 'Note: '; font-style: normal; font-weight: 600; }

/* ── Grouped nav lists (Related Weaknesses / Memberships), mirrors
   ReferencesBlock's own band+row look so the sidebar reads consistently
   with the main References card next to it. ─────────────────────────── */
.ref-block { display: flex; flex-direction: column; }
.ref-group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 -1.25rem;
  padding: 0.4rem 1.25rem;
  background: var(--ares-surface-2);
  border-top: 1px solid var(--ares-border);
  border-bottom: 1px solid var(--ares-border);
}
.ref-block > .ref-group:first-child .ref-group-header { margin-top: -1rem; border-top: none; }
.ref-block > .ref-group:last-child .ref-group-items .ref-item:last-child { margin-bottom: -1.25rem; }
.ref-group-title {
  display: inline-flex;
  align-items: center;
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ref-group-count { font-size: 0.66rem; font-weight: 600; color: var(--ares-text-muted); flex-shrink: 0; }

.ref-group-items { display: flex; flex-direction: column; }

.ref-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-top: 1px solid var(--ares-border);
  min-width: 0;
  margin: 0 -1.25rem;
  padding: 0.5rem 1.25rem;
  transition: background 0.1s;
}
.ref-group-items .ref-item:first-child { border-top: none; }
.ref-item--nav { cursor: pointer; }
.ref-item--nav:hover { background: color-mix(in srgb, var(--ares-text) 4%, transparent); }
.ref-item--nav:hover .ref-item-code { color: var(--p-primary-400); }

.ref-item-code {
  font-family: monospace;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ares-text-2);
  flex-shrink: 0;
  transition: color 0.15s;
}
.ref-item-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.ref-item-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.nature-badge {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.1em 0.45em;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-muted);
  white-space: nowrap;
}
.ref-item-arrow {
  font-size: 0.68rem;
  color: var(--ares-text-muted);
  flex-shrink: 0;
  margin-left: auto;
}
</style>
