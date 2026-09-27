<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { profileApi, type OutOfOfficeDto } from '@/api/profile';
import { apiTokensApi, type ApiToken } from '@/api/api-tokens';
import InputText from 'primevue/inputtext';
import DatePicker from 'primevue/datepicker';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Dialog from 'primevue/dialog';
import AresBadge from '@/components/AresBadge.vue';

const auth = useAuthStore();

const ROLE_LABELS: Record<string, string> = {
  MSSP_ADMIN: 'Admin',
  MSSP_OPERATOR: 'Operator',
  CLIENT_ADMIN: 'Client Admin',
  CLIENT_USER: 'Client',
};
const primaryRoleLabel = () => {
  const r = auth.user?.roles ?? [];
  for (const code of ['MSSP_ADMIN', 'MSSP_OPERATOR', 'CLIENT_ADMIN', 'CLIENT_USER']) {
    if (r.includes(code)) return ROLE_LABELS[code];
  }
  return r[0] ?? '';
};

// ── Display name ────────────────────────────────────────────────────
const displayName = ref('');
const nameLoading = ref(false);
const nameSuccess = ref(false);
const nameError = ref<string | null>(null);

// ── Password ────────────────────────────────────────────────────────
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const pwLoading = ref(false);
const pwSuccess = ref(false);
const pwError = ref<string | null>(null);

// ── Avatar ──────────────────────────────────────────────────────────
const avatarPreview = ref<string | null>(null);
const avatarFile = ref<File | null>(null);
const avatarLoading = ref(false);
const avatarError = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  try {
    const profile = await profileApi.me();
    displayName.value = profile.displayName ?? '';
    auth.updateUser({ hasAvatar: profile.hasAvatar, displayName: profile.displayName ?? '' });
    if (profile.hasAvatar) {
      avatarPreview.value = profileApi.avatarUrl(profile.id) + `?t=${Date.now()}`;
    }
  } catch { /* silent */ }
  loadOoo();
  loadTokens();
});

async function saveName() {
  nameError.value = null;
  nameSuccess.value = false;
  nameLoading.value = true;
  try {
    const updated = await profileApi.update({ displayName: displayName.value });
    auth.updateUser({ displayName: updated.displayName ?? '' });
    nameSuccess.value = true;
    setTimeout(() => { nameSuccess.value = false; }, 3000);
  } catch (e: any) {
    nameError.value = e?.response?.data?.message ?? 'Failed to update profile.';
  } finally {
    nameLoading.value = false;
  }
}

