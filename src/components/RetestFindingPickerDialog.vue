<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import SeverityTag from '@/components/SeverityTag.vue';
import AppPagination from '@/components/AppPagination.vue';
import { projectRetestApi } from '@/api/project-retest';
import type { Finding } from '@/api/findings';
import { severityToPriorityLabel } from '@/utils/cvss';

const props = defineProps<{ visible: boolean; projectId: number }>();
const emit = defineEmits<{
  'update:visible': [v: boolean];
  linked: [];
}>();

const PAGE_SIZE = 25;
const loading = ref(false);
const linking = ref(false);
const error = ref('');
const candidates = ref<Finding[]>([]);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);
const severityFilter = ref<string | null>(null);
const selected = ref<Set<number>>(new Set());

const severityOptions = ['critical', 'high', 'medium', 'low', 'info']
  .map((value) => ({ label: severityToPriorityLabel(value), value }));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await projectRetestApi.searchCandidates(props.projectId, {
      severity: severityFilter.value ?? undefined,
      page: page.value,
      size: PAGE_SIZE,
    });
    candidates.value = res.items;
    totalPages.value = res.totalPages;
    total.value = res.total;
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load candidate findings';
  } finally {
    loading.value = false;
  }
}

function toggle(id: number) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next;
}

function onFilter() { page.value = 0; load(); }

watch(() => props.visible, (open) => {
  if (open) {
    page.value = 0;
    severityFilter.value = null;
    selected.value = new Set();
    error.value = '';
    load();
  }
});

watch(page, load);

async function linkSelected() {
  if (!selected.value.size) return;
  linking.value = true;
  error.value = '';
  try {
    await projectRetestApi.link(props.projectId, [...selected.value]);
    emit('linked');
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to add findings to scope';
  } finally {
    linking.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Add findings to retest"
    modal
    style="width:42rem;"
  >
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <p style="margin:0; font-size:0.82rem; color:var(--ares-text-muted);">
        Pick published findings from other projects in this organization to verify in this retest.
        The finding stays owned by its original project — only a link is created here.
      </p>

      <Select
        v-model="severityFilter"
        :options="severityOptions"
        option-label="label"
        option-value="value"
        placeholder="All severities"
        show-clear
        style="width:14rem;"
        @update:model-value="onFilter"
      />

      <div v-if="loading" style="display:flex; justify-content:center; padding:2rem;">
        <ProgressSpinner style="width:2.2rem; height:2.2rem;" />
      </div>

      <template v-else>
        <div class="ares-card" style="padding:0; max-height:22rem; overflow:auto;">
          <table class="ares-table">
            <tbody>
              <tr
                v-for="f in candidates"
                :key="f.id"
                style="cursor:pointer;"
                @click="toggle(f.id)"
              >
                <td style="width:2.2rem;" @click.stop="toggle(f.id)">
                  <Checkbox :model-value="selected.has(f.id)" binary @update:model-value="toggle(f.id)" />
                </td>
                <td style="width:110px; font-family:monospace; font-size:0.8rem;">{{ f.code ?? '—' }}</td>
                <td style="font-weight:500;">{{ f.title }}</td>
                <td style="width:90px; text-align:center;"><SeverityTag :level="f.severity" scale="priority" /></td>
              </tr>
              <tr v-if="!candidates.length">
                <td colspan="4" class="ares-table-empty">No eligible findings found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <AppPagination
          :page="page"
          :total-pages="totalPages"
          :total="total"
          @prev="page--"
          @next="page++"
        />
      </template>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
        <Button
          :label="`Add ${selected.size ? '(' + selected.size + ')' : ''}`"
          :disabled="!selected.size"
          :loading="linking"
          @click="linkSelected"
        />
      </div>
    </div>
  </Dialog>
</template>
