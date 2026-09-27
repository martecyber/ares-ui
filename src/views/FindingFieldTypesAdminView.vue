<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { findingFieldTypesApi, type FindingFieldType } from '@/api/finding-field-types';

const toast = useToast();
const items = ref<FindingFieldType[]>([]);
const loading = ref(true);

// ── Create dialog ──────────────────────────────────────────────────────────
const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const createForm = ref({ name: '', title: '', description: '', required: false, sortOrder: 50 });
const SLUG_RE = /^[a-z0-9_]+$/;

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function onCreateTitleInput() {
  if (!createForm.value.name) createForm.value.name = slugify(createForm.value.title);
}

// ── Edit dialog ────────────────────────────────────────────────────────────
const editTarget = ref<FindingFieldType | null>(null);
const showEdit = ref(false);
const saving = ref(false);
const editError = ref('');
const editForm = ref({ title: '', description: '', required: false, sortOrder: 0 });

// ── Delete confirm ─────────────────────────────────────────────────────────
const deleteTarget = ref<FindingFieldType | null>(null);
const showDelete = ref(false);
const deleting = ref(false);

async function load() {
  loading.value = true;
  try {
    items.value = await findingFieldTypesApi.list();
  } finally {
    loading.value = false;
  }
}

// ── Create ────────────────────────────────────────────────────────────────
function openCreate() {
  createForm.value = { name: '', title: '', description: '', required: false, sortOrder: 50 };
  createError.value = '';
  showCreate.value = true;
}