async function changePassword() {
  pwError.value = null;
  pwSuccess.value = false;
  if (newPassword.value !== confirmPassword.value) {
    pwError.value = 'New passwords do not match.';
    return;
  }
  if (newPassword.value.length < 8) {
    pwError.value = 'New password must be at least 8 characters.';
    return;
  }
  pwLoading.value = true;
  try {
    await profileApi.changePassword({ currentPassword: currentPassword.value, newPassword: newPassword.value });
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    pwSuccess.value = true;
    setTimeout(() => { pwSuccess.value = false; }, 3000);
  } catch (e: any) {
    pwError.value = e?.response?.data?.message ?? 'Failed to change password.';
  } finally {
    pwLoading.value = false;
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { avatarError.value = 'File must be an image.'; return; }
  if (file.size > 2 * 1024 * 1024) { avatarError.value = 'Image must be under 2 MB.'; return; }
  avatarFile.value = file;
  avatarError.value = null;
  const reader = new FileReader();
  reader.onload = () => { avatarPreview.value = reader.result as string; };
  reader.readAsDataURL(file);
}

async function uploadAvatar() {
  if (!avatarFile.value) return;
  avatarError.value = null;
  avatarLoading.value = true;
  try {
    await profileApi.uploadAvatar(avatarFile.value);
    avatarFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
    // Reload preview from backend (cache-busted) and update store
    const profile = await profileApi.me();
    auth.updateUser({ hasAvatar: true });
    avatarPreview.value = profileApi.avatarUrl(profile.id) + `?t=${Date.now()}`;
  } catch (e: any) {
    avatarError.value = e?.response?.data?.message ?? 'Failed to upload avatar.';
  } finally {
    avatarLoading.value = false;
  }
}

async function removeAvatar() {
  avatarError.value = null;
  avatarLoading.value = true;
  try {
    await profileApi.deleteAvatar();
    avatarPreview.value = null;
    avatarFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
    auth.updateUser({ hasAvatar: false });
  } catch (e: any) {
    avatarError.value = e?.response?.data?.message ?? 'Failed to remove avatar.';
  } finally {
    avatarLoading.value = false;
  }
}

// ── Out of Office ────────────────────────────────────────────────────
const oooList    = ref<OutOfOfficeDto[]>([]);
const oooStart   = ref<Date | null>(null);
const oooEnd     = ref<Date | null>(null);
const oooReason  = ref('');
const oooLoading = ref(false);
const oooError   = ref<string | null>(null);

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadOoo() {
  try { oooList.value = await profileApi.listOoo(); } catch { /* silent */ }
}

async function addOoo() {
  oooError.value = null;
  if (!oooStart.value || !oooEnd.value) { oooError.value = 'Start and end dates are required.'; return; }
  if (oooEnd.value < oooStart.value) { oooError.value = 'End date must be on or after start date.'; return; }
  oooLoading.value = true;
  try {
    const created = await profileApi.createOoo({
      startDate: toDateStr(oooStart.value),
      endDate: toDateStr(oooEnd.value),
      reason: oooReason.value.trim() || undefined,
    });
    oooList.value.push(created);
    oooList.value.sort((a, b) => a.startDate.localeCompare(b.startDate));
    oooStart.value = null;
    oooEnd.value = null;
    oooReason.value = '';
  } catch (e: any) {
    oooError.value = e?.response?.data?.message ?? 'Failed to add period.';
  } finally {
    oooLoading.value = false;
  }
}

async function deleteOoo(id: number) {
  try {
    await profileApi.deleteOoo(id);
    oooList.value = oooList.value.filter(o => o.id !== id);
  } catch { /* silent */ }
}

// ── API Keys ─────────────────────────────────────────────────────────
const tokens         = ref<ApiToken[]>([]);
const showNewToken   = ref(false);
const newTokenName   = ref('');
const newTokenResult = ref<string | null>(null);
const tokenSaving    = ref(false);
const tokenError     = ref<string | null>(null);

async function loadTokens() {
  try { tokens.value = await apiTokensApi.list(); } catch { /* silent */ }
}

async function createToken() {
  if (!newTokenName.value.trim()) return;
  tokenError.value = null;
  tokenSaving.value = true;
  try {
    const res = await apiTokensApi.create({ name: newTokenName.value.trim() });
    newTokenResult.value = res.token;
    tokens.value.push(res.metadata);
    newTokenName.value = '';
  } catch (e: any) {
    tokenError.value = e?.response?.data?.message ?? 'Failed to create token.';
  } finally {
    tokenSaving.value = false;
  }
}

async function revokeToken(id: number) {
  try {
    await apiTokensApi.revoke(id);
    tokens.value = tokens.value.filter(t => t.id !== id);
  } catch { /* silent */ }
}

function copyToken() {
  if (newTokenResult.value) navigator.clipboard.writeText(newTokenResult.value).catch(() => {});
}

// Relocated here from the topbar "Documentation" menu — sits next to API key management since
// that's who actually needs it (integrators authenticating against the API), not general nav.
function openApiReference() {
  window.open('/swagger-ui.html', '_blank', 'noopener,noreferrer');
}

onMounted(() => { loadTokens(); });
</script>

<template>
  <div class="profile-page">
    <!-- ── Identity header — avatar, name, email and role in one glanceable band ── -->
    <section class="profile-header">
      <div class="profile-avatar" @click="fileInput?.click()" v-tooltip.top="'Change photo'">
        <img v-if="avatarPreview" :src="avatarPreview" alt="" />
        <span v-else>{{ (auth.user?.displayName ?? auth.user?.email ?? '?')[0]?.toUpperCase() }}</span>
        <div class="profile-avatar__overlay"><i class="pi pi-camera" /></div>
      </div>
      <input ref="fileInput" type="file" accept="image/*" style="display: none;" @change="onFileSelect" />

      <div class="profile-header__identity">
        <div class="profile-header__name-row">
          <InputText v-model="displayName" class="profile-header__name-input" placeholder="Your display name" @keydown.enter="saveName" />
          <Button icon="pi pi-check" size="small" text :loading="nameLoading" v-tooltip.top="'Save name'" @click="saveName" />
        </div>
        <div class="profile-header__meta">
          <span>{{ auth.user?.email }}</span>
          <AresBadge v-if="primaryRoleLabel()" :value="primaryRoleLabel()" severity="secondary" />
        </div>
        <Message v-if="nameSuccess" severity="success" :closable="false" class="profile-header__message">Display name updated.</Message>
        <Message v-if="nameError" severity="error" :closable="false" class="profile-header__message">{{ nameError }}</Message>
        <Message v-if="avatarError" severity="error" :closable="false" class="profile-header__message">{{ avatarError }}</Message>
      </div>

      <div v-if="avatarFile || (auth.user?.hasAvatar && !avatarFile)" class="profile-header__avatar-actions">
        <Button v-if="avatarFile" label="Upload photo" icon="pi pi-check" size="small" :loading="avatarLoading" @click="uploadAvatar" />
        <Button v-if="auth.user?.hasAvatar && !avatarFile" label="Remove photo" icon="pi pi-trash" size="small" severity="danger" text :loading="avatarLoading" @click="removeAvatar" />
      </div>
    </section>

    <div class="profile-grid">
      <!-- Out of Office -->
      <section class="ares-card">
        <div class="ares-card-section-header"><span class="section-header-label">Out of Office</span></div>
        <div class="profile-card-body">
          <p class="profile-hint">Periods when you're unavailable — shown in team calendars when assigning roles.</p>

          <div class="ooo-form-fields">
            <div>
              <label class="ares-label">From</label>
              <DatePicker v-model="oooStart" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" append-to="self" class="w-full" />
            </div>
            <div>
              <label class="ares-label">To</label>
              <DatePicker v-model="oooEnd" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" append-to="self" class="w-full" />
            </div>
            <div style="flex: 1; min-width: 140px;">
              <label class="ares-label">Reason (optional)</label>
              <InputText v-model="oooReason" class="w-full" placeholder="e.g. Vacation" />
            </div>
            <div style="align-self: flex-end;">
              <Button label="Add" icon="pi pi-plus" size="small" :loading="oooLoading" @click="addOoo" />
            </div>
          </div>
          <Message v-if="oooError" severity="error" :closable="false" style="margin-top: 0.5rem;">{{ oooError }}</Message>

          <div v-if="oooList.length" class="ooo-list">
            <div v-for="o in oooList" :key="o.id" class="ooo-row">
              <i class="pi pi-calendar-times" style="color: var(--ares-warning); font-size: 0.8rem; flex-shrink: 0;" />
              <span class="ooo-dates">{{ o.startDate }} → {{ o.endDate }}</span>
              <span v-if="o.reason" class="ooo-reason">{{ o.reason }}</span>
              <Button icon="pi pi-times" text severity="danger" size="small" style="margin-left: auto;" @click="deleteOoo(o.id)" />
            </div>
          </div>
          <p v-else class="profile-empty">No out-of-office periods set.</p>
        </div>
      </section>

      <!-- Change password -->
      <section class="ares-card">
        <div class="ares-card-section-header"><span class="section-header-label">Change Password</span></div>
        <div class="profile-card-body">
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div>
              <label class="ares-label">Current password</label>
              <InputText v-model="currentPassword" type="password" class="w-full" autocomplete="current-password" />
            </div>
            <div>
              <label class="ares-label">New password</label>
              <InputText v-model="newPassword" type="password" class="w-full" autocomplete="new-password" />
            </div>
            <div>
              <label class="ares-label">Confirm new password</label>
              <InputText v-model="confirmPassword" type="password" class="w-full" autocomplete="new-password" />
            </div>
            <div>
              <Button
                label="Change password"
                icon="pi pi-lock"
                :loading="pwLoading"
                @click="changePassword"
              />
            </div>
          </div>
          <Message v-if="pwSuccess" severity="success" :closable="false" style="margin-top: 0.75rem;">
            Password changed successfully.
          </Message>
          <Message v-if="pwError" severity="error" :closable="false" style="margin-top: 0.75rem;">
            {{ pwError }}
          </Message>
        </div>
      </section>
    </div>

    <!-- ── API Keys ──────────────────────────────────────────────────── -->
    <section class="ares-card" style="margin-top: 1.25rem;">
      <div class="ares-card-section-header">
        <span class="section-header-label">API Keys</span>
        <div style="display:flex; gap:0.4rem;">
          <Button label="API Reference" icon="pi pi-external-link" size="small" text severity="secondary" @click="openApiReference" />
          <Button icon="pi pi-plus" label="New key" size="small" @click="showNewToken = true" />
        </div>
      </div>
      <div class="profile-card-body">
        <p class="profile-hint">Use API keys to authenticate the Ares CLI and other integrations.</p>

        <div v-if="tokens.length" class="ares-table-wrap">
          <div
            v-for="t in tokens" :key="t.id"
            class="api-token-row"
          >
            <i class="pi pi-key" style="color:var(--ares-text-muted); font-size:0.85rem;" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:0.85rem; font-weight:600;">{{ t.name }}</div>
              <div style="font-size:0.72rem; color:var(--ares-text-muted);">
                Created {{ new Date(t.createdAt).toLocaleDateString() }}
                <span v-if="t.lastUsedAt"> · Last used {{ new Date(t.lastUsedAt).toLocaleDateString() }}</span>
                <span v-if="t.expiresAt" style="color:#f59e0b;"> · Expires {{ new Date(t.expiresAt).toLocaleDateString() }}</span>
              </div>
            </div>
            <Button
              icon="pi pi-trash"
              severity="danger" text size="small"
              v-tooltip.left="'Revoke'"
              @click="revokeToken(t.id)"
            />
          </div>
        </div>
        <p v-else class="profile-empty">No API keys yet.</p>
      </div>
    </section>

    <!-- New token dialog -->
    <Dialog v-model:visible="showNewToken" header="Create API Key" modal style="width:min(480px,96vw);"
      :pt="{ content: { style: 'padding:1.25rem' } }"
      @hide="newTokenResult = null; newTokenName = ''; tokenError = null">

      <!-- Step 1: name input -->
      <template v-if="!newTokenResult">
        <p style="font-size:0.82rem; color:var(--ares-text-muted); margin:0 0 1rem;">
          Give the key a descriptive name so you can identify it later.
        </p>
        <InputText
          v-model="newTokenName"
          placeholder="e.g. Personal laptop CLI"
          style="width:100%;"
          autofocus
          @keydown.enter="createToken"
        />
        <Message v-if="tokenError" severity="error" :closable="false" style="margin-top:0.75rem;">
          {{ tokenError }}
        </Message>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showNewToken = false" />
          <Button label="Create" icon="pi pi-check" size="small"
            :loading="tokenSaving" :disabled="!newTokenName.trim()" @click="createToken" />
        </div>
      </template>

      <!-- Step 2: show the token once -->
      <template v-else>
        <Message severity="warn" :closable="false" style="margin-bottom:1rem;">
          Copy this key now — it will not be shown again.
        </Message>
        <div style="display:flex; gap:0.5rem; align-items:center; background:var(--ares-surface-sunken); border:1px solid var(--ares-border); border-radius: var(--ares-radius); padding:0.6rem 0.9rem;">
          <code style="flex:1; font-size:0.8rem; word-break:break-all; color:var(--ares-accent);">{{ newTokenResult }}</code>
          <Button icon="pi pi-copy" severity="secondary" text size="small" v-tooltip="'Copy'" @click="copyToken" />
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
          <Button label="Done" size="small" @click="showNewToken = false; newTokenResult = null" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 920px;
  margin: 0 auto;
}

