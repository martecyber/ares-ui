<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { rolesApi, permissionsApi, type RoleOption, type PermissionOption } from '@/api/roles';
import { confirmDialog } from '@/composables/useConfirmDialog';

const roles = ref<RoleOption[]>([]);
const allPermissions = ref<PermissionOption[]>([]);
const loading = ref(true);
const err = ref<string | null>(null);

// ── Create role dialog ────────────────────────────────────────────
const showCreateDialog = ref(false);
const createSaving = ref(false);
const createErr = ref('');
const createForm = ref({ code: '', name: '', description: '' });
const createSelectedPermIds = ref<Set<number>>(new Set());

const canCreate = computed(() =>
  /^[A-Z][A-Z0-9_]*$/.test(createForm.value.code.trim()) &&
  createForm.value.name.trim().length >= 2
);

// ── Edit permissions dialog ───────────────────────────────────────
const showEditDialog = ref(false);
const selectedRole = ref<RoleOption | null>(null);
const addPermId = ref<number | null>(null);
const editSaving = ref(false);
const editErr = ref('');

async function load() {
  loading.value = true;
  err.value = null;
  try {
    [roles.value, allPermissions.value] = await Promise.all([
      rolesApi.list(),
      permissionsApi.list(),
    ]);
  } catch {
    err.value = 'Failed to load roles.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ── Create role ───────────────────────────────────────────────────
function openCreateDialog() {
  createForm.value = { code: '', name: '', description: '' };
  createSelectedPermIds.value = new Set();
  createErr.value = '';
  showCreateDialog.value = true;
}

function onCreateCodeInput(e: Event) {
  createForm.value.code = (e.target as HTMLInputElement).value
    .toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

function toggleCreatePerm(id: number) {
  const s = new Set(createSelectedPermIds.value);
  s.has(id) ? s.delete(id) : s.add(id);
  createSelectedPermIds.value = s;
}

async function submitCreate() {
  if (!canCreate.value) return;
  createSaving.value = true;
  createErr.value = '';
  try {
    let role = await rolesApi.create({
      code: createForm.value.code.trim(),
      name: createForm.value.name.trim(),
      description: createForm.value.description.trim() || undefined,
    });
    // Assign selected permissions
    for (const permId of createSelectedPermIds.value) {
      role = await rolesApi.addPermission(role.id, permId);
    }
    roles.value.push(role);
    showCreateDialog.value = false;
  } catch (e: any) {
    createErr.value = e?.response?.data?.detail ?? 'Failed to create role.';
  } finally {
    createSaving.value = false;
  }
}

// ── Delete role ───────────────────────────────────────────────────
async function deleteRole(role: RoleOption) {
  const ok = await confirmDialog({ header: 'Delete role', message: `Delete role "${role.name}"? This cannot be undone.` });
  if (!ok) return;
  try {
    await rolesApi.delete(role.id);
    roles.value = roles.value.filter((r) => r.id !== role.id);
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? 'Failed to delete role.';
  }
}

// ── Edit permissions ──────────────────────────────────────────────
function openEditDialog(role: RoleOption) {
  selectedRole.value = { ...role, permissionCodes: [...role.permissionCodes] };
  addPermId.value = null;
  editErr.value = '';
  showEditDialog.value = true;
}

function closeEditDialog() {
  if (selectedRole.value) {
    const idx = roles.value.findIndex((r) => r.id === selectedRole.value!.id);
    if (idx >= 0) roles.value[idx] = { ...selectedRole.value };
  }
  showEditDialog.value = false;
}

async function addPermission() {
  if (!addPermId.value || !selectedRole.value) return;
  editSaving.value = true;
  editErr.value = '';
  try {
    const updated = await rolesApi.addPermission(selectedRole.value.id, addPermId.value);
    selectedRole.value.permissionCodes = updated.permissionCodes;
    addPermId.value = null;
  } catch (e: any) {
    editErr.value = e?.response?.data?.detail ?? 'Failed to add permission.';
  } finally {
    editSaving.value = false;
  }
}

async function removePermission(permCode: string) {
  if (!selectedRole.value) return;
  const perm = allPermissions.value.find((p) => p.code === permCode);
  if (!perm) return;
  editSaving.value = true;
  editErr.value = '';
  try {
    const updated = await rolesApi.removePermission(selectedRole.value.id, perm.id);
    selectedRole.value.permissionCodes = updated.permissionCodes;
  } catch (e: any) {
    editErr.value = e?.response?.data?.detail ?? 'Failed to remove permission.';
  } finally {
    editSaving.value = false;
  }
}

const availablePermsForEdit = computed(() => {
  if (!selectedRole.value) return [];
  const assigned = new Set(selectedRole.value.permissionCodes);
  return allPermissions.value
    .filter((p) => !assigned.has(p.code))
    .map((p) => ({ label: p.code, value: p.id, description: p.description }));
});

function roleColor(code: string) {
  if (code === 'MSSP_ADMIN')    return 'danger';
  if (code === 'MSSP_OPERATOR') return 'warn';
  if (code === 'CLIENT_ADMIN')  return 'info';
  if (code === 'CLIENT_USER')   return 'secondary';
  return 'secondary';
}
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Roles</h2>
        <p class="ares-page-subtitle">Platform roles and their assigned permissions.</p>
      </div>
      <Button icon="pi pi-plus" text v-tooltip.top="'New role'" @click="openCreateDialog" />
    </div>

    <p v-if="err" style="color:var(--ares-error); margin-bottom:1rem;">{{ err }}</p>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <div v-else style="display:flex; flex-direction:column; gap:0.75rem;">
      <div
        v-for="role in roles"
        :key="role.id"
        style="border:1px solid var(--ares-border); border-radius:var(--ares-radius); padding:1rem 1.1rem; background:var(--ares-surface);"
      >
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:1rem;">
          <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
            <AresBadge :value="role.name" :severity="roleColor(role.code)" />
            <code style="font-size:0.72rem; color:var(--ares-text-muted); background:var(--ares-bg); padding:0.1rem 0.35rem; border-radius: var(--ares-radius); border:1px solid var(--ares-border);">{{ role.code }}</code>
            <span v-if="role.system" style="font-size:0.65rem; color:var(--ares-text-muted); font-style:italic;">system</span>
            <span v-if="role.description" style="font-size:0.78rem; color:var(--ares-text-muted);">— {{ role.description }}</span>
          </div>
          <div style="display:flex; gap:0.25rem; flex-shrink:0;">
            <Button icon="pi pi-key" text size="small" severity="secondary" title="Manage permissions" @click="openEditDialog(role)" />
            <Button v-if="!role.system" icon="pi pi-trash" text size="small" severity="danger" @click="deleteRole(role)" />
          </div>
        </div>

        <div style="margin-top:0.65rem; display:flex; flex-wrap:wrap; gap:0.3rem; min-height:1.5rem;">
          <span
            v-for="code in role.permissionCodes"
            :key="code"
            style="font-size:0.67rem; padding:0.15rem 0.45rem; border-radius: var(--ares-radius);
                   background:color-mix(in srgb, var(--ares-accent-bg) 12%, var(--ares-surface));
                   border:1px solid color-mix(in srgb, var(--ares-accent-bg) 35%, transparent);
                   color:var(--ares-text-muted); font-family:monospace;"
          >{{ code }}</span>
          <span v-if="!role.permissionCodes.length" style="font-size:0.75rem; color:var(--ares-text-muted); font-style:italic;">No permissions assigned.</span>
        </div>
      </div>

      <div v-if="!roles.length" class="ares-table-empty">No roles defined.</div>
    </div>

    <!-- ── Create role dialog ───────────────────────────────────── -->
    <Dialog v-model:visible="showCreateDialog" header="New role" modal style="width:42rem;">
      <div style="display:flex; flex-direction:column; gap:0.9rem; padding-top:0.5rem;">

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
          <div class="form-field">
            <label>Code * <span style="font-size:0.7rem; color:var(--ares-text-muted);">(UPPERCASE_SNAKE)</span></label>
            <InputText
              :value="createForm.code"
              placeholder="e.g. AUDITOR"
              class="w-full"
              style="font-family:monospace;"
              @input="onCreateCodeInput"
            />
          </div>
          <div class="form-field">
            <label>Name *</label>
            <InputText v-model="createForm.name" placeholder="Display name" class="w-full" />
          </div>
        </div>

        <div class="form-field">
          <label>Description</label>
          <Textarea v-model="createForm.description" placeholder="What this role grants…" class="w-full" rows="2" auto-resize />
        </div>

        <!-- Permission picker -->
        <div class="form-field">
          <label>Permissions</label>
          <div style="border:1px solid var(--ares-border); border-radius:var(--ares-radius); background:var(--ares-bg); max-height:14rem; overflow-y:auto;">
            <div
              v-for="perm in allPermissions"
              :key="perm.id"
              style="display:flex; align-items:flex-start; gap:0.6rem; padding:0.4rem 0.7rem; cursor:pointer; border-bottom:1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);"
              @click="toggleCreatePerm(perm.id)"
            >
              <div style="margin-top:0.1rem; flex-shrink:0;">
                <div :style="{
                  width:'1rem', height:'1rem', borderRadius:'3px',
                  border:'1.5px solid var(--ares-border)',
                  background: createSelectedPermIds.has(perm.id) ? 'var(--ares-accent-bg)' : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }">
                  <i v-if="createSelectedPermIds.has(perm.id)" class="pi pi-check" style="font-size:0.6rem; color:#fff;" />
                </div>
              </div>
              <div>
                <div style="font-size:0.78rem; font-family:monospace; line-height:1.3;">{{ perm.code }}</div>
                <div v-if="perm.description" style="font-size:0.68rem; color:var(--ares-text-muted);">{{ perm.description }}</div>
              </div>
            </div>
            <div v-if="!allPermissions.length" style="padding:0.5rem 0.7rem; font-size:0.78rem; color:var(--ares-text-muted);">No permissions available.</div>
          </div>
          <span style="font-size:0.72rem; color:var(--ares-text-muted);">{{ createSelectedPermIds.size }} selected</span>
        </div>

        <Message v-if="createErr" severity="error" :closable="false">{{ createErr }}</Message>

        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" @click="showCreateDialog = false" />
          <Button label="Create" :loading="createSaving" :disabled="!canCreate" @click="submitCreate" />
        </div>
      </div>
    </Dialog>

    <!-- ── Edit permissions dialog ──────────────────────────────── -->
    <Dialog
      :visible="showEditDialog"
      @update:visible="closeEditDialog"
      :header="selectedRole ? `Permissions — ${selectedRole.name}` : 'Permissions'"
      modal
      style="width:40rem;"
    >
      <div v-if="selectedRole" style="display:flex; flex-direction:column; gap:1rem; padding-top:0.5rem;">

        <div>
          <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ares-text-muted); margin-bottom:0.5rem;">
            Assigned permissions
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:0.35rem; min-height:2.25rem; padding:0.6rem; border:1px solid var(--ares-border); border-radius:var(--ares-radius); background:var(--ares-bg);">
            <span
              v-for="code in selectedRole.permissionCodes"
              :key="code"
              style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.72rem; padding:0.2rem 0.5rem; border-radius: var(--ares-radius);
                     background:color-mix(in srgb, var(--ares-accent-bg) 12%, var(--ares-surface));
                     border:1px solid color-mix(in srgb, var(--ares-accent-bg) 35%, transparent);
                     color:var(--ares-text); font-family:monospace;"
            >
              {{ code }}
              <button
                type="button"
                style="background:none; border:none; cursor:pointer; padding:0; display:flex; align-items:center; color:var(--ares-text-muted); line-height:1;"
                :disabled="editSaving"
                @click="removePermission(code)"
              ><i class="pi pi-times" style="font-size:0.6rem;" /></button>
            </span>
            <span v-if="!selectedRole.permissionCodes.length" style="font-size:0.75rem; color:var(--ares-text-muted); font-style:italic; align-self:center;">None assigned.</span>
          </div>
        </div>

        <div>
          <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ares-text-muted); margin-bottom:0.5rem;">
            Add permission
          </div>
          <div style="display:flex; gap:0.5rem;">
            <Select
              v-model="addPermId"
              :options="availablePermsForEdit"
              option-label="label"
              option-value="value"
              placeholder="Select permission…"
              filter
              class="w-full"
              :disabled="editSaving"
            >
              <template #option="{ option }">
                <div>
                  <div style="font-size:0.8rem; font-family:monospace;">{{ option.label }}</div>
                  <div v-if="option.description" style="font-size:0.67rem; color:var(--ares-text-muted);">{{ option.description }}</div>
                </div>
              </template>
            </Select>
            <Button icon="pi pi-plus" :loading="editSaving" :disabled="!addPermId" @click="addPermission" />
          </div>
        </div>

        <Message v-if="editErr" severity="error" :closable="false">{{ editErr }}</Message>

        <div style="display:flex; justify-content:flex-end;">
          <Button label="Close" severity="secondary" @click="closeEditDialog" />
        </div>
      </div>
    </Dialog>
  </div>
</template>
