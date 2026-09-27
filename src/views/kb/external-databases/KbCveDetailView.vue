<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import ProgressSpinner from 'primevue/progressspinner';
import { cveApi, cweApi, cisaKevApi, vulncheckKevApi, type CveEntry, type CveScore, type KbNameDto, type CisaKevEntry, type VulnCheckKevEntry, type CveAffectedProduct, type CveVersionRange } from '@/api/kb';
import KevBadge from '@/components/KevBadge.vue';
import ExploitBadge from '@/components/ExploitBadge.vue';
import { exploitsApi } from '@/api/kb-exploits';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getCisaSsvcLabels, type CisaSsvcLabels } from '@/utils/cisaSsvcLabels';

const { isMobile } = useBreakpoint();

const route  = useRoute();
const router = useRouter();
const entry    = ref<CveEntry | null>(null);
const loading  = ref(true);
const err      = ref<string | null>(null);
const exploitCount = ref<number>(0);
const cweNames = ref<Map<string, string>>(new Map());
const kev      = ref<CisaKevEntry | null>(null);
const vcKev    = ref<VulnCheckKevEntry | null>(null);
const ssvcLabels = ref<CisaSsvcLabels | null>(null);

const id = route.params.id as string;

// ── Helpers ────────────────────────────────────────────────────────

function scoreTag(score: number | null): string {
  if (score == null) return 'secondary';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >  0.0) return 'low';
  return 'info';
}

function defaultScore(e: CveEntry): CveScore | undefined {
  return e.cvssScores?.find(s => s.isDefault);
}

function ssvcOption(dp: keyof CisaSsvcLabels, code: string | null) {
  if (!code) return null;
  return ssvcLabels.value?.[dp]?.options[code] ?? null;
}

function navCwe(cwe: string) {
  router.push({ name: 'kb-cwe-detail', params: { id: String(cwe).replace(/^CWE-/i, '') } });
}

/** CveEntry.cwes is stored lowercase ("cwe-770" — CveEntry#setCwes lowercases at write time,
 *  same case-insensitive-storage convention AQL string comparisons rely on elsewhere) — this is a
 *  display-only formatter so the reference list always reads "CWE-770" regardless of the raw
 *  stored casing. */
