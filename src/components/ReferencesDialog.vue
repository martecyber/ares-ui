<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import AresBadge, { type BadgeSeverity } from '@/components/AresBadge.vue';
import KevBadge from '@/components/KevBadge.vue';
import ExploitBadge from '@/components/ExploitBadge.vue';
import { cweApi, capecApi, attackApi, owaspApi, cveApi, cisaKevApi, vulncheckKevApi } from '@/api/kb';
import type { CweEntry, CapecEntry, AttackTechnique, OwaspEntry, CveEntry, CisaKevStatusDto, VulnCheckKevStatusDto } from '@/api/kb';
import { exploitsApi, type ExploitCountDto } from '@/api/kb-exploits';
import { referencesApi } from '@/api/references';
import type { ReferenceCatalog, ReferenceEntry } from '@/api/references';

const props = defineProps<{
  visible: boolean;
  modelValue: ReferenceEntry[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:modelValue': [refs: ReferenceEntry[]];
}>();

// ── Catalogs ──────────────────────────────────────────────────────────────────
const catalogs = ref<ReferenceCatalog[]>([]);
const catalogByCode = computed(() => {
  const m: Record<string, ReferenceCatalog> = {};
  catalogs.value.forEach((c) => { m[c.code.toUpperCase()] = c; });
  return m;
});

onMounted(async () => {
  const res = await referencesApi.listCatalogs();
  catalogs.value = res.items;
});

// ── Local selected refs ───────────────────────────────────────────────────────
const selected = ref<ReferenceEntry[]>([]);

watch(() => props.visible, (open) => {
  if (open) selected.value = props.modelValue.map((r) => ({ ...r }));
});

function isSelected(title: string, catalogCode: string): boolean {
  const cat = catalogByCode.value[catalogCode.toUpperCase()];
  if (!cat) return false;
  return selected.value.some((r) => r.catalogId === cat.id && r.title === title);
}

function removeSelected(id: number) {
  selected.value = selected.value.filter((r) => r.id !== id);
}

function catalogLabel(catalogId: number): string {
  return catalogs.value.find((c) => c.id === catalogId)?.code ?? '?';
}

// ── Adding entries (find-or-create) ──────────────────────────────────────────
const adding = ref(false);

async function addEntry(catalogCode: string, title: string, description: string) {
  const cat = catalogByCode.value[catalogCode.toUpperCase()];
  if (!cat) return;
  if (isSelected(title, catalogCode)) {
    selected.value = selected.value.filter(
      (r) => !(r.catalogId === cat.id && r.title === title),
    );
    return;
  }
  adding.value = true;
  try {
    const entry = await referencesApi.findOrCreate(cat.id, title, description);
    if (!selected.value.some((r) => r.id === entry.id)) selected.value.push(entry);
  } finally {
    adding.value = false;
  }
}

// ── CWE warning ───────────────────────────────────────────────────────────────
const cweWarnEntry = ref<CweEntry | null>(null);
const cweWarnVisible = ref(false);

async function handleCweAdd(entry: CweEntry) {
  const usage = entry.vulnerabilityMapping?.usage;
  if (usage === 'Discouraged' || usage === 'Prohibited') {
    cweWarnEntry.value = entry;
    cweWarnVisible.value = true;
    return;
  }
  await addEntry('CWE', entry.code, entry.name);
}

async function confirmCweAdd() {
  if (!cweWarnEntry.value) return;
  cweWarnVisible.value = false;
  await addEntry('CWE', cweWarnEntry.value.code, cweWarnEntry.value.name);
  cweWarnEntry.value = null;
}

// ── CWE tab ───────────────────────────────────────────────────────────────────
const cweSearch = ref('');
const cweResults = ref<CweEntry[]>([]);
const cweLoading = ref(false);
const cwePreview = ref<CweEntry | null>(null);
let cweTimer: ReturnType<typeof setTimeout> | null = null;

watch(cweSearch, () => {
  if (cweTimer) clearTimeout(cweTimer);
  cweTimer = setTimeout(() => searchCwe(), 350);
});

async function searchCwe() {
  cweLoading.value = true;
  try {
    const res = await cweApi.list({ q: cweSearch.value || undefined, size: 40 });
    cweResults.value = res.content;
  } finally {
    cweLoading.value = false;
  }
}

// ── CAPEC tab ─────────────────────────────────────────────────────────────────
const capecSearch = ref('');
const capecResults = ref<CapecEntry[]>([]);
const capecLoading = ref(false);
const capecPreview = ref<CapecEntry | null>(null);
let capecTimer: ReturnType<typeof setTimeout> | null = null;

watch(capecSearch, () => {
  if (capecTimer) clearTimeout(capecTimer);
  capecTimer = setTimeout(() => searchCapec(), 350);
});

async function searchCapec() {
  capecLoading.value = true;
  try {
    const res = await capecApi.list({ q: capecSearch.value || undefined, size: 40 });
    capecResults.value = res.content;
  } finally {
    capecLoading.value = false;
  }
}

// ── ATT&CK tab ────────────────────────────────────────────────────────────────
const attackSearch = ref('');
const attackResults = ref<AttackTechnique[]>([]);
const attackLoading = ref(false);
const attackPreview = ref<AttackTechnique | null>(null);
let attackTimer: ReturnType<typeof setTimeout> | null = null;

watch(attackSearch, () => {
  if (attackTimer) clearTimeout(attackTimer);
  attackTimer = setTimeout(() => searchAttack(), 350);
});

async function searchAttack() {
  attackLoading.value = true;
  try {
    const res = await attackApi.techniques({ q: attackSearch.value || undefined, size: 40 });
    attackResults.value = res.content;
  } finally {
    attackLoading.value = false;
  }
}

// ── OWASP tab ─────────────────────────────────────────────────────────────────
const owaspSearch = ref('');
const owaspResults = ref<OwaspEntry[]>([]);
const owaspLoading = ref(false);
const owaspPreview = ref<OwaspEntry | null>(null);

const owaspByYear = computed(() => {
  const groups: { year: number; entries: OwaspEntry[] }[] = [];
  for (const entry of owaspResults.value) {
    let g = groups.find(g => g.year === entry.year);
    if (!g) { g = { year: entry.year, entries: [] }; groups.push(g); }
    g.entries.push(entry);
  }
  return groups;
});

async function searchOwasp() {
  owaspLoading.value = true;
  try {
    owaspResults.value = await owaspApi.list({ q: owaspSearch.value || undefined });
  } finally {
    owaspLoading.value = false;
  }
}

let owaspTimer: ReturnType<typeof setTimeout> | null = null;
watch(owaspSearch, () => {
  if (owaspTimer) clearTimeout(owaspTimer);
  owaspTimer = setTimeout(() => searchOwasp(), 350);
});

// ── CVE tab ───────────────────────────────────────────────────────────────────
const cveSearch = ref('');
const cveResults = ref<CveEntry[]>([]);
const cveLoading = ref(false);
const cvePreview = ref<CveEntry | null>(null);
let cveTimer: ReturnType<typeof setTimeout> | null = null;

const cveKevStatus = ref<Map<string, CisaKevStatusDto>>(new Map());
const cveVulncheckKevStatus = ref<Map<string, VulnCheckKevStatusDto>>(new Map());
const cveExploitCount = ref<Map<string, number>>(new Map());

watch(cveSearch, () => {
  if (cveTimer) clearTimeout(cveTimer);
  cveTimer = setTimeout(() => searchCve(), 350);
});

async function searchCve() {
  const q = cveSearch.value.trim();
  if (!q) { cveResults.value = []; return; }
  cveLoading.value = true;
  try {
    const res = await cveApi.list({ q, size: 40 });
    cveResults.value = res.items;
    await loadCveBadgeData();
  } finally {
    cveLoading.value = false;
  }
}

async function loadCveBadgeData() {
  const ids = cveResults.value.map((e) => e.cveId);
  if (!ids.length) {
    cveKevStatus.value = new Map();
    cveVulncheckKevStatus.value = new Map();
    cveExploitCount.value = new Map();
    return;
  }
  const [kevList, vcList, expList] = await Promise.all([
    cisaKevApi.status(ids).catch(() => [] as CisaKevStatusDto[]),
    vulncheckKevApi.status(ids).catch(() => [] as VulnCheckKevStatusDto[]),
    exploitsApi.status(ids).catch(() => [] as ExploitCountDto[]),
  ]);
  cveKevStatus.value = new Map(kevList.map((d) => [d.id, d]));
  cveVulncheckKevStatus.value = new Map(vcList.map((d) => [d.id, d]));
  cveExploitCount.value = new Map(expList.map((d) => [d.cveId, d.count]));
}

// ── URL tab ───────────────────────────────────────────────────────────────────
const urlInput = ref('');
const urlTitleInput = ref('');
const urlAdding = ref(false);
const urlError = ref('');

async function addUrlEntry() {
  const url = urlInput.value.trim();
  if (!url) return;
  urlError.value = '';
  urlAdding.value = true;
  try {
    const entry = await referencesApi.createUrlEntry(url, urlTitleInput.value.trim() || undefined);
    if (!selected.value.some((r) => r.id === entry.id)) selected.value.push(entry);
    urlInput.value = '';
    urlTitleInput.value = '';
  } catch (e: any) {
    urlError.value = e?.response?.data?.detail || e?.response?.data?.message || 'Could not add this URL — check it is reachable and points to a public site.';
  } finally {
    urlAdding.value = false;
  }
}

const urlSelected = computed(() => selected.value.filter((r) => catalogLabel(r.catalogId) === 'URL'));

function truncateUrl(url: string, n = 60): string {
  if (!url) return '';
  return url.length > n ? url.slice(0, n) + '…' : url;
}

// ── Load defaults when opening ────────────────────────────────────────────────
watch(() => props.visible, async (open) => {
  if (!open) return;
  if (!cweResults.value.length)   searchCwe();
  if (!capecResults.value.length) searchCapec();
  if (!attackResults.value.length) searchAttack();
  if (!owaspResults.value.length)  searchOwasp();
  // CVE not auto-loaded (too many records — requires explicit search)
});

// ── Apply / close ─────────────────────────────────────────────────────────────
function apply() {
  emit('update:modelValue', [...selected.value]);
  emit('update:visible', false);
}

function close() { emit('update:visible', false); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncate(s: string | null | undefined, n = 200): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function cweUsageTag(usage: string): BadgeSeverity {
  if (usage === 'Allowed') return 'success';
  if (usage === 'Allowed-with-Review') return 'warn';
  if (usage === 'Discouraged') return 'warn';
  if (usage === 'Prohibited') return 'danger';
  return 'secondary';
}
</script>

<template>
  <!-- CWE mapping warning dialog -->
  <Dialog
    v-model:visible="cweWarnVisible"
    :header="cweWarnEntry?.vulnerabilityMapping?.usage === 'Prohibited' ? 'CWE mapping prohibited' : 'CWE mapping discouraged'"
    modal
    :style="{ width: 'min(520px, 95vw)' }"
  >
    <div style="display:flex; flex-direction:column; gap:0.85rem;">
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <i
          :class="cweWarnEntry?.vulnerabilityMapping?.usage === 'Prohibited' ? 'pi pi-ban' : 'pi pi-exclamation-triangle'"
          :style="{ color: cweWarnEntry?.vulnerabilityMapping?.usage === 'Prohibited' ? '#ef4444' : '#f97316', fontSize: '1.25rem' }"
        />
        <span style="font-weight:600; font-size:0.95rem;">{{ cweWarnEntry?.code }} — {{ cweWarnEntry?.name }}</span>
      </div>
      <div
        :style="{
          background: cweWarnEntry?.vulnerabilityMapping?.usage === 'Prohibited'
            ? 'color-mix(in srgb,#ef4444 10%,transparent)'
            : 'color-mix(in srgb,#f97316 10%,transparent)',
          border: `1px solid ${cweWarnEntry?.vulnerabilityMapping?.usage === 'Prohibited' ? 'rgba(239,68,68,0.4)' : 'rgba(249,115,22,0.4)'}`,
          borderRadius: '6px',
          padding: '0.75rem 1rem',
          fontSize: '0.83rem',
        }"
      >
        <strong>Mapping status: {{ cweWarnEntry?.vulnerabilityMapping?.usage }}</strong>
        <p v-if="cweWarnEntry?.vulnerabilityMapping?.rationale" style="margin:0.4rem 0 0; color:var(--ares-text-2);">
          {{ cweWarnEntry.vulnerabilityMapping.rationale }}
        </p>
        <p v-if="cweWarnEntry?.vulnerabilityMapping?.comments" style="margin:0.4rem 0 0; color:var(--ares-text-muted); font-style:italic;">
          {{ cweWarnEntry.vulnerabilityMapping.comments }}
        </p>
      </div>
      <p style="font-size:0.82rem; color:var(--ares-text-muted); margin:0;">
        The application will not block this mapping, but MITRE advises against it. Proceed only if you have a strong justification.
      </p>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" size="small" @click="cweWarnVisible = false" />
      <Button
        :label="cweWarnEntry?.vulnerabilityMapping?.usage === 'Prohibited' ? 'Add anyway (Prohibited)' : 'Add anyway'"
        :severity="cweWarnEntry?.vulnerabilityMapping?.usage === 'Prohibited' ? 'danger' : 'warn'"
        size="small"
        @click="confirmCweAdd"
      />
    </template>
  </Dialog>

  <!-- Main references dialog -->
  <Dialog
    :visible="visible"
    header="References"
    modal
    :style="{ width: 'min(920px, 96vw)', maxHeight: '90vh' }"
    :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem; display:flex; flex-direction:column; gap:1rem;' } }"
    @update:visible="close"
  >
    <!-- Selected chips -->
    <div v-if="selected.length" class="chips-bar">
      <span class="chips-label">Selected</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem; flex:1;">
        <div v-for="ref in selected" :key="ref.id" class="ref-chip">
          <span class="ref-chip-cat">{{ catalogLabel(ref.catalogId) }}</span>
          <span>{{ ref.title }}</span>
          <button type="button" class="ref-chip-x" @click="removeSelected(ref.id)">×</button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <Tabs value="cwe" style="flex:1; overflow:hidden; display:flex; flex-direction:column;">
      <TabList>
        <Tab value="cwe">CWE</Tab>
        <Tab value="capec">CAPEC</Tab>
        <Tab value="attack">ATT&amp;CK</Tab>
        <Tab value="owasp">OWASP</Tab>
        <Tab value="cve">CVE</Tab>
        <Tab value="url">URL</Tab>
      </TabList>
      <TabPanels style="flex:1; overflow:hidden; padding:0;">

      <!-- ── CWE ───────────────────────────────────────────────────────────── -->
      <TabPanel value="cwe">
        <div class="tab-body">
          <div class="tab-left">
            <InputText
              v-model="cweSearch"
              placeholder="Search by ID or name…"
              class="tab-search"
            />
            <div class="results-list">
              <div v-if="cweLoading" class="list-hint">Searching…</div>
              <div v-else-if="!cweResults.length" class="list-hint">No results</div>
              <div
                v-for="entry in cweResults"
                :key="entry.id"
                class="result-row"
                :class="{ 'result-row--selected': isSelected(entry.code, 'CWE'), 'result-row--preview': cwePreview?.id === entry.id }"
                @click="cwePreview = entry"
              >
                <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                  <span class="entry-code">{{ entry.code }}</span>
                  <span class="entry-name">{{ entry.name }}</span>
                  <i v-if="isSelected(entry.code, 'CWE')" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem; flex-shrink:0;" />
                </div>
                <AresBadge
                  v-if="entry.vulnerabilityMapping?.usage && entry.vulnerabilityMapping.usage !== 'Allowed'"
                  :value="entry.vulnerabilityMapping.usage"
                  :severity="cweUsageTag(entry.vulnerabilityMapping.usage)"
                  style="font-size:0.62rem; flex-shrink:0;"
                />
              </div>
            </div>
          </div>
          <div class="tab-right">
            <div v-if="!cwePreview" class="preview-empty">Click an entry to preview</div>
            <div v-else class="preview-pane">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem; margin-bottom:0.6rem;">
                <div>
                  <div class="preview-code">{{ cwePreview.code }}</div>
                  <div class="preview-name">{{ cwePreview.name }}</div>
                </div>
                <Button
                  :icon="isSelected(cwePreview.code, 'CWE') ? 'pi pi-minus' : 'pi pi-plus'"
                  :label="isSelected(cwePreview.code, 'CWE') ? 'Remove' : 'Add'"
                  :severity="isSelected(cwePreview.code, 'CWE') ? 'secondary' : 'primary'"
                  size="small"
                  :loading="adding"
                  @click="handleCweAdd(cwePreview)"
                />
              </div>
              <div v-if="cwePreview.vulnerabilityMapping" class="preview-badge-row">
                <AresBadge
                  :value="'Mapping: ' + cwePreview.vulnerabilityMapping.usage"
                  :severity="cweUsageTag(cwePreview.vulnerabilityMapping.usage)"
                  style="font-size:0.72rem;"
                />
              </div>
              <div v-if="cwePreview.abstraction" class="preview-meta">{{ cwePreview.abstraction }} · {{ cwePreview.type ?? '' }}</div>
              <div v-if="cwePreview.description" class="preview-desc">{{ truncate(cwePreview.description, 300) }}</div>
              <div v-if="cwePreview.consequences?.length" class="preview-section">
                <div class="preview-section-title">Consequences</div>
                <div v-for="(c, i) in cwePreview.consequences.slice(0,3)" :key="i" class="preview-item">
                  <span v-if="c.scopes?.length" class="preview-tag-row">
                    <span v-for="s in c.scopes" :key="s" class="inline-tag">{{ s }}</span>
                  </span>
                  <span style="font-size:0.77rem; color:var(--ares-text-2);">{{ c.impacts?.join(', ') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <!-- ── CAPEC ─────────────────────────────────────────────────────────── -->
      <TabPanel value="capec">
        <div class="tab-body">
          <div class="tab-left">
            <InputText
              v-model="capecSearch"
              placeholder="Search by ID or name…"
              class="tab-search"
            />
            <div class="results-list">
              <div v-if="capecLoading" class="list-hint">Searching…</div>
              <div v-else-if="!capecResults.length" class="list-hint">No results</div>
              <div
                v-for="entry in capecResults"
                :key="entry.id"
                class="result-row"
                :class="{ 'result-row--selected': isSelected(entry.capecId, 'CAPEC'), 'result-row--preview': capecPreview?.id === entry.id }"
                @click="capecPreview = entry"
              >
                <span class="entry-code">{{ entry.capecId }}</span>
                <span class="entry-name">{{ entry.name }}</span>
                <i v-if="isSelected(entry.capecId, 'CAPEC')" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem; margin-left:auto; flex-shrink:0;" />
              </div>
            </div>
          </div>
          <div class="tab-right">
            <div v-if="!capecPreview" class="preview-empty">Click an entry to preview</div>
            <div v-else class="preview-pane">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem; margin-bottom:0.6rem;">
                <div>
                  <div class="preview-code">{{ capecPreview.capecId }}</div>
                  <div class="preview-name">{{ capecPreview.name }}</div>
                </div>
                <Button
                  :icon="isSelected(capecPreview.capecId, 'CAPEC') ? 'pi pi-minus' : 'pi pi-plus'"
                  :label="isSelected(capecPreview.capecId, 'CAPEC') ? 'Remove' : 'Add'"
                  :severity="isSelected(capecPreview.capecId, 'CAPEC') ? 'secondary' : 'primary'"
                  size="small"
                  :loading="adding"
                  @click="addEntry('CAPEC', capecPreview.capecId, capecPreview.name)"
                />
              </div>
              <div v-if="capecPreview.abstraction" class="preview-meta">{{ capecPreview.abstraction }}</div>
              <div v-if="capecPreview.typicalSeverity" class="preview-meta">Typical severity: {{ capecPreview.typicalSeverity }}</div>
              <div v-if="capecPreview.description" class="preview-desc">{{ truncate(capecPreview.description, 300) }}</div>
              <div v-if="capecPreview.consequences?.length" class="preview-section">
                <div class="preview-section-title">Consequences</div>
                <div v-for="(c, i) in capecPreview.consequences.slice(0,3)" :key="i" class="preview-item">
                  <span v-if="c.scopes?.length" class="preview-tag-row">
                    <span v-for="s in c.scopes" :key="s" class="inline-tag">{{ s }}</span>
                  </span>
                  <span style="font-size:0.77rem; color:var(--ares-text-2);">{{ c.impacts?.join(', ') }}</span>
                </div>
              </div>
              <div v-if="capecPreview.mitigations?.length" class="preview-section">
                <div class="preview-section-title">Mitigations</div>
                <p v-for="(m, i) in capecPreview.mitigations.slice(0,2)" :key="i" style="font-size:0.77rem; color:var(--ares-text-2); margin:0.2rem 0 0;">{{ truncate(m, 150) }}</p>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <!-- ── ATT&CK ─────────────────────────────────────────────────────────── -->
      <TabPanel value="attack">
        <div class="tab-body">
          <div class="tab-left">
            <InputText
              v-model="attackSearch"
              placeholder="Search techniques by ID or name…"
              class="tab-search"
            />
            <div class="results-list">
              <div v-if="attackLoading" class="list-hint">Searching…</div>
              <div v-else-if="!attackResults.length" class="list-hint">No results</div>
              <div
                v-for="entry in attackResults"
                :key="entry.id"
                class="result-row"
                :class="{ 'result-row--selected': isSelected(entry.attackId, 'ATT&CK'), 'result-row--preview': attackPreview?.id === entry.id }"
                @click="attackPreview = entry"
              >
                <span class="entry-code">{{ entry.attackId }}</span>
                <span class="entry-name">{{ entry.name }}</span>
                <i v-if="isSelected(entry.attackId, 'ATT&CK')" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem; margin-left:auto; flex-shrink:0;" />
              </div>
            </div>
          </div>
          <div class="tab-right">
            <div v-if="!attackPreview" class="preview-empty">Click an entry to preview</div>
            <div v-else class="preview-pane">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem; margin-bottom:0.6rem;">
                <div>
                  <div class="preview-code">{{ attackPreview.attackId }}</div>
                  <div class="preview-name">{{ attackPreview.name }}</div>
                </div>
                <Button
                  :icon="isSelected(attackPreview.attackId, 'ATT&CK') ? 'pi pi-minus' : 'pi pi-plus'"
                  :label="isSelected(attackPreview.attackId, 'ATT&CK') ? 'Remove' : 'Add'"
                  :severity="isSelected(attackPreview.attackId, 'ATT&CK') ? 'secondary' : 'primary'"
                  size="small"
                  :loading="adding"
                  @click="addEntry('ATT&CK', attackPreview.attackId, attackPreview.name)"
                />
              </div>
              <div v-if="attackPreview.tactics?.length" class="preview-tag-row" style="margin-bottom:0.4rem;">
                <span v-for="t in attackPreview.tactics" :key="t" class="inline-tag">{{ t }}</span>
              </div>
              <div v-if="attackPreview.platforms?.length" class="preview-meta">Platforms: {{ attackPreview.platforms.join(', ') }}</div>
              <div v-if="attackPreview.description" class="preview-desc">{{ truncate(attackPreview.description, 400) }}</div>
              <div v-if="attackPreview.detection" class="preview-section">
                <div class="preview-section-title">Detection</div>
                <p style="font-size:0.77rem; color:var(--ares-text-2); margin:0.2rem 0 0;">{{ truncate(attackPreview.detection, 200) }}</p>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <!-- ── OWASP ──────────────────────────────────────────────────────────── -->
      <TabPanel value="owasp">
        <div class="tab-body">
          <div class="tab-left">
            <InputText
              v-model="owaspSearch"
              placeholder="Search by ID or name…"
              class="tab-search"
            />
            <div class="results-list">
              <div v-if="owaspLoading" class="list-hint">Searching…</div>
              <div v-else-if="!owaspResults.length" class="list-hint">No results</div>
              <template v-for="group in owaspByYear" :key="group.year">
                <div class="owasp-year-header">Top 10 · {{ group.year }}</div>
                <div
                  v-for="entry in group.entries"
                  :key="entry.id"
                  class="result-row"
                  :class="{ 'result-row--selected': isSelected(`${entry.owaspId}:${entry.year}`, 'OWASP'), 'result-row--preview': owaspPreview?.id === entry.id }"
                  @click="owaspPreview = entry"
                >
                  <span class="entry-code">{{ entry.owaspId }}:{{ entry.year }}</span>
                  <span class="entry-name">{{ entry.name }}</span>
                  <i v-if="isSelected(`${entry.owaspId}:${entry.year}`, 'OWASP')" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem; margin-left:auto; flex-shrink:0;" />
                </div>
              </template>
            </div>
          </div>
          <div class="tab-right">
            <div v-if="!owaspPreview" class="preview-empty">Click an entry to preview</div>
            <div v-else class="preview-pane">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem; margin-bottom:0.6rem;">
                <div>
                  <div class="preview-code">{{ owaspPreview.owaspId }}:{{ owaspPreview.year }}</div>
                  <div class="preview-name">{{ owaspPreview.name }}</div>
                </div>
                <Button
                  :icon="isSelected(`${owaspPreview.owaspId}:${owaspPreview.year}`, 'OWASP') ? 'pi pi-minus' : 'pi pi-plus'"
                  :label="isSelected(`${owaspPreview.owaspId}:${owaspPreview.year}`, 'OWASP') ? 'Remove' : 'Add'"
                  :severity="isSelected(`${owaspPreview.owaspId}:${owaspPreview.year}`, 'OWASP') ? 'secondary' : 'primary'"
                  size="small"
                  :loading="adding"
                  @click="addEntry('OWASP', `${owaspPreview.owaspId}:${owaspPreview.year}`, owaspPreview.name)"
                />
              </div>
              <div class="preview-meta">OWASP Top 10 · {{ owaspPreview.year }} · Rank #{{ owaspPreview.rank }}</div>
              <div v-if="owaspPreview.description" class="preview-desc">{{ truncate(owaspPreview.description, 400) }}</div>
              <div v-if="owaspPreview.cwes?.length" class="preview-section">
                <div class="preview-section-title">Related CWEs</div>
                <div class="preview-tag-row">
                  <span v-for="cwe in owaspPreview.cwes" :key="cwe" class="inline-tag">{{ cwe }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <!-- ── CVE ───────────────────────────────────────────────────────────── -->
      <TabPanel value="cve">
        <div class="tab-body">
          <div class="tab-left">
            <InputText
              v-model="cveSearch"
              placeholder="Search by CVE-ID or keyword…"
              class="tab-search"
            />
            <div class="results-list">
              <div v-if="cveLoading" class="list-hint">Searching…</div>
              <div v-else-if="!cveSearch.trim() && !cveResults.length" class="list-hint">Type a CVE-ID or keyword to search.</div>
              <div v-else-if="!cveResults.length" class="list-hint">No results</div>
              <div
                v-for="entry in cveResults"
                :key="entry.id"
                class="result-row"
                :class="{ 'result-row--selected': isSelected(entry.cveId, 'CVE'), 'result-row--preview': cvePreview?.id === entry.id }"
                @click="cvePreview = entry"
              >
                <span class="entry-code">{{ entry.cveId }}</span>
                <span class="entry-name">{{ truncate(entry.description, 60) }}</span>
                <span class="entry-badges">
                  <span v-if="entry.severity" :style="{ fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, color: entry.severity === 'CRITICAL' ? '#ef4444' : entry.severity === 'HIGH' ? '#f97316' : entry.severity === 'MEDIUM' ? '#eab308' : 'var(--ares-text-muted)' }">{{ entry.severity }}</span>
                  <KevBadge :status="cveKevStatus.get(entry.cveId)" source="cisa" />
                  <KevBadge :status="cveVulncheckKevStatus.get(entry.cveId)" source="vulncheck" />
                  <ExploitBadge :cve-id="entry.cveId" :count="cveExploitCount.get(entry.cveId)" />
                </span>
                <i v-if="isSelected(entry.cveId, 'CVE')" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem; flex-shrink:0;" />
              </div>
            </div>
          </div>
          <div class="tab-right">
            <div v-if="!cvePreview" class="preview-empty">Click an entry to preview</div>
            <div v-else class="preview-pane">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem; margin-bottom:0.6rem;">
                <div>
                  <div class="preview-code">{{ cvePreview.cveId }}</div>
                  <div v-if="cvePreview.severity" class="preview-name">{{ cvePreview.severity }}</div>
                </div>
                <Button
                  :icon="isSelected(cvePreview.cveId, 'CVE') ? 'pi pi-minus' : 'pi pi-plus'"
                  :label="isSelected(cvePreview.cveId, 'CVE') ? 'Remove' : 'Add'"
                  :severity="isSelected(cvePreview.cveId, 'CVE') ? 'secondary' : 'primary'"
                  size="small"
                  :loading="adding"
                  @click="addEntry('CVE', cvePreview.cveId, truncate(cvePreview.description, 200))"
                />
              </div>
              <div
                v-if="cveKevStatus.get(cvePreview.cveId) || cveVulncheckKevStatus.get(cvePreview.cveId) || cveExploitCount.get(cvePreview.cveId)"
                class="preview-badge-row"
              >
                <KevBadge :status="cveKevStatus.get(cvePreview.cveId)" source="cisa" />
                <KevBadge :status="cveVulncheckKevStatus.get(cvePreview.cveId)" source="vulncheck" />
                <ExploitBadge :cve-id="cvePreview.cveId" :count="cveExploitCount.get(cvePreview.cveId)" />
              </div>
              <div v-if="cvePreview.cvssScore != null" class="preview-meta">
                CVSS {{ cvePreview.cvssVersion }} · Score {{ cvePreview.cvssScore.toFixed(1) }}
                <span v-if="cvePreview.cvssVector" style="font-family:monospace; font-size:0.68rem; margin-left:0.4rem; color:var(--ares-text-muted);">{{ cvePreview.cvssVector }}</span>
              </div>
              <div v-if="cvePreview.description" class="preview-desc">{{ truncate(cvePreview.description, 400) }}</div>
              <div v-if="cvePreview.cwes?.length" class="preview-section">
                <div class="preview-section-title">Related CWEs</div>
                <div class="preview-tag-row">
                  <span v-for="cwe in cvePreview.cwes" :key="cwe" class="inline-tag">{{ cwe }}</span>
                </div>
              </div>
              <div v-if="cvePreview.affectedProducts?.length" class="preview-section">
                <div class="preview-section-title">Affected products</div>
                <div class="preview-tag-row">
                  <span
                    v-for="(p, i) in cvePreview.affectedProducts.slice(0, 8)"
                    :key="i"
                    class="inline-tag"
                  >{{ [p.vendor, p.product].filter(Boolean).join(' / ') || '—' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <!-- ── URL ───────────────────────────────────────────────────────────── -->
      <TabPanel value="url">
        <div class="url-tab-body">
          <div class="url-form">
            <InputText
              v-model="urlInput"
              placeholder="https://example.com/advisory"
              class="tab-search"
              @keyup.enter="addUrlEntry"
            />
            <InputText
              v-model="urlTitleInput"
              placeholder="Title (optional — fetched from the page if left blank)"
              class="tab-search"
              @keyup.enter="addUrlEntry"
            />
            <Button
              label="Add"
              icon="pi pi-plus"
              size="small"
              :loading="urlAdding"
              :disabled="!urlInput.trim()"
              @click="addUrlEntry"
            />
            <p v-if="urlError" class="url-error">{{ urlError }}</p>
          </div>
          <div class="results-list url-added-list">
            <div v-if="!urlSelected.length" class="list-hint">No URLs added yet.</div>
            <div v-for="item in urlSelected" :key="item.id" class="result-row" style="cursor: default;">
              <i class="pi pi-globe" style="color: var(--ares-text-muted); flex-shrink: 0;" />
              <span class="entry-name">
                <template v-if="item.title">{{ item.title }} — </template>{{ truncateUrl(item.url || '') }}
              </span>
              <button type="button" class="ref-chip-x" style="margin-left: auto;" @click="removeSelected(item.id)">×</button>
            </div>
          </div>
        </div>
      </TabPanel>

      </TabPanels>
    </Tabs>

    <!-- Footer -->
    <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.85rem; border-top:1px solid var(--ares-border);">
      <Button type="button" label="Cancel" severity="secondary" size="small" @click="close" />
      <Button
        type="button"
        icon="pi pi-check"
        :label="selected.length ? 'Apply (' + selected.length + ')' : 'Apply'"
        size="small"
        @click="apply"
      />
    </div>
  </Dialog>
</template>

<style scoped>
/* ── Tabs background overrides ────────────────────────────────────────────── */
:deep(.p-tabs),
:deep(.p-tablist),
:deep(.p-tabpanels) {
  background: transparent !important;
}
:deep(.p-tablist) {
  border-bottom: 1px solid var(--ares-border) !important;
}
:deep(.p-tab) {
  background: transparent !important;
  color: var(--ares-text-muted) !important;
}
:deep(.p-tab[data-p-active="true"]) {
  color: var(--p-primary-400) !important;
}

/* ── OWASP year group header ───────────────────────────────────────────────── */
.owasp-year-header {
  padding: 0.4rem 0.75rem 0.2rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ares-text-muted);
  border-top: 1px solid var(--ares-border);
}
.owasp-year-header:first-child {
  border-top: none;
}

/* ── Selected chips bar ────────────────────────────────────────────────────── */
.chips-bar {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.1));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.5rem 0.75rem;
}
.chips-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  padding-top: 0.15rem;
  white-space: nowrap;
}
.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.18rem 0.5rem;
  font-size: 0.78rem;
}
.ref-chip-cat {
  font-size: 0.62rem;
  font-weight: 700;
  background: var(--p-primary-500);
  color: #fff;
  border-radius: var(--ares-radius);
  padding: 0.1em 0.4em;
  letter-spacing: 0.04em;
}
.ref-chip-x {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ares-text-muted);
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
.ref-chip-x:hover { color: #ef4444; }

/* ── Tab layout ────────────────────────────────────────────────────────────── */
.tab-body {
  display: flex;
  gap: 0.75rem;
  height: 380px;
}
.tab-left {
  display: flex;
  flex-direction: column;
  flex: 0 0 52%;
  gap: 0.5rem;
  min-width: 0;
}
.tab-right {
  flex: 1;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.07));
}
.tab-search { width: 100%; }

