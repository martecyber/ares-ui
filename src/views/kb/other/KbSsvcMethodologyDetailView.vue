<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ssvcMethodologiesApi, type SsvcMethodology, type SsvcRoleDetail, type SsvcRoleOutcome } from '@/api/ssvcMethodologies';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Checkbox from 'primevue/checkbox';
import SsvcTreeNodeEditor from '@/components/ssvc/SsvcTreeNodeEditor.vue';
import SsvcTreeWizard from '@/components/ssvc/SsvcTreeWizard.vue';
import SsvcRoleSettingsDialog, { type KnownOutcome, type RoleMeta } from '@/components/ssvc/SsvcRoleSettingsDialog.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { useAuthStore } from '@/stores/auth';
import { deriveKnownOutcomes } from '@/utils/ssvcTree';

const route = useRoute();
const id = Number(route.params.id);
const auth = useAuthStore();

const methodology = ref<SsvcMethodology | null>(null);
const loading = ref(true);
const err = ref<string | null>(null);

const selectedRoleId = ref<number | null>(null);
const selectedRoleDetail = ref<SsvcRoleDetail | null>(null);
const roleLoading = ref(false);

const editMode = ref(false);
const treeEditorRef = ref<InstanceType<typeof SsvcTreeNodeEditor> | null>(null);
const topSaving = ref(false);

const showAddRole = ref(false);
const addingRole = ref(false);
const addRoleError = ref('');
const newRoleCode = ref('');
const newRoleName = ref('');
const newRoleDescription = ref('');
const newRoleUsesPriorityMapping = ref(true);

const showRoleSettings = ref(false);
const roleSettingsRole = ref<RoleMeta | null>(null);
const roleSettingsOutcomes = ref<KnownOutcome[]>([]);
const roleSettingsRoleId = ref<number | null>(null);

const showSimulate = ref(false);
/** Walks the tree exactly as currently configured in the editor — including any
 *  not-yet-saved structural edits — rather than the last-persisted version, so
 *  "Simulate" is useful mid-edit, not just on an already-saved tree. */
const simulationTree = computed(() => treeEditorRef.value?.previewTree ?? null);

async function load() {
  loading.value = true;
  err.value = null;
  try {
    methodology.value = await ssvcMethodologiesApi.getDetail(id);
  } catch {
    err.value = 'Failed to load methodology.';
  } finally {
    loading.value = false;
  }
}

async function selectRole(roleId: number) {
  selectedRoleId.value = roleId;
  roleLoading.value = true;
  try {
    selectedRoleDetail.value = await ssvcMethodologiesApi.getRoleDetail(roleId);
  } finally {
    roleLoading.value = false;
  }
}

async function onTreeSaved() {
  if (selectedRoleId.value != null) await selectRole(selectedRoleId.value);
  await load();
}

function openAddRole() {
  newRoleCode.value = '';
  newRoleName.value = '';
  newRoleDescription.value = '';
  newRoleUsesPriorityMapping.value = true;
  addRoleError.value = '';
  showAddRole.value = true;
  editMode.value = true;
}

async function submitAddRole() {
  if (!methodology.value) return;
  if (!newRoleCode.value.trim() || !newRoleName.value.trim()) {
    addRoleError.value = 'Code and name are required.';
    return;
  }
  addingRole.value = true;
  addRoleError.value = '';
  try {
    await ssvcMethodologiesApi.createRole(methodology.value.id, {
      code: newRoleCode.value.trim(), name: newRoleName.value.trim(),
      description: newRoleDescription.value.trim() || undefined,
      usesPriorityMapping: newRoleUsesPriorityMapping.value,
    });
    showAddRole.value = false;
    await load();
  } catch (e: any) {
    addRoleError.value = e?.response?.data?.detail ?? e.message ?? 'Failed to add role';
  } finally {
    addingRole.value = false;
  }
}

async function removeRole(roleId: number, roleName: string) {
  const ok = await confirmDialog({ header: 'Delete role', message: `Delete role "${roleName}"?` });
  if (!ok) return;
  try {
    await ssvcMethodologiesApi.removeRole(roleId);
    if (selectedRoleId.value === roleId) { selectedRoleId.value = null; selectedRoleDetail.value = null; }
    await load();
  } catch {
    err.value = 'Failed to delete role — it may still have scores referencing it.';
  }
}

/** The role's outcome palette for editing in SsvcRoleSettingsDialog: the persisted list
 *  (SsvcRole.outcomes — authoritative) plus, as a fallback, any outcome code that only
 *  exists embedded in a tree leaf (covers roles/trees saved before the palette had its
 *  own storage). Persisted entries always win over a same-code tree-derived one. */
function currentKnownOutcomes(): KnownOutcome[] {
  const known = new Map<string, KnownOutcome>(
    (selectedRoleDetail.value?.outcomes ?? []).map((o) => [o.code, { code: o.code, label: o.label, description: o.description ?? '', priorityLevel: o.priorityLevel }]),
  );
  for (const o of deriveKnownOutcomes(selectedRoleDetail.value?.tree ?? null)) {
    if (!known.has(o.code)) known.set(o.code, o);
  }
  return [...known.values()];
}

