<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DatePicker from 'primevue/datepicker';
import Select from 'primevue/select';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import AresBadge from '@/components/AresBadge.vue';
import { projectsApi, isMonitoring, ITERATION_CADENCES, type Project, type MonitorStats } from '@/api/projects';
import { type UserSummary } from '@/api/users';
import { useContextStore } from '@/stores/context';
import { useAuthStore } from '@/stores/auth';
import UserCalendarPickerDialog from '@/components/UserCalendarPickerDialog.vue';

// Replaces the old ProjectEditDialog's General tab (its Team/Programme/Notifications tabs were
// full duplicates of the already-existing ProjectTeamView/ProjectBugHuntingProgramView/
// ProjectNotificationsView pages, reachable from the project's own nav — dropped, not migrated).
// Team was later folded in here too as its own tab (was a standalone nav item/route), mirroring
// how Organization Settings hosts its own Operators tab — see OrgSettingsView.
const route = useRoute();
const router = useRouter();
const context = useContextStore();
const auth = useAuthStore();

const engId = computed(() => Number(route.params.engId));
const orgId = computed(() => Number(route.params.orgId));

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : (auth.isAdmin ? 'general' : 'team')),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});

const project = ref<Project | null>(null);
const loading = ref(true);
const saving = ref(false);
const saveError = ref('');

const isMonitor = computed(() => isMonitoring(project.value?.typeCode, project.value?.supertypeCode));

// ── Iteration status / manual approval ──────────────────────────────────────
const iterationInfo = ref<MonitorStats | null>(null);
const approving = ref(false);
const approveError = ref('');

async function approveIteration() {
  approving.value = true;
  approveError.value = '';
  try {
    iterationInfo.value = await projectsApi.approveIteration(engId.value);
  } catch (e: any) {
    approveError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to approve iteration';
  } finally {
    approving.value = false;
  }
}

// ── Complete / reopen ───────────────────────────────────────────────────────
const completing = ref(false);
const reopening = ref(false);
const completeError = ref('');

async function completeProject() {
  if (!project.value) return;
  completeError.value = '';
  completing.value = true;
  try {
    project.value = await projectsApi.complete(project.value.id);
  } catch (e: any) {
    completeError.value = e?.response?.data?.message ?? 'Failed to complete project.';
  } finally {
    completing.value = false;
  }
}

async function reopenProject() {
  if (!project.value) return;
  completeError.value = '';
  reopening.value = true;
  try {
    project.value = await projectsApi.reopen(project.value.id);
  } catch (e: any) {
    completeError.value = e?.response?.data?.message ?? 'Failed to reopen project.';
  } finally {
    reopening.value = false;
  }
}

const form = ref({ name: '', startDate: null as Date | null, endDate: null as Date | null, iterationCadence: null as string | null, autoAdvanceIterations: false, clientsCanViewDetections: false });
const canSave = computed(() => !!form.value.name.trim());