async function submitCreate() {
  if (!createForm.value.title.trim()) return;
  const slug = createForm.value.name.trim();
  if (!slug || !SLUG_RE.test(slug)) {
    createError.value = 'Slug is required and must contain only lowercase letters, digits and underscores.';
    return;
  }
  creating.value = true;
  createError.value = '';
  try {
    const created = await findingFieldTypesApi.create({
      name: slug,
      title: createForm.value.title.trim(),
      description: createForm.value.description || undefined,
      required: createForm.value.required,
      sortOrder: createForm.value.sortOrder,
    });
    items.value.push(created);
    items.value.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    showCreate.value = false;
    toast.add({ severity: 'success', summary: 'Field type created', life: 3000 });
  } catch (e: any) {
    createError.value = e?.response?.data?.message ?? e.message;
  } finally {
    creating.value = false;
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────
function openEdit(item: FindingFieldType) {
  editTarget.value = item;
  editForm.value = {
    title: item.title,
    description: item.description ?? '',
    required: item.isRequired,
    sortOrder: item.sortOrder,
  };
  editError.value = '';
  showEdit.value = true;
}

async function submitEdit() {
  if (!editTarget.value) return;
  saving.value = true;
  editError.value = '';
  try {
    const updated = await findingFieldTypesApi.update(editTarget.value.id, {
      title: editTarget.value.isSystem ? undefined : editForm.value.title.trim(),
      description: editTarget.value.isSystem ? undefined : (editForm.value.description || undefined),
      required: editForm.value.required,
      sortOrder: editTarget.value.isSystem ? undefined : editForm.value.sortOrder,
    });
    const idx = items.value.findIndex((i) => i.id === updated.id);
    if (idx >= 0) items.value[idx] = updated;
    items.value.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    showEdit.value = false;
    toast.add({ severity: 'success', summary: 'Field type updated', life: 3000 });
  } catch (e: any) {
    editError.value = e?.response?.data?.message ?? e.message;
  } finally {
    saving.value = false;
  }
}

// ── Delete ────────────────────────────────────────────────────────────────
function openDelete(item: FindingFieldType) {
  deleteTarget.value = item;
  showDelete.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await findingFieldTypesApi.delete(deleteTarget.value.id);
    items.value = items.value.filter((i) => i.id !== deleteTarget.value!.id);
    showDelete.value = false;
    toast.add({ severity: 'success', summary: 'Field type deleted', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <!-- Header -->
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Finding field types</h2>
        <p class="ares-page-subtitle">Configure which fields are available on findings. System fields are mandatory and cannot be removed.</p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New field type'" @click="openCreate" />
    </div>

    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else class="ares-card" style="padding:0;">
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:50px; text-align:center;">Order</th>
            <th>Title</th>
            <th style="width:140px;">Slug</th>
            <th>Description</th>
            <th style="width:90px; text-align:center;">Required</th>
            <th style="width:80px; text-align:center;">System</th>
            <th style="width:100px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td style="text-align:center; color:var(--ares-text-muted); font-size:0.8rem;">{{ item.sortOrder }}</td>
            <td>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <i v-if="item.isSystem" class="pi pi-lock" style="font-size:0.75rem; color:var(--ares-text-muted);" />
                <span style="font-weight:500;">{{ item.title }}</span>
              </div>
            </td>
            <td><code class="slug-chip">{{ item.name }}</code></td>
            <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ item.description ?? '—' }}</td>
            <td style="text-align:center;">
              <AresBadge
                :value="item.isRequired ? 'Required' : 'Optional'"
                :severity="item.isRequired ? 'warn' : 'secondary'"
              />
            </td>
            <td style="text-align:center;">
              <i v-if="item.isSystem" class="pi pi-lock" style="color:var(--ares-text-muted);" />
              <span v-else style="color:var(--ares-text-muted); font-size:0.75rem;">—</span>
            </td>
            <td>
              <div style="display:flex; gap:0.25rem; justify-content:flex-end;">
                <Button icon="pi pi-pencil" severity="secondary" text size="small" @click="openEdit(item)" />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  size="small"
                  :disabled="item.isSystem"
                  @click="openDelete(item)"
                />
              </div>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="7" class="ares-table-empty">No field types defined.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Create dialog ─────────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="showCreate"
      header="New field type"
      modal
      :style="{ width: '440px' }"
      :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem' } }"
    >
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div>
          <label class="dlg-label">Title *</label>
          <InputText v-model="createForm.title" style="width:100%;" placeholder="e.g. Proof of concept" @input="onCreateTitleInput" />
        </div>
        <div>
          <label class="dlg-label">Slug * <span style="font-weight:400; font-size:0.75rem;">(lowercase, digits, underscores only)</span></label>
          <InputText
            v-model="createForm.name"
            style="width:100%; font-family:monospace;"
            placeholder="e.g. proof_of_concept"
            :invalid="!!createForm.name && !SLUG_RE.test(createForm.name)"
          />
          <small v-if="createForm.name && !SLUG_RE.test(createForm.name)" style="color:var(--p-red-400);">Only lowercase letters, digits and underscores allowed.</small>
        </div>
        <div>
          <label class="dlg-label">Description</label>
          <Textarea v-model="createForm.description" rows="2" auto-resize style="width:100%;" placeholder="Short explanation of what this field contains." />
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
          <div>
            <label class="dlg-label">Sort order</label>
            <InputNumber v-model="createForm.sortOrder" :min="0" :max="9999" style="width:100%;" />
          </div>
          <div style="display:flex; flex-direction:column; gap:0.4rem;">
            <label class="dlg-label">Required</label>
            <div style="display:flex; align-items:center; gap:0.5rem; padding-top:0.3rem;">
              <ToggleSwitch v-model="createForm.required" />
              <span style="font-size:0.82rem; color:var(--ares-text-muted);">{{ createForm.required ? 'Yes' : 'No' }}</span>
            </div>
          </div>
        </div>
        <Message v-if="createError" severity="error" :closable="false">{{ createError }}</Message>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showCreate = false" />
          <Button label="Create" icon="pi pi-check" size="small" :loading="creating"
            :disabled="!createForm.title.trim() || !createForm.name.trim() || !SLUG_RE.test(createForm.name)" @click="submitCreate" />
        </div>
      </div>
    </Dialog>

    <!-- ── Edit dialog ───────────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="showEdit"
      :header="`Edit — ${editTarget?.title ?? ''}`"
      modal
      :style="{ width: '440px' }"
      :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem' } }"
    >
      <div v-if="editTarget" style="display:flex; flex-direction:column; gap:1rem;">
        <div v-if="editTarget.isSystem" class="system-notice">
          <i class="pi pi-lock" />
          System field — name, description and order are locked. You can only toggle Required.
        </div>

        <div v-if="!editTarget.isSystem">
          <label class="dlg-label">Title *</label>
          <InputText v-model="editForm.title" style="width:100%;" />
        </div>
        <div v-if="!editTarget.isSystem">
          <label class="dlg-label">Slug <span style="font-weight:400; font-size:0.75rem;">(read-only)</span></label>
          <InputText :value="editTarget.name" style="width:100%; font-family:monospace; opacity:0.6;" disabled />
        </div>
        <div v-if="!editTarget.isSystem">
          <label class="dlg-label">Description</label>
          <Textarea v-model="editForm.description" rows="2" auto-resize style="width:100%;" />
        </div>
        <div v-if="!editTarget.isSystem">
          <label class="dlg-label">Sort order</label>
          <InputNumber v-model="editForm.sortOrder" :min="0" :max="9999" style="width:100%;" />
        </div>

        <div style="display:flex; flex-direction:column; gap:0.4rem;">
          <label class="dlg-label">Required</label>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <ToggleSwitch v-model="editForm.required" :disabled="editTarget.isSystem" />
            <span style="font-size:0.82rem; color:var(--ares-text-muted);">
              {{ editForm.required ? 'Required in all findings' : 'Optional' }}
            </span>
          </div>
          <p v-if="editTarget.isSystem" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.1rem;">
            System fields are always required.
          </p>
        </div>

        <Message v-if="editError" severity="error" :closable="false">{{ editError }}</Message>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showEdit = false" />
          <Button label="Save" icon="pi pi-check" size="small" :loading="saving" @click="submitEdit" />
        </div>
      </div>
    </Dialog>

    <!-- ── Delete confirm ────────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="showDelete"
      header="Delete field type"
      modal
      :style="{ width: '400px' }"
      :pt="{ content: { style: 'padding: 1.25rem 1.25rem 1.25rem' } }"
    >
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <p style="font-size:0.9rem; line-height:1.6;">
          Are you sure you want to delete <strong>{{ deleteTarget?.title }}</strong>?
          This will also remove this field from all existing findings.
        </p>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showDelete = false" />
          <Button label="Delete" icon="pi pi-trash" severity="danger" size="small"
            :loading="deleting" @click="confirmDelete" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
  letter-spacing: 0.02em;
}
.slug-chip {
  font-size: 0.78rem;
  background: var(--ares-surface-sunken, rgba(0,0,0,0.18));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.4rem;
  color: var(--ares-accent, #7dd3fc);
  white-space: nowrap;
}
.system-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--ares-text-muted);
  background: var(--ares-surface-sunken, rgba(0,0,0,0.15));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.6rem 0.9rem;
}
</style>