/** Opens the role settings modal (metadata + reusable outcome palette) for the given
 *  role, selecting it first if it isn't already the one loaded in the tree editor. */
async function openRoleSettings(roleId: number, roleName: string) {
  if (selectedRoleId.value !== roleId) await selectRole(roleId);
  const role = methodology.value?.roles.find((r) => r.id === roleId);
  roleSettingsRoleId.value = roleId;
  roleSettingsRole.value = { code: role?.code ?? '', name: role?.name ?? roleName, description: role?.description ?? '' };
  roleSettingsOutcomes.value = currentKnownOutcomes();
  showRoleSettings.value = true;
}

async function saveRoleSettings(payload: { role: RoleMeta; outcomes: KnownOutcome[] }) {
  if (roleSettingsRoleId.value == null) return;
  try {
    const outcomesForApi = payload.outcomes.map((o) => ({
      code: o.code, label: o.label, description: o.description || null,
      priorityLevel: o.priorityLevel as SsvcRoleOutcome['priorityLevel'],
    }));
    await ssvcMethodologiesApi.updateRole(roleSettingsRoleId.value, {
      code: payload.role.code.trim(), name: payload.role.name.trim(), description: payload.role.description,
      outcomes: outcomesForApi,
    });
    showRoleSettings.value = false;
    // Patch the already-loaded role locally instead of re-fetching it — a re-fetch would
    // replace `.tree` with the last-*persisted* version, silently discarding any
    // in-progress (unsaved) structural edits made to the tree in this same edit session.
    // Only `.tree` is left untouched; everything else reflects what was just saved.
    if (selectedRoleDetail.value?.id === roleSettingsRoleId.value) {
      selectedRoleDetail.value = {
        ...selectedRoleDetail.value,
        code: payload.role.code.trim(),
        name: payload.role.name.trim(),
        description: payload.role.description,
        outcomes: outcomesForApi,
      };
    }
    await load();
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? e.message ?? 'Failed to save role settings';
  }
}

async function topSave() {
  if (!treeEditorRef.value) { editMode.value = false; return; }
  topSaving.value = true;
  try {
    const ok = await treeEditorRef.value.save();
    if (ok) editMode.value = false;
  } finally {
    topSaving.value = false;
  }
}

/** Discards any in-progress local edits by re-fetching the selected role's tree from
 *  the server, then exits edit mode. */
async function topCancel() {
  editMode.value = false;
  if (selectedRoleId.value != null) await selectRole(selectedRoleId.value);
}

const canEditStructure = computed(() =>
  !!methodology.value && !methodology.value.isSystem && auth.hasPermission('SSVC_WRITE')
);
const selectedRoleReadonly = computed(() => {
  const role = methodology.value?.roles.find((r) => r.id === selectedRoleId.value);
  return !canEditStructure.value || !!role?.locked;
});

onMounted(load);
</script>

