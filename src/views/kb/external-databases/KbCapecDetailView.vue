<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import ProgressSpinner from 'primevue/progressspinner';
import SeverityTag from '@/components/SeverityTag.vue';
import ReferencesBlock from '@/components/ReferencesBlock.vue';
import { capecApi, cweApi, attackApi, type CapecEntry, type KbNameDto } from '@/api/kb';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { isMobile } = useBreakpoint();

const route  = useRoute();
const router = useRouter();
const entry       = ref<CapecEntry | null>(null);
const loading     = ref(true);
const err         = ref<string | null>(null);
const cweNames    = ref<Map<string, string>>(new Map());
const attackNames = ref<Map<string, string>>(new Map());
const capecNames  = ref<Map<string, string>>(new Map());

const id = route.params.id as string;

function externalUrl(capecId: string) {
  return `https://capec.mitre.org/data/definitions/${capecId}.html`;
}
function navCapec(cid: string) {
  router.push({ name: 'kb-capec-detail', params: { id: String(cid) } });
}
function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

// ── References card — related CWE weaknesses + related ATT&CK techniques +
// URL references, all through the same ReferencesBlock Findings/Detections/CWE
// use, so CAPEC gets the identical grouped-band look with resolved titles. ──
interface RefItem { id: number; catalogCode: string; title: string; description?: string | null; url?: string | null }

const referenceItems = computed<RefItem[]>(() => {
  if (!entry.value) return [];
  const items: RefItem[] = [];
  let i = 0;
  for (const cid of entry.value.relatedCweIds ?? []) {
    const bare = cid.replace(/^CWE-/i, '');
    items.push({ id: i++, catalogCode: 'CWE', title: `CWE-${bare}`, description: cweNames.value.get(bare) });
  }
  for (const tid of entry.value.relatedAttackTechniqueIds ?? []) {
    items.push({ id: i++, catalogCode: 'ATT&CK', title: tid, description: attackNames.value.get(tid) });
  }
  for (const r of entry.value.references ?? []) {
    items.push({ id: i++, catalogCode: 'URL', title: r.name ?? '', url: r.url });
  }
  return items;
});

// ── Related Attack Patterns (CAPEC hierarchy) — every Nature, grouped. No
// "View" concept exists for CAPEC the way it does for CWE, so this is a flat
// nature-keyed grouping instead of CWE's view-primary one. ──────────────────
const NATURE_LABELS: Record<string, string> = {
  ChildOf: 'Parent',
  ParentOf: 'Child',
  PeerOf: 'Peer',
  CanAlsoBe: 'Can Also Be',
  CanPrecede: 'Can Precede',
  CanFollow: 'Can Follow',
};
const NATURE_ORDER = Object.keys(NATURE_LABELS);

interface RelatedGroup { nature: string; label: string; items: { capecId: string; nature: string }[] }

const relatedPatternGroups = computed<RelatedGroup[]>(() => {
  const list = entry.value?.relatedAttackPatterns ?? [];
  const byNature = new Map<string, { capecId: string; nature: string }[]>();
  for (const r of list) {
    if (!byNature.has(r.nature)) byNature.set(r.nature, []);
    byNature.get(r.nature)!.push(r);
  }
  const orderedKeys = [
    ...NATURE_ORDER.filter(n => byNature.has(n)),
    ...[...byNature.keys()].filter(n => !NATURE_ORDER.includes(n)),
  ];
  return orderedKeys.map(nature => ({ nature, label: NATURE_LABELS[nature] ?? nature, items: byNature.get(nature)! }));
});