function parseDateStr(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function load() {
  loading.value = true;
  try {
    project.value = await projectsApi.get(engId.value);
    context.setProject({ id: project.value.id, name: project.value.name, code: project.value.code, typeCode: project.value.typeCode ?? null, supertypeCode: project.value.supertypeCode ?? null, clientsCanViewDetections: project.value.clientsCanViewDetections ?? false });
    form.value = {
      name: project.value.name,
      startDate: parseDateStr(project.value.startDate),
      endDate: parseDateStr(project.value.endDate),
      iterationCadence: project.value.iterationCadence ?? null,
      autoAdvanceIterations: project.value.autoAdvanceIterations ?? false,
      clientsCanViewDetections: project.value.clientsCanViewDetections ?? false,
    };
    if (isMonitor.value) {
      iterationInfo.value = await projectsApi.monitorStats(engId.value);
    }
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!project.value || !canSave.value) return;
  saveError.value = '';
  saving.value = true;
  try {
    project.value = await projectsApi.update(project.value.id, {
      name: form.value.name.trim(),
      startDate: form.value.startDate ? toLocalDateStr(form.value.startDate) : undefined,
      endDate: form.value.endDate ? toLocalDateStr(form.value.endDate) : undefined,
      iterationCadence: isMonitor.value ? (form.value.iterationCadence ?? null) : undefined,
      autoAdvanceIterations: isMonitor.value ? form.value.autoAdvanceIterations : undefined,
      clientsCanViewDetections: form.value.clientsCanViewDetections,
    });
  } catch (e: any) {
    saveError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to update project';
  } finally {
    saving.value = false;
  }
}

// ── Delete ───────────────────────────────────────────────────────────────
const showDeleteConfirm = ref(false);
const deleteConfirmName = ref('');
const deleting = ref(false);
const deleteError = ref('');
const canDelete = computed(() => !!project.value && deleteConfirmName.value.trim() === project.value.name);

async function deleteProject() {
  if (!project.value || !canDelete.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await projectsApi.delete(project.value.id);
    router.push({ name: 'org-projects', params: { orgId: orgId.value } });
  } catch (e: any) {
    deleteError.value = e?.response?.data?.message ?? e?.message ?? 'Failed to delete project';
  } finally {
    deleting.value = false;
  }
}

// ── Team ─────────────────────────────────────────────────────────────────
const failedAvatars = ref(new Set<number>());
function avatarUrl(userId: number) { return `/api/v1/profile/${userId}/avatar`; }
function onAvatarError(userId: number) {
  failedAvatars.value = new Set([...failedAvatars.value, userId]);
}
function initials(displayName: string, email: string): string {
  const n = displayName || email;
  return n.split(/\s+/).map((w) => w[0]?.toUpperCase()).slice(0, 2).join('');
}

const currentLead = computed(() => project.value?.members.find((m) => m.role === 'lead') ?? null);
const operators   = computed(() => project.value?.members.filter((m) => m.role === 'operator') ?? []);
const projectStartDate = computed(() => parseDateStr(project.value?.startDate));
const projectEndDate   = computed(() => parseDateStr(project.value?.endDate));

const showLeaderPicker = ref(false);
const leadSaving = ref(false);
const leadExcludeIds = computed(() =>
  project.value?.members.filter((m) => m.role === 'lead').map((m) => m.userId) ?? []
);

async function onLeaderSelected(user: UserSummary) {
  if (!project.value) return;
  leadSaving.value = true;
  try {
    if (currentLead.value) {
      await projectsApi.removeMember(project.value.id, currentLead.value.userId, 'lead');
      project.value.members = project.value.members.filter((m) => m.role !== 'lead');
    }
    const member = await projectsApi.addMember(project.value.id, { userId: user.id, role: 'lead' });
    project.value.members.push(member);
  } catch { /* silent */ }
  finally { leadSaving.value = false; }
}

const showOperatorPicker = ref(false);
const operatorExcludeIds = computed(() =>
  project.value?.members.filter((m) => m.role === 'operator').map((m) => m.userId) ?? []
);

async function onOperatorSelected(user: UserSummary) {
  if (!project.value) return;
  try {
    const member = await projectsApi.addMember(project.value.id, { userId: user.id, role: 'operator' });
    project.value.members.push(member);
  } catch { /* silent */ }
}

async function removeOperator(userId: number) {
  if (!project.value) return;
  await projectsApi.removeMember(project.value.id, userId, 'operator');
  project.value.members = project.value.members.filter((m) => !(m.userId === userId && m.role === 'operator'));
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Settings</h2>
        <p v-if="project" class="ares-page-subtitle">{{ project.name }}</p>
      </div>
    </div>

    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <Tabs v-else v-model:value="activeTab">
      <TabList>
        <Tab v-if="auth.isAdmin" value="general">General</Tab>
        <Tab value="team">Team</Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-if="auth.isAdmin" value="general">
          <div style="display:flex; flex-direction:column; gap:0.9rem; max-width:560px;">
            <div class="form-field">
              <label>Name *</label>
              <InputText v-model="form.name" class="w-full" />
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
              <div class="form-field">
                <label>Start date</label>
                <DatePicker v-model="form.startDate" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" append-to="body" class="w-full" />
              </div>
              <div v-if="!isMonitor" class="form-field">
                <label>End date</label>
                <DatePicker v-model="form.endDate" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" append-to="body" class="w-full" />
              </div>
              <div v-if="isMonitor" class="form-field">
                <label>Iteration cadence</label>
                <Select v-model="form.iterationCadence" :options="[...ITERATION_CADENCES]" option-label="label" option-value="value" placeholder="No cadence" show-clear class="w-full" />
              </div>
              <div v-if="isMonitor" class="form-field" style="flex-direction:row; align-items:center; gap:0.5rem;">
                <Checkbox v-model="form.autoAdvanceIterations" input-id="autoAdvanceIterationsSettings" binary />
                <label for="autoAdvanceIterationsSettings" style="margin:0;">Auto-advance iterations without manual approval</label>
              </div>
              <div class="form-field" style="flex-direction:row; align-items:center; gap:0.5rem;">
                <Checkbox v-model="form.clientsCanViewDetections" input-id="clientsCanViewDetectionsSettings" binary />
                <label for="clientsCanViewDetectionsSettings" style="margin:0;">Clients can view Detections (read-only)</label>
              </div>
            </div>

            <!-- Iteration status (MONITOR projects only) -->
            <div v-if="isMonitor && iterationInfo" class="ares-card" style="display:flex; flex-direction:column; gap:0.6rem;">
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <span style="font-size:0.8rem; color:var(--ares-text-muted);">Current iteration</span>
                <AresBadge v-if="iterationInfo.currentIterationLabel" :value="iterationInfo.currentIterationLabel" severity="info" style="font-size:0.85rem;" />
                <span v-else style="font-size:0.8rem; color:var(--ares-text-muted);">—</span>
              </div>
              <div v-if="iterationInfo.awaitingApproval" style="display:flex; align-items:center; gap:0.75rem; padding-top:0.5rem; border-top:1px solid color-mix(in srgb, var(--p-amber-500) 30%, transparent);">
                <i class="pi pi-exclamation-triangle" style="color:var(--p-amber-500);" />
                <span style="font-size:0.85rem; flex:1;">
                  New iteration available: <AresBadge :value="iterationInfo.pendingIterationLabel!" severity="warn" style="font-size:0.85rem;" />
                  — new findings are still being reported under {{ iterationInfo.currentIterationLabel }}.
                </span>
                <Button label="Approve" size="small" :loading="approving" @click="approveIteration" />
              </div>
              <Message v-if="approveError" severity="error" :closable="false">{{ approveError }}</Message>
            </div>

            <Message v-if="saveError" severity="error" :closable="false">{{ saveError }}</Message>

            <div style="display:flex; justify-content:flex-end;">
              <Button label="Save" :loading="saving" :disabled="!canSave" @click="save" />
            </div>

            <!-- Danger zone -->
            <div class="danger-zone">
              <div style="font-size:0.78rem; font-weight:600; color:var(--p-red-400); margin-bottom:0.5rem;">Danger zone</div>

              <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; padding-bottom:0.85rem; margin-bottom:0.85rem; border-bottom:1px solid color-mix(in srgb, var(--p-red-500) 25%, transparent);">
                <span v-if="project?.status !== 'completed'" style="font-size:0.8rem; color:var(--ares-text-muted);">Mark this project as complete. It stops counting toward active work.</span>
                <span v-else style="font-size:0.8rem; color:var(--ares-text-muted);">Reopen this project so it counts as active again.</span>
                <Button
                  v-if="project?.status !== 'completed'"
                  label="Mark complete" icon="pi pi-check" severity="danger" outlined size="small"
                  :loading="completing" @click="completeProject"
                />
                <Button
                  v-else
                  label="Reopen" icon="pi pi-refresh" severity="danger" outlined size="small"
                  :loading="reopening" @click="reopenProject"
                />
              </div>
              <Message v-if="completeError" severity="error" :closable="false" style="margin-bottom:0.85rem;">{{ completeError }}</Message>

              <div v-if="!showDeleteConfirm" style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
                <span style="font-size:0.8rem; color:var(--ares-text-muted);">Permanently delete this project, including all findings, detections and assets.</span>
                <Button label="Delete project" severity="danger" outlined size="small" @click="showDeleteConfirm = true" />
              </div>
              <div v-else style="display:flex; flex-direction:column; gap:0.6rem;">
                <p style="margin:0; font-size:0.82rem; color:var(--ares-text-2);">
                  Type <strong>{{ project?.name }}</strong> to confirm deletion. This cannot be undone.
                </p>
                <InputText v-model="deleteConfirmName" :placeholder="project?.name" class="w-full" style="font-size:0.85rem;" />
                <Message v-if="deleteError" severity="error" :closable="false">{{ deleteError }}</Message>
                <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                  <Button label="Cancel" severity="secondary" size="small" @click="showDeleteConfirm = false; deleteConfirmName = ''" />
                  <Button label="Delete permanently" severity="danger" size="small" :loading="deleting" :disabled="!canDelete" @click="deleteProject" />
                </div>
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="team">
          <p class="ares-page-subtitle" style="margin:0 0 1.25rem;">Leads and operators assigned to this project.</p>

          <!-- Leader section -->
          <div style="margin-bottom:1.5rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.6rem;">
              <span class="team-section-label"><i class="pi pi-star" style="margin-right:0.35rem;" />Leader</span>
              <Button v-if="!currentLead && auth.isAdmin" label="Assign" icon="pi pi-user-plus" size="small" @click="showLeaderPicker = true" />
            </div>

            <div v-if="currentLead" class="team-member-card team-member-card--lead">
              <div class="team-member-avatar">
                <img v-if="!failedAvatars.has(currentLead.userId)"
                  :src="avatarUrl(currentLead.userId)"
                  style="width:100%; height:100%; object-fit:cover; border-radius: 50%;"
                  @error="onAvatarError(currentLead.userId)"
                />
                <template v-else>{{ initials(currentLead.userDisplayName, currentLead.userEmail) }}</template>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:0.9rem;">{{ currentLead.userDisplayName }}</div>
                <div style="font-size:0.75rem; color:var(--ares-text-muted);">{{ currentLead.userEmail }}</div>
              </div>
              <span style="font-size:0.67rem; color:var(--ares-text-muted);">since {{ currentLead.addedAt.slice(0, 10) }}</span>
              <Button v-if="auth.isAdmin" label="Change" icon="pi pi-refresh" text size="small" :loading="leadSaving" @click="showLeaderPicker = true" />
            </div>

            <div v-else class="team-empty-slot">No leader assigned.</div>
          </div>

          <!-- Operators section -->
          <div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.6rem;">
              <span class="team-section-label"><i class="pi pi-users" style="margin-right:0.35rem;" />Operators</span>
              <Button v-if="auth.isAdmin" label="Add operator" icon="pi pi-user-plus" size="small" @click="showOperatorPicker = true" />
            </div>

            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              <div v-for="m in operators" :key="m.userId" class="team-member-card">
                <div class="team-member-avatar">
                  <img v-if="!failedAvatars.has(m.userId)"
                    :src="avatarUrl(m.userId)"
                    style="width:100%; height:100%; object-fit:cover; border-radius: 50%;"
                    @error="onAvatarError(m.userId)"
                  />
                  <template v-else>{{ initials(m.userDisplayName, m.userEmail) }}</template>
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:500; font-size:0.875rem;">{{ m.userDisplayName }}</div>
                  <div style="font-size:0.75rem; color:var(--ares-text-muted);">{{ m.userEmail }}</div>
                </div>
                <span style="font-size:0.67rem; color:var(--ares-text-muted);">since {{ m.addedAt.slice(0, 10) }}</span>
                <Button v-if="auth.isAdmin" icon="pi pi-times" text severity="danger" size="small" @click="removeOperator(m.userId)" />
              </div>
              <div v-if="!operators.length" class="team-empty-slot">No operators assigned.</div>
            </div>
          </div>

          <!-- Leader picker -->
          <UserCalendarPickerDialog
            v-model:visible="showLeaderPicker"
            title="Select leader"
            :eng-start-date="projectStartDate"
            :eng-end-date="projectEndDate"
            :exclude-user-ids="leadExcludeIds"
            @select="onLeaderSelected"
          />

          <!-- Operator picker -->
          <UserCalendarPickerDialog
            v-model:visible="showOperatorPicker"
            title="Add operator"
            :eng-start-date="projectStartDate"
            :eng-end-date="projectEndDate"
            :exclude-user-ids="operatorExcludeIds"
            @select="onOperatorSelected"
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.form-field { display: flex; flex-direction: column; gap: 0.35rem; }
.form-field label { font-size: 0.8rem; font-weight: 600; color: var(--ares-text-muted); }
.danger-zone {
  margin-top: 0.5rem; padding: 0.85rem 1rem;
  border: 1px solid color-mix(in srgb, var(--p-red-500) 35%, transparent);
  border-radius: var(--ares-radius);
  background: color-mix(in srgb, var(--p-red-500) 6%, transparent);
}
.team-section-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
}
.team-member-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
}
.team-member-card--lead {
  border-color: var(--ares-accent-muted);
  background: color-mix(in srgb, var(--ares-accent-bg) 6%, var(--ares-surface));
}
.team-member-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--ares-accent-bg);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
}
.team-empty-slot {
  padding: 1rem;
  border: 1px dashed var(--ares-border);
  border-radius: var(--ares-radius);
  color: var(--ares-text-muted);
  font-size: 0.82rem;
  font-style: italic;
  text-align: center;
}
</style>
