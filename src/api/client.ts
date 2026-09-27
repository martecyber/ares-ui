import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
// Plain event bus underneath PrimeVue's ToastService/useToast (see toastservice's own source) —
// works from here precisely because it ISN'T a composable: no Vue component/app context needed,
// so a module like this one (loaded before any component exists) can still surface a toast.
import ToastEventBus from 'primevue/toasteventbus';

const apiHost = import.meta.env.VITE_API_BASE ?? '';
const baseURL = apiHost + '/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  // Deep nested AQL relation queries (e.g. exploits' cves.cwes.relatedCapecs.id) can legitimately
  // take longer than a typical request even after the backend-side query optimization (V159) —
  // 30s was tight enough that one of these would routinely hit it, and a plain axios timeout looks
  // identical to the backend being down (no `error.response` at all — see isBackendUnreachable
  // below), bouncing the user to the "no connection" screen for a query that was just slow, not
  // actually failed. Kept below nginx's own proxy_read_timeout (120s, see ares-ui/nginx.conf) so
  // this fires first with a clean axios timeout instead of racing a 504 from the proxy.
  timeout: 100_000,
  // Axios's default array serialization produces `key[]=a&key[]=b`, but Spring's
  // @RequestParam List<T> binds on the exact param name and never strips `[]` — every
  // multi-select filter across the app (findings, CVE, etc.) would silently bind to an
  // empty/null list server-side without this. `indexes: null` serializes as `key=a&key=b`.
  paramsSerializer: { indexes: null },
});

/** Thrown by performRefresh() when the failure was a network-level one (connection
 *  refused/timeout/DNS — `error.response` is undefined) rather than the backend actually
 *  rejecting the refresh token. Callers must NOT treat this the same as an invalid session —
 *  a backend blip shouldn't force a re-login once it's back up. */
export class BackendUnreachableError extends Error {
  constructor() {
    super('Backend unreachable');
    this.name = 'BackendUnreachableError';
  }
}

// Statuses the reverse proxy itself returns when ares-api isn't reachable behind it — nginx
// answers these directly (it's still up), so a plain "no response at all" check misses this
// case entirely: the browser DOES get a response, just not from the API.
const GATEWAY_ERROR_STATUSES = new Set([502, 503, 504]);

/** True when the failure means the backend couldn't be reached — either a true network-level
 *  failure (no response at all: connection refused/timeout/DNS) or the reverse proxy answering
 *  with a gateway error on its own because the upstream API is down. */
export function isBackendUnreachable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true;
  return GATEWAY_ERROR_STATUSES.has(err.response.status);
}

/** Lightweight, unauthenticated reachability probe (Actuator's health endpoint is `permitAll`)
 *  — used by the router guard so the app doesn't optimistically render the authenticated shell
 *  from a locally-valid-but-unverifiable token when the backend is actually down. */
export async function checkBackendReachable(): Promise<boolean> {
  try {
    await axios.get(`${apiHost}/actuator/health`, { timeout: 5_000 });
    return true;
  } catch (err) {
    return !isBackendUnreachable(err);
  }
}

// Coalesces concurrent callers into a single in-flight probe — a heavy multi-module view (asset/
// finding/detection/... detail pages, see DetectionDetailView) can fire several requests that all
// time out within the same instant, and each would otherwise kick off its own redundant
// /actuator/health round trip right as the response interceptor below decides whether to redirect.
let reachabilityCheckPromise: Promise<boolean> | null = null;
function checkBackendReachableCoalesced(): Promise<boolean> {
  if (!reachabilityCheckPromise) {
    reachabilityCheckPromise = checkBackendReachable().finally(() => {
      reachabilityCheckPromise = null;
    });
  }
  return reachabilityCheckPromise;
}

// ── token helpers ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ares.mssp.auth';

