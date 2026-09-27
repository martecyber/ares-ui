<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { isBackendUnreachable } from '@/api/client';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import logoWhite from '@/assets/logo/ares-wordmark-white.svg';
import logoPurpleLight from '@/assets/logo/ares-wordmark-purple-light.svg';
import logoPurpleDark from '@/assets/logo/ares-wordmark-purple-dark.svg';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const theme = useThemeStore();

// The brand panel's background is a fixed dark gradient regardless of theme, so its
// logo always uses the white mark. The form panel's mobile-only logo sits on the
// theme-reactive --ares-bg, so it swaps the same way the navbar brand mark does.
const formLogo = computed(() => theme.theme === 'light' ? logoPurpleDark : logoPurpleLight);

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

// Set on load when the router redirected here because the backend was unreachable, and
// again on any login attempt that fails the same way — distinct from a normal auth error.
const backendUnreachable = ref(route.query.reason === 'network');

// Set when a client account successfully authenticates but has no organization assigned
// (or its sole org was later removed) — a config problem for their admin, not a credentials error.
const noOrgAssigned = ref(route.query.reason === 'no-org');

// MFA step
const mfaVisible = ref(false);
const totpCode = ref('');
const mfaLoading = ref(false);
const mfaError = ref<string | null>(null);

async function submit() {
  error.value = null;
  noOrgAssigned.value = false;
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    backendUnreachable.value = false;
    redirect();
  } catch (e: unknown) {
    const err = e as any;
    if (isBackendUnreachable(e)) {
      backendUnreachable.value = true;
    } else {
      backendUnreachable.value = false;
      const code = err?.response?.data?.code;
      if (code === 'mfa_required') {
        totpCode.value = '';
        mfaError.value = null;
        mfaVisible.value = true;
      } else {
        error.value = 'Invalid credentials.';
      }
    }
  } finally {
    loading.value = false;
  }
}

async function submitMfa() {
  mfaError.value = null;
  mfaLoading.value = true;
  try {
    await auth.login(email.value, password.value, totpCode.value);
    mfaVisible.value = false;
    redirect();
  } catch {
    mfaError.value = 'Invalid or expired code. Try again.';
  } finally {
    mfaLoading.value = false;
  }
}

async function redirect() {
  const next = typeof route.query.next === 'string' ? route.query.next : null;
  // Client accounts have no general dashboard — send them straight to their org's page
  // instead of bouncing through '/dashboard' (the router guard would redirect them anyway,
  // this just avoids the extra hop).
  if (!next && auth.isClient) {
    const orgId = await auth.loadClientOrgId();
    if (!orgId) {
      // No organization assigned — nothing for this account to see. Log out rather than
      // leave them "logged in" on a dead end, with a clear reason instead of a raw 403.
      // Set the flag directly (not just via the query param) since we're already mounted
      // on this same LoginView instance — a route-query change alone wouldn't re-run setup.
      await auth.logout();
      noOrgAssigned.value = true;
      router.replace({ name: 'login', query: { reason: 'no-org' } });
      return;
    }
    router.replace({ name: 'organization-detail', params: { id: orgId } });
    return;
  }
  router.replace(next ?? '/dashboard');
}

// ── Animated graph background (nodes drifting, edges to nearby nodes, red glow pulse) ──
const canvasEl = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let resizeObserver: ResizeObserver | null = null;

interface GraphNode { x: number; y: number; vx: number; vy: number; r: number; pulse: number; }

