<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import { owaspApi, type OwaspEntry } from '@/api/kb';

const route  = useRoute();
const router = useRouter();
const entry  = ref<OwaspEntry | null>(null);
const loading = ref(true);
const err     = ref<string | null>(null);

const owaspId = route.params.owaspId as string;
const year    = Number(route.params.year);

function rankColor(rank: number): string {
  if (rank <= 3) return '#ef4444';
  if (rank <= 5) return '#f97316';
  if (rank <= 7) return '#eab308';
  return '#22c55e';
}

function externalUrl(e: OwaspEntry) {
  if (e.year >= 2021) {
    const slug = e.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    return `https://owasp.org/Top10/${e.owaspId}_${e.year}-${slug}/`;
  }
  if (e.year === 2017) return 'https://owasp.org/www-project-top-ten/2017/';
  return 'https://owasp.org/www-project-top-ten/';
}

function navCwe(cwe: string) {
  router.push({ name: 'kb-cwe-detail', params: { id: String(cwe).replace(/^CWE-/i, '') } });
}
function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

onMounted(async () => {
  try { entry.value = await owaspApi.get(owaspId, year); }
  catch { err.value = `OWASP entry not found: ${owaspId} (${year})`; }
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
          <div style="display:flex; align-items:center; gap:0.75rem; min-width:0; flex-wrap:wrap;">
            <!-- Rank badge -->
            <div
              class="rank-badge"
              :style="{ background: rankColor(entry.rank) }"
            >{{ entry.rank }}</div>
            <div style="min-width:0;">
              <div style="display:flex; align-items:center; gap:0.55rem; flex-wrap:wrap; margin-bottom:0.3rem;">
                <span class="entry-code">{{ entry.owaspId }}</span>
                <span style="font-size:0.8rem; color:var(--ares-text-muted);">· OWASP Top 10 {{ entry.year }}</span>
              </div>
              <div style="font-size:1.05rem; font-weight:700; color:var(--ares-text);">{{ entry.name }}</div>
            </div>
          </div>
        </div>
        <div style="display:flex; gap:0.5rem; flex-shrink:0;">
          <Button
            icon="pi pi-external-link"
            label="OWASP.org"
            size="small"
            severity="secondary"
            @click="openExternal(externalUrl(entry))"
          />
        </div>
      </div>

      <!-- ── Description ────────────────────────────────────────── -->
      <div class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header"><span class="section-header-label">Description</span></div>
        <div class="detail-grid__body">
          <p class="body-text" style="margin:0;">{{ entry.description }}</p>
        </div>
      </div>

      <!-- ── How to Prevent ─────────────────────────────────────── -->
      <div v-if="entry.preventions?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">How to Prevent <span class="section-badge">{{ entry.preventions.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <ol class="prevention-list">
            <li v-for="(p, i) in entry.preventions" :key="i" class="body-text">{{ p }}</li>
          </ol>
        </div>
      </div>

      <!-- ── Related CWE Weaknesses ─────────────────────────────── -->
      <div v-if="entry.cwes?.length" class="ares-card" style="padding:0; margin-bottom:1.25rem; overflow:hidden;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Related CWE Weaknesses <span class="section-badge">{{ entry.cwes.length }}</span></span>
        </div>
        <div class="detail-grid__body">
          <div
            v-for="cwe in entry.cwes"
            :key="cwe"
            class="ref-row ref-row--nav"
            @click="navCwe(cwe)"
          >
            <span class="ref-cat ref-cat--cwe">CWE</span>
            <div style="flex:1; min-width:0;">
              <div class="ref-title">{{ cwe }}</div>
            </div>
            <i class="pi pi-chevron-right" style="color:var(--ares-text-muted); font-size:0.75rem; flex-shrink:0;" />
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
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
.ref-row {
  display: flex; align-items: flex-start; gap: 0.75rem;
  margin: 0 -1.25rem; padding: 0.6rem 1.25rem;
  border-top: 1px solid var(--ares-border);
  transition: background 0.1s;
}
.ref-row:first-child { border-top: none; }
.ref-row:last-child { margin-bottom: -1.25rem; }
.ref-row--nav { cursor:pointer; }
.ref-row--nav:hover { background: color-mix(in srgb, var(--ares-text) 4%, transparent); }
.ref-row--nav:hover .ref-title { color:var(--p-primary-400); }
.ref-cat { font-size:0.7rem; font-weight:700; color:#fff; border-radius: var(--ares-radius); padding:0.15em 0.55em; flex-shrink:0; margin-top:0.2rem; white-space:nowrap; }
.ref-cat--cwe { background:#3b82f6; }
.ref-cat--capec { background:#f59e0b; }
.ref-cat--attack { background:#ef4444; }
.ref-cat--owasp { background:#10b981; }
.ref-title { font-size:0.88rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ref-desc { font-size:0.78rem; color:var(--ares-text-muted); margin-top:0.15rem; }
.empty-hint { font-size:0.83rem; color:var(--ares-text-muted); padding:0.75rem 0; margin:0; }
.inline-badge { font-size:0.68rem; font-weight:700; padding:0.15rem 0.5rem; border-radius: var(--ares-radius); border:1px solid; letter-spacing:0.04em; }

.rank-badge {
  width: 36px;
  height: 36px;
  border-radius: var(--ares-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

.prevention-list {
  margin: 0;
  padding: 0 0 0 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
