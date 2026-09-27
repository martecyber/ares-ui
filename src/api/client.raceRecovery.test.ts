import { describe, it, expect } from 'vitest';

// Regression coverage for the "session ends while the user is actively working" bug: a tab that
// loses a concurrent refresh-token race (another tab, or this same tab's own proactive timer,
// already rotated the exact refresh token this call is using) used to have that race
// indistinguishable from a genuinely invalid session, forcing a full logout — including wiping
// shared localStorage out from under every other tab. Runs against the real backend (no mocks):
// skipped automatically when it isn't reachable (e.g. CI without the dev stack running).
//
// client.ts resolves its own baseURL from import.meta.env.VITE_API_BASE, which Vite only
// populates from an actual VITE_-prefixed env var (no .env file sets one in this repo) — run
// this with e.g. `VITE_API_BASE=http://localhost:8888 npx vitest run src/api/client.raceRecovery.test.ts`,
// matching the dev server's own default proxy target. Without it, client.ts's requests target a
// relative /api/v1/... URL, which has no meaning in Node and throws ERR_INVALID_URL rather than
// cleanly skipping — the reachability probe below uses this same resolved BASE specifically to
// avoid that drift.
const API_HOST = process.env.VITE_API_BASE || 'http://localhost:8888';
const BASE = `${API_HOST}/api/v1`;

const store = new Map<string, string>();
const listeners: ((e: { key: string }) => void)[] = [];

(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).window = {
  ...(globalThis as any).window,
  addEventListener: (type: string, cb: any) => { if (type === 'storage') listeners.push(cb); },
  removeEventListener: (type: string, cb: any) => {
    if (type === 'storage') { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }
  },
};

// Skip rather than fail when VITE_API_BASE isn't set — client.ts itself would target a relative
// (invalid in Node) URL in that case, which is an environment-not-configured-for-this-test
// condition, not a real regression. Also requires process.env.VITE_API_BASE specifically
// (not just this file's own API_HOST fallback above) since that's what Vite actually exposes to
// client.ts's import.meta.env — running the full suite with no env vars set must skip cleanly.
//
// Top-level await so runnable is resolved before describe.skipIf reads it below — skipIf's
// condition is evaluated at collection time, synchronously, before any beforeAll would run.
let runnable = !!process.env.VITE_API_BASE;
if (runnable) {
  try {
    const res = await fetch(`${BASE}/ping`);
    runnable = res.ok;
  } catch {
    runnable = false;
  }
}

function fireStorageEvent(key: string) {
  for (const cb of [...listeners]) cb({ key });
}

describe.skipIf(!runnable)('cross-tab refresh race recovery (live backend)', () => {
  it('adopts the winning tab\'s tokens instead of forcing a logout, and resyncs the session hook', async () => {
    const client = await import('./client');

    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'admin123!' }),
    });
    expect(loginRes.ok).toBe(true);
    const login = await loginRes.json();
    store.set('ares.mssp.auth', JSON.stringify({ accessToken: login.accessToken, refreshToken: login.refreshToken, user: login.user }));

    const hookCalls: { accessToken: string; refreshToken: string; user: unknown }[] = [];
    client.setOnSessionRefreshed((accessToken: string, refreshToken: string, user?: unknown) => {
      hookCalls.push({ accessToken, refreshToken, user });
    });

    // Simulate another tab winning a concurrent refresh with the SAME token this tab still has.
    const staleRefreshToken = login.refreshToken;
    const otherTabRes = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: staleRefreshToken }),
    });
    expect(otherTabRes.ok).toBe(true);
    const otherTab = await otherTabRes.json();

    // That other tab's write lands in localStorage a beat after our own refresh call starts.
    setTimeout(() => {
      store.set('ares.mssp.auth', JSON.stringify({ accessToken: otherTab.accessToken, refreshToken: otherTab.refreshToken, user: otherTab.user }));
      fireStorageEvent('ares.mssp.auth');
    }, 150);

    // Our own refresh attempt still uses the now-stale (already-rotated) token from before the
    // write above lands — reproducing the exact race.
    const result = await client.performRefresh();

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe(otherTab.accessToken);
    expect(result!.refreshToken).toBe(otherTab.refreshToken);

    expect(hookCalls.length).toBeGreaterThan(0);
    const lastHook = hookCalls[hookCalls.length - 1];
    expect(lastHook.accessToken).toBe(otherTab.accessToken);
    expect(lastHook.refreshToken).toBe(otherTab.refreshToken);
  });
});