function startGraphAnimation(canvas: HTMLCanvasElement) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const ctx: CanvasRenderingContext2D = ctx2d;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let nodes: GraphNode[] = [];
  let width = 0;
  let height = 0;

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    width = canvas.width = Math.max(1, Math.round(rect.width * dpr));
    height = canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const count = Math.min(90, Math.max(24, Math.round((rect.width * rect.height) / 16000)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25 * dpr,
      vy: (Math.random() - 0.5) * 0.25 * dpr,
      r: (1.4 + Math.random() * 1.6) * dpr,
      pulse: Math.random() * Math.PI * 2,
    }));
  }

  const linkDist = 150 * dpr;

  function frame() {
    ctx.clearRect(0, 0, width, height);

    for (const n of nodes) {
      if (!reduceMotion) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        n.pulse += 0.015;
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < linkDist) {
          ctx.strokeStyle = `rgba(184,179,216,${0.14 * (1 - dist / linkDist)})`;
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const n of nodes) {
      const glow = 0.5 + 0.5 * Math.sin(n.pulse);
      const gradR = n.r * 7;
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gradR);
      grad.addColorStop(0, `rgba(184,179,216,${0.65 * glow})`);
      grad.addColorStop(1, 'rgba(184,179,216,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, gradR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  resize();
  resizeObserver = new ResizeObserver(resize);
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
  frame();
}

onMounted(() => {
  if (canvasEl.value) startGraphAnimation(canvasEl.value);
});

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="login-page">
    <!-- Brand panel — animated node/edge graph, hidden on narrow viewports. -->
    <div class="login-panel login-panel--brand">
      <canvas ref="canvasEl" class="graph-canvas" aria-hidden="true" />
      <div class="brand-content">
        <div class="brand-logo-row">
          <img class="brand-logo" :src="logoWhite" alt="ARES" />
          <span class="ares-beta-badge">Beta</span>
        </div>
        <div class="brand-copy">
          <h1 class="brand-heading">Aggregate, Discover, <span class="brand-heading-accent">Report.</span></h1>
          <p class="brand-tagline">The All-in-one Attack Surface Management Platform.</p>
        </div>
      </div>
      <div class="brand-footer">© {{ new Date().getFullYear() }} Martín Romera. All rights reserved.</div>
    </div>

    <!-- Form panel -->
    <div class="login-panel login-panel--form">
      <button
        class="theme-toggle"
        type="button"
        :title="theme.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="theme.toggle()"
      >
        <i :class="theme.theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" />
      </button>

      <div class="form-wrap">
        <div class="form-logo-row">
          <img class="form-logo" :src="formLogo" alt="ARES" />
          <span class="ares-beta-badge">Beta</span>
        </div>
        <div class="form-brand">Log In</div>

        <Message v-if="backendUnreachable" severity="warn" :closable="false" style="margin-bottom:1rem;">
          No connection with the backend. The server may be starting up or temporarily unavailable — try logging in again in a moment.
        </Message>

        <Message v-if="noOrgAssigned" severity="error" :closable="false" style="margin-bottom:1rem;">
          Your account has no organization assigned. Contact your administrator.
        </Message>

        <form @submit.prevent="submit" class="login-form">
          <div class="form-field">
            <label for="email">Email</label>
            <InputText
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              class="w-full"
            />
          </div>

          <div class="form-field">
            <label for="password">Password</label>
            <Password
              id="password"
              v-model="password"
              :feedback="false"
              toggle-mask
              input-class="w-full"
              class="w-full"
              required
            />
          </div>

          <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

          <Button type="submit" label="Login Now" class="login-submit" :loading="loading" />

          <!-- SSO options (e.g. "Login with Google") land here once available -->
        </form>
      </div>
    </div>

    <!-- MFA dialog -->
    <Dialog
      v-model:visible="mfaVisible"
      header="Two-factor authentication"
      modal
      :closable="false"
      style="width: 22rem;"
    >
      <div style="display:flex; flex-direction:column; gap:1rem; padding-top:0.25rem;">
        <p style="font-size:0.875rem; color:var(--ares-text-2); line-height:1.5;">
          Your account has two-factor authentication enabled. Enter the 6-digit code from your authenticator app.
        </p>

        <div class="form-field">
          <label for="totp">Authentication code</label>
          <InputText
            id="totp"
            v-model="totpCode"
            inputmode="numeric"
            pattern="\d{6}"
            maxlength="6"
            placeholder="000000"
            class="w-full"
            autofocus
            @keydown.enter.prevent="submitMfa"
          />
        </div>

        <Message v-if="mfaError" severity="error" :closable="false">{{ mfaError }}</Message>

        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button
            label="Cancel"
            severity="secondary"
            :disabled="mfaLoading"
            @click="mfaVisible = false"
          />
          <Button
            label="Verify"
            :loading="mfaLoading"
            :disabled="totpCode.length !== 6"
            @click="submitMfa"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
}

.login-panel {
  min-height: 100vh;
}

/* ── Brand panel ─────────────────────────────────────────────────────────── */

.login-panel--brand {
  position: relative;
  flex: 1 1 55%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  background: radial-gradient(ellipse at 25% 15%, #241f5c 0%, #14113a 55%, #0a0920 100%);
  padding: 3rem;
  color: #fff;
}

.graph-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.brand-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  /* Without this, the default align-items:stretch stretches the <img>'s own box to
     the full container width — its fixed height then leaves the SVG's actual content
     (scaled to fit via preserveAspectRatio) floating centered in that oversized box,
     instead of sized to its own content and flush left like brand-heading/tagline. */
  align-items: flex-start;
  gap: 2.75rem;
}

.brand-logo-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.brand-logo {
  height: 96px;
  width: auto;
  display: block;
}

.brand-copy {
  max-width: 30rem;
}

.brand-heading {
  font-size: 2.75rem;
  font-weight: 800;
  line-height: 1.15;
  margin: 0 0 1rem;
}

.brand-heading-accent {
  color: #b8b3d8;
}

.brand-tagline {
  font-size: 1rem;
  line-height: 1.6;
  color: rgba(255,255,255,0.75);
  margin: 0;
}

.brand-footer {
  position: relative;
  z-index: 1;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.4);
}

/* ── Form panel — uses the app's own theme tokens so it responds to the
   dark/light toggle, unlike the fixed brand panel on the left. ─────────── */

.login-panel--form {
  position: relative;
  flex: 1 1 45%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ares-bg);
  padding: 2rem;
}

.theme-toggle {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  color: var(--ares-text-muted);
  cursor: pointer;
}

.theme-toggle:hover {
  background: var(--ares-surface-2);
  border-color: var(--ares-accent-muted);
}

.form-wrap {
  width: 100%;
  max-width: 380px;
}

/* Only shown on mobile (see media query below) — on desktop the brand panel already
   carries the ARES logo, so repeating it here would be redundant. */
.form-logo-row {
  display: none;
  align-items: flex-start;
  justify-content: center;
  gap: 0.5rem;
  margin: 0 auto 2.5rem;
}

.form-logo {
  height: 52px;
  width: auto;
}

.form-brand {
  font-size: 1.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ares-text);
  margin-bottom: 1.25rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-field label {
  font-size: 0.83rem;
  font-weight: 500;
  color: var(--ares-text-2);
}

.login-submit {
  background: #4141a2;
  border-color: #4141a2;
  color: #fff;
  font-weight: 600;
  padding: 0.75rem;
  border-radius: var(--ares-radius);
}

.login-submit:hover {
  background: #2a3d6b;
  border-color: #2a3d6b;
}

@media (max-width: 820px) {
  .login-panel--brand { display: none; }
  .login-panel--form { flex: 1 1 100%; }
  .form-logo-row { display: flex; }
  .form-brand { text-align: center; }
}
</style>
