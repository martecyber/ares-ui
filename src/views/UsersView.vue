<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { usersApi, type UserSummary } from '@/api/users';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';
import AresBadge from '@/components/AresBadge.vue';
import UserDialog from '@/components/UserDialog.vue';
import AppPagination from '@/components/AppPagination.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import { confirmDialog } from '@/composables/useConfirmDialog';

const toast = useToast();

const PAGE_SIZE = 50;
const items = ref<UserSummary[]>([]);
const loading = ref(true);
const err = ref<string | null>(null);
const page = ref(0);
const totalPages = ref(0);
const total = ref(0);

const showDialog = ref(false);
const editingUser = ref<UserSummary | null>(null);

// ── Sort / filter state ────────────────────────────────────────────────────
const sortCol = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc' | null>(null);
const filterStatus = ref<string[]>([]);
const filterRole = ref<string[]>([]);

function onSort(col: string, dir: 'asc' | 'desc' | null) {
  sortCol.value = dir ? col : null;
  sortDir.value = dir;
}

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Deleted', value: 'deleted' },
];

const roleOptions = computed(() => {
  const seen = new Set<string>();
  const opts: { label: string; value: string }[] = [];
  for (const u of items.value) {
    for (const r of u.roles) {
      if (!seen.has(r)) {
        seen.add(r);
        opts.push({ label: roleLabel(r), value: r });
      }
    }
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label));
});

const processedItems = computed(() => {
  let data = [...items.value];
  if (filterStatus.value.length) data = data.filter((u) => filterStatus.value.includes(u.status));
  if (filterRole.value.length) data = data.filter((u) => u.roles.some((r) => filterRole.value.includes(r)));
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
watch(filterRole, () => { page.value = 0; });

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const res = await usersApi.list({ page: page.value, size: PAGE_SIZE });
    items.value = res.items;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch {
    err.value = 'Failed to load users.';
  } finally {
    loading.value = false;
  }
}

watch(page, load);
onMounted(load);

function openCreate() {
  editingUser.value = null;
  showDialog.value = true;
}

function openEdit(user: UserSummary) {
  editingUser.value = user;
  showDialog.value = true;
}

function onSaved(user: UserSummary) {
  const idx = items.value.findIndex((u) => u.id === user.id);
  if (idx >= 0) items.value[idx] = user;
  else { items.value.unshift(user); total.value++; }
}

async function deleteUser(user: UserSummary) {
  const ok = await confirmDialog({ header: 'Delete user', message: `Mark "${user.displayName}" as deleted?` });
  if (!ok) return;
  try {
    await usersApi.delete(user.id);
    const idx = items.value.findIndex((u) => u.id === user.id);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], status: 'deleted' };
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? 'Failed to delete user.';
  }
}

// ── Hard delete ────────────────────────────────────────────────────────────
const showHardDeleteDialog = ref(false);
const hardDeleteTarget     = ref<UserSummary | null>(null);
const hardDeleteSaving     = ref(false);

function openHardDelete(user: UserSummary) {
  hardDeleteTarget.value = user;
  showHardDeleteDialog.value = true;
}

async function doHardDelete() {
  if (!hardDeleteTarget.value) return;
  hardDeleteSaving.value = true;
  try {
    await usersApi.hardDelete(hardDeleteTarget.value.id);
    items.value = items.value.filter((u) => u.id !== hardDeleteTarget.value!.id);
    total.value--;
    showHardDeleteDialog.value = false;
    toast.add({ severity: 'success', summary: 'User deleted', detail: `${hardDeleteTarget.value.email} has been permanently deleted.`, life: 4000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e?.response?.data?.message ?? 'Failed to delete the user.', life: 5000 });
  } finally {
    hardDeleteSaving.value = false;
  }
}

function statusSeverity(s: string) {
  return s === 'active' ? 'success' : s === 'deleted' ? 'danger' : 'warn';
}

function roleBadge(code: string) {
  if (code === 'MSSP_ADMIN') return 'danger';
  if (code === 'MSSP_OPERATOR') return 'warn';
  if (code === 'CLIENT_ADMIN') return 'info';
  return 'secondary';
}

function roleLabel(code: string) {
  const map: Record<string, string> = {
    MSSP_ADMIN: 'Admin',
    MSSP_OPERATOR: 'Operator',
    CLIENT_ADMIN: 'Client Admin',
    CLIENT_USER: 'Client',
  };
  return map[code] ?? code;
}

// ── Reset password ─────────────────────────────────────────────────────────
const showResetDialog  = ref(false);
const resetTargetUser  = ref<UserSummary | null>(null);
const newPassword      = ref('');
const confirmPassword  = ref('');
const resetSaving      = ref(false);
const resetError       = ref<string | null>(null);

function openResetPassword(user: UserSummary) {
  resetTargetUser.value = user;
  newPassword.value     = '';
  confirmPassword.value = '';
  resetError.value      = null;
  showResetDialog.value = true;
}

async function doResetPassword() {
  resetError.value = null;
  if (newPassword.value.length < 8) {
    resetError.value = 'Password must be at least 8 characters.'; return;
  }
  if (newPassword.value !== confirmPassword.value) {
    resetError.value = 'Passwords do not match.'; return;
  }
  if (!resetTargetUser.value) return;
  resetSaving.value = true;
  try {
    await usersApi.resetPassword(resetTargetUser.value.id, newPassword.value);
    toast.add({ severity: 'success', summary: 'Password reset', detail: `Password updated for ${resetTargetUser.value.email}`, life: 4000 });
    showResetDialog.value = false;
  } catch (e: any) {
    resetError.value = e?.response?.data?.message ?? 'Failed to reset password.';
  } finally {
    resetSaving.value = false;
  }
}
</script>

