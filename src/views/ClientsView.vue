<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { organizationsApi, type Organization } from '@/api/organizations';
import { useAuthStore } from '@/stores/auth';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import AppPagination from '@/components/AppPagination.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import { useToast } from 'primevue/usetoast';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const PAGE_SIZE = 50;
const items = ref<Organization[]>([]);
const loading = ref(true);
const err = ref<string | null>(null);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);

// ── Sort / filter state ────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterStatus = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
  { label: 'Inactive', value: 'inactive' },
];

const processedItems = computed(() => {
  let data = [...items.value];
  if (filterStatus.value.length) data = data.filter((o) => filterStatus.value.includes(o.status));
  if (sortCol.value && sortDir.value) {
    const dir = sortDir.value === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      const va = String((a as any)[sortCol.value!] ?? '');
      const vb = String((b as any)[sortCol.value!] ?? '');
      return dir * va.localeCompare(vb, undefined, { numeric: true });
    });
  }
  return data;
});

watch(filterStatus, () => { page.value = 0; });

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const res = await organizationsApi.list({ page: page.value, size: PAGE_SIZE });
    items.value = res.items;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch {
    err.value = 'Failed to load organizations.';
  } finally {
    loading.value = false;
  }
}

watch(page, load);
onMounted(load);

function severity(status: string) {
  return status === 'active' ? 'success' : status === 'archived' ? 'secondary' : 'warn';
}

// Moved here from ClientDetailView's header — this staff-only list is the org "administration"
// surface (also embedded as AdminAccessView's Organizations tab), same reasoning as project
// delete moving to ProjectSettingsView.
async function archive(org: Organization) {
  const ok = await confirmDialog({
    message: `Archive "${org.name}"? The organization becomes inactive but no data is deleted.`,
    header: 'Archive organization',
    acceptLabel: 'Archive',
    acceptIcon: 'pi pi-archive',
  });
  if (!ok) return;
  try {
    await organizationsApi.archive(org.id);
    toast.add({ severity: 'success', summary: 'Organization archived', life: 3000 });
    await load();
  } catch {
    toast.add({ severity: 'error', summary: 'Failed to archive', life: 5000 });
  }
}
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Organizations</h2>
        <p class="ares-page-subtitle">Organizations managed by this MSSP.</p>
      </div>
      <Button v-if="auth.isAdmin" icon="pi pi-plus" text v-tooltip.top="'New organization'" @click="router.push({ name: 'organization-new' })" />
    </div>

    <p v-if="err" style="color:var(--ares-error); margin-bottom:1rem;">{{ err }}</p>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table ares-table--clickable">
          <thead>
            <tr>
              <th>
                <ColumnHeader label="Name" :sortable="true"
                  :sort-dir="sortCol === 'name' ? sortDir : null"
                  sort-asc-label="A → Z" sort-desc-label="Z → A"
                  @update:sort-dir="onSort('name', $event)" />
              </th>
              <th style="width:160px;">
                <ColumnHeader label="Slug" :sortable="true"
                  :sort-dir="sortCol === 'slug' ? sortDir : null"
                  sort-asc-label="A → Z" sort-desc-label="Z → A"
                  @update:sort-dir="onSort('slug', $event)" />
              </th>
              <th style="width:110px;">
                <ColumnHeader label="Status" :sortable="true"
                  :sort-dir="sortCol === 'status' ? sortDir : null"
                  :filter-options="statusOptions"
                  :filter-value="filterStatus"
                  @update:sort-dir="onSort('status', $event)"
                  @update:filter-value="filterStatus = $event" />
              </th>
              <th style="width:110px;">
                <ColumnHeader label="Created" :sortable="true"
                  :sort-dir="sortCol === 'createdAt' ? sortDir : null"
                  sort-asc-label="Oldest first" sort-desc-label="Newest first"
                  @update:sort-dir="onSort('createdAt', $event)" />
              </th>
              <th v-if="auth.isAdmin" style="width:50px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="org in processedItems" :key="org.id" @click="router.push({ name: 'organization-detail', params: { id: org.id } })">
              <td>
                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <img v-if="org.hasLogo" :src="organizationsApi.logoUrl(org.id)" :alt="org.name"
                    style="width:28px; height:28px; border-radius: var(--ares-radius); object-fit:contain; flex-shrink:0; background:var(--p-surface-800);" />
                  <span v-else style="width:28px; height:28px; border-radius: var(--ares-radius); background:var(--p-surface-700); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="pi pi-building" style="font-size:0.75rem; color:var(--ares-text-muted);" />
                  </span>
                  {{ org.name }}
                </div>
              </td>
              <td><code style="font-size:0.78rem;">{{ org.slug.toUpperCase() }}</code></td>
              <td><AresBadge :value="org.status" :severity="severity(org.status)" /></td>
              <td>{{ new Date(org.createdAt).toLocaleDateString() }}</td>
              <td v-if="auth.isAdmin" @click.stop>
                <Button v-if="org.status === 'active'" icon="pi pi-archive" text size="small" severity="danger"
                  style="padding:0.25rem;" v-tooltip.left="'Archive'" @click="archive(org)" />
              </td>
            </tr>
            <tr v-if="!processedItems.length">
              <td :colspan="auth.isAdmin ? 5 : 4" class="ares-table-empty">No organizations yet. Create the first one above.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
    </template>
  </div>
</template>
