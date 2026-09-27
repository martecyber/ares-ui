<script setup lang="ts">
// Search/select detections eligible for a Research Board — "new"/"reopened" only, same
// search+paginated-checkable-table pattern as RetestFindingPickerDialog.vue.
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import SeverityTag from '@/components/SeverityTag.vue';
import AppPagination from '@/components/AppPagination.vue';
import { detectionsApi, type Detection } from '@/api/detections';

const props = defineProps<{ visible: boolean; projectId: number; title?: string }>();
const emit = defineEmits<{
  'update:visible': [v: boolean];
  picked: [detectionIds: number[]];
}>();

const PAGE_SIZE = 25;
const loading = ref(false);
const error = ref('');
const candidates = ref<Detection[]>([]);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);
const search = ref('');
const selected = ref<Set<number>>(new Set());

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await detectionsApi.list({
      projectId: props.projectId,
      status: ['new', 'reopened'],
      q: search.value.trim() || undefined,
      page: page.value,
      size: PAGE_SIZE,
    });
    candidates.value = res.items;
    totalPages.value = res.totalPages;
    total.value = res.total;
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load candidate detections';
  } finally {
    loading.value = false;
  }
}

function toggle(id: number) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next;
}

function onSearch() { page.value = 0; load(); }

watch(() => props.visible, (open) => {
  if (open) {
    page.value = 0;
    search.value = '';
    selected.value = new Set();
    error.value = '';
    load();
  }
});

watch(page, load);

function confirm() {
  if (!selected.value.size) return;
  emit('picked', [...selected.value]);
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    :header="title ?? 'Add detections'"
    modal
    style="width:42rem;"
  >
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <p style="margin:0; font-size:0.82rem; color:var(--ares-text-muted);">
        Only "New"/"Reopened" detections not already on another active Research Board can be added.
      </p>

      <InputText v-model="search" placeholder="Search title, description…" style="width:100%;" @keyup.enter="onSearch" @blur="onSearch" />

      <div v-if="loading" style="display:flex; justify-content:center; padding:2rem;">
        <ProgressSpinner style="width:2.2rem; height:2.2rem;" />
      </div>

      <template v-else>
        <div class="ares-card" style="padding:0; max-height:22rem; overflow:auto;">
          <table class="ares-table">
            <tbody>
              <tr v-for="d in candidates" :key="d.id" style="cursor:pointer;" @click="toggle(d.id)">
                <td style="width:2.2rem;" @click.stop="toggle(d.id)">
                  <Checkbox :model-value="selected.has(d.id)" binary @update:model-value="toggle(d.id)" />
                </td>
                <td style="font-weight:500;">{{ d.title }}</td>
                <td style="width:90px; text-align:center;"><SeverityTag :level="d.severity" scale="priority" /></td>
              </tr>
              <tr v-if="!candidates.length">
                <td colspan="3" class="ares-table-empty">No eligible detections found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
      </template>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
        <Button :label="`Add ${selected.size ? '(' + selected.size + ')' : ''}`" :disabled="!selected.size" @click="confirm" />
      </div>
    </div>
  </Dialog>
</template>