onMounted(async () => {
  try {
    const e = await capecApi.get(id);
    entry.value = e;
    const bareCweIds = (e.relatedCweIds ?? []).map(c => c.replace(/^CWE-/i, ''));
    const allCapecIds = [...new Set((e.relatedAttackPatterns ?? []).map(r => r.capecId))];
    const [cweList, attackList, capecList] = await Promise.all([
      cweApi.names(bareCweIds),
      attackApi.techniqueNames(e.relatedAttackTechniqueIds ?? []),
      capecApi.names(allCapecIds),
    ]);
    cweNames.value    = new Map(cweList.map((n: KbNameDto) => [n.id, n.name]));
    attackNames.value = new Map(attackList.map((n: KbNameDto) => [n.id, n.name]));
    capecNames.value  = new Map(capecList.map((n: KbNameDto) => [n.id, n.name]));
  } catch { err.value = `CAPEC not found: ${id}`; }
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
            label="MITRE CAPEC"
            size="small"
            severity="secondary"
            @click="openExternal(externalUrl(entry.capecId))"
          />
        </div>
      </div>

      <!-- ── References (2/3, left) | Info + Related Attack Patterns (1/3, right) ── -->
      <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <div class="detail-grid__data" style="display:flex; flex-direction:column; gap:1.25rem;">

          <!-- References (CWE Weaknesses + ATT&CK Techniques + URLs) -->
          <div class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header"><span class="section-header-label">References</span></div>
            <div class="detail-grid__body">
              <ReferencesBlock :references="referenceItems" />
            </div>
          </div>
        </div>

        <!-- Info + Related Attack Patterns -->
        <div class="detail-grid__meta" style="display:flex; flex-direction:column; gap:1.25rem;">
          <div class="ares-card" style="padding:0;">
            <div class="ares-card-section-header"><span class="section-header-label">Info</span></div>
            <div class="detail-grid__body">
              <dl class="ares-dl">
                <dt>ID</dt>
                <dd><span class="entry-code">{{ entry.code }}</span></dd>

                <dt>Abstraction</dt>
                <dd>{{ entry.abstraction ?? '—' }}</dd>

                <dt>Status</dt>
                <dd>{{ entry.status ?? '—' }}</dd>

                <dt>Severity</dt>
                <dd><SeverityTag v-if="entry.typicalSeverity" :level="entry.typicalSeverity" :display-label="entry.typicalSeverity" /><span v-else style="color:var(--ares-text-muted);">—</span></dd>

                <dt>Likelihood</dt>
                <dd><SeverityTag v-if="entry.likelihoodOfAttack" :level="entry.likelihoodOfAttack" :display-label="entry.likelihoodOfAttack" /><span v-else style="color:var(--ares-text-muted);">—</span></dd>

                <dt v-if="entry.domains?.length">Domains</dt>
                <dd v-if="entry.domains?.length">
                  <div class="badge-row">
                    <AresBadge v-for="d in entry.domains" :key="d" :value="d" severity="secondary" />
                  </div>
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

          <!-- Related Attack Patterns (CAPEC hierarchy, every Nature) -->
          <div v-if="entry.relatedAttackPatterns?.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">Related Attack Patterns <span class="section-badge">{{ entry.relatedAttackPatterns.length }}</span></span>
            </div>
            <div class="detail-grid__body">
              <div class="ref-block">
                <div v-for="group in relatedPatternGroups" :key="group.nature" class="ref-group">
                  <div class="ref-group-header">
                    <span class="ref-group-title">{{ group.label }}</span>
                    <span class="ref-group-count">{{ group.items.length }}</span>
                  </div>
                  <div class="ref-group-items">
                    <div
                      v-for="(item, i) in group.items"
                      :key="i"
                      class="ref-item ref-item--nav"
                      @click="navCapec(item.capecId)"
                    >
                      <span class="ref-item-code">CAPEC-{{ item.capecId }}</span>
                      <span class="ref-item-main">
                        <span v-if="capecNames.get(item.capecId)" class="ref-item-name">{{ capecNames.get(item.capecId) }}</span>
                      </span>
                      <i class="pi pi-chevron-right ref-item-arrow" />
                    </div>
                  </div>
                </div>
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

      <!-- ── Prerequisites ──────────────────────────────────────── -->
      <div v-if="entry.prerequisites?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Prerequisites <span class="section-badge">{{ entry.prerequisites.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <ul class="plain-list">
            <li v-for="(p, i) in entry.prerequisites" :key="i" class="body-text">{{ p }}</li>
          </ul>
        </div>
      </div>

      <!-- ── Mitigations ────────────────────────────────────────── -->
      <div v-if="entry.mitigations?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Mitigations <span class="section-badge">{{ entry.mitigations.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <ul class="plain-list">
            <li v-for="(m, i) in entry.mitigations" :key="i" class="body-text">{{ m }}</li>
          </ul>
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

      <!-- ── Execution Flow ─────────────────────────────────────── -->
      <div v-if="entry.executionFlow?.length" class="ares-card" style="padding:0; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Execution Flow <span class="section-badge">{{ entry.executionFlow.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <div v-for="(s, i) in entry.executionFlow" :key="i" class="consequence-item">
            <div class="badge-row" style="margin-bottom:0.25rem; align-items:center;">
              <span style="font-weight:700; font-size:0.8rem; color:var(--ares-text-2);">Step {{ s.step }}</span>
              <AresBadge v-if="s.phase" :value="s.phase" severity="secondary" style="font-size:0.65rem;" />
            </div>
            <p v-if="s.description" class="body-text" style="font-size:0.8rem; margin:0;">{{ s.description }}</p>
            <ul v-if="s.techniques?.length" class="plain-list" style="margin-top:0.4rem;">
              <li v-for="(t, ti) in s.techniques" :key="ti" class="body-text" style="font-size:0.8rem;">{{ t }}</li>
            </ul>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
/* ── Two-column layout (matches FindingDetailView/DetectionDetailView/CVE/CWE detail) ── */
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
.plain-list { margin: 0; padding: 0 0 0 1.1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.consequence-item { border-left: 2px solid var(--ares-border); padding-left: 0.75rem; margin-bottom: 0.6rem; }
.consequence-item:last-child { margin-bottom: 0; }
.note-text {
  font-size: 0.8rem;
  font-style: italic;
  color: var(--ares-text-muted);
  margin: 0.3rem 0 0;
}
.note-text::before { content: 'Note: '; font-style: normal; font-weight: 600; }

/* ── Grouped nav list (Related Attack Patterns), mirrors ReferencesBlock's
   own band+row look so the sidebar reads consistently with References. ──── */
.ref-block { display: flex; flex-direction: column; }
.ref-group-header {
  display: flex; align-items: center; gap: 0.5rem;
  margin: 0 -1.25rem; padding: 0.4rem 1.25rem;
  background: var(--ares-surface-2);
  border-top: 1px solid var(--ares-border); border-bottom: 1px solid var(--ares-border);
}
.ref-block > .ref-group:first-child .ref-group-header { margin-top: -1rem; border-top: none; }
.ref-block > .ref-group:last-child .ref-group-items .ref-item:last-child { margin-bottom: -1.25rem; }
.ref-group-title { display: inline-flex; align-items: center; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ares-text-muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ref-group-count { font-size: 0.66rem; font-weight: 600; color: var(--ares-text-muted); flex-shrink: 0; }
.ref-group-items { display: flex; flex-direction: column; }
.ref-item { display: flex; align-items: center; gap: 0.5rem; border-top: 1px solid var(--ares-border); min-width: 0; margin: 0 -1.25rem; padding: 0.5rem 1.25rem; transition: background 0.1s; }
.ref-group-items .ref-item:first-child { border-top: none; }
.ref-item--nav { cursor: pointer; }
.ref-item--nav:hover { background: color-mix(in srgb, var(--ares-text) 4%, transparent); }
.ref-item--nav:hover .ref-item-code { color: var(--p-primary-400); }
.ref-item-code { font-family: monospace; font-size: 0.78rem; font-weight: 700; color: var(--ares-text-2); flex-shrink: 0; transition: color 0.15s; }
.ref-item-main { display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; flex: 1; min-width: 0; overflow: hidden; }
.ref-item-name { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.ref-item-arrow { font-size: 0.68rem; color: var(--ares-text-muted); flex-shrink: 0; margin-left: auto; }
</style>