/* ── Identity header — the one deliberately bigger moment on this page; everything
   below it stays at the same quiet card weight. ── */
.profile-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.5rem;
  margin-bottom: 1.25rem;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
}
.profile-avatar {
  position: relative;
  width: 76px;
  height: 76px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--ares-accent-bg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  font-weight: 700;
  color: #fff;
  border: 2px solid var(--ares-border);
  cursor: pointer;
}
.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.profile-avatar__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 1rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.profile-avatar:hover .profile-avatar__overlay { opacity: 1; }

.profile-header__identity { flex: 1; min-width: 0; }
.profile-header__name-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.profile-header__name-input {
  font-size: 1.15rem;
  font-weight: 700;
  max-width: 320px;
}
.profile-header__meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.35rem;
  font-size: 0.82rem;
  color: var(--ares-text-muted);
}
.profile-header__message { margin-top: 0.6rem; max-width: 420px; }
.profile-header__avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex-shrink: 0;
}

/* ── Out of Office / Password side by side on wide screens ── */
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  align-items: start;
}
.profile-card-body { padding-top: 1rem; }
.profile-hint {
  font-size: 0.78rem;
  color: var(--ares-text-muted);
  margin: 0 0 1rem;
}
.profile-empty {
  font-size: 0.82rem;
  color: var(--ares-text-muted);
  margin: 0.75rem 0 0;
}

.ooo-form-fields {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.ooo-list {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ooo-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
  font-size: 0.82rem;
}
.ooo-dates { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ares-text); }
.ooo-reason { color: var(--ares-text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.api-token-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--ares-border);
}
.api-token-row:last-child { border-bottom: none; }

@media (max-width: 767px) {
  .profile-header { flex-wrap: wrap; }
  .profile-header__avatar-actions { flex-direction: row; width: 100%; }
  .profile-grid { grid-template-columns: 1fr; }
}
</style>
