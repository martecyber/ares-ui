<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { cweApi, capecApi, attackApi, owaspApi, cveApi } from '@/api/kb';
import type { CweEntry, CapecEntry, AttackTechnique, OwaspEntry, CveEntry } from '@/api/kb';
import type { TestingProcedureExternalRef } from '@/api/kb-testing-procedures';

const props = defineProps<{
  visible: boolean;
  modelValue: TestingProcedureExternalRef[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:modelValue': [refs: TestingProcedureExternalRef[]];
}>();

const selected = ref<TestingProcedureExternalRef[]>([]);

watch(() => props.visible, (open) => {
  if (open) {
    selected.value = props.modelValue.map(r => ({ ...r }));
    if (!cweResults.value.length)    searchCwe();
    if (!capecResults.value.length)  searchCapec();
    if (!attackResults.value.length) searchAttack();
    if (!owaspResults.value.length)  searchOwasp();
  }
});

function isLinked(type: string, key: string) {
  return selected.value.some(r => r.refType === type && r.refKey === key);
}

function toggle(type: string, key: string, label: string) {
  if (isLinked(type, key)) {
    selected.value = selected.value.filter(r => !(r.refType === type && r.refKey === key));
  } else {
    selected.value.push({ id: null, refType: type, refKey: key, refLabel: label });
  }
}

function removeChip(r: TestingProcedureExternalRef) {
  selected.value = selected.value.filter(x => !(x.refType === r.refType && x.refKey === r.refKey));
}

function chipLabel(r: TestingProcedureExternalRef) {
  return r.refLabel || r.refKey;
}

function typeLabel(type: string) {
  const map: Record<string, string> = { cve:'CVE', cwe:'CWE', capec:'CAPEC', attack:'ATT&CK', owasp:'OWASP' };
  return map[type] ?? type.toUpperCase();
}

// ── CWE ───────────────────────────────────────────────────────────────────────
const cweSearch = ref('');
const cweResults = ref<CweEntry[]>([]);
const cweLoading = ref(false);
const cwePreview = ref<CweEntry | null>(null);
let cweTimer: ReturnType<typeof setTimeout> | null = null;
watch(cweSearch, () => { if (cweTimer) clearTimeout(cweTimer); cweTimer = setTimeout(searchCwe, 350); });
async function searchCwe() {
  cweLoading.value = true;
  try { const r = await cweApi.list({ q: cweSearch.value || undefined, size: 40 }); cweResults.value = r.content; }
  finally { cweLoading.value = false; }
}

// ── CAPEC ─────────────────────────────────────────────────────────────────────
const capecSearch = ref('');
const capecResults = ref<CapecEntry[]>([]);
const capecLoading = ref(false);
const capecPreview = ref<CapecEntry | null>(null);
let capecTimer: ReturnType<typeof setTimeout> | null = null;
watch(capecSearch, () => { if (capecTimer) clearTimeout(capecTimer); capecTimer = setTimeout(searchCapec, 350); });
async function searchCapec() {
  capecLoading.value = true;
  try { const r = await capecApi.list({ q: capecSearch.value || undefined, size: 40 }); capecResults.value = r.content; }
  finally { capecLoading.value = false; }
}

// ── ATT&CK ────────────────────────────────────────────────────────────────────
const attackSearch = ref('');
const attackResults = ref<AttackTechnique[]>([]);
const attackLoading = ref(false);
const attackPreview = ref<AttackTechnique | null>(null);
let attackTimer: ReturnType<typeof setTimeout> | null = null;
watch(attackSearch, () => { if (attackTimer) clearTimeout(attackTimer); attackTimer = setTimeout(searchAttack, 350); });
async function searchAttack() {
  attackLoading.value = true;
  try { const r = await attackApi.techniques({ q: attackSearch.value || undefined, size: 40 }); attackResults.value = r.content; }
  finally { attackLoading.value = false; }
}

// ── OWASP ─────────────────────────────────────────────────────────────────────
const owaspSearch = ref('');
const owaspResults = ref<OwaspEntry[]>([]);
const owaspLoading = ref(false);
const owaspPreview = ref<OwaspEntry | null>(null);
let owaspTimer: ReturnType<typeof setTimeout> | null = null;
watch(owaspSearch, () => { if (owaspTimer) clearTimeout(owaspTimer); owaspTimer = setTimeout(searchOwasp, 350); });
async function searchOwasp() {
  owaspLoading.value = true;
  try { owaspResults.value = await owaspApi.list({ q: owaspSearch.value || undefined }); }
  finally { owaspLoading.value = false; }
}

// ── CVE ───────────────────────────────────────────────────────────────────────
const cveSearch = ref('');
const cveResults = ref<CveEntry[]>([]);
const cveLoading = ref(false);
const cvePreview = ref<CveEntry | null>(null);
let cveTimer: ReturnType<typeof setTimeout> | null = null;
watch(cveSearch, () => { if (cveTimer) clearTimeout(cveTimer); cveTimer = setTimeout(searchCve, 350); });
async function searchCve() {
  const q = cveSearch.value.trim();
  if (!q) { cveResults.value = []; return; }
  cveLoading.value = true;
  try { const r = await cveApi.list({ q, size: 40 }); cveResults.value = r.items; }
  finally { cveLoading.value = false; }
}

function apply() {
  emit('update:modelValue', [...selected.value]);
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Link external DB entries"
    modal
    :style="{ width: 'min(920px, 96vw)', maxHeight: '90vh' }"
    :pt="{ content: { style: 'padding:1.25rem; display:flex; flex-direction:column; gap:1rem;' } }"
    @update:visible="emit('update:visible', false)"
  >
    <!-- Selected chips -->
    <div v-if="selected.length" class="chips-bar">
      <span class="chips-label">Selected</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem; flex:1;">
        <div v-for="r in selected" :key="r.refType + r.refKey" class="ref-chip">
          <span class="ref-chip-cat">{{ typeLabel(r.refType) }}</span>
          <span>{{ chipLabel(r) }}</span>
          <button type="button" class="ref-chip-x" @click="removeChip(r)">×</button>
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
      </TabList>
      <TabPanels style="flex:1; overflow:hidden; padding:0;">

        <!-- CWE -->
        <TabPanel value="cwe">
          <div class="tab-body">
            <div class="tab-left">
              <InputText v-model="cweSearch" placeholder="Search by ID or name…" class="tab-search" />
              <div class="results-list">
                <div v-if="cweLoading" class="list-hint">Searching…</div>
                <div v-else-if="!cweResults.length" class="list-hint">No results</div>
                <div v-for="e in cweResults" :key="e.id"
                  class="result-row"
                  :class="{ 'result-row--selected': isLinked('cwe', e.id), 'result-row--preview': cwePreview?.id === e.id }"
                  @click="cwePreview = e">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                    <span class="entry-code">{{ e.code }}</span>
                    <span class="entry-name">{{ e.name }}</span>
                    <i v-if="isLinked('cwe', e.id)" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem;" />
                  </div>
                </div>
              </div>
            </div>
            <div class="tab-right">
              <div v-if="!cwePreview" class="preview-empty">Click an entry to preview</div>
              <template v-else>
                <div class="preview-title">{{ cwePreview.code }} — {{ cwePreview.name }}</div>
                <p class="preview-desc">{{ cwePreview.description }}</p>
                <Button
                  :label="isLinked('cwe', cwePreview.id) ? 'Remove' : 'Add'"
                  :severity="isLinked('cwe', cwePreview.id) ? 'secondary' : undefined"
                  size="small"
                  @click="toggle('cwe', cwePreview.id, `${cwePreview.code}: ${cwePreview.name}`)"
                />
              </template>
            </div>
          </div>
        </TabPanel>

        <!-- CAPEC -->
        <TabPanel value="capec">
          <div class="tab-body">
            <div class="tab-left">
              <InputText v-model="capecSearch" placeholder="Search by ID or name…" class="tab-search" />
              <div class="results-list">
                <div v-if="capecLoading" class="list-hint">Searching…</div>
                <div v-else-if="!capecResults.length" class="list-hint">No results</div>
                <div v-for="e in capecResults" :key="e.id"
                  class="result-row"
                  :class="{ 'result-row--selected': isLinked('capec', e.id), 'result-row--preview': capecPreview?.id === e.id }"
                  @click="capecPreview = e">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                    <span class="entry-code">CAPEC-{{ e.capecId }}</span>
                    <span class="entry-name">{{ e.name }}</span>
                    <i v-if="isLinked('capec', e.id)" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem;" />
                  </div>
                </div>
              </div>
            </div>
            <div class="tab-right">
              <div v-if="!capecPreview" class="preview-empty">Click an entry to preview</div>
              <template v-else>
                <div class="preview-title">CAPEC-{{ capecPreview.capecId }} — {{ capecPreview.name }}</div>
                <p class="preview-desc">{{ capecPreview.description }}</p>
                <Button
                  :label="isLinked('capec', capecPreview.id) ? 'Remove' : 'Add'"
                  :severity="isLinked('capec', capecPreview.id) ? 'secondary' : undefined"
                  size="small"
                  @click="toggle('capec', capecPreview.id, `CAPEC-${capecPreview.capecId}: ${capecPreview.name}`)"
                />
              </template>
            </div>
          </div>
        </TabPanel>

        <!-- ATT&CK -->
        <TabPanel value="attack">
          <div class="tab-body">
            <div class="tab-left">
              <InputText v-model="attackSearch" placeholder="Search by ID or name…" class="tab-search" />
              <div class="results-list">
                <div v-if="attackLoading" class="list-hint">Searching…</div>
                <div v-else-if="!attackResults.length" class="list-hint">No results</div>
                <div v-for="e in attackResults" :key="e.id"
                  class="result-row"
                  :class="{ 'result-row--selected': isLinked('attack', e.id), 'result-row--preview': attackPreview?.id === e.id }"
                  @click="attackPreview = e">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                    <span class="entry-code">{{ e.attackId }}</span>
                    <span class="entry-name">{{ e.name }}</span>
                    <i v-if="isLinked('attack', e.id)" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem;" />
                  </div>
                </div>
              </div>
            </div>
            <div class="tab-right">
              <div v-if="!attackPreview" class="preview-empty">Click an entry to preview</div>
              <template v-else>
                <div class="preview-title">{{ attackPreview.attackId }} — {{ attackPreview.name }}</div>
                <p class="preview-desc">{{ attackPreview.description }}</p>
                <Button
                  :label="isLinked('attack', attackPreview.id) ? 'Remove' : 'Add'"
                  :severity="isLinked('attack', attackPreview.id) ? 'secondary' : undefined"
                  size="small"
                  @click="toggle('attack', attackPreview.id, `${attackPreview.attackId}: ${attackPreview.name}`)"
                />
              </template>
            </div>
          </div>
        </TabPanel>

        <!-- OWASP -->
        <TabPanel value="owasp">
          <div class="tab-body">
            <div class="tab-left">
              <InputText v-model="owaspSearch" placeholder="Search by name…" class="tab-search" />
              <div class="results-list">
                <div v-if="owaspLoading" class="list-hint">Searching…</div>
                <div v-else-if="!owaspResults.length" class="list-hint">No results</div>
                <div v-for="e in owaspResults" :key="e.id"
                  class="result-row"
                  :class="{ 'result-row--selected': isLinked('owasp', e.id), 'result-row--preview': owaspPreview?.id === e.id }"
                  @click="owaspPreview = e">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                    <span class="entry-code">{{ e.owaspId }}</span>
                    <span class="entry-name">{{ e.name }} <span style="font-size:0.7rem; opacity:0.5;">({{ e.year }})</span></span>
                    <i v-if="isLinked('owasp', e.id)" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem;" />
                  </div>
                </div>
              </div>
            </div>
            <div class="tab-right">
              <div v-if="!owaspPreview" class="preview-empty">Click an entry to preview</div>
              <template v-else>
                <div class="preview-title">{{ owaspPreview.owaspId }} ({{ owaspPreview.year }}) — {{ owaspPreview.name }}</div>
                <p class="preview-desc">{{ owaspPreview.description }}</p>
                <Button
                  :label="isLinked('owasp', owaspPreview.id) ? 'Remove' : 'Add'"
                  :severity="isLinked('owasp', owaspPreview.id) ? 'secondary' : undefined"
                  size="small"
                  @click="toggle('owasp', owaspPreview.id, `${owaspPreview.owaspId} (${owaspPreview.year}): ${owaspPreview.name}`)"
                />
              </template>
            </div>
          </div>
        </TabPanel>

        <!-- CVE -->
        <TabPanel value="cve">
          <div class="tab-body">
            <div class="tab-left">
              <InputText v-model="cveSearch" placeholder="Search CVE ID or keyword…" class="tab-search" />
              <div class="results-list">
                <div v-if="cveLoading" class="list-hint">Searching…</div>
                <div v-else-if="!cveSearch.trim()" class="list-hint">Type to search CVEs</div>
                <div v-else-if="!cveResults.length" class="list-hint">No results</div>
                <div v-for="e in cveResults" :key="e.id"
                  class="result-row"
                  :class="{ 'result-row--selected': isLinked('cve', e.id), 'result-row--preview': cvePreview?.id === e.id }"
                  @click="cvePreview = e">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:0;">
                    <span class="entry-code">{{ e.cveId }}</span>
                    <span v-if="e.severity" class="entry-name">{{ e.severity }}</span>
                    <i v-if="isLinked('cve', e.id)" class="pi pi-check" style="color:var(--p-primary-500); font-size:0.75rem;" />
                  </div>
                </div>
              </div>
            </div>
            <div class="tab-right">
              <div v-if="!cvePreview" class="preview-empty">Click an entry to preview</div>
              <template v-else>
                <div class="preview-title">{{ cvePreview.cveId }}</div>
                <p class="preview-desc">{{ cvePreview.description }}</p>
                <Button
                  :label="isLinked('cve', cvePreview.id) ? 'Remove' : 'Add'"
                  :severity="isLinked('cve', cvePreview.id) ? 'secondary' : undefined"
                  size="small"
                  @click="toggle('cve', cvePreview.id, cvePreview.cveId)"
                />
              </template>
            </div>
          </div>
        </TabPanel>

      </TabPanels>
    </Tabs>

    <template #footer>
      <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
      <Button label="Apply" size="small" @click="apply" />
    </template>
  </Dialog>
</template>

<style scoped>
.chips-bar {
  display: flex; align-items: flex-start; gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
}
.chips-label {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--ares-text-muted);
  white-space: nowrap; padding-top: 0.2rem;
}
.ref-chip {
  display: inline-flex; align-items: center; gap: 0.35rem;
  background: var(--ares-surface-2); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.15rem 0.45rem;
  font-size: 0.78rem; max-width: 280px;
}
.ref-chip-cat {
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--p-primary-400);
  background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
  padding: 0.05rem 0.3rem; border-radius: var(--ares-radius);
}
.ref-chip-x {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); font-size: 1rem; line-height: 1; padding: 0;
}
.ref-chip-x:hover { color: var(--p-red-400); }
.tab-body {
  display: flex; height: 360px; overflow: hidden;
}
.tab-left {
  flex: 1; display: flex; flex-direction: column; gap: 0.6rem;
  overflow: hidden; padding: 0.75rem 0.65rem 0.75rem 0;
}
.tab-search { width: 100%; }
.results-list {
  flex: 1; overflow-y: auto;
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
}
.list-hint {
  padding: 1rem; font-size: 0.82rem;
  color: var(--ares-text-muted); font-style: italic;
}
.result-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.45rem 0.7rem; cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);
  font-size: 0.82rem;
}
.result-row:last-child { border-bottom: none; }
.result-row:hover { background: var(--ares-surface-raised); }
.result-row--selected { background: color-mix(in srgb, var(--p-primary-500) 8%, transparent); }
.result-row--preview { background: var(--ares-surface-2); }
.entry-code {
  font-family: monospace; font-size: 0.75rem; font-weight: 700;
  color: var(--ares-accent); flex-shrink: 0;
}
.entry-name {
  color: var(--ares-text-2); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.tab-right {
  width: 300px; flex-shrink: 0;
  border-left: 1px solid var(--ares-border);
  padding: 0.75rem 0 0.75rem 0.85rem;
  display: flex; flex-direction: column; gap: 0.6rem; overflow-y: auto;
}
.preview-empty {
  font-size: 0.82rem; color: var(--ares-text-muted);
  font-style: italic; margin: auto;
}
.preview-title { font-weight: 600; font-size: 0.88rem; line-height: 1.4; }
.preview-desc {
  font-size: 0.8rem; color: var(--ares-text-muted);
  line-height: 1.55; margin: 0; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden;
}
</style>