<template>
  <div>
    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <div v-else-if="err && !methodology" class="ares-alert ares-alert--error">{{ err }}</div>
    <template v-else-if="methodology">
      <div class="ares-page-header">
        <div>
          <h2 class="ares-page-title">
            {{ methodology.name }}
            <span v-if="methodology.isSystem" class="ares-badge-system">System</span>
          </h2>
          <p class="ares-page-subtitle">{{ methodology.description || 'No description.' }}</p>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <Button
            v-if="!editMode"
            icon="pi pi-play"
            text
            severity="secondary"
            size="small"
            :disabled="!simulationTree"
            v-tooltip.top="'Simulate'"
            @click="showSimulate = true"
          />
          <template v-if="canEditStructure">
            <template v-if="editMode">
              <Button icon="pi pi-times" text severity="danger" size="small" v-tooltip.top="'Cancel'" @click="topCancel" />
              <Button icon="pi pi-check" text size="small" :loading="topSaving" v-tooltip.top="'Save'" @click="topSave" />
            </template>
            <template v-else>
              <Button icon="pi pi-pencil" text severity="secondary" size="small" v-tooltip.top="'Edit Roles'" @click="editMode = true" />
              <Button icon="pi pi-plus" text size="small" v-tooltip.top="'New Role'" @click="openAddRole" />
            </template>
          </template>
        </div>
      </div>

      <Dialog v-model:visible="showAddRole" header="New role" modal :style="{ width: 'min(480px, 96vw)' }">
        <div style="display:flex; flex-direction:column; gap:0.75rem;">
          <div>
            <label class="ares-field-label">Code</label>
            <InputText v-model="newRoleCode" placeholder="e.g. deployer" style="width:100%;" />
          </div>
          <div>
            <label class="ares-field-label">Name</label>
            <InputText v-model="newRoleName" placeholder="e.g. Deployer" style="width:100%;" />
          </div>
          <div>
            <label class="ares-field-label">Description</label>
            <Textarea v-model="newRoleDescription" rows="3" style="width:100%;" />
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <Checkbox v-model="newRoleUsesPriorityMapping" input-id="role-uses-priority" binary />
            <label for="role-uses-priority" style="margin:0; font-size:0.85rem;">
              Outcomes map to Ares's P0-P4 priority (uncheck for informational-only roles)
            </label>
          </div>
          <div v-if="addRoleError" class="ares-alert ares-alert--error">{{ addRoleError }}</div>
        </div>
        <template #footer>
          <Button label="Cancel" severity="secondary" size="small" @click="showAddRole = false" />
          <Button label="Create" icon="pi pi-check" size="small" :loading="addingRole" @click="submitAddRole" />
        </template>
      </Dialog>

      <div v-if="err" class="ares-alert ares-alert--error" style="margin-bottom:0.75rem;">{{ err }}</div>

      <div class="role-list">
        <button
          v-for="r in methodology.roles"
          :key="r.id"
          type="button"
          :class="['role-chip', { 'role-chip--active': selectedRoleId === r.id }]"
          @click="selectRole(r.id)"
        >
          <span>{{ r.name }}</span>
          <span v-if="!r.usesPriorityMapping" class="ref-badge" title="For reference">R</span>
          <span v-if="r.locked" class="role-chip-tag" title="Used by at least one score — structure is locked">Locked</span>
          <span v-if="!r.hasTree" class="role-chip-tag role-chip-tag--warn">No tree</span>
          <template v-if="editMode && canEditStructure">
            <span class="role-chip-edit" title="Role settings" @click.stop="openRoleSettings(r.id, r.name)"><i class="pi pi-pencil" /></span>
            <span
              v-if="!r.locked"
              class="role-chip-delete"
              title="Delete role"
              @click.stop="removeRole(r.id, r.name)"
            ><i class="pi pi-trash" /></span>
          </template>
        </button>
      </div>

      <SsvcRoleSettingsDialog
        v-model:visible="showRoleSettings"
        :role="roleSettingsRole"
        :outcomes="roleSettingsOutcomes"
        :uses-priority-mapping="selectedRoleDetail?.usesPriorityMapping ?? true"
        @save="saveRoleSettings"
      />

      <div v-if="selectedRoleId" class="role-detail">
        <p v-if="selectedRoleReadonly && canEditStructure" style="font-size:0.75rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">
          This role's tree has been used by at least one score and can no longer be restructured.
        </p>
        <div v-if="roleLoading" class="ares-table-empty">Loading tree…</div>
        <SsvcTreeNodeEditor
          v-else-if="selectedRoleDetail"
          ref="treeEditorRef"
          :role-id="selectedRoleDetail.id"
          :uses-priority-mapping="selectedRoleDetail.usesPriorityMapping"
          :initial-tree="selectedRoleDetail.tree"
          :initial-outcomes="selectedRoleDetail.outcomes"
          :readonly="selectedRoleReadonly || editMode === false"
          @saved="onTreeSaved"
        />
      </div>
      <p v-else style="font-size:0.82rem; color:var(--ares-text-muted);">Select a role above to view or edit its decision tree.</p>

      <Dialog
        v-model:visible="showSimulate"
        :header="`Simulate — ${selectedRoleDetail?.name ?? ''}`"
        modal
        :style="{ width: 'min(640px, 96vw)' }"
      >
        <SsvcTreeWizard v-if="showSimulate" :tree="simulationTree" />
      </Dialog>
    </template>
  </div>
</template>

<style scoped>
.ares-badge-system {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-primary-400);
  border: 1px solid color-mix(in srgb, var(--p-primary-500) 40%, transparent);
  border-radius: var(--ares-radius);
  padding: 0.1rem 0.4rem;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.ares-field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.3rem;
}
.section-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
}

.role-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; }
.role-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-2);
  cursor: pointer;
}
.role-chip:hover { border-color: var(--p-primary-400); }
.role-chip--active { border-color: var(--p-primary-500); color: var(--p-primary-300); background: color-mix(in srgb, var(--p-primary-500) 12%, transparent); }
.role-chip-tag {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.05rem 0.3rem;
}
.role-chip-tag--warn { color: #ca8a04; border-color: #ca8a04; }
.ref-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--ares-text-muted);
  border: 1px solid var(--ares-border);
  cursor: default;
}
.role-chip-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--ares-radius);
  color: var(--ares-text-muted);
  font-size: 0.7rem;
}
.role-chip-delete:hover { color: #ef4444; background: color-mix(in srgb, #ef4444 16%, transparent); }
.role-chip-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--ares-radius);
  color: var(--ares-text-muted);
  font-size: 0.7rem;
}
.role-chip-edit:hover { color: var(--p-primary-400); background: color-mix(in srgb, var(--p-primary-500) 16%, transparent); }

.role-detail {
  border-top: 1px solid var(--ares-border);
  padding-top: 1rem;
}
</style>
