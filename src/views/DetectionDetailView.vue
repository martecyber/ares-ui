<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  detectionsApi, detectionStatusSeverity, detectionStatusLabel, DETECTION_STATUS_TRANSITIONS,
  type Detection, type DetectionAffection, type DetectionStatusHistoryItem,
} from '@/api/detections';
import { assetsApi, type Asset, ASSET_TYPE_LABELS } from '@/api/assets';
import { badgeIconSrc } from '@/utils/tool-icons';
import SourceBadge from '@/components/SourceBadge.vue';
import JsonViewer from '@/components/JsonViewer.vue';
import AssetPickerDialog from '@/components/AssetPickerDialog.vue';
import HttpSamplesPanel, { type HttpSampleInput } from '@/components/HttpSamplesPanel.vue';
import { statusSeverity, statusLabel } from '@/api/findings';
import SeverityTag from '@/components/SeverityTag.vue';
import EscalationWizard from '@/components/EscalationWizard.vue';
import InvestigateDialog from '@/components/InvestigateDialog.vue';
import AresBadge from '@/components/AresBadge.vue';
import TagChipList from '@/components/TagChipList.vue';
import EntityTagEditDialog from '@/components/EntityTagEditDialog.vue';
import ReferencesBlock from '@/components/ReferencesBlock.vue';
import AppPagination from '@/components/AppPagination.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/stores/auth';

const { isMobile } = useBreakpoint();

const route = useRoute();
const router = useRouter();
const toast = useToast();
const auth = useAuthStore();

const detection = ref<Detection | null>(null);
const asset = ref<Asset | null>(null);
const assetLoading = ref(false);
const affections = ref<DetectionAffection[]>([]);
const loading = ref(true);
const rawExpanded = ref(false);
const rawViewMode = ref<'tree' | 'visual'>('tree');
const rawCopied = ref(false);
let rawCopyTimer: ReturnType<typeof setTimeout> | null = null;
const newStatus = ref<string | null>(null);
const savingStatus = ref(false);
const showStatusDialog = ref(false);
const statusNote = ref('');
const history = ref<DetectionStatusHistoryItem[]>([]);
const HISTORY_PAGE_SIZE = 10;
const historyPage = ref(0);
const historyTotalPages = ref(0);
const historyTotal = ref(0);

// Escalate dialog
const showEscalate = ref(false);

// Investigate dialog (assign to a Research Board)
const showInvestigate = ref(false);

const orgId = computed(() => route.params.orgId ? Number(route.params.orgId) : null);
const engId = computed(() => route.params.engId ? Number(route.params.engId) : null);

const allowedNextStatuses = computed(() => {
  if (!detection.value) return [];
  const transitions = DETECTION_STATUS_TRANSITIONS[detection.value.status] ?? [];
  return transitions.map((s) => ({ label: detectionStatusLabel(s), value: s }));
});

const canEscalate = computed(() =>
  !auth.isClient && (detection.value?.status === 'new' || detection.value?.status === 'reopened')
);

const parsedRaw = computed(() => {
  if (!detection.value?.rawData) return null;
  try { return JSON.stringify(JSON.parse(detection.value.rawData), null, 2); }
  catch { return detection.value.rawData; }
});

const rawDataObj = computed<Record<string, unknown> | null>(() => {
  if (!detection.value?.rawData) return null;
  try { return JSON.parse(detection.value.rawData); } catch { return null; }
});

async function copyRawJson() {
  try {
    const text = rawDataObj.value !== null
      ? JSON.stringify(rawDataObj.value, null, 2)
      : (parsedRaw.value ?? '');
    await navigator.clipboard.writeText(text);
    rawCopied.value = true;
    if (rawCopyTimer) clearTimeout(rawCopyTimer);
    rawCopyTimer = setTimeout(() => { rawCopied.value = false; }, 1500);
  } catch { /* clipboard unavailable in this context — no-op, nothing to recover from */ }
}

// Priority-scoring CVSS score, when the source tool provided one (currently only Tenable).
// Read-only display — the full CVSS calculator (CvssMetricGrid) is Finding-only for now.
const defaultScore = computed(() => {
  const scores = detection.value?.scores ?? [];
  return scores.find((s) => s.isDefault) ?? scores[0] ?? null;
});

