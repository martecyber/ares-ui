<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import ProgressSpinner from 'primevue/progressspinner';
import ReferencesBlock from '@/components/ReferencesBlock.vue';
import { attackApi, type AttackTechnique, type AttackMitigation, type KbNameDto } from '@/api/kb';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { isMobile } = useBreakpoint();

const route  = useRoute();
const router = useRouter();
const entry  = ref<AttackTechnique | null>(null);
const loading = ref(true);
const err     = ref<string | null>(null);
const mitigations   = ref<AttackMitigation[]>([]);
const subtechniques = ref<KbNameDto[]>([]);
const parentName    = ref<string | null>(null);

const id     = route.params.id as string;
const matrix = (route.query.matrix as string) || 'enterprise-attack';

function externalUrl(attackId: string) {
  return `https://attack.mitre.org/techniques/${attackId.split('.').join('/')}/`;
}
function navTechnique(attackId: string) {
  router.push({ name: 'kb-attack-technique-detail', params: { id: attackId }, query: { matrix } });
}
function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

const parentAttackId = computed(() => {
  if (!entry.value?.subtechnique) return null;
  return entry.value.attackId.split('.')[0];
});

interface RefItem { id: number; catalogCode: string; title: string; description?: string | null; url?: string | null }
const referenceItems = computed<RefItem[]>(() => {
  if (!entry.value) return [];
  return (entry.value.references ?? []).map((r, i) => ({ id: i, catalogCode: 'URL', title: r.name ?? '', url: r.url }));
});