<template>
  <div>
    <Toast />
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Users</h2>
        <p class="ares-page-subtitle">MSSP operators and administrators.</p>
      </div>
      <Button icon="pi pi-plus" text v-tooltip.top="'New user'" @click="openCreate" />
    </div>

    <p v-if="err" style="color:var(--ares-error); margin-bottom:1rem;">{{ err }}</p>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th>
                <ColumnHeader label="Email" :sortable="true"
                  :sort-dir="sortCol === 'email' ? sortDir : null"
                  sort-asc-label="A → Z" sort-desc-label="Z → A"
                  @update:sort-dir="onSort('email', $event)" />
              </th>
              <th style="width:180px;">
                <ColumnHeader label="Name" :sortable="true"
                  :sort-dir="sortCol === 'displayName' ? sortDir : null"
                  sort-asc-label="A → Z" sort-desc-label="Z → A"
                  @update:sort-dir="onSort('displayName', $event)" />
              </th>
              <th style="width:220px;">
                <ColumnHeader label="Roles"
                  :filter-options="roleOptions"
                  :filter-value="filterRole"
                  @update:filter-value="filterRole = $event" />
              </th>
              <th style="width:100px;">
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
              <th style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in processedItems" :key="user.id">
              <td data-label="Email">{{ user.email }}</td>
              <td data-label="Name">{{ user.displayName }}</td>
              <td data-label="Roles">
                <span style="display:flex; flex-wrap:wrap; gap:0.25rem;">
                  <AresBadge v-for="r in user.roles" :key="r" :value="roleLabel(r)" :severity="roleBadge(r)" />
                  <span v-if="!user.roles.length" style="color:var(--ares-text-muted); font-size:0.8rem;">—</span>
                </span>
              </td>
              <td data-label="Status"><AresBadge :value="user.status" :severity="statusSeverity(user.status)" /></td>
              <td data-label="Created">{{ new Date(user.createdAt).toLocaleDateString() }}</td>
              <td data-actions>
                <div style="display:flex; gap:0.25rem;">
                  <Button icon="pi pi-pencil" text size="small" severity="secondary" v-tooltip.left="'Edit'" @click="openEdit(user)" />
                  <Button icon="pi pi-lock" text size="small" severity="secondary" v-tooltip.left="'Reset password'" @click="openResetPassword(user)" />
                  <Button v-if="user.status !== 'deleted'" icon="pi pi-trash" text size="small" severity="danger" v-tooltip.left="'Mark as deleted'" @click="deleteUser(user)" />
                  <Button v-if="user.status === 'deleted'" icon="pi pi-ban" text size="small" severity="danger" v-tooltip.left="'Eliminar permanentemente'" @click="openHardDelete(user)" style="color:var(--p-red-600);" />
                </div>
              </td>
            </tr>
            <tr v-if="!processedItems.length">
              <td colspan="6" class="ares-table-empty">No users found.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total" @prev="page--" @next="page++" />
    </template>

    <UserDialog
      v-model:visible="showDialog"
      :user="editingUser"
      @saved="onSaved"
    />

    <!-- Reset password dialog -->
    <Dialog
      v-model:visible="showResetDialog"
      :header="`Reset password — ${resetTargetUser?.email}`"
      modal
      style="width:min(420px,96vw);"
      :pt="{ content: { style: 'padding:1.25rem' } }"
      @hide="resetError = null"
    >
      <div style="display:flex; flex-direction:column; gap:0.9rem;">
        <div>
          <label class="reset-label">New password</label>
          <InputText
            v-model="newPassword"
            type="password"
            style="width:100%;"
            placeholder="Min. 8 characters"
            autofocus
            autocomplete="new-password"
          />
        </div>
        <div>
          <label class="reset-label">Confirm new password</label>
          <InputText
            v-model="confirmPassword"
            type="password"
            style="width:100%;"
            placeholder="Repeat password"
            autocomplete="new-password"
            @keydown.enter="doResetPassword"
          />
        </div>
        <p v-if="resetError" style="color:var(--ares-error); font-size:0.82rem; margin:0;">{{ resetError }}</p>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem; border-top:1px solid var(--ares-border);">
          <Button label="Cancel" severity="secondary" size="small" @click="showResetDialog = false" />
          <Button label="Reset password" icon="pi pi-lock" size="small" :loading="resetSaving" @click="doResetPassword" />
        </div>
      </div>
    </Dialog>
    <!-- Hard delete confirmation dialog -->
    <Dialog
      v-model:visible="showHardDeleteDialog"
      header="Delete permanently"
      modal
      style="width:min(440px,96vw);"
      :pt="{ content: { style: 'padding:1.25rem' } }"
    >
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div style="display:flex; gap:0.75rem; align-items:flex-start;">
          <i class="pi pi-exclamation-triangle" style="font-size:1.5rem; color:var(--p-red-500); flex-shrink:0; margin-top:0.1rem;" />
          <div>
            <p style="margin:0 0 0.5rem; font-weight:600;">This action is irreversible.</p>
            <p style="margin:0; font-size:0.88rem; color:var(--ares-text-muted);">
              User <strong>{{ hardDeleteTarget?.email }}</strong> will be permanently deleted from the platform.
              Their references in findings, tasks and audit logs will show as <em>Deleted user</em>.
            </p>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem; border-top:1px solid var(--ares-border);">
          <Button label="Cancel" severity="secondary" size="small" @click="showHardDeleteDialog = false" />
          <Button label="Delete permanently" icon="pi pi-ban" size="small" severity="danger" :loading="hardDeleteSaving" @click="doHardDelete" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.reset-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