function cweDisplayCode(cwe: string): string {
  const bare = String(cwe).replace(/^cwe-/i, '');
  return /^\d+$/.test(bare) ? `CWE-${bare}` : String(cwe).toUpperCase();
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function nvdUrl(cveId: string)   { return `https://nvd.nist.gov/vuln/detail/${cveId}`; }
function mitreUrl(cveId: string) { return `https://www.cve.org/CVERecord?id=${cveId}`; }

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

// ── Affected products: group each product's version ranges by status (affected/
// unaffected/…) and render them the way cve.org does, instead of a flat joined string —
// a CVE's versions[] array mixes affected and unaffected ranges (and CNAs like the Linux
// kernel emit one entry per fix commit/branch), so a plain join is unreadable and loses
// exactly the information ("is this range affected or not") that matters.
interface VersionGroup { status: string; ranges: CveVersionRange[]; }
const STATUS_ORDER = ['affected', 'unaffected'];

function groupedVersions(p: CveAffectedProduct): VersionGroup[] {
  const groups = new Map<string, CveVersionRange[]>();
  for (const v of p.versions ?? []) {
    const key = v.status ?? 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  const orderedKeys = [
    ...STATUS_ORDER.filter(k => groups.has(k)),
    ...[...groups.keys()].filter(k => !STATUS_ORDER.includes(k)),
  ];
  return orderedKeys.map(status => ({ status, ranges: groups.get(status)! }));
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function rangeLabel(v: CveVersionRange): string {
  const start = v.version && v.version.trim() ? v.version : '?';
  if (v.lessThan) return `from ${start} before ${v.lessThan}`;
  if (v.lessThanOrEqual) return `from ${start} through ${v.lessThanOrEqual}`;
  return `at ${start}`;
}

onMounted(async () => {
  try {
    const e = await cveApi.get(id);
    entry.value = e;
    const names = await cweApi.names(e.cwes ?? []);
    cweNames.value = new Map(names.map((n: KbNameDto) => [n.id, n.name]));
    kev.value = await cisaKevApi.get(e.cveId).catch(() => null);
    vcKev.value = await vulncheckKevApi.get(e.cveId).catch(() => null);
    const exploitStatus = await exploitsApi.status([e.cveId]).catch(() => []);
    exploitCount.value = exploitStatus[0]?.count ?? 0;
    if (e.ssvc) ssvcLabels.value = await getCisaSsvcLabels().catch(() => null);
  } catch { err.value = `CVE not found: ${id}`; }
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
            @click="router.push({ name: 'kb-cve' })"
            style="flex-shrink:0;"
          />
          <div style="min-width:0;">
            <h2 class="ares-page-title" style="margin:0;">{{ entry.cveId }}</h2>
          </div>
        </div>

        <!-- External links -->
        <div style="display:flex; gap:0.5rem; flex-shrink:0;">
          <Button
            icon="pi pi-external-link"
            label="NVD"
            size="small"
            severity="secondary"
            @click="openExternal(nvdUrl(entry.cveId))"
          />
          <Button
            icon="pi pi-external-link"
            label="MITRE"
            size="small"
            severity="secondary"
            @click="openExternal(mitreUrl(entry.cveId))"
          />
        </div>
      </div>

      <!-- ── Scores + References (2/3, left) | Metadata + Affected Products (1/3, right) ── -->
      <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <div class="detail-grid__data" style="display:flex; flex-direction:column; gap:1.25rem;">

          <!-- Scores -->
          <div class="ares-card" style="padding:0;">
            <div class="ares-card-section-header">
              <span class="section-header-label">
                Priorization
                <span v-if="entry.cvssScores?.length" class="section-badge">{{ entry.cvssScores.length }}</span>
              </span>
            </div>
            <div class="detail-grid__body">
              <div v-if="entry.cvssScores?.length" class="score-list">
                <div
                  v-for="s in entry.cvssScores"
                  :key="`${s.source}-${s.version}`"
                  class="score-row"
                >
                  <AresBadge
                    :value="s.score != null ? s.score.toFixed(1) : '—'"
                    :severity="(scoreTag(s.score) as any)"
                    style="font-size:1.1rem; font-weight:800;"
                  />
                  <div style="flex:1; min-width:0;">
                    <div class="score-type">
                      CVSS {{ s.version ?? '—' }}
                      <span class="role-chip" :class="s.sourceRole === 'ADP' ? 'role-adp' : 'role-cna'">
                        {{ s.sourceRole }}
                      </span>
                    </div>
                    <div v-if="s.source" class="score-source">{{ s.source }}</div>
                    <div v-if="s.severity" class="score-source">{{ s.severity }}</div>
                    <div v-if="s.vector" class="score-vector">{{ s.vector }}</div>
                  </div>
                  <span v-if="s.isDefault" class="default-badge">authority</span>
                </div>
              </div>
              <p v-else class="empty-hint">No CVSS scores available.</p>

              <!-- CISA's own SSVC assessment, when published — display-only, no computed
                   outcome (CISA doesn't publish one either). CVSS remains the severity source. -->
              <div v-if="entry.ssvc" class="ssvc-block">
                <div class="ssvc-block-header">SSVC — {{ entry.ssvc.role ?? 'CISA Coordinator' }}</div>
                <div class="ssvc-chips">
                  <span class="ssvc-chip" :title="ssvcOption('exploitation', entry.ssvc.exploitation)?.helpText ?? undefined">
                    <span class="ssvc-chip-label">{{ ssvcLabels?.exploitation?.name ?? 'Exploitation' }}</span>
                    <span class="ssvc-chip-value">{{ ssvcOption('exploitation', entry.ssvc.exploitation)?.label ?? entry.ssvc.exploitation ?? '—' }}</span>
                  </span>
                  <span class="ssvc-chip" :title="ssvcOption('automatable', entry.ssvc.automatable)?.helpText ?? undefined">
                    <span class="ssvc-chip-label">{{ ssvcLabels?.automatable?.name ?? 'Automatable' }}</span>
                    <span class="ssvc-chip-value">{{ ssvcOption('automatable', entry.ssvc.automatable)?.label ?? entry.ssvc.automatable ?? '—' }}</span>
                  </span>
                  <span class="ssvc-chip" :title="ssvcOption('technicalImpact', entry.ssvc.technicalImpact)?.helpText ?? undefined">
                    <span class="ssvc-chip-label">{{ ssvcLabels?.technicalImpact?.name ?? 'Technical Impact' }}</span>
                    <span class="ssvc-chip-value">{{ ssvcOption('technicalImpact', entry.ssvc.technicalImpact)?.label ?? entry.ssvc.technicalImpact ?? '—' }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- References (CWE Weaknesses + URLs) -->
          <div class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">References</span>
            </div>
            <div class="detail-grid__body">
              <div v-if="entry.cwes?.length || entry.references?.length" class="ref-block">

                <div v-if="entry.cwes?.length" class="ref-group">
                  <div class="ref-group-header" style="background:#8b5cf618; border-color:#8b5cf640;">
                    <span class="ref-group-title" style="color:#8b5cf6;">CWE Weaknesses</span>
                    <span class="ref-group-count">{{ entry.cwes.length }}</span>
                  </div>
                  <div class="ref-group-items">
                    <div
                      v-for="c in entry.cwes"
                      :key="c"
                      class="ref-item ref-item--nav"
                      @click="navCwe(c)"
                    >
                      <span class="ref-item-code">{{ cweDisplayCode(c) }}</span>
                      <span class="ref-item-main">
                        <span v-if="cweNames.get(c.replace(/^CWE-/i, ''))" class="ref-item-name">{{ cweNames.get(c.replace(/^CWE-/i, '')) }}</span>
                      </span>
                      <i class="pi pi-chevron-right ref-item-arrow" />
                    </div>
                  </div>
                </div>

                <div v-if="entry.references?.length" class="ref-group">
                  <div class="ref-group-header">
                    <span class="ref-group-title">URLs</span>
                    <span class="ref-group-count">{{ entry.references.length }}</span>
                  </div>
                  <div class="ref-group-items">
                    <a
                      v-for="(r, i) in entry.references"
                      :key="i"
                      :href="r.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="ref-item ref-item--link"
                    >
                      <span class="ref-item-main ref-item-main--stack">
                        <span class="ref-item-name">{{ r.name || r.url }}</span>
                        <span v-if="r.name && r.name !== r.url" class="ref-item-url">{{ r.url }}</span>
                      </span>
                      <span v-if="r.tags?.length" class="ref-tags">
                        <span v-for="t in r.tags" :key="t" class="ref-tag">{{ t }}</span>
                      </span>
                      <i class="pi pi-external-link ref-item-arrow" />
                    </a>
                  </div>
                </div>

              </div>
              <p v-else class="empty-hint">No references linked.</p>
            </div>
          </div>
        </div>

        <!-- Metadata -->
        <div class="detail-grid__meta" style="display:flex; flex-direction:column; gap:1.25rem;">
          <div class="ares-card" style="padding:0;">
            <div class="ares-card-section-header"><span class="section-header-label">Info</span></div>
            <div class="detail-grid__body">
              <dl class="ares-dl">
                <template v-if="entry.state && entry.state !== 'PUBLISHED'">
                  <dt>State</dt>
                  <dd>
                    <span
                      class="state-chip"
                      :class="entry.state === 'REJECTED' ? 'state-chip--rejected' : 'state-chip--other'"
                    >{{ entry.state }}</span>
                  </dd>
                </template>

                <dt>Severity</dt>
                <dd style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                  <SeverityTag v-if="entry.severity" :level="entry.severity" />
                  <span v-else style="color:var(--ares-text-muted);">—</span>
                  <span v-if="defaultScore(entry)" class="score-inline">
                    {{ defaultScore(entry)!.score?.toFixed(1) }}
                    <span class="score-inline-ver">CVSS {{ defaultScore(entry)!.version }}</span>
                  </span>
                </dd>

                <dt>Published</dt>
                <dd>{{ fmtDate(entry.publishedAt) }}</dd>

                <dt>Last modified</dt>
                <dd>{{ fmtDate(entry.lastModifiedAt) }}</dd>

                <dt>KEV</dt>
                <dd style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                  <KevBadge v-if="kev" :status="kev" source="cisa" />
                  <KevBadge v-if="vcKev" :status="vcKev" source="vulncheck" />
                  <span v-if="!kev && !vcKev" style="color:var(--ares-text-muted);">—</span>
                </dd>

                <dt>Exploits</dt>
                <dd>
                  <ExploitBadge :cve-id="entry.cveId" :count="exploitCount" />
                  <span v-if="!exploitCount" style="color:var(--ares-text-muted);">—</span>
                </dd>
              </dl>
            </div>
          </div>

          <!-- Affected Products -->
          <div v-if="entry.affectedProducts?.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">Affected Products <span class="section-badge">{{ entry.affectedProducts.length }}</span></span>
            </div>
            <div class="detail-grid__body">
              <div
                v-for="(p, i) in entry.affectedProducts"
                :key="i"
                class="product-block"
              >
                <div class="product-header">
                  <span class="product-vendor">{{ p.vendor ?? '—' }}</span>
                  <span class="product-name">{{ p.product ?? '—' }}</span>
                </div>
                <p v-if="!p.versions?.length" class="empty-hint" style="padding:0.2rem 0 0.5rem;">No version data.</p>
                <div v-for="group in groupedVersions(p)" :key="group.status" class="version-group">
                  <p class="version-group-label" :class="`status-${group.status}`">{{ statusLabel(group.status) }}</p>
                  <ul class="version-list">
                    <li v-for="(v, vi) in group.ranges" :key="vi">{{ rangeLabel(v) }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Description ────────────────────────────────────────── -->
      <div class="ares-card" style="padding:0; overflow:hidden;">
        <div class="ares-card-section-header"><span class="section-header-label">Description</span></div>
        <div class="detail-grid__body">
          <p class="body-text" style="white-space:pre-line; margin:0;">
            {{ entry.description ?? 'No description available.' }}
          </p>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
/* ── Two-column layout (matches FindingDetailView/DetectionDetailView) ── */
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

.ares-dl { display: grid; grid-template-columns: 110px 1fr; gap: 0.4rem 1rem; font-size: 0.85rem; }
.ares-dl dt { color: var(--ares-text-muted); font-size: 0.8rem; padding-top: 0.1rem; }
.ares-dl dd { margin: 0; color: var(--ares-text-2); line-height: 1.5; }

/* ── State chip ──────────────────────────────────────────────────── */
.state-chip {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: var(--ares-radius);
  border: 1px solid;
  letter-spacing: 0.04em;
}
.state-chip--rejected { color: #ef4444; border-color: #ef4444; background: #ef444418; }
.state-chip--other    { color: #f59e0b; border-color: #f59e0b; background: #f59e0b18; }

/* ── Inline score ──────────────────────────────────────────────────── */
.score-inline {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ares-text-2);
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
}
.score-inline-ver {
  font-size: 0.68rem;
  font-weight: 400;
  color: var(--ares-text-muted);
  font-family: monospace;
}

/* ── Score list (flowing rows, matches FindingDetailView) ─────────── */
.score-list { display: flex; flex-direction: column; }
.score-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--ares-border);
  min-width: 0;
  max-width: 100%;
}
.score-list > .score-row:first-child { padding-top: 0; }
.score-list > .score-row:last-child { padding-bottom: 0; border-bottom: none; }
.score-type   { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-2); display: flex; align-items: center; gap: 0.4rem; }
.score-source { font-size: 0.72rem; color: var(--ares-text-muted); margin-top: 0.1rem; }
.score-vector { font-family: monospace; font-size: 0.62rem; color: var(--ares-text-muted); margin-top: 0.1rem; overflow-wrap: break-word; word-break: break-all; }
.default-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 35%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1em 0.4em;
  white-space: nowrap;
}

/* ── Role chip ───────────────────────────────────────────────────── */
.role-chip {
  font-size: 0.6rem;
  font-weight: 700;
  font-family: monospace;
  padding: 0.1rem 0.35rem;
  border-radius: var(--ares-radius);
  border: 1px solid;
}
.role-adp { color: #3b82f6; border-color: #3b82f6; }
.role-cna { color: #8b5cf6; border-color: #8b5cf6; }

/* ── SSVC (CISA's own assessment) ───────────────────────────────────── */
.ssvc-block {
  padding-top: 0.85rem;
  margin-top: 0.85rem;
  border-top: 1px solid var(--ares-border);
}
.ssvc-block-header {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  margin-bottom: 0.5rem;
}
.ssvc-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.ssvc-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
}
.ssvc-chip-label { color: var(--ares-text-muted); font-weight: 600; }
.ssvc-chip-value { color: var(--ares-text-2); font-weight: 700; }

.body-text {
  font-size: 0.88rem;
  line-height: 1.75;
  color: var(--ares-text-2);
}

/* ── References (grouped bands, mirrors ReferencesBlock.vue) ──────── */
.ref-block { display: flex; flex-direction: column; }
.ref-group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 -1.25rem;
  padding: 0.4rem 1.25rem;
  border-top: 1px solid transparent;
  border-bottom: 1px solid transparent;
  background: var(--ares-surface-2);
  border-color: var(--ares-border);
}
.ref-block > .ref-group:first-child .ref-group-header { margin-top: -1rem; }
.ref-block > .ref-group:last-child .ref-group-items .ref-item:last-child { margin-bottom: -1.25rem; }
.ref-group-title {
  display: inline-flex;
  align-items: center;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
}
.ref-group-count { font-size: 0.68rem; font-weight: 600; color: var(--ares-text-muted); }

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
  text-decoration: none;
  color: inherit;
}
.ref-group-items .ref-item:first-child { border-top: none; }
.ref-item--nav, .ref-item--link { cursor: pointer; }
.ref-item:hover { background: color-mix(in srgb, var(--ares-text) 4%, transparent); }
.ref-item:hover .ref-item-name { color: var(--p-primary-400); }

.ref-item-main {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex: 1;
  padding: 0.6rem 0;
  min-width: 0;
  overflow: hidden;
}
.ref-item-main--stack { flex-direction: column; align-items: flex-start; gap: 0.15rem; }

.ref-item-code {
  font-family: monospace;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ares-text-2);
  flex: 0 0 6.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.6rem 0.75rem 0.6rem 0;
  margin-right: 0.75rem;
  border-right: 1px solid var(--ares-border);
  transition: color 0.15s;
}
.ref-item-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ares-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  transition: color 0.15s;
}
.ref-item-url {
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--ares-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.ref-item-arrow {
  font-size: 0.7rem;
  color: var(--ares-text-muted);
  flex-shrink: 0;
  margin-left: auto;
}
.ref-tags { display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center; flex-shrink: 0; margin-right: 0.6rem; }
.ref-tag { font-size: 0.62rem; font-family: monospace; padding: 0.1rem 0.4rem; border: 1px solid var(--ares-border); border-radius: var(--ares-radius); color: var(--ares-text-muted); white-space: nowrap; }

/* ── Affected products (one block per product, edge-to-edge) ──────── */
.product-block {
  margin: 0 -1.25rem;
  padding: 0.6rem 1.25rem;
  border-top: 1px solid var(--ares-border);
}
.product-block:first-child { border-top: none; }
.product-block:last-child { margin-bottom: -1.25rem; }
.product-header { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
.product-vendor { font-size: 0.78rem; font-weight: 600; color: var(--ares-text-muted); flex-shrink: 0; }
.product-name   { font-size: 0.85rem; font-weight: 600; color: var(--ares-text-2); flex: 1; }

.version-group { margin-top: 0.5rem; }
.version-group-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.2rem;
  color: var(--ares-text-muted);
}
.version-group-label.status-affected   { color: var(--ares-error); }
.version-group-label.status-unaffected { color: var(--ares-success); }
.version-list {
  margin: 0;
  padding-left: 1.1rem;
  list-style: disc;
  font-family: monospace;
  font-size: 0.72rem;
  color: var(--ares-text-2);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* ── Empty hint ──────────────────────────────────────────────────── */
.empty-hint { font-size: 0.83rem; color: var(--ares-text-muted); padding: 0.75rem 0; margin: 0; }
</style>