onMounted(async () => {
  try {
    const e = await attackApi.getTechnique(id, matrix as any);
    entry.value = e;

    mitigations.value = await attackApi.techniqueMitigations(id, matrix as any).catch(() => []);

    if (e.subtechnique) {
      const parentId = e.attackId.split('.')[0];
      const names = await attackApi.techniqueNames([parentId]).catch(() => []);
      parentName.value = names[0]?.name ?? null;
    } else {
      subtechniques.value = await attackApi.techniqueSubtechniques(id, matrix as any).catch(() => []);
    }
  } catch { err.value = `ATT&CK technique not found: ${id}`; }
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
            label="MITRE ATT&amp;CK"
            size="small"
            severity="secondary"
            @click="openExternal(externalUrl(entry.attackId))"
          />
        </div>
      </div>

      <!-- ── References + Mitigations (2/3, left) | Info + Tactics/Platforms + Sub-techniques (1/3, right) ── -->
      <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <div class="detail-grid__data" style="display:flex; flex-direction:column; gap:1.25rem;">

          <!-- References -->
          <div class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header"><span class="section-header-label">References</span></div>
            <div class="detail-grid__body">
              <ReferencesBlock :references="referenceItems" />
            </div>
          </div>

          <!-- Mitigations -->
          <div v-if="mitigations.length" class="ares-card" style="padding:0; margin-bottom:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">Mitigations <span class="section-badge">{{ mitigations.length }}</span></span>
            </div>
            <div class="detail-grid__body">
              <div v-for="m in mitigations" :key="m.id" class="consequence-item">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.2rem;">
                  <span class="entry-code">{{ m.attackId }}</span>
                  <span style="font-weight:700; font-size:0.85rem; color:var(--ares-text-2);">{{ m.name }}</span>
                </div>
                <p v-if="m.description" class="body-text" style="font-size:0.8rem; margin:0;">{{ m.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Info + Tactics + Platforms + Sub-techniques -->
        <div class="detail-grid__meta" style="display:flex; flex-direction:column; gap:1.25rem;">
          <div class="ares-card" style="padding:0;">
            <div class="ares-card-section-header"><span class="section-header-label">Info</span></div>
            <div class="detail-grid__body">
              <dl class="ares-dl">
                <dt>ID</dt>
                <dd><span class="entry-code">{{ entry.attackId }}</span></dd>

                <dt>Matrix</dt>
                <dd>{{ entry.matrix }}</dd>

                <dt v-if="entry.subtechnique">Parent</dt>
                <dd v-if="entry.subtechnique">
                  <span class="ref-item-nav-inline" @click="navTechnique(parentAttackId!)">{{ parentAttackId }}<template v-if="parentName"> — {{ parentName }}</template></span>
                </dd>

                <dt>Status</dt>
                <dd style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                  <span v-if="entry.revoked" class="inline-badge" style="color:#ef4444; border-color:#ef4444;">Revoked</span>
                  <span v-if="entry.deprecated" class="inline-badge" style="color:var(--ares-text-muted); border-color:var(--ares-border);">Deprecated</span>
                  <span v-if="!entry.revoked && !entry.deprecated" style="color:var(--ares-text-muted);">Active</span>
                </dd>

                <dt v-if="entry.permissionsRequired?.length">Permissions</dt>
                <dd v-if="entry.permissionsRequired?.length">
                  <div class="badge-row">
                    <AresBadge v-for="p in entry.permissionsRequired" :key="p" :value="p" severity="secondary" />
                  </div>
                </dd>

                <dt v-if="entry.dataSources?.length">Data Sources</dt>
                <dd v-if="entry.dataSources?.length">
                  <div class="badge-row">
                    <AresBadge v-for="d in entry.dataSources" :key="d" :value="d" severity="secondary" />
                  </div>
                </dd>
              </dl>
            </div>
          </div>

          <!-- Tactics -->
          <div v-if="entry.tactics?.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header"><span class="section-header-label">Tactics <span class="section-badge">{{ entry.tactics.length }}</span></span></div>
            <div class="detail-grid__body">
              <div class="badge-row">
                <AresBadge v-for="t in entry.tactics" :key="t" :value="t" severity="secondary" />
              </div>
            </div>
          </div>

          <!-- Platforms -->
          <div v-if="entry.platforms?.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header"><span class="section-header-label">Platforms <span class="section-badge">{{ entry.platforms.length }}</span></span></div>
            <div class="detail-grid__body">
              <div class="badge-row">
                <AresBadge v-for="p in entry.platforms" :key="p" :value="p" severity="secondary" />
              </div>
            </div>
          </div>

          <!-- Sub-techniques -->
          <div v-if="subtechniques.length" class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">Sub-techniques <span class="section-badge">{{ subtechniques.length }}</span></span>
            </div>
            <div class="detail-grid__body">
              <div class="ref-block">
                <div class="ref-group-items">
                  <div
                    v-for="s in subtechniques"
                    :key="s.id"
                    class="ref-item ref-item--nav"
                    @click="navTechnique(s.id)"
                  >
                    <span class="ref-item-code">{{ s.id }}</span>
                    <span class="ref-item-main">
                      <span class="ref-item-name">{{ s.name }}</span>
                    </span>
                    <i class="pi pi-chevron-right ref-item-arrow" />
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
          <p class="body-text" style="white-space:pre-line; margin:0;">{{ entry.description ?? 'No description available.' }}</p>
        </div>
      </div>

      <!-- ── Detection ──────────────────────────────────────────── -->
      <div v-if="entry.detection" class="ares-card" style="padding:0; overflow:hidden;">
        <div class="ares-card-section-header"><span class="section-header-label">Detection</span></div>
        <div class="detail-grid__body">
          <p class="body-text" style="white-space:pre-line; margin:0;">{{ entry.detection }}</p>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
/* ── Two-column layout (matches FindingDetailView/DetectionDetailView/CVE/CWE/CAPEC detail) ── */
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
.empty-hint { font-size:0.83rem; color:var(--ares-text-muted); padding:0.75rem 0; margin:0; }
.inline-badge { font-size:0.68rem; font-weight:700; padding:0.15rem 0.5rem; border-radius: var(--ares-radius); border:1px solid; letter-spacing:0.04em; }

.ares-dl { display: grid; grid-template-columns: 110px 1fr; gap: 0.4rem 1rem; font-size: 0.85rem; }
.ares-dl dt { color: var(--ares-text-muted); font-size: 0.8rem; padding-top: 0.1rem; }
.ares-dl dd { margin: 0; color: var(--ares-text-2); line-height: 1.5; }

.ref-item-nav-inline { cursor: pointer; font-family: monospace; font-size: 0.82rem; color: var(--ares-text-2); }
.ref-item-nav-inline:hover { color: var(--p-primary-400); }

.consequence-item { border-left: 2px solid var(--ares-border); padding-left: 0.75rem; margin-bottom: 0.6rem; }
.consequence-item:last-child { margin-bottom: 0; }

/* ── Grouped nav list (Sub-techniques), mirrors ReferencesBlock's own band+row look ── */
.ref-block { display: flex; flex-direction: column; }
.ref-group-items { display: flex; flex-direction: column; }
.ref-item { display: flex; align-items: center; gap: 0.5rem; border-top: 1px solid var(--ares-border); min-width: 0; margin: 0 -1.25rem; padding: 0.5rem 1.25rem; transition: background 0.1s; }
.ref-group-items .ref-item:first-child { border-top: none; margin-top: -1rem; padding-top: 1rem; }
.ref-group-items .ref-item:last-child { margin-bottom: -1.25rem; padding-bottom: 1.25rem; }
.ref-item--nav { cursor: pointer; }
.ref-item--nav:hover { background: color-mix(in srgb, var(--ares-text) 4%, transparent); }
.ref-item--nav:hover .ref-item-code { color: var(--p-primary-400); }
.ref-item-code { font-family: monospace; font-size: 0.78rem; font-weight: 700; color: var(--ares-text-2); flex-shrink: 0; transition: color 0.15s; }
.ref-item-main { display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; flex: 1; min-width: 0; overflow: hidden; }
.ref-item-name { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.ref-item-arrow { font-size: 0.68rem; color: var(--ares-text-muted); flex-shrink: 0; margin-left: auto; }
</style>
