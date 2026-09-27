<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import { kbTestingGuidesApi, type TestingGuide, type TestingGuidePoint } from '@/api/kb-testing-guides';
import { confirmDialog } from '@/composables/useConfirmDialog';

const route   = useRoute();
const router  = useRouter();
const guideId = computed(() => Number(route.params.id));

const guide   = ref<TestingGuide | null>(null);
const points  = ref<TestingGuidePoint[]>([]);
const loading = ref(true);
const err     = ref<string | null>(null);

// Guide meta edit dialog
const showMeta    = ref(false);
const meta        = ref({ name: '', description: '' });
const savingMeta  = ref(false);
const metaErr     = ref('');

function openEditMeta() {
  meta.value = { name: guide.value?.name ?? '', description: guide.value?.description ?? '' };
  metaErr.value = '';
  showMeta.value = true;
}

async function saveMeta() {
  if (!meta.value.name.trim()) return;
  savingMeta.value = true;
  metaErr.value = '';
  try {
    const updated = await kbTestingGuidesApi.update(guideId.value, {
      name: meta.value.name.trim(),
      description: meta.value.description.trim() || undefined,
    });
    if (guide.value) { guide.value.name = updated.name; guide.value.description = updated.description; }
    showMeta.value = false;
  } catch (e: any) {
    metaErr.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to save';
  } finally {
    savingMeta.value = false;
  }
}

// Point dialog
const showPoint   = ref(false);
const savingPoint = ref(false);
const pointErr    = ref('');
const pointForm   = ref({ id: null as number | null, title: '', description: '' });

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const g = await kbTestingGuidesApi.get(guideId.value);
    guide.value = g;
    points.value = g.points ?? [];
  } catch {
    err.value = 'Failed to load guide.';
  } finally {
    loading.value = false;
  }
}

function openAddPoint() {
  pointForm.value = { id: null, title: '', description: '' };
  pointErr.value = '';
  showPoint.value = true;
}

function openEditPoint(p: TestingGuidePoint) {
  pointForm.value = { id: p.id, title: p.title, description: p.description ?? '' };
  pointErr.value = '';
  showPoint.value = true;
}

async function savePoint() {
  if (!pointForm.value.title.trim()) return;
  savingPoint.value = true;
  pointErr.value = '';
  try {
    const body = {
      title: pointForm.value.title.trim(),
      description: pointForm.value.description.trim() || undefined,
    };
    if (pointForm.value.id == null) {
      const created = await kbTestingGuidesApi.addPoint(guideId.value, body);
      points.value.push(created);
    } else {
      const updated = await kbTestingGuidesApi.updatePoint(guideId.value, pointForm.value.id, body);
      const idx = points.value.findIndex((p) => p.id === updated.id);
      if (idx !== -1) points.value[idx] = updated;
    }
    showPoint.value = false;
  } catch (e: any) {
    pointErr.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to save point';
  } finally {
    savingPoint.value = false;
  }
}

async function deletePoint(p: TestingGuidePoint) {
  const ok = await confirmDialog({ header: 'Delete point', message: 'Delete this point?' });
  if (!ok) return;
  await kbTestingGuidesApi.deletePoint(guideId.value, p.id);
  points.value = points.value.filter((x) => x.id !== p.id);
}

async function move(index: number, dir: -1 | 1) {
  const target = index + dir;
  if (target < 0 || target >= points.value.length) return;
  const arr = points.value.slice();
  [arr[index], arr[target]] = [arr[target], arr[index]];
  points.value = arr;
  await kbTestingGuidesApi.reorderPoints(guideId.value, arr.map((p) => p.id));
}

