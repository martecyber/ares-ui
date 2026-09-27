<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import Message from 'primevue/message';
import { usersApi, rolesApi, type UserSummary, type RoleOption } from '@/api/users';
import { holidaysApi, type HolidayCalendar } from '@/api/holidays';

// organizationId=0 means platform-wide (MSSP roles)
const PLATFORM_ORG_ID = 0;

const props = defineProps<{
  visible: boolean;
  user?: UserSummary | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  saved: [user: UserSummary];
}>();

const isEdit = computed(() => !!props.user);

const saving = ref(false);
const error = ref('');
const allRoles = ref<RoleOption[]>([]);
const rolesLoaded = ref(false);

// Form fields
const form = ref({
  email: '',
  displayName: '',
  password: '',
  status: 'active',
  mfaEnforced: false,
  // null = no calendar assigned. We track the "original" value separately so
  // submit() only fires the dedicated endpoint when the operator actually changed it.
  holidayCalendarId: null as number | null,
});
const originalHolidayCalendarId = ref<number | null>(null);

// Holiday calendars (loaded once when the dialog opens in edit mode).
const holidayCalendars = ref<HolidayCalendar[]>([]);

// Selected role IDs (for toggling)
const selectedRoleIds = ref<Set<number>>(new Set());

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

const canSubmit = computed(() => {
  if (isEdit.value) return form.value.displayName.trim().length >= 2;
  return (
    /\S+@\S+\.\S+/.test(form.value.email) &&
    form.value.displayName.trim().length >= 2 &&
    form.value.password.length >= 8
  );
});

async function loadRoles() {
  if (rolesLoaded.value) return;
  try {
    allRoles.value = await rolesApi.list();
    rolesLoaded.value = true;
  } catch {
    // non-fatal
  }
}

async function loadHolidayCalendars() {
  // Cheap to refresh on every open and lets admins reflect new calendars
  // without re-mounting the dialog.
  try { holidayCalendars.value = await holidaysApi.list(); }
  catch { /* non-fatal */ }
}

function initForm() {
  if (props.user) {
    form.value = {
      email: props.user.email,
      displayName: props.user.displayName,
      password: '',
      status: props.user.status === 'deleted' ? 'inactive' : props.user.status,
      mfaEnforced: props.user.mfaEnforced,
      holidayCalendarId: props.user.holidayCalendarId ?? null,
    };
    originalHolidayCalendarId.value = props.user.holidayCalendarId ?? null;
    // pre-select current roles
    const currentCodes = new Set(props.user.roles);
    selectedRoleIds.value = new Set(
      allRoles.value.filter((r) => currentCodes.has(r.code)).map((r) => r.id)
    );
  } else {
    form.value = { email: '', displayName: '', password: '', status: 'active',
                   mfaEnforced: false, holidayCalendarId: null };
    originalHolidayCalendarId.value = null;
    selectedRoleIds.value = new Set();
  }
  error.value = '';
}

watch(() => props.visible, async (val) => {
  if (val) {
    await Promise.all([loadRoles(), loadHolidayCalendars()]);
    initForm();
  }
});

// Re-init when roles finish loading (user may already be set)
watch(rolesLoaded, (loaded) => {
  if (loaded && props.visible && props.user) {
    const currentCodes = new Set(props.user.roles);
    selectedRoleIds.value = new Set(
      allRoles.value.filter((r) => currentCodes.has(r.code)).map((r) => r.id)
    );
  }
});

function toggleRole(roleId: number) {
  const s = new Set(selectedRoleIds.value);
  if (s.has(roleId)) s.delete(roleId);
  else s.add(roleId);
  selectedRoleIds.value = s;
}

async function applyRoleChanges(userId: number, originalCodes: string[]) {
  const originalIds = new Set(
    allRoles.value.filter((r) => originalCodes.includes(r.code)).map((r) => r.id)
  );
  const toAdd = [...selectedRoleIds.value].filter((id) => !originalIds.has(id));
  const toRemove = [...originalIds].filter((id) => !selectedRoleIds.value.has(id));

  await Promise.all([
    ...toAdd.map((roleId) => usersApi.assignRole(userId, roleId, PLATFORM_ORG_ID)),
    ...toRemove.map((roleId) => usersApi.removeRole(userId, roleId, PLATFORM_ORG_ID)),
  ]);
}

