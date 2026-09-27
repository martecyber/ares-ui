<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import Select from 'primevue/select';
import { projectsApi, STATUS_OPTIONS, statusSeverity, statusLabel, type Project, type ProjectStatus } from '@/api/projects';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';
import ProjectCreateDialog from '@/components/ProjectCreateDialog.vue';
import AppPagination from '@/components/AppPagination.vue';

const auth = useAuthStore();

const route = useRoute();
const router = useRouter();
const context = useContextStore();

const orgId = computed(() => Number(route.params.orgId));

const PAGE_SIZE = 50;
const items = ref<Project[]>([]);
const loading = ref(false);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);
const statusFilter = ref<ProjectStatus | null>(null);
const showCreateDialog = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await projectsApi.list({
      organizationId: orgId.value,
      status: statusFilter.value ?? undefined,
      page: page.value,
      size: PAGE_SIZE,
    });
    items.value = res.items;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } finally {
    loading.value = false;
  }
}

function onFilter() { page.value = 0; load(); }
watch(page, load);

function goToProject(eng: Project) {
  context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
  router.push({ name: 'org-project-dashboard', params: { orgId: orgId.value, engId: eng.id } });
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Projects</h2>
        <p class="ares-page-subtitle">{{ context.org?.name ?? '' }} — security projects and assessments.</p>
      </div>
      <Button v-if="auth.isAdmin" icon="pi pi-plus" text v-tooltip.top="'New project'" @click="showCreateDialog = true" />
    </div>

    <div style="display:flex; gap:0.75rem; margin-bottom:1rem; align-items:center;">
      <Select
        v-model="statusFilter"
        :options="STATUS_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="All statuses"
        show-clear
        style="width:180px;"
        @change="onFilter"
      />
      <span style="font-size:0.8rem; color:var(--ares-text-muted);">{{ total }} project{{ total !== 1 ? 's' : '' }}</span>
    </div>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table ares-table--clickable">
          <thead>
            <tr>
              <th style="width:190px;">Code</th>
              <th>Name</th>
              <th style="width:160px;">Type</th>
              <th style="width:120px;">Status</th>
              <th style="width:100px;">Start</th>
              <th style="width:100px;">End</th>
              <th style="width:75px;">Members</th>
              <th style="width:100px;">Created</th>
              <th style="width:48px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="eng in items" :key="eng.id" @click="goToProject(eng)">
              <td>
                <code v-if="eng.code" style="font-size:0.75rem; color:var(--ares-accent);">{{ eng.code }}</code>
                <span v-else style="color:var(--ares-text-muted);">—</span>
              </td>
              <td style="font-weight:500;">{{ eng.name }}</td>
              <td style="color:var(--ares-text-muted); font-size:0.8rem;">{{ eng.typeName ?? '—' }}</td>
              <td><AresBadge :value="statusLabel(eng.status)" :severity="statusSeverity(eng.status)" /></td>
              <td>{{ eng.startDate?.slice(0, 10) ?? '—' }}</td>
              <td>{{ eng.endDate?.slice(0, 10) ?? '—' }}</td>
              <td>{{ eng.members.length }}</td>
              <td>{{ eng.createdAt.slice(0, 10) }}</td>
              <td @click.stop>
                <Button
                  v-if="auth.isAdmin"
                  icon="pi pi-pencil"
                  size="small"
                  severity="secondary"
                  text
                  style="padding:0.25rem;"
                  v-tooltip.left="'Settings'"
                  @click="router.push({ name: 'org-project-settings', params: { orgId, engId: eng.id } })"
                />
              </td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="9" class="ares-table-empty">No projects yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
    </template>

    <ProjectCreateDialog
      v-model:visible="showCreateDialog"
      :org-id="orgId"
      @created="(eng) => { items.unshift(eng); total++; }"
    />

  </div>
</template>