/* ── Results list ──────────────────────────────────────────────────────────── */
.results-list {
  flex: 1;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow-y: auto;
}
.list-hint {
  padding: 1rem;
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  text-align: center;
}
.result-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--ares-border);
  cursor: pointer;
  transition: background 0.1s;
}
.result-row:last-child { border-bottom: none; }
.result-row:hover { background: color-mix(in srgb, var(--p-primary-500) 5%, transparent); }
.result-row--preview { background: color-mix(in srgb, var(--p-primary-500) 8%, transparent); }
.result-row--selected { background: color-mix(in srgb, var(--p-primary-500) 6%, transparent); }

.entry-code {
  font-family: monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--p-primary-400);
  white-space: nowrap;
  flex-shrink: 0;
}
.entry-name {
  font-size: 0.8rem;
  color: var(--ares-text-2);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-badges {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  margin-left: auto;
}

/* ── Preview pane ──────────────────────────────────────────────────────────── */
.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.8rem;
  color: var(--ares-text-muted);
}
.preview-pane {
  height: 100%;
  overflow-y: auto;
  padding: 0.85rem 1rem;
}
.preview-code {
  font-family: monospace;
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--p-primary-400);
}
.preview-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ares-text-1);
  margin-top: 0.1rem;
  line-height: 1.3;
}
.preview-meta {
  font-size: 0.73rem;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.preview-desc {
  font-size: 0.8rem;
  color: var(--ares-text-2);
  line-height: 1.5;
  margin-bottom: 0.6rem;
}
.preview-badge-row {
  margin-bottom: 0.5rem;
}
.preview-section {
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--ares-border);
}
.preview-section-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.preview-item {
  font-size: 0.77rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.35rem;
}
.preview-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  margin-bottom: 0.2rem;
}
.inline-tag {
  font-size: 0.65rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 30%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.08em 0.35em;
}

/* ── URL tab ───────────────────────────────────────────────────────────────── */
.url-tab-body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  height: 380px;
}
.url-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.url-error {
  margin: 0;
  font-size: 0.78rem;
  color: #ef4444;
}
.url-added-list {
  flex: 1;
}

/* ── Severity dots ─────────────────────────────────────────────────────────── */
.sev-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sev-critical { background: #ef4444; }
.sev-high     { background: #f97316; }
.sev-medium   { background: #ca8a04; }
.sev-low      { background: #16a34a; }
</style>