async function submit() {
  if (!canSubmit.value) return;
  error.value = '';
  saving.value = true;
  try {
    let saved: UserSummary;
    if (isEdit.value && props.user) {
      saved = await usersApi.update(props.user.id, {
        displayName: form.value.displayName.trim(),
        status: form.value.status,
        mfaEnforced: form.value.mfaEnforced,
      });
      await applyRoleChanges(props.user.id, props.user.roles);
      // Only hit the holiday endpoint if the operator actually changed the selection.
      // Avoids a spurious PUT (and audit entry) for users untouched in that field.
      if (form.value.holidayCalendarId !== originalHolidayCalendarId.value) {
        await usersApi.setHolidayCalendar(props.user.id, form.value.holidayCalendarId);
      }
      // Reload to get fresh role list + resolved calendar name
      saved = await usersApi.get(props.user.id);
    } else {
      saved = await usersApi.create({
        email: form.value.email.trim(),
        displayName: form.value.displayName.trim(),
        password: form.value.password,
      });
      await applyRoleChanges(saved.id, []);
      // Honor the initial calendar pick in create-mode too, if any.
      if (form.value.holidayCalendarId != null) {
        await usersApi.setHolidayCalendar(saved.id, form.value.holidayCalendarId);
      }
      saved = await usersApi.get(saved.id);
    }
    emit('saved', saved);
    emit('update:visible', false);
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to save user';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    :header="isEdit ? 'Edit user' : 'New user'"
    modal
    :style="{ width: 'min(38rem, 96vw)' }"
  >
    <div style="display:flex; flex-direction:column; gap:0.9rem; padding-top:0.5rem;">

      <!-- Email (create only) -->
      <div v-if="!isEdit" class="form-field">
        <label>Email *</label>
        <InputText v-model="form.email" type="email" placeholder="user@example.com" class="w-full" />
      </div>
      <div v-else class="form-field">
        <label style="color:var(--ares-text-muted);">Email</label>
        <div style="font-size:0.875rem; padding:0.45rem 0; color:var(--ares-text-muted);">{{ form.email }}</div>
      </div>

      <!-- Display name -->
      <div class="form-field">
        <label>Display name *</label>
        <InputText v-model="form.displayName" placeholder="Full name" class="w-full" maxlength="120" />
      </div>

      <!-- Password (create only) -->
      <div v-if="!isEdit" class="form-field">
        <label>Initial password *</label>
        <Password v-model="form.password" class="w-full" input-class="w-full" :feedback="false" toggle-mask placeholder="Min. 8 characters" />
        <span style="font-size:0.72rem; color:var(--ares-text-muted);">User should change it on first login.</span>
      </div>

      <!-- Status + MFA (edit only) -->
      <div v-if="isEdit" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-field">
          <label>Status</label>
          <Select v-model="form.status" :options="statusOptions" option-label="label" option-value="value" class="w-full" />
        </div>
        <div class="form-field" style="justify-content:flex-end;">
          <label>MFA enforced</label>
          <div style="padding-top:0.35rem;">
            <ToggleSwitch v-model="form.mfaEnforced" />
          </div>
        </div>
      </div>

      <!-- Holiday calendar -->
      <div class="form-field">
        <label>Holiday calendar</label>
        <Select
          v-model="form.holidayCalendarId"
          :options="holidayCalendars"
          option-label="name"
          option-value="id"
          placeholder="No calendar assigned"
          show-clear
          :disabled="!holidayCalendars.length"
          class="w-full"
        />
        <span style="font-size:0.72rem; color:var(--ares-text-muted);">
          Days from this calendar appear on the user's dashboard alongside Out-of-Office.
        </span>
      </div>

      <!-- Roles -->
      <div class="form-field">
        <label>Roles</label>
        <div style="display:flex; flex-direction:column; gap:0.4rem; padding:0.5rem 0.6rem; border:1px solid var(--ares-border); border-radius:var(--ares-radius); background:var(--ares-surface);">
          <div
            v-for="role in allRoles"
            :key="role.id"
            style="display:flex; align-items:flex-start; gap:0.6rem; cursor:pointer; padding:0.2rem 0;"
            @click="toggleRole(role.id)"
          >
            <div style="margin-top:0.05rem; flex-shrink:0;">
              <div
                :style="{
                  width: '1rem', height: '1rem', borderRadius: '3px',
                  border: '1.5px solid var(--ares-border)',
                  background: selectedRoleIds.has(role.id) ? 'var(--ares-accent-bg)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }"
              >
                <i v-if="selectedRoleIds.has(role.id)" class="pi pi-check" style="font-size:0.6rem; color:#fff;" />
              </div>
            </div>
            <div>
              <div style="font-size:0.82rem; font-weight:500; line-height:1.2;">{{ role.name }}</div>
              <div style="font-size:0.71rem; color:var(--ares-text-muted);">{{ role.description }}</div>
            </div>
          </div>
          <div v-if="!allRoles.length" style="font-size:0.78rem; color:var(--ares-text-muted);">Loading roles…</div>
        </div>
      </div>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.25rem;">
        <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
        <Button :label="isEdit ? 'Save' : 'Create'" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </div>

    </div>
  </Dialog>
</template>
