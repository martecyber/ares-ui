<script setup lang="ts">
// Shared "Active grants" table for the 4 integration Grants tabs (standard tool
// integrations, Caido plugin, Caido API, Messaging) — organization icon+name, project
// ("*" for org-wide), and any type-specific details (capabilities/account/task),
// paginated client-side since a grant list is fully loaded up front.
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import AppPagination from '@/components/AppPagination.vue';
import { organizationsApi } from '@/api/organizations';

export interface ActiveGrantRow {
  id: number;
  organizationId: number;
  organizationName: string;
  organizationHasLogo: boolean;
  /** null/undefined = org-wide grant, rendered as "*". */
  projectLabel?: string | null;
  /** Capability chips (e.g. "enrich assets") — omitted for grant types without them. */
  badges?: string[];
  /** Free-text extra (e.g. "Account: foo", "Task: bar") — omitted when not applicable. */
  note?: string | null;
}

const props = withDefaults(defineProps<{
  rows: ActiveGrantRow[];
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
}>(), {
  loading: false,
  emptyText: 'No grants yet.',
  pageSize: 5,
});

const emit = defineEmits<{ revoke: [id: number] }>();

const hasDetails = computed(() => props.rows.some((r) => (r.badges && r.badges.length) || r.note));

const page = ref(0);
watch(() => props.rows.length, () => { page.value = 0; });

const totalPages = computed(() => Math.max(1, Math.ceil(props.rows.length / props.pageSize)));
const pageRows = computed(() => {
  const start = page.value * props.pageSize;
  return props.rows.slice(start, start + props.pageSize);
});
</script>

<template>
  <div>
    <div v-if="loading" class="empty-hint">Loading…</div>
    <div v-else-if="!rows.length" class="empty-hint">{{ emptyText }}</div>
    <template v-else>
      <table class="grants-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th style="width:110px;">Project</th>
            <th v-if="hasDetails">Details</th>
            <th style="width:40px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in pageRows" :key="r.id">
            <td>
              <div class="org-cell">
                <img v-if="r.organizationHasLogo" :src="organizationsApi.logoUrl(r.organizationId)" :alt="r.organizationName" class="org-icon" />
                <span v-else class="org-icon org-icon--placeholder"><i class="pi pi-building" /></span>
                <span>{{ r.organizationName }}</span>
              </div>
            </td>
            <td>
              <span v-if="!r.projectLabel" class="project-all" title="All projects">*</span>
              <span v-else>{{ r.projectLabel }}</span>
            </td>
            <td v-if="hasDetails">
              <div style="display:flex; flex-wrap:wrap; gap:0.25rem; align-items:center;">
                <AresBadge v-for="b in r.badges" :key="b" :value="b" severity="info" style="font-size:0.62rem;" />
                <span v-if="r.note" style="font-size:0.72rem; color:var(--ares-text-muted);">{{ r.note }}</span>
              </div>
            </td>
            <td style="text-align:right;">
              <Button icon="pi pi-trash" size="small" severity="danger" text @click="emit('revoke', r.id)" />
            </td>
          </tr>
        </tbody>
      </table>
      <AppPagination :page="page" :total-pages="totalPages" :total="rows.length"
        @prev="page--" @next="page++" />
    </template>
  </div>
</template>

<style scoped>
.empty-hint { font-size: 0.8rem; color: var(--ares-text-muted); }
.grants-table { width: 100%; border-collapse: collapse; }
.grants-table th {
  text-align: left;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
  padding: 0 0.4rem 0.4rem;
  border-bottom: 1px solid var(--ares-border);
}
.grants-table td {
  padding: 0.5rem 0.4rem;
  border-bottom: 1px solid var(--ares-border);
  font-size: 0.85rem;
  vertical-align: middle;
}
.grants-table tr:last-child td { border-bottom: none; }
.org-cell { display: flex; align-items: center; gap: 0.5rem; }
.org-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: var(--ares-radius);
  object-fit: contain;
  background: var(--p-surface-800);
}
.org-icon--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--p-surface-700);
}
.org-icon--placeholder .pi { font-size: 0.7rem; color: var(--ares-text-muted); }
.project-all { color: var(--ares-text-muted); font-weight: 700; }
</style>