// ── Plugin/template identifier badge ────────────────────────────────
// Some scanners identify findings by a plugin or template id rather than a
// free-text title. Surface that id as a clickable badge linking to the
// vendor's documentation page when one is known.
interface PluginBadge { tool: string; label: string; href: string | null; }

const pluginBadge = computed<PluginBadge | null>(() => {
  const d = detection.value;
  if (!d?.sourceType) return null;
  const tool = d.sourceType.toLowerCase();

  if (tool === 'qualys') {
    if (!d.sourceTemplateId) return null;
    // sourceTemplateId is "{QID}@{port}/{protocol}" (disambiguates the same QID recurring on one
    // host under different ports — see QualysScanResultsXmlParser/QualysVulnParser) — strip that
    // suffix for display so the badge reads "QID 15164", not "15164@53/tcp".
    const qid = d.sourceTemplateId.split('@')[0];
    return { tool, label: `QID ${qid}`, href: null }; // doc link not implemented yet
  }
  if (tool === 'tenable') {
    if (!d.sourceTemplateId) return null;
    return { tool, label: d.sourceTemplateId, href: `https://www.tenable.com/plugins/nessus/${d.sourceTemplateId}` };
  }
  if (tool === 'nuclei') {
    const raw = rawDataObj.value;
    const templateId = raw?.['template-id'];
    if (typeof templateId !== 'string' || !templateId) return null; // custom templates often lack this
    const templateUrl = raw?.['template-url'];
    return { tool, label: templateId, href: typeof templateUrl === 'string' && templateUrl ? templateUrl : null };
  }
  if (tool === 'greenbone') {
    const raw = rawDataObj.value;
    const oid = raw?.oid;
    // No public NVT lookup site exists — the link only resolves when the integration has a
    // configured GVM web UI URL (stamped onto rawData as "nvtUrl" during live sync); file-import
    // detections and syncs without a configured URL just render the badge without a link.
    if (typeof oid !== 'string' || !oid) return null;
    const nvtUrl = raw?.nvtUrl;
    return { tool, label: oid, href: typeof nvtUrl === 'string' && nvtUrl ? nvtUrl : null };
  }
  return null;
});


// ── Affected assets editor ─────────────────────────────────────────
const showAffectedPicker = ref(false);
const allAssetsForPicker = ref<Asset[]>([]);
const affectedDraftIds = ref<number[]>([]);
const savingAffected = ref(false);

const canEditAffected = computed(() => engId.value !== null && !auth.isClient);

// ── Affected assets pagination (client-side; list is already loaded whole) ──
const AFFECTED_PAGE_SIZE = 10;
const affectedPage = ref(0);
const affectedTotalPages = computed(() =>
  detection.value ? Math.ceil(detection.value.affectedAssets.length / AFFECTED_PAGE_SIZE) : 0);
const pagedAffected = computed(() => {
  if (!detection.value) return [];
  const start = affectedPage.value * AFFECTED_PAGE_SIZE;
  return detection.value.affectedAssets.slice(start, start + AFFECTED_PAGE_SIZE);
});

async function ensureAssetPickerLoaded() {
  if (allAssetsForPicker.value.length) return;
  if (!orgId.value) return;
  try {
    const res = await assetsApi.list({ organizationId: orgId.value, size: 500 });
    allAssetsForPicker.value = res.items;
  } catch { /* silent */ }
}

const affectedGraphConfig = computed(() => {
  if (!orgId.value || !asset.value) return null;
  return { orgId: orgId.value, centerAssetId: asset.value.id, centerLabel: asset.value.identifier };
});

async function openAffectedPicker() {
  if (!detection.value) return;
  affectedDraftIds.value = detection.value.affectedAssets.map(a => a.id);
  await ensureAssetPickerLoaded();
  // Make sure preselected assets are visible in the picker even when they
  // live outside the first 500 of the list.
  const missing = affectedDraftIds.value.filter(
    id => !allAssetsForPicker.value.find(a => a.id === id));
  for (const id of missing) {
    const a = await assetsApi.get(id).catch(() => null);
    if (a) allAssetsForPicker.value = [...allAssetsForPicker.value, a];
  }
  showAffectedPicker.value = true;
}

