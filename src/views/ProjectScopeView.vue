<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { projectsApi, SCOPE_KINDS, SCOPE_KIND_META, type Project } from '@/api/projects';
import { vdpPlatformLabel, vdpLogoMarkup, loadBugHuntingPlatforms } from '@/api/vdp-integrations';
import { useContextStore } from '@/stores/context';

const route = useRoute();
const context = useContextStore();
const toast = useToast();
const engId = computed(() => Number(route.params.engId));

const project = ref<Project | null>(null);
const loading = ref(true);

const showDialog = ref(false);
const saving = ref(false);
const deriving = ref(false);
const formError = ref('');
const form = ref({ kind: 'domain', value: '', notes: '', inScope: true });

async function load() {
  loading.value = true;
  try {
    project.value = await projectsApi.get(engId.value);
    if (project.value) {
      context.setProject({ id: project.value.id, name: project.value.name, code: project.value.code, typeCode: project.value.typeCode ?? null, supertypeCode: project.value.supertypeCode ?? null, clientsCanViewDetections: project.value.clientsCanViewDetections ?? false });
    }
  } finally {
    loading.value = false;
  }
}

async function addEntry() {
  formError.value = '';
  saving.value = true;
  try {
    const entries = await projectsApi.addScope(project.value!.id, {
      kind: form.value.kind,
      value: form.value.value,
      notes: form.value.notes || undefined,
      inScope: form.value.inScope,
    });
    project.value!.scopeEntries.push(...entries);
    showDialog.value = false;
    form.value = { kind: 'domain', value: '', notes: '', inScope: true };
  } catch (e: any) {
    formError.value = e?.response?.data?.detail ?? e?.message ?? 'Error adding entry';
  } finally {
    saving.value = false;
  }
}

function isImported(source: string): boolean {
  return source !== 'manual';
}

function kindTagStyle(kind: string) {
  const color = SCOPE_KIND_META[kind]?.color ?? '#4B5563';
  return { background: color, color: '#fff', border: 'none', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.73rem', fontWeight: '600', letterSpacing: '0.02em', whiteSpace: 'nowrap' as const };
}

function kindLabel(kind: string): string {
  return SCOPE_KIND_META[kind]?.label ?? kind;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function displayCreatedAt(s: { source: string; createdAt: string; platformCreatedAt: string | null }): string {
  return s.source === 'manual' ? formatDate(s.createdAt) : formatDate(s.platformCreatedAt);
}

function displayUpdatedAt(s: { source: string; updatedAt: string | null; platformUpdatedAt: string | null }): string {
  return s.source === 'manual' ? formatDate(s.updatedAt) : formatDate(s.platformUpdatedAt);
}

function sourceLogo(source: string): string {
  return vdpLogoMarkup(source);
}

function sourceLabel(source: string): string {
  return vdpPlatformLabel(source);
}

async function removeEntry(entryId: number) {
  await projectsApi.removeScope(project.value!.id, entryId);
  project.value!.scopeEntries = project.value!.scopeEntries.filter((s) => s.id !== entryId);
}

async function deriveAssets() {
  deriving.value = true;
  try {
    const result = await projectsApi.deriveAssets(project.value!.id);
    toast.add({
      severity: 'success',
      summary: 'Assets derived',
      detail: `${result.derived} asset${result.derived !== 1 ? 's' : ''} created or matched, ${result.skipped} skipped.`,
      life: 4000,
    });
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Derivation failed',
      detail: e?.response?.data?.detail ?? e?.message ?? 'Unknown error',
      life: 5000,
    });
  } finally {
    deriving.value = false;
  }
}

// Split entries for display
const inScopeEntries  = computed(() => project.value?.scopeEntries.filter((s) => s.inScope)  ?? []);
const outScopeEntries = computed(() => project.value?.scopeEntries.filter((s) => !s.inScope) ?? []);

onMounted(() => {
  load();
  loadBugHuntingPlatforms();
});
</script>

