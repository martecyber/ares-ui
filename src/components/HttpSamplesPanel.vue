<script setup lang="ts">
/**
 * Reusable panel for HTTP request/response sample pairs.
 *
 * Decoupled from any specific API: the parent passes CRUD callbacks so the same
 * component serves both web_endpoint assets (/assets/{id}/http-samples) and
 * detections (/detections/{id}/http-samples).
 */
import { ref, onMounted } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';

export interface HttpSample {
  id: number;
  label: string | null;
  requestContent: string | null;
  responseContent: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}
export interface HttpSampleInput {
  label?: string;
  requestContent?: string;
  responseContent?: string;
  notes?: string;
}

const props = defineProps<{
  load:      () => Promise<HttpSample[]>;
  create:    (body: HttpSampleInput) => Promise<HttpSample>;
  update:    (sampleId: number, body: HttpSampleInput) => Promise<HttpSample>;
  remove:    (sampleId: number) => Promise<void>;
  readonly?: boolean;
  /** When true, the whole card is hidden until at least one sample is loaded — used
   *  on read-only views (e.g. detections) where an empty "add your first sample" card
   *  isn't actionable. Asset views keep the always-visible card since they can add one. */
  hideWhenEmpty?: boolean;
}>();

const toast = useToast();
const samples = ref<HttpSample[]>([]);
const loading = ref(true);

const showForm = ref(false);
const editing  = ref<HttpSample | null>(null);
const fLabel   = ref('');
const fRequest = ref('');
const fResponse = ref('');
const fNotes   = ref('');
const saving   = ref(false);
const expanded = ref<Set<number>>(new Set());

async function reload() {
  loading.value = true;
  try { samples.value = await props.load(); }
  catch { samples.value = []; }
  finally { loading.value = false; }
}
onMounted(reload);

function openCreate() {
  editing.value = null;
  fLabel.value = ''; fRequest.value = ''; fResponse.value = ''; fNotes.value = '';
  showForm.value = true;
}
function openEdit(s: HttpSample) {
  editing.value = s;
  fLabel.value = s.label ?? '';
  fRequest.value = s.requestContent ?? '';
  fResponse.value = s.responseContent ?? '';
  fNotes.value = s.notes ?? '';
  showForm.value = true;
}

async function save() {
  saving.value = true;
  try {
    const body: HttpSampleInput = {
      label: fLabel.value.trim() || undefined,
      requestContent: fRequest.value || undefined,
      responseContent: fResponse.value || undefined,
      notes: fNotes.value.trim() || undefined,
    };
    if (editing.value) await props.update(editing.value.id, body);
    else await props.create(body);
    showForm.value = false;
    await reload();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to save sample',
      detail: e?.response?.data?.message ?? e?.message, life: 4000 });
  } finally {
    saving.value = false;
  }
}

async function remove(s: HttpSample) {
  try {
    await props.remove(s.id);
    await reload();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to delete sample',
      detail: e?.response?.data?.message ?? e?.message, life: 4000 });
  }
}

function toggle(id: number) {
  const next = new Set(expanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expanded.value = next;
}
</script>

<template>
  <div v-if="!hideWhenEmpty || (!loading && samples.length > 0)" class="ares-card" style="padding:0; margin-bottom:1.25rem;">
    <div class="ares-card-section-header">
      <span style="display:inline-flex; align-items:center; gap:0.45rem;">
        HTTP samples
        <span v-if="samples.length" class="sample-count-badge">{{ samples.length }}</span>
      </span>
      <Button v-if="!props.readonly" icon="pi pi-plus" label="Add" size="small" text @click="openCreate" />
    </div>

    <div v-if="loading" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">Loading…</div>
    <div v-else-if="!samples.length" style="padding:1rem; color:var(--ares-text-muted); font-size:0.85rem;">
      No request/response pairs recorded yet.
    </div>

    <div v-for="s in samples" :key="s.id" class="sample-row">
      <div class="sample-head" @click="toggle(s.id)">
        <i :class="expanded.has(s.id) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" style="font-size:0.7rem;" />
        <span class="sample-label">{{ s.label || 'Untitled pair' }}</span>
        <span style="flex:1;" />
        <Button v-if="!props.readonly" icon="pi pi-pencil" text size="small" @click.stop="openEdit(s)" />
        <Button v-if="!props.readonly" icon="pi pi-trash" text severity="danger" size="small" @click.stop="remove(s)" />
      </div>
      <div v-if="expanded.has(s.id)" class="sample-body">
        <div class="reqresp">
          <div class="reqresp-col">
            <div class="reqresp-label">Request</div>
            <pre>{{ s.requestContent || '—' }}</pre>
          </div>
          <div class="reqresp-col">
            <div class="reqresp-label">Response</div>
            <pre>{{ s.responseContent || '—' }}</pre>
          </div>
        </div>
        <div v-if="s.notes" class="sample-notes"><strong>Notes:</strong> {{ s.notes }}</div>
      </div>
    </div>

    <Dialog v-model:visible="showForm" modal
      :header="editing ? 'Edit HTTP sample' : 'New HTTP sample'"
      :style="{ width: 'min(820px, 95vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.9rem;">
        <div>
          <label class="ares-field-label">Label <span style="opacity:0.6;">(optional)</span></label>
          <InputText v-model="fLabel" placeholder="e.g. Auth bypass — admin endpoint" style="width:100%;" />
        </div>
        <div class="reqresp">
          <div class="reqresp-col">
            <label class="ares-field-label">Request</label>
            <Textarea v-model="fRequest" rows="12" class="w-full mono" auto-resize
              placeholder="GET /admin HTTP/1.1&#10;Host: example.com&#10;…" />
          </div>
          <div class="reqresp-col">
            <label class="ares-field-label">Response</label>
            <Textarea v-model="fResponse" rows="12" class="w-full mono" auto-resize
              placeholder="HTTP/1.1 200 OK&#10;…" />
          </div>
        </div>
        <div>
          <label class="ares-field-label">Notes <span style="opacity:0.6;">(optional)</span></label>
          <Textarea v-model="fNotes" rows="2" class="w-full" auto-resize />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showForm = false" />
          <Button :label="editing ? 'Save' : 'Create'" size="small" :loading="saving" @click="save" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.sample-count-badge {
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
.sample-row { border-top: 1px solid var(--ares-border); }
.sample-head {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.55rem 0.9rem; cursor: pointer; user-select: none;
}
.sample-head:hover { background: var(--ares-surface-2); }
.sample-label { font-size: 0.85rem; font-weight: 500; }
.sample-body { padding: 0.5rem 0.9rem 0.9rem; }
.reqresp { display: flex; gap: 0.75rem; }
.reqresp-col { flex: 1; min-width: 0; }
.reqresp-label { font-size: 0.72rem; font-weight: 600; color: var(--ares-text-muted); margin-bottom: 0.3rem; }
.reqresp-col pre {
  margin: 0; padding: 0.6rem; background: var(--ares-surface-2);
  border-radius: var(--ares-radius); font-size: 0.78rem; white-space: pre-wrap; word-break: break-all;
  max-height: 360px; overflow: auto;
}
.sample-notes { margin-top: 0.6rem; font-size: 0.82rem; color: var(--ares-text-muted); }
:deep(.mono) textarea, :deep(textarea.mono) { font-family: monospace; font-size: 0.8rem; }
@media (max-width: 640px) { .reqresp { flex-direction: column; } }
</style>