async function saveAffected(newIds: number[]) {
  if (!detection.value) return;
  savingAffected.value = true;
  try {
    const updated = await detectionsApi.setAffectedAssets(detection.value.id, newIds);
    // Server returns the full detection with refreshed affectedAssets.
    detection.value = { ...detection.value, affectedAssets: updated.affectedAssets };
    affectedPage.value = 0;
    showAffectedPicker.value = false;
    toast.add({ severity: 'success', summary: 'Affected assets updated', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    savingAffected.value = false;
  }
}

function removeAffected(id: number) {
  if (!detection.value) return;
  const remaining = detection.value.affectedAssets.filter(a => a.id !== id).map(a => a.id);
  saveAffected(remaining);
}

function goToAffectedAsset(id: number) {
  if (!orgId.value) return;
  if (engId.value) {
    router.push({ name: 'org-project-asset-detail', params: { orgId: orgId.value, engId: engId.value, id } });
  } else {
    router.push({ name: 'org-asset-detail', params: { orgId: orgId.value, id } });
  }
}

/** Newest first, server-paginated (see detectionsApi.getHistory) — a long-lived detection can
 *  accumulate an unbounded number of "reseen" rows across rescans, so unlike affectedAssets above
 *  (small, sliced client-side) this re-fetches per page instead of loading everything up front. */
function changeHistoryPage(delta: 1 | -1) {
  if (!detection.value) return;
  loadHistory(detection.value.id, historyPage.value + delta);
}

async function loadHistory(id: number, page = 0) {
  const hist = await detectionsApi.getHistory(id, page, HISTORY_PAGE_SIZE).catch(() => null);
  historyPage.value = hist?.page ?? 0;
  historyTotalPages.value = hist?.totalPages ?? 0;
  historyTotal.value = hist?.total ?? 0;
  history.value = hist?.items ?? [];
}

// The header/references/affected-assets/metadata panels only need the main detection record
// (affectedAssets ships embedded in it already) — those render as soon as it arrives instead of
// waiting on the detected-asset lookup, escalated-findings list and status history too, each of
// which is its own round trip and, on a slow deployment, its own chance to time out. Splitting
// them into independent background loads (own loading flag, own try/catch) means one of those
// three being slow no longer holds up — or blanks — the rest of an already-rendered page.
async function load() {
  loading.value = true;
  try {
    detection.value = await detectionsApi.get(Number(route.params.id));
  } finally {
    loading.value = false;
  }
  const d = detection.value;
  if (!d) return;

  assetLoading.value = !!d.assetId;
  (d.assetId ? assetsApi.get(d.assetId).catch(() => null) : Promise.resolve(null))
    .then((a) => { asset.value = a; })
    .finally(() => { assetLoading.value = false; });

  detectionsApi.getAffections(d.id).catch(() => [] as DetectionAffection[])
    .then((aff) => { affections.value = aff; });

  loadHistory(d.id, 0);
  affectedPage.value = 0;
}

// ── Tags ───────────────────────────────────────────────────────────────────
const showTagEditor = ref(false);

async function assignTag(tagId: number) {
  if (!detection.value) return;
  detection.value = await detectionsApi.assignTag(detection.value.id, tagId);
}

async function unassignTag(tagId: number) {
  if (!detection.value) return;
  detection.value = await detectionsApi.unassignTag(detection.value.id, tagId);
}

function openStatusDialog() {
  newStatus.value = null;
  statusNote.value = '';
  showStatusDialog.value = true;
}

async function applyStatus() {
  if (!newStatus.value || !detection.value) return;
  savingStatus.value = true;
  try {
    detection.value = await detectionsApi.updateStatus(detection.value.id, newStatus.value, statusNote.value.trim() || undefined);
    await loadHistory(detection.value.id, 0); // newest first — the just-recorded change lands on page 0
    newStatus.value = null;
    statusNote.value = '';
    showStatusDialog.value = false;
    toast.add({ severity: 'success', summary: 'Status updated', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    savingStatus.value = false;
  }
}

// Affection descriptions are stored as rich-text HTML (edited via a PrimeVue Editor) —
// strip tags/entities for the plain-text preview in the Escalated-to table. Parsed in a
// detached document, never inserted via v-html, so nothing in it ever executes.
function stripHtml(html: string | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function historyLabel(h: DetectionStatusHistoryItem): string {
  switch (h.eventType) {
    case 'created':
      return `Created${h.toStatus ? ' — ' + detectionStatusLabel(h.toStatus) : ''}`;
    case 'reseen':
      return 'Re-detected by scanner (no status change)';
    case 'status_changed':
      return `Status changed: ${h.fromStatus ? detectionStatusLabel(h.fromStatus) : '—'} → ${h.toStatus ? detectionStatusLabel(h.toStatus) : '—'}`;
    default:
      return h.eventType;
  }
}

function historyIcon(eventType: string): string {
  switch (eventType) {
    case 'created':        return 'pi pi-plus-circle';
    case 'reseen':          return 'pi pi-refresh';
    case 'status_changed':  return 'pi pi-arrow-right-arrow-left';
    default:                 return 'pi pi-circle';
  }
}

function openEscalateModal() {
  showEscalate.value = true;
}

function goToFinding(findingId: number | null) {
  if (!findingId || !orgId.value || !engId.value) return;
  router.push({ name: 'org-project-finding-detail', params: { orgId: orgId.value, engId: engId.value, id: findingId } });
}

function goToAsset() {
  if (!asset.value || !orgId.value) return;
  if (engId.value) {
    router.push({ name: 'org-project-asset-detail', params: { orgId: orgId.value, engId: engId.value, id: asset.value.id } });
  } else {
    router.push({ name: 'org-asset-detail', params: { orgId: orgId.value, id: asset.value.id } });
  }
}

function onEscalationDone() {
  showEscalate.value = false;
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:4rem;">
      <ProgressSpinner />
    </div>

    <template v-else-if="detection">
      <!-- Header -->
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.5rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <Button icon="pi pi-arrow-left" severity="secondary" text @click="router.back()" />
          <div style="display:flex; align-items:center; gap:0.55rem;">
            <SourceBadge v-if="detection.sourceType" :source="detection.sourceType" />
            <h2 class="ares-page-title" style="margin:0;">{{ detection.title }}</h2>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <Button
            v-if="canEscalate"
            icon="pi pi-search"
            label="Investigate"
            severity="secondary"
            size="small"
            @click="showInvestigate = true"
          />
          <Button
            v-if="canEscalate"
            icon="pi pi-arrow-up-right"
            label="Escalate"
            size="small"
            @click="openEscalateModal"
          />
        </div>
      </div>

      <!-- References + Assets (2/3, left) | Metadata (1/3, right) -->
      <div :class="['detail-grid', { 'detail-grid--stacked': isMobile }]" style="margin-bottom:1.25rem;">
        <div class="detail-grid__data" style="display:flex; flex-direction:column; gap:1.25rem;">

          <!-- References: auto-extracted CVE/CWE/CAPEC/ATT&CK ids — grouped by catalog -->
          <div class="ares-card" style="padding:0; overflow:hidden;">
            <div class="ares-card-section-header">
              <span class="section-header-label">
                References
                <span v-if="detection.references.length" class="section-badge">{{ detection.references.length }}</span>
              </span>
            </div>
            <div class="detail-grid__body">
              <ReferencesBlock :references="detection.references" />
            </div>
          </div>

          <!-- Assets: where it was detected + operator-managed affected list -->
          <div class="ares-card" style="padding:0;">
            <div class="ares-card-section-header"><span class="section-header-label">Assets</span></div>
            <div v-if="assetLoading" style="display:flex; align-items:center; gap:0.5rem; padding:0.85rem 1rem;">
              <ProgressSpinner style="width:16px; height:16px;" stroke-width="6" />
              <span style="font-size:0.82rem; color:var(--ares-text-muted);">Loading…</span>
            </div>
            <div v-else-if="asset" class="detail-grid__body" style="display:flex; align-items:center; gap:0.75rem;">
              <i class="pi pi-server" style="color:var(--ares-accent-muted);" />
              <div style="flex:1;">
                <p style="font-size:0.75rem; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:0.05em;">Detected at</p>
                <p style="font-family:monospace; font-size:0.9rem; margin-top:0.1rem;">{{ asset.identifier }}</p>
              </div>
              <span v-if="asset.code" style="font-family:monospace; font-size:0.75rem; color:var(--ares-text-muted);">{{ asset.code }}</span>
              <AresBadge :value="ASSET_TYPE_LABELS[asset.type] ?? asset.type.toUpperCase()" severity="secondary" />
              <Button v-if="orgId" icon="pi pi-arrow-right" severity="secondary" text size="small" @click="goToAsset" />
            </div>
            <p v-else style="font-size:0.82rem; color:var(--ares-text-muted); padding:0.85rem 1rem; margin:0;">
              No detected asset linked.
            </p>

            <div class="ares-card-section-header" style="border-top:1px solid var(--ares-border);">
              <span class="section-header-label">
                Affected assets
                <span v-if="detection.affectedAssets.length" class="section-badge">{{ detection.affectedAssets.length }}</span>
              </span>
              <Button v-if="canEditAffected" icon="pi pi-pencil" label="Edit"
                severity="secondary" text size="small" :loading="savingAffected"
                @click="openAffectedPicker" />
            </div>
            <table v-if="pagedAffected.length" class="ares-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Identifier</th>
                  <th>Type</th>
                  <th v-if="canEditAffected" style="width:36px;"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in pagedAffected" :key="a.id">
                  <td style="font-family:monospace; font-size:0.75rem; color:var(--ares-text-muted);">{{ a.code ?? '—' }}</td>
                  <td>
                    <button type="button" class="aff-id-link" @click="goToAffectedAsset(a.id)">
                      {{ a.identifier ?? `#${a.id}` }}
                    </button>
                  </td>
                  <td style="font-size:0.78rem; color:var(--ares-text-muted);">
                    {{ a.type ? (ASSET_TYPE_LABELS[a.type] ?? a.type) : '—' }}
                  </td>
                  <td v-if="canEditAffected" style="text-align:center;">
                    <button type="button" class="aff-remove-btn" v-tooltip.top="'Remove'"
                      @click="removeAffected(a.id)">×</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else style="font-size:0.82rem; color:var(--ares-text-muted); padding:0.75rem 1rem; margin:0;">
              None — this detection is not considered to impact any asset.
            </p>
            <AppPagination
              v-if="affectedTotalPages > 1"
              :page="affectedPage"
              :total-pages="affectedTotalPages"
              :total="detection.affectedAssets.length"
              @prev="affectedPage--"
              @next="affectedPage++"
            />
          </div>
        </div>

        <!-- Metadata -->
        <div class="ares-card detail-grid__meta" style="padding:0;">
          <div class="ares-card-section-header"><span class="section-header-label">Metadata</span></div>
          <div class="detail-grid__body">
            <dl class="ares-dl">
              <dt>Code</dt>
              <dd style="font-family:monospace;">#{{ detection.id }}</dd>

              <dt>Priority</dt>
              <dd><SeverityTag :level="detection.severity" scale="priority" /></dd>

              <template v-if="defaultScore">
                <dt>CVSS</dt>
                <dd style="font-family:monospace;">
                  {{ defaultScore.score }}
                  <span style="color:var(--ares-text-muted); font-family:inherit;">({{ defaultScore.typeTitle }})</span>
                </dd>
              </template>

              <dt>Template</dt>
              <dd>
                <component
                  :is="pluginBadge.href ? 'a' : 'span'"
                  v-if="pluginBadge"
                  :href="pluginBadge.href ?? undefined"
                  :target="pluginBadge.href ? '_blank' : undefined"
                  :rel="pluginBadge.href ? 'noopener' : undefined"
                  :class="['plugin-badge', 'plugin-badge--' + pluginBadge.tool]"
                  v-tooltip.top="pluginBadge.href ? 'Open plugin documentation' : 'No documentation link available yet'"
                >
                  <img v-if="badgeIconSrc(pluginBadge.tool)" :src="badgeIconSrc(pluginBadge.tool)" class="plugin-badge-icon" />
                  <span>{{ pluginBadge.label }}</span>
                  <i v-if="pluginBadge.href" class="pi pi-external-link" style="font-size:0.58rem; opacity:0.7;" />
                </component>
                <span v-else-if="detection.sourceTemplateId" style="font-family:monospace; font-size:0.8rem; color:var(--ares-text-muted);">{{ detection.sourceTemplateId }}</span>
                <span v-else style="color:var(--ares-text-muted);">—</span>
              </dd>

              <dt>Status</dt>
              <dd style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <AresBadge :value="detectionStatusLabel(detection.status)" :severity="detectionStatusSeverity(detection.status)" />
                <Button
                  v-if="allowedNextStatuses.length && !auth.isClient"
                  icon="pi pi-arrow-right"
                  text rounded size="small"
                  v-tooltip.top="'Change status'"
                  @click="openStatusDialog"
                />
              </dd>

              <dt>Tags</dt>
              <dd>
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.4rem;">
                  <TagChipList :tags="detection.tags" :limit="6" />
                  <Button
                    v-if="!auth.isClient"
                    icon="pi pi-pencil"
                    text
                    size="small"
                    severity="secondary"
                    v-tooltip="'Edit tags'"
                    style="width:1.6rem; height:1.6rem; padding:0;"
                    @click="showTagEditor = true"
                  />
                </div>
              </dd>

              <dt>Detected</dt>
              <dd>{{ detection.createdAt.slice(0, 10) }}</dd>

              <dt>Last modified</dt>
              <dd>{{ detection.updatedAt ? detection.updatedAt.slice(0, 10) : '—' }}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div v-if="detection.description" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span>Description</span>
        </div>
        <p style="white-space:pre-wrap; line-height:1.8; color:var(--ares-text-2); font-size:0.9rem; padding:0.85rem 1rem; margin:0;">{{ detection.description }}</p>
      </div>

      <!-- Escalated to: findings / affections -->
      <div v-if="affections.length" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">
            Escalated to
            <span class="section-badge">{{ affections.length }}</span>
          </span>
        </div>
        <table class="ares-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Title</th>
              <th>Description</th>
              <th>Priority</th>
              <th>Status</th>
              <th style="width:36px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in affections" :key="a.affectionId" class="esc-aff-row" @click="goToFinding(a.findingId)">
              <td style="font-family:monospace; font-size:0.75rem; color:var(--ares-text-muted); white-space:nowrap;">{{ a.affectionCode }}</td>
              <td style="font-size:0.85rem; font-weight:600;">{{ a.affectionTitle ?? 'Untitled affection' }}</td>
              <td class="esc-desc-cell">{{ stripHtml(a.affectionDescription) || '—' }}</td>
              <td><SeverityTag v-if="a.findingSeverity" :level="a.findingSeverity" scale="priority" /><span v-else>—</span></td>
              <td><AresBadge v-if="a.findingStatusName" :value="statusLabel(a.findingStatusName)" :severity="statusSeverity(a.findingStatusName)" /><span v-else>—</span></td>
              <td style="text-align:center;">
                <i class="pi pi-chevron-right" style="color:var(--ares-text-muted); font-size:0.75rem;" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- HTTP request/response samples -->
      <HttpSamplesPanel
        :readonly="true"
        :hide-when-empty="true"
        :load="() => detectionsApi.listHttpSamples(detection!.id)"
        :create="(body: HttpSampleInput) => detectionsApi.createHttpSample(detection!.id, body)"
        :update="(sid: number, body: HttpSampleInput) => detectionsApi.updateHttpSample(detection!.id, sid, body)"
        :remove="(sid: number) => detectionsApi.deleteHttpSample(detection!.id, sid)"
      />

      <!-- Raw data -->
      <div v-if="parsedRaw" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span>Raw data</span>
          <div v-if="rawExpanded" class="raw-data-actions">
            <Button
              icon="pi pi-code"
              :text="rawViewMode !== 'tree'" :severity="rawViewMode === 'tree' ? undefined : 'secondary'"
              rounded size="small"
              v-tooltip.top="'Code view'" @click="rawViewMode = 'tree'"
            />
            <Button
              icon="pi pi-th-large"
              :text="rawViewMode !== 'visual'" :severity="rawViewMode === 'visual' ? undefined : 'secondary'"
              rounded size="small"
              v-tooltip.top="'Visual view'" @click="rawViewMode = 'visual'"
            />
            <span class="raw-data-actions-sep" />
            <Button
              :icon="rawCopied ? 'pi pi-check' : 'pi pi-copy'"
              severity="secondary" text rounded size="small"
              v-tooltip.top="rawCopied ? 'Copied' : 'Copy JSON'"
              @click="copyRawJson"
            />
            <Button
              :icon="rawExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
              severity="secondary" text rounded size="small"
              v-tooltip.top="'Collapse'"
              @click="rawExpanded = false"
            />
          </div>
          <Button
            v-else
            icon="pi pi-chevron-down"
            severity="secondary" text rounded size="small"
            v-tooltip.top="'Expand'"
            @click="rawExpanded = true"
          />
        </div>
        <div v-if="rawExpanded" style="margin:0.85rem 1rem;">
          <JsonViewer :value="rawDataObj" :raw-text="parsedRaw" :mode="rawViewMode" />
        </div>
        <p v-else style="font-size:0.8rem; color:var(--ares-text-muted); padding:0.85rem 1rem; margin:0;">{{ parsedRaw.slice(0, 200) }}{{ parsedRaw.length > 200 ? '…' : '' }}</p>
      </div>

      <!-- History: created / re-seen-by-tool / status-changed audit trail — newest first, server-paginated -->
      <div v-if="history.length" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">
            History
            <span class="section-badge">{{ historyTotal }}</span>
          </span>
        </div>
        <div v-for="h in history" :key="h.id" class="history-row">
          <i :class="historyIcon(h.eventType)" class="history-icon" />
          <div class="history-body">
            <div class="history-line">{{ historyLabel(h) }}</div>
            <div v-if="h.note" class="history-note">{{ h.note }}</div>
          </div>
          <div class="history-meta">
            <span class="history-actor">{{ h.changedByName ?? 'System / Tool' }}</span>
            <span class="history-date">{{ h.changedAt.slice(0, 16).replace('T', ' ') }}</span>
          </div>
        </div>
        <AppPagination
          v-if="historyTotalPages > 1"
          :page="historyPage"
          :total-pages="historyTotalPages"
          :total="historyTotal"
          @prev="changeHistoryPage(-1)"
          @next="changeHistoryPage(1)"
        />
      </div>
    </template>

    <div v-else style="color:var(--ares-text-muted); padding:3rem; text-align:center;">
      Detection not found.
    </div>

    <!-- Escalate dialog -->
    <EscalationWizard
      v-if="detection && orgId"
      v-model:visible="showEscalate"
      :project-id="detection.projectId!"
      :org-id="orgId"
      :detections="detection ? [detection] : []"
      @done="onEscalationDone"
    />

    <InvestigateDialog
      v-if="detection"
      v-model:visible="showInvestigate"
      :project-id="detection.projectId!"
      :detection-ids="[detection.id]"
      @done="load"
    />

    <!-- Affected assets picker -->
    <AssetPickerDialog
      v-if="detection"
      v-model:visible="showAffectedPicker"
      :model-value="affectedDraftIds"
      :assets="allAssetsForPicker"
      :graph-config="affectedGraphConfig"
      title="Select affected assets"
      @update:modelValue="saveAffected"
    />

    <!-- Change status -->
    <Dialog v-model:visible="showStatusDialog" header="Change status" modal
      :style="{ width: 'min(420px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.5rem;">
        <div>
          <label class="ares-field-label">New status</label>
          <Select v-model="newStatus" :options="allowedNextStatuses"
            option-label="label" option-value="value" style="width:100%;"
            placeholder="Select a destination status" />
        </div>
        <div>
          <label class="ares-field-label">Note <span style="font-weight:400; color:var(--ares-text-muted);">(optional)</span></label>
          <Textarea v-model="statusNote" class="ares-textarea" style="width:100%;" rows="3"
            placeholder="Justification, evidence link, ticket reference…" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showStatusDialog = false" />
          <Button label="Apply" icon="pi pi-check" size="small" :loading="savingStatus"
            :disabled="!newStatus" @click="applyStatus" />
        </div>
      </div>
    </Dialog>

    <!-- Edit this detection's tags -->
    <EntityTagEditDialog
      v-if="orgId"
      v-model:visible="showTagEditor"
      :org-id="orgId"
      :assigned-tags="detection?.tags"
      :assign="assignTag"
      :unassign="unassignTag"
    />
  </div>
</template>

<style scoped>
.plugin-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border-radius: var(--ares-radius);
  font-size: 0.74rem;
  font-weight: 600;
  font-family: monospace;
  text-decoration: none;
  border: 1px solid transparent;
  transition: filter 0.12s;
}
a.plugin-badge:hover { filter: brightness(1.15); }
span.plugin-badge { cursor: default; }
.plugin-badge-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
}
.plugin-badge--qualys {
  background: color-mix(in srgb, #ef4444 18%, transparent);
  border-color: color-mix(in srgb, #ef4444 45%, transparent);
  color: #fca5a5;
}
.plugin-badge--tenable {
  background: color-mix(in srgb, #3b82f6 18%, transparent);
  border-color: color-mix(in srgb, #3b82f6 45%, transparent);
  color: #93c5fd;
}
.plugin-badge--nuclei {
  background: #0a0a0a;
  border-color: #444;
  color: #e5e5e5;
}
.plugin-badge--greenbone {
  background: color-mix(in srgb, #0E823E 18%, transparent);
  border-color: color-mix(in srgb, #0E823E 45%, transparent);
  color: #6ee7a0;
}

/* References/Assets (left, 2/3) + Metadata (right, 1/3) row */
.detail-grid {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}
.detail-grid__data {
  flex: 2;
  order: 1;
  min-width: 0;
}
.detail-grid__meta {
  flex: 1;
  order: 2;
  min-width: 0;
}
.detail-grid--stacked {
  flex-direction: column;
  align-items: stretch;
}
.detail-grid--stacked .detail-grid__meta {
  order: 1;
}
.detail-grid--stacked .detail-grid__data {
  order: 2;
}
.detail-grid__body {
  padding: 1rem 1.25rem 1.25rem;
}
.ares-dl {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.4rem 1rem;
  font-size: 0.85rem;
}
.ares-dl dt {
  color: var(--ares-text-muted);
  font-size: 0.8rem;
  padding-top: 0.1rem;
}
.ares-dl dd {
  margin: 0;
  color: var(--ares-text-2);
  line-height: 1.5;
}

.section-header-label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.section-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  line-height: 1;
}
.raw-data-actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}
.raw-data-actions-sep {
  width: 1px;
  height: 1.1rem;
  background: var(--ares-border);
  margin: 0 0.3rem;
}

/* ── Affected-asset table ─────────────────────────────────────────── */
.aff-id-link {
  background: none;
  border: none;
  cursor: pointer;
  font-family: monospace;
  font-size: 0.82rem;
  color: var(--p-primary-400);
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.aff-id-link:hover { color: var(--p-primary-300); }
.aff-remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ares-text-muted);
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
.aff-remove-btn:hover { color: #ef4444; }

/* ── Escalated-to table ──────────────────────────────────────────── */
.esc-aff-row {
  cursor: pointer;
  transition: background 0.1s;
}
.esc-aff-row:hover { background: color-mix(in srgb, var(--p-primary-500) 5%, transparent); }
.esc-desc-cell {
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Change-status dialog ────────────────────────────────────────── */
.ares-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
:deep(.ares-textarea) {
  background: var(--ares-surface-raised) !important;
  color: var(--ares-text) !important;
  border-color: var(--ares-border) !important;
}
:deep(.ares-textarea::placeholder) { color: var(--ares-text-muted) !important; }
:deep(.ares-textarea:focus) { border-color: var(--p-primary-500) !important; outline: none; }

/* ── History timeline ────────────────────────────────────────────── */
.history-row {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.65rem 1rem;
  border-top: 1px solid var(--ares-border);
}
.history-icon {
  font-size: 0.85rem;
  color: var(--ares-text-muted);
  margin-top: 0.2rem;
  flex-shrink: 0;
}
.history-body { flex: 1; min-width: 0; }
.history-line { font-size: 0.85rem; color: var(--ares-text-2); }
.history-note {
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  margin-top: 0.2rem;
  white-space: pre-wrap;
}
.history-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
  flex-shrink: 0;
}
.history-actor { font-size: 0.75rem; color: var(--ares-text-2); }
.history-date { font-size: 0.7rem; color: var(--ares-text-muted); font-family: monospace; }
</style>