function getStored(): { accessToken?: string; refreshToken?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function updateStored(patch: { accessToken: string; refreshToken: string; user?: unknown }) {
  try {
    const current = getStored();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* ignore */
  }
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

// This module only owns localStorage, not the Pinia auth store — every silent refresh (proactive
// timer, reactive 401 retry, or adopting another tab's win — see waitForExternalRefresh below)
// updates localStorage directly, but previously left the store's own accessToken/refreshToken
// refs untouched until the next explicit login()/ensureValidSession() call. Since
// auth.isAuthenticated (checked on every router navigation) reads THOSE refs' own `exp` claim —
// not the freshest token in storage — a session that background refreshes were keeping
// perfectly alive would still look expired to the router guard once the *original* token's own
// 15-minute clock ran out, forcing an unnecessary (and, under an unlucky multi-tab collision,
// potentially failing) navigation-time refresh instead of quietly already being current. This
// hook keeps the store synced on every refresh, not just the ones it triggered itself, so
// isAuthenticated reflects the real session state and the session only ever actually ends from
// real inactivity (refresh token truly expired/revoked) — never from this staleness.
let onSessionRefreshed: ((accessToken: string, refreshToken: string, user?: unknown) => void) | null = null;
export function setOnSessionRefreshed(cb: (accessToken: string, refreshToken: string, user?: unknown) => void) {
  onSessionRefreshed = cb;
}

/** Decode the `exp` claim from a JWT without verifying the signature. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Seconds until `token` expires. Negative = already expired. */
function secondsUntilExpiry(token: string): number {
  const exp = jwtExpiry(token);
  if (exp === null) return Infinity;
  return exp - Math.floor(Date.now() / 1000);
}

/** True once `token`'s `exp` claim has passed. Tokens with no decodable `exp` are treated as non-expiring. */
export function isTokenExpired(token: string): boolean {
  return secondsUntilExpiry(token) <= 0;
}

// ── proactive refresh ─────────────────────────────────────────────────────────
// Fires a silent refresh ~2 minutes before the access token expires so the
// user is never caught mid-action with a stale token.
//
// Every open tab schedules this independently off the same shared (localStorage) token, so with
// more than one tab open — routine for an analyst working several detections/projects at once —
// their timers land within the same window and can both call /auth/refresh with the same
// refresh token. The backend rotates refresh tokens on single use with no grace period, so the
// losing request gets a flat 401. Routing this through performRefresh() (below) instead of its
// own bespoke axios call means it shares that function's cross-tab race recovery, so a losing
// tab adopts the winner's tokens instead of ever treating the loss as a real failure.
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleProactiveRefresh(accessToken: string) {
  if (proactiveTimer !== null) clearTimeout(proactiveTimer);
  const ttl = secondsUntilExpiry(accessToken);
  // Refresh 2 minutes before expiry (plus a few seconds of jitter so same-token tabs don't all
  // fire in the same instant), never scheduling for tokens already expired.
  const jitter = Math.floor(Math.random() * 5);
  const delay = Math.max(ttl - 120 + jitter, 10);
  if (!isFinite(delay) || delay > 86400) return; // no-op for non-expiring tokens
  proactiveTimer = setTimeout(() => {
    proactiveTimer = null;
    if (!getStored().refreshToken) return;
    performRefresh().catch(() => {
      // Proactive refresh failed — will fall through to reactive 401 handler on next request.
    });
  }, delay * 1000);
}

/** Resolves once some OTHER tab's successful refresh replaces `staleToken` in storage — used so
 *  a tab that just lost a cross-tab refresh race adopts the winner's tokens instead of wrongly
 *  treating "this exact token was already rotated by someone else" as a genuinely invalid
 *  session. Resolves null on timeout, which means it really was invalid/expired (e.g. actual
 *  inactivity, or logout elsewhere) — that case still ends the session as intended. */
function waitForExternalRefresh(staleToken: string, timeoutMs = 2000): Promise<{ accessToken: string; refreshToken: string } | null> {
  return new Promise((resolve) => {
    const immediate = getStored();
    if (immediate.refreshToken && immediate.refreshToken !== staleToken && immediate.accessToken) {
      resolve({ accessToken: immediate.accessToken, refreshToken: immediate.refreshToken });
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('storage', onStorage);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = getStored();
      if (next.refreshToken && next.refreshToken !== staleToken && next.accessToken) {
        cleanup();
        resolve({ accessToken: next.accessToken, refreshToken: next.refreshToken });
      }
    };
    const timer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    window.addEventListener('storage', onStorage);
  });
}

// ── request interceptor ───────────────────────────────────────────────────────

apiClient.interceptors.request.use((config) => {
  const { accessToken } = getStored();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ── shared refresh call ───────────────────────────────────────────────────────
// Used by the reactive 401 handler below and, proactively, by the router guard
// so an expired-but-refreshable session never renders a page before it's resolved.

let refreshPromise: Promise<{ accessToken: string; refreshToken: string; user?: unknown }> | null = null;

export function performRefresh(): Promise<{ accessToken: string; refreshToken: string; user?: unknown } | null> {
  const { refreshToken } = getStored();
  if (!refreshToken) return Promise.resolve(null);

  // Coalesce concurrent callers — only one refresh request in-flight at a time (within this tab;
  // see waitForExternalRefresh above for the cross-tab case).
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ accessToken: string; refreshToken: string; user?: unknown }>(`${baseURL}/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        updateStored({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
        scheduleProactiveRefresh(data.accessToken);
        onSessionRefreshed?.(data.accessToken, data.refreshToken, data.user);
        return data;
      })
      .catch(async (err) => {
        // The backend rejects reuse of an already-rotated refresh token outright, no grace
        // period — indistinguishable, from here, from a genuinely invalid session. If another
        // tab won a concurrent refresh race with this exact token, give it a moment to land its
        // result in localStorage before treating this as a real failure.
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          const external = await waitForExternalRefresh(refreshToken);
          if (external) {
            onSessionRefreshed?.(external.accessToken, external.refreshToken);
            return external;
          }
        }
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise.catch((err) => {
    if (isBackendUnreachable(err)) throw new BackendUnreachableError();
    return null;
  });
}

// ── response interceptor — refresh-and-retry on 401 ─────────────────────────

apiClient.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const config = err.config as InternalAxiosRequestConfig & { _retried?: boolean; _skipUnreachableRedirect?: boolean };

    // `isBackendUnreachable` also fires on a plain axios timeout (no `error.response` at all —
    // same shape as a real connection failure), which used to bounce straight to the login page
    // with a "no connection" message even when the backend was fine and only that one endpoint
    // was slow (a heavy multi-module detail view — asset/finding/detection/... — timing out on a
    // slow deployment is exactly this case, not an outage). So before redirecting, actually probe
    // the backend (`/actuator/health`, permitAll, cheap) rather than assume: still-reachable means
    // this request's own timeout/gateway blip, surfaced as a toast instead of a redirect; only a
    // failed probe means the backend is genuinely down and the redirect below is warranted.
    //
    // Skipped entirely on the login page itself — LoginView already shows this same message
    // inline without reloading — and when the caller opted out via `_skipUnreachableRedirect`,
    // used by per-widget dashboard data requests (dashboardsApi.widgetData): one slow/heavy
    // widget timing out is a per-widget error to show inline, not a reason to bounce the whole
    // app to the login screen (this was a real reported bug — a single dashboard widget's
    // timeout was forcing a false "session expired" redirect even though the session was fine).
    if (isBackendUnreachable(err) && !config?._skipUnreachableRedirect && !location.pathname.startsWith('/login')) {
      const reachable = await checkBackendReachableCoalesced();
      if (reachable) {
        ToastEventBus.emit('add', {
          severity: 'error',
          summary: 'Request timed out',
          detail: 'The server took too long to respond to this request. Please try again.',
          life: 6000,
        });
        return Promise.reject(err);
      }
      // A full page navigation (not router.push) is used deliberately: client.ts has no router
      // instance, and the reload also resets the router guard's cached
      // `backendConfirmedReachable` flag so the next navigation re-probes instead of trusting a
      // now-stale "reachable" result.
      location.assign('/login?reason=network');
      return Promise.reject(err);
    }

    if (err.response?.status !== 401 || config._retried) {
      return Promise.reject(err);
    }

    // Only attempt refresh once per original request.
    config._retried = true;

    let result;
    try {
      result = await performRefresh();
    } catch (refreshErr) {
      if (refreshErr instanceof BackendUnreachableError) {
        // A network-level failure, not a real refresh rejection — the token might still be
        // good once the backend's back, so don't wipe the session over a transient blip.
        return Promise.reject(err);
      }
      throw refreshErr;
    }
    if (!result) {
      clearAuth();
      if (!location.pathname.startsWith('/login')) location.assign('/login?reason=expired');
      return Promise.reject(err);
    }

    config.headers.Authorization = `Bearer ${result.accessToken}`;
    return apiClient(config);
  },
);

// ── bootstrap proactive refresh from stored token on page load ────────────────
{
  const { accessToken } = getStored();
  if (accessToken) scheduleProactiveRefresh(accessToken);
}
