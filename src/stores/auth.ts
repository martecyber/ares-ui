import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiClient, BackendUnreachableError, isTokenExpired, performRefresh, scheduleProactiveRefresh, setOnSessionRefreshed } from '@/api/client';

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  roles: string[];
  /** Fine-grained permission codes granted via the user's roles (roles_permission) —
   *  e.g. 'SSVC_WRITE'. Mirrors the JWT's own 'permissions' claim, which the backend
   *  actually enforces; this is only used to decide what to show in the UI. Optional:
   *  a session persisted before this field existed won't have it until next login. */
  permissions?: string[];
  hasAvatar?: boolean;
}

const STORAGE_KEY = 'ares.mssp.auth';

interface PersistedAuth {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

function loadPersisted(): PersistedAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedAuth;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const persisted = loadPersisted();

  const accessToken = ref<string | null>(persisted?.accessToken ?? null);
  const refreshToken = ref<string | null>(persisted?.refreshToken ?? null);
  const user = ref<AuthUser | null>(persisted?.user ?? null);

  // Every silent token refresh (proactive, 401-triggered, or adopted from another tab's win —
  // see client.ts) must resync this store's own accessToken/refreshToken, not just localStorage.
  // isAuthenticated below reads THESE refs' own exp claim, so leaving them stale would make an
  // actively-refreshed, genuinely-still-valid session look expired to the router guard purely
  // because the *original* token's own clock ran out — the session would appear to end during
  // active use even though nothing was ever actually wrong with it. The refresh response also
  // carries a fresh UserDto — roles/permissions can change server-side mid-session (e.g. a new
  // permission grant) — so this keeps that current too, not just on next full login.
  setOnSessionRefreshed((freshAccessToken, freshRefreshToken, freshUser) => {
    accessToken.value = freshAccessToken;
    refreshToken.value = freshRefreshToken;
    if (freshUser) user.value = freshUser as AuthUser;
    persist();
  });

  const isAuthenticated = computed(() => !!accessToken.value && !isTokenExpired(accessToken.value));
  const isAdmin         = computed(() => user.value?.roles.includes('MSSP_ADMIN') ?? false);
  const isOperator      = computed(() => !isAdmin.value && (user.value?.roles.includes('MSSP_OPERATOR') ?? false));
  const isClient        = computed(() => !isAdmin.value &&
    !!(user.value?.roles.includes('CLIENT_USER') || user.value?.roles.includes('CLIENT_ADMIN')));
  // CLIENT_ADMIN can additionally edit their own org's name/logo/SLA — everything else
  // (findings, assets, reports, projects) stays exactly as read-only as CLIENT_USER.
  const isClientAdmin   = computed(() => !isAdmin.value && (user.value?.roles.includes('CLIENT_ADMIN') ?? false));

  /** UI-only check — the backend is the actual authority (@PreAuthorize hasAuthority(...)
   *  on the relevant endpoints), this just decides what write affordances to render. */
  function hasPermission(code: string): boolean {
    return user.value?.permissions?.includes(code) ?? false;
  }

  // Client accounts are scoped to exactly one organization. Resolved lazily (not persisted —
  // cheap single API call) since the JWT carries no org claim; /organizations already returns
  // only the caller's own orgs for non-admins (see OrganizationController.list).
  // Never throws — a client account with no organization assigned (misconfigured by an admin,
  // or one whose sole org was later removed) is a real, expected state, not a network failure;
  // callers treat a null result as "no org assigned" and show a clear message instead of a
  // raw 403/console error.
  const clientOrgId      = ref<number | null>(null);
  const clientOrgName    = ref<string | null>(null);
  const clientOrgHasLogo = ref(false);
  async function loadClientOrgId(): Promise<number | null> {
    if (!isClient.value) return null;
    if (clientOrgId.value != null) return clientOrgId.value;
    try {
      const { organizationsApi } = await import('@/api/organizations');
      const res = await organizationsApi.list({ size: 1 });
      const org = res.items[0] ?? null;
      clientOrgId.value = org?.id ?? null;
      clientOrgName.value = org?.name ?? null;
      clientOrgHasLogo.value = org?.hasLogo ?? false;
    } catch {
      clientOrgId.value = null;
    }
    return clientOrgId.value;
  }

  function persist() {
    if (accessToken.value && refreshToken.value && user.value) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken: accessToken.value,
          refreshToken: refreshToken.value,
          user: user.value,
        } satisfies PersistedAuth),
      );
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function login(email: string, password: string, totp?: string) {
    const { data } = await apiClient.post('/auth/login', { email, password, totp });
    accessToken.value = data.accessToken;
    refreshToken.value = data.refreshToken;
    user.value = data.user;
    persist();
    scheduleProactiveRefresh(data.accessToken);
  }

  function updateUser(patch: Partial<AuthUser>) {
    if (user.value) {
      user.value = { ...user.value, ...patch };
      persist();
    }
  }

  const avatarUrl = computed(() =>
    user.value?.hasAvatar ? `/api/v1/profile/${user.value.id}/avatar` : null
  );

  /**
   * Called from the router guard before rendering a protected route. If the access token
   * has expired, tries a silent refresh; only clears the session when that fails, so a
   * still-valid refresh token doesn't force a needless re-login. Returns whether the
   * session is (now) valid. Throws BackendUnreachableError (without touching the stored
   * session) when the refresh failed because the backend couldn't be reached at all — the
   * router guard handles that case separately, since a transient outage shouldn't log
   * anyone out.
   */
  async function ensureValidSession(): Promise<boolean> {
    if (!accessToken.value) return false;
    if (!isTokenExpired(accessToken.value)) return true;

    const result = await performRefresh().catch((err) => {
      if (err instanceof BackendUnreachableError) throw err;
      return null;
    });
    if (!result) {
      accessToken.value = null;
      refreshToken.value = null;
      user.value = null;
      persist();
      return false;
    }

    accessToken.value = result.accessToken;
    refreshToken.value = result.refreshToken;
    if (result.user) user.value = result.user as AuthUser;
    persist();
    return true;
  }

  async function logout() {
    try {
      if (refreshToken.value) {
        await apiClient.post('/auth/logout', { refreshToken: refreshToken.value });
      }
    } finally {
      accessToken.value = null;
      refreshToken.value = null;
      user.value = null;
      clientOrgId.value = null;
      clientOrgName.value = null;
      clientOrgHasLogo.value = false;
      persist();
    }
  }

  return { accessToken, refreshToken, user, isAuthenticated, isAdmin, isOperator, isClient, isClientAdmin,
    hasPermission,
    clientOrgId, clientOrgName, clientOrgHasLogo, loadClientOrgId, avatarUrl, login, logout, updateUser, ensureValidSession };
});