function exportGuide() {
  if (!guide.value) return;
  const payload = {
    name: guide.value.name,
    description: guide.value.description,
    points: points.value.map(({ title, description, sortOrder }) => ({ title, description, sortOrder })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `testing-guide-${guide.value.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="loading" class="ares-table-empty" style="margin-top:1rem;">Loading…</div>
    <div v-else-if="err" class="ares-alert ares-alert--error" style="margin-top:1rem;">{{ err }}</div>

    <template v-else-if="guide">
      <!-- Page header — same pattern as DetectionDetailView -->
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.5rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <Button icon="pi pi-arrow-left" severity="secondary" text
            @click="router.push({ name: 'kb-testing-guides' })" />
          <div>
            <h2 class="ares-page-title" style="margin:0 0 0.2rem;">{{ guide.name }}</h2>
            <p class="ares-page-subtitle" style="margin:0; line-height:1.55;">
              <template v-if="guide.description">{{ guide.description }}</template>
              <span v-else style="font-style:italic;">No description.</span>
            </p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0;">
          <Button icon="pi pi-download" label="Export" size="small" severity="secondary" text @click="exportGuide" />
          <Button icon="pi pi-pencil" label="Edit" size="small" severity="secondary" text @click="openEditMeta" />
          <Button icon="pi pi-plus" label="Add point" size="small" @click="openAddPoint" />
        </div>
      </div>

      <!-- Points section subheader -->
      <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ares-text-muted); margin-bottom:0.6rem;">
        Points <span style="font-weight:400;">({{ points.length }})</span>
      </div>

      <div class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:60px;">#</th>
              <th style="width:280px;">Title</th>
              <th style="min-width:180px;">Description</th>
              <th style="width:130px; text-align:right;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in points" :key="p.id">
              <td style="color:var(--ares-text-muted);">{{ i + 1 }}</td>
              <td style="font-weight:500;">{{ p.title }}</td>
              <td style="color:var(--ares-text-muted); font-size:0.85rem; white-space:normal; word-break:break-word; max-width:400px;">{{ p.description || '—' }}</td>
              <td style="text-align:right; white-space:nowrap;">
                <Button icon="pi pi-arrow-up" text size="small" severity="secondary"
                  :disabled="i === 0" @click="move(i, -1)" />
                <Button icon="pi pi-arrow-down" text size="small" severity="secondary"
                  :disabled="i === points.length - 1" @click="move(i, 1)" />
                <Button icon="pi pi-pencil" text size="small" @click="openEditPoint(p)" />
                <Button icon="pi pi-trash" text size="small" severity="danger" @click="deletePoint(p)" />
              </td>
            </tr>
            <tr v-if="!points.length">
              <td colspan="4" class="ares-table-empty">No points yet. Click "Add point".</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Edit guide dialog -->
    <Dialog v-model:visible="showMeta" header="Edit guide" modal :style="{ width: 'min(480px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.5rem;">
        <div class="form-field">
          <label>Name *</label>
          <InputText v-model="meta.name" class="w-full" />
        </div>
        <div class="form-field">
          <label>Description</label>
          <Textarea v-model="meta.description" rows="3" auto-resize class="w-full"
            placeholder="What this guide covers…" />
        </div>
        <Message v-if="metaErr" severity="error" :closable="false">{{ metaErr }}</Message>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" @click="showMeta = false" />
          <Button label="Save" icon="pi pi-check" :loading="savingMeta"
            :disabled="!meta.name.trim()" @click="saveMeta" />
        </div>
      </div>
    </Dialog>

    <!-- Point dialog -->
    <Dialog v-model:visible="showPoint" :header="pointForm.id == null ? 'Add point' : 'Edit point'"
      modal :style="{ width: 'min(520px, 96vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.5rem;">
        <div class="form-field">
          <label>Title *</label>
          <InputText v-model="pointForm.title" class="w-full" placeholder="e.g. Test for SQL Injection" />
        </div>
        <div class="form-field">
          <label>Description</label>
          <Textarea v-model="pointForm.description" rows="4" auto-resize class="w-full"
            placeholder="What this test verifies and how…" />
        </div>
        <Message v-if="pointErr" severity="error" :closable="false">{{ pointErr }}</Message>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" @click="showPoint = false" />
          <Button :label="pointForm.id == null ? 'Add' : 'Save'" :loading="savingPoint"
            :disabled="!pointForm.title.trim()" @click="savePoint" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.form-field { display: flex; flex-direction: column; gap: 0.35rem; }
.form-field label { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-muted); }

.title-row { display: flex; align-items: center; gap: 0.5rem; }
.title-row--editing { gap: 0.4rem; flex: 1; min-width: 0; }
.title-row:hover .title-edit-btn { opacity: 1; }
.title-edit-btn {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); padding: 0.2rem; border-radius: var(--ares-radius);
  font-size: 0.85rem; opacity: 0; transition: opacity 0.12s, color 0.12s;
}
.title-edit-btn:hover { color: var(--p-primary-400); }
.title-input { flex: 1; min-width: 0; font-size: 1.25rem; font-weight: 600; }
</style>