<template>
  <div>
  <Toast />
    <div class="ares-page-header" style="margin-bottom:1.25rem;">
      <div>
        <h2 class="ares-page-title">Scope</h2>
        <p class="ares-page-subtitle">Targets and boundaries for this project.</p>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button
          icon="pi pi-sync"
          text
          size="small"
          severity="secondary"
          :loading="deriving"
          v-tooltip.left="'Derive assets — create assets from in-scope entries'"
          @click="deriveAssets"
        />
        <Button icon="pi pi-plus" text size="small" v-tooltip.top="'Add entry'" @click="showDialog = true" />
      </div>
    </div>

    <div v-if="loading" class="ares-table-empty"><ProgressSpinner style="width:32px;height:32px;" /></div>

    <template v-else>
      <!-- In Scope -->
      <div style="margin-bottom:0.5rem; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ares-text-muted);">
        In Scope <span style="font-weight:400; text-transform:none; letter-spacing:0;">({{ inScopeEntries.length }})</span>
      </div>
      <div class="ares-table-wrap" style="margin-bottom:1.75rem;">
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:140px;">Type</th>
              <th>Value</th>
              <th>Notes</th>
              <th style="width:100px;">Created</th>
              <th style="width:100px;">Updated</th>
              <th style="width:52px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in inScopeEntries" :key="s.id">
              <td data-label="Type"><span :style="kindTagStyle(s.kind)">{{ kindLabel(s.kind) }}</span></td>
              <td data-label="Value" style="font-family:monospace; font-size:0.82rem;">{{ s.value }}</td>
              <td data-label="Notes" style="color:var(--ares-text-muted); font-size:0.82rem; white-space:pre-line;">{{ s.notes ?? '—' }}</td>
              <td data-label="Created" style="font-size:0.78rem;color:var(--ares-text-muted);white-space:nowrap;">{{ displayCreatedAt(s) }}</td>
              <td data-label="Updated" style="font-size:0.78rem;color:var(--ares-text-muted);white-space:nowrap;">{{ displayUpdatedAt(s) }}</td>
              <td data-actions style="text-align:center;">
                <Button
                  v-if="!isImported(s.source)"
                  icon="pi pi-trash" severity="danger" text size="small"
                  @click="removeEntry(s.id)"
                />
                <span
                  v-else
                  class="inline-logo"
                  style="width:16px; height:16px; display:inline-flex; align-items:center; opacity:0.75;"
                  v-html="sourceLogo(s.source)"
                  v-tooltip="`Synced from ${sourceLabel(s.source)}`"
                />
              </td>
            </tr>
            <tr v-if="!inScopeEntries.length">
              <td colspan="6" class="ares-table-empty">No in-scope entries.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Out of Scope -->
      <div style="margin-bottom:0.5rem; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ares-text-muted);">
        Out of Scope <span style="font-weight:400; text-transform:none; letter-spacing:0;">({{ outScopeEntries.length }})</span>
      </div>
      <div class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:140px;">Type</th>
              <th>Value</th>
              <th>Notes</th>
              <th style="width:100px;">Created</th>
              <th style="width:100px;">Updated</th>
              <th style="width:52px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in outScopeEntries" :key="s.id" style="opacity:0.75;">
              <td data-label="Type"><span :style="kindTagStyle(s.kind)">{{ kindLabel(s.kind) }}</span></td>
              <td data-label="Value" style="font-family:monospace; font-size:0.82rem;">{{ s.value }}</td>
              <td data-label="Notes" style="color:var(--ares-text-muted); font-size:0.82rem; white-space:pre-line;">{{ s.notes ?? '—' }}</td>
              <td data-label="Created" style="font-size:0.78rem;color:var(--ares-text-muted);white-space:nowrap;">{{ displayCreatedAt(s) }}</td>
              <td data-label="Updated" style="font-size:0.78rem;color:var(--ares-text-muted);white-space:nowrap;">{{ displayUpdatedAt(s) }}</td>
              <td data-actions style="text-align:center;">
                <Button
                  v-if="!isImported(s.source)"
                  icon="pi pi-trash" severity="danger" text size="small"
                  @click="removeEntry(s.id)"
                />
                <span
                  v-else
                  class="inline-logo"
                  style="width:16px; height:16px; display:inline-flex; align-items:center; opacity:0.75;"
                  v-html="sourceLogo(s.source)"
                  v-tooltip="`Synced from ${sourceLabel(s.source)}`"
                />
              </td>
            </tr>
            <tr v-if="!outScopeEntries.length">
              <td colspan="6" class="ares-table-empty">No out-of-scope entries.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Add entry dialog -->
    <Dialog v-model:visible="showDialog" header="Add scope entry" modal style="width:30rem;">
      <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem;">
        <Select v-model="form.kind" :options="SCOPE_KINDS" option-label="label" option-value="value" placeholder="Type" class="w-full" />
        <div>
          <Textarea v-model="form.value" rows="3" auto-resize
            placeholder="Value (domain, URL, IP...) — one per line for multiple entries" class="w-full"
            style="max-height:12rem; overflow-y:auto;" />
          <p class="scope-hint">One value per line to add multiple entries with the same type, notes, and scope.</p>
        </div>
        <InputText v-model="form.notes" placeholder="Notes (optional)" class="w-full" />
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <ToggleSwitch v-model="form.inScope" />
          <span style="font-size:0.85rem;">{{ form.inScope ? 'In scope' : 'Out of scope' }}</span>
        </div>
        <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" @click="showDialog = false" />
          <Button label="Add" :loading="saving" :disabled="!form.value.trim()" @click="addEntry" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.scope-hint {
  margin: 0.3rem 0 0;
  font-size: 0.72rem;
  color: var(--ares-text-muted);
}
</style>
