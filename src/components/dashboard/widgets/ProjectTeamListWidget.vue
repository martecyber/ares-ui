<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { projectsApi, type Project, type ProjectMember } from '@/api/projects';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null; orgId: number | null }>();
const route = useRoute();
const router = useRouter();

const members = ref<ProjectMember[]>([]);
const leadUserIds = ref(new Set<number>());
const loading = ref(true);

const ROLE_LABELS: Record<string, string> = { lead: 'Lead', operator: 'Operator' };

const failedAvatars = ref(new Set<number>());
function avatarUrl(userId: number) { return `/api/v1/profile/${userId}/avatar`; }
function onAvatarError(userId: number) { failedAvatars.value = new Set([...failedAvatars.value, userId]); }
function initials(displayName: string, email: string): string {
  const n = displayName || email;
  return n.split(/\s+/).map((w) => w[0]?.toUpperCase()).slice(0, 2).join('');
}

onMounted(async () => {
  if (!props.scopeId) { loading.value = false; return; }
  try {
    const project: Project = await projectsApi.get(props.scopeId);
    // A user can hold more than one role on a project (lead AND operator) — project.members has
    // one row per (userId, role) pair, so it lists that user twice. Collapse to one row per user
    // (keep the first occurrence, but force its role to 'lead' whenever the user holds that role
    // anywhere in the list, regardless of which row was seen first) and flag lead users
    // separately for the star marker, rather than relying on the merged row's role label alone.
    const leads = new Set(project.members.filter((m) => m.role === 'lead').map((m) => m.userId));
    leadUserIds.value = leads;
    const seen = new Set<number>();
    const deduped: ProjectMember[] = [];
    for (const m of project.members) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      deduped.push(leads.has(m.userId) ? { ...m, role: 'lead' } : m);
    }
    members.value = deduped.sort((a, b) => (leads.has(a.userId) === leads.has(b.userId) ? 0 : leads.has(a.userId) ? -1 : 1));
  } finally {
    loading.value = false;
  }
});

function goToTeam() {
  const orgId = props.orgId ?? Number(route.params.orgId);
  if (orgId && props.scopeId) router.push({ name: 'org-project-settings', params: { orgId, engId: props.scopeId }, query: { tab: 'team' } });
}
</script>

<template>
  <div class="ares-card widget-card">
    <div class="ares-card-section-header">
      <span>Team</span>
      <a class="widget-link" @click="goToTeam">Manage</a>
    </div>
    <div class="widget-body">
      <WidgetLoading v-if="loading" />
      <div v-else-if="!members.length" style="color:var(--ares-text-muted); font-size:0.82rem; padding:0.75rem 1rem;">No members yet.</div>
      <ul v-else class="team-list">
        <li v-for="m in members" :key="m.userId" class="team-row">
          <img v-if="!failedAvatars.has(m.userId)" :src="avatarUrl(m.userId)" class="avatar" @error="onAvatarError(m.userId)" />
          <span v-else class="avatar-fallback">{{ initials(m.userDisplayName, m.userEmail) }}</span>
          <div class="team-row-info">
            <span class="team-row-name">
              {{ m.userDisplayName || m.userEmail }}
              <i v-if="leadUserIds.has(m.userId)" class="pi pi-star-fill lead-star" v-tooltip.top="'Project lead'" />
            </span>
            <span class="team-row-role">{{ ROLE_LABELS[m.role] ?? m.role }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.widget-card { height: 100%; padding: 0; display: flex; flex-direction: column; }
.widget-body { flex: 1; min-height: 0; overflow: auto; }
.widget-link { font-size: 0.78rem; color: var(--ares-accent-muted); cursor: pointer; }
.widget-link:hover { text-decoration: underline; }
.team-list { list-style: none; margin: 0; padding: 0.4rem 0; }
.team-row { display: flex; align-items: center; gap: 0.55rem; padding: 0.4rem 1rem; }
.avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.avatar-fallback {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  background: var(--ares-surface-2); color: var(--ares-text-muted); font-size: 0.65rem; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.team-row-info { display: flex; flex-direction: column; min-width: 0; }
.team-row-name { font-size: 0.82rem; color: var(--ares-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lead-star { margin-left: 0.3rem; font-size: 0.68rem; color: var(--ares-accent); }
.team-row-role { font-size: 0.72rem; color: var(--ares-text-muted); }
</style>
