<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { agentsApi } from '@/api/agents';

const toast = useToast();
const base = window.location.origin;
const tab = ref<'linux' | 'windows'>('linux');

type FormatMap = Record<'py' | 'zip' | 'deb' | 'rpm' | 'exe', boolean>;
const formats = ref<FormatMap>({ py: true, zip: true, deb: false, rpm: false, exe: false });

interface Pkg { label: string; url: string; filename: string; available: boolean; hint?: string; }

const packages = computed<Pkg[]>(() => {
  const out: Pkg[] = [];
  if (tab.value === 'windows') {
    out.push({
      label: 'Windows installer (.exe)',
      url: `${base}/api/v1/agent/dist/ares_agent_setup.exe`,
      filename: 'ares_agent_setup.exe',
      available: formats.value.exe,
      hint: 'Server needs NSIS (`makensis`) on PATH.',
    });
  } else {
    out.push({
      label: 'Debian / Ubuntu (.deb)',
      url: `${base}/api/v1/agent/dist/ares_agent.deb`,
      filename: 'ares_agent.deb',
      available: formats.value.deb,
      hint: 'Server needs `fpm` on PATH.',
    });
    out.push({
      label: 'RHEL / Fedora / SUSE (.rpm)',
      url: `${base}/api/v1/agent/dist/ares_agent.rpm`,
      filename: 'ares_agent.rpm',
      available: formats.value.rpm,
      hint: 'Server needs `fpm` on PATH.',
    });
  }
  // Portable ZIP — always available, works on any platform with Python 3.
  out.push({
    label: 'Portable bundle (.zip)',
    url: `${base}/api/v1/agent/dist/ares_agent.zip`,
    filename: 'ares_agent.zip',
    available: true,
  });
  return out;
});

const hasNativeInstaller = computed(() =>
  tab.value === 'windows' ? formats.value.exe : (formats.value.deb || formats.value.rpm)
);

async function load() {
  try {
    formats.value = await agentsApi.formats();
  } catch (e: any) {
    toast.add({ severity: 'warn', summary: 'Could not query installer formats', life: 4000 });
  }
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() =>
    toast.add({ severity: 'success', summary: 'Copied', life: 2000 })
  );
}

onMounted(load);
</script>

<template>
  <div style="max-width:760px; margin:0 auto; padding:2rem 1rem;">
    <h2 style="font-size:1.25rem; font-weight:700; margin:0 0 0.25rem;">Agent installer</h2>
    <p style="color:var(--ares-text-muted); font-size:0.875rem; margin:0 0 2rem;">
      Install the ares-agent daemon on a remote host. It pulls scan tasks from this platform
      and reports results back into your projects.
    </p>

    <!-- OS tabs -->
    <div style="display:flex; gap:0.5rem; margin-bottom:1.5rem;">
      <button v-for="os in (['linux','windows'] as const)" :key="os"
        @click="tab = os"
        :style="{
          padding:'0.4rem 1rem', borderRadius:'6px', border:'1px solid var(--ares-border)',
          cursor:'pointer', fontSize:'0.85rem', fontWeight:600,
          background: tab === os ? 'var(--p-primary-color)' : 'transparent',
          color: tab === os ? '#fff' : 'var(--ares-text-1)',
        }">
        <i :class="{ 'pi pi-desktop': os === 'linux', 'pi pi-microsoft': os === 'windows' }"
          style="margin-right:0.4rem; font-size:0.8rem;" />
        {{ os === 'linux' ? 'Linux' : 'Windows' }}
      </button>
    </div>

    <!-- Requirements -->
    <section style="margin-bottom:1.5rem;">
      <h3 style="font-size:0.85rem; font-weight:700; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:.05em; margin:0 0 0.5rem;">
        Requirements
      </h3>
      <ul style="margin:0; padding-left:1.25rem; font-size:0.875rem; color:var(--ares-text-1); line-height:1.8;">
        <li>Python 3.10 or later</li>
        <li>Network reachability to <code>{{ base }}</code></li>
        <li v-if="tab === 'linux'">systemd (for daemon mode)</li>
      </ul>
    </section>

    <!-- Step 1 — Install -->
    <section style="margin-bottom:1.5rem;">
      <h3 style="font-size:0.85rem; font-weight:700; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:.05em; margin:0 0 0.75rem;">
        1 — Install
      </h3>

      <div v-if="!hasNativeInstaller"
           style="background: color-mix(in srgb, var(--p-yellow-500) 12%, transparent);
                  border:1px solid color-mix(in srgb, var(--p-yellow-500) 35%, transparent);
                  border-radius: var(--ares-radius); padding:0.6rem 0.9rem; font-size:0.83rem; margin-bottom:0.75rem;">
        <i class="pi pi-info-circle" style="margin-right:0.4rem;" />
        Native installer for {{ tab === 'windows' ? 'Windows' : 'Linux' }} is unavailable on this
        server (missing build tooling). Use the portable bundle below — it works on any
        platform with Python 3.
      </div>

      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <template v-for="pkg in packages" :key="pkg.url">
          <a v-if="pkg.available"
            :href="pkg.url" :download="pkg.filename"
            style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.45rem 0.9rem;
                   border:1px solid var(--ares-border); border-radius: var(--ares-radius); font-size:0.83rem;
                   color:var(--ares-text-1); text-decoration:none; background:var(--p-surface-700);">
            <i class="pi pi-download" style="font-size:0.78rem;" />
            {{ pkg.label }}
          </a>
          <span v-else
            v-tooltip.top="pkg.hint"
            style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.45rem 0.9rem;
                   border:1px dashed var(--ares-border); border-radius: var(--ares-radius); font-size:0.83rem;
                   color:var(--ares-text-muted); cursor:not-allowed;">
            <i class="pi pi-times-circle" style="font-size:0.78rem;" />
            {{ pkg.label }}
          </span>
        </template>
      </div>
      <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0.6rem 0 0;">
        Just the script?
        <a :href="`${base}/api/v1/agent/dist/ares_agent.py`" download style="color:var(--p-primary-color);">Download ares_agent.py</a>.
      </p>
    </section>

    <!-- Step 2 — Register -->
    <section style="margin-bottom:1.5rem;">
      <h3 style="font-size:0.85rem; font-weight:700; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:.05em; margin:0 0 0.75rem;">
        2 — Register the agent in Ares
      </h3>
      <p style="font-size:0.875rem; color:var(--ares-text-1); margin:0 0 0.5rem;">
        Go to <router-link :to="{ name: 'agents' }" style="color:var(--p-primary-color);">Agents</router-link>
        → <strong>Register agent</strong>. Ares returns a one-time
        <em>enrollment code</em>; copy it for the next step.
      </p>
    </section>

    <!-- Step 3 — Enroll -->
    <section style="margin-bottom:1.5rem;">
      <h3 style="font-size:0.85rem; font-weight:700; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:.05em; margin:0 0 0.75rem;">
        3 — Enroll
      </h3>
      <div style="background:var(--p-surface-800); border:1px solid var(--ares-border); border-radius: var(--ares-radius); overflow:hidden;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.75rem; border-bottom:1px solid var(--ares-border); background:var(--p-surface-700);">
          <span style="font-size:0.75rem; color:var(--ares-text-muted);">{{ tab === 'windows' ? 'PowerShell / cmd' : 'bash' }}</span>
          <Button icon="pi pi-copy" text size="small"
            v-tooltip.left="'Copy'"
            @click="copy(`ares-agent enroll --server ${base} --code <ENROLLMENT_CODE>`)" />
        </div>
        <pre style="margin:0; padding:0.85rem 1rem; font-size:0.82rem; color:#e2e8f0; white-space:pre-wrap;">ares-agent enroll --server {{ base }} --code &lt;ENROLLMENT_CODE&gt;</pre>
      </div>
    </section>

    <!-- Step 4 — Run -->
    <section style="margin-bottom:1.5rem;">
      <h3 style="font-size:0.85rem; font-weight:700; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:.05em; margin:0 0 0.75rem;">
        4 — Start the daemon
      </h3>
      <div style="background:var(--p-surface-800); border:1px solid var(--ares-border); border-radius: var(--ares-radius); overflow:hidden;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.75rem; border-bottom:1px solid var(--ares-border); background:var(--p-surface-700);">
          <span style="font-size:0.75rem; color:var(--ares-text-muted);">{{ tab === 'windows' ? 'PowerShell / cmd' : 'systemd' }}</span>
        </div>
        <pre v-if="tab === 'linux'" style="margin:0; padding:0.85rem 1rem; font-size:0.82rem; color:#e2e8f0;">sudo systemctl enable --now ares-agent
sudo systemctl status ares-agent</pre>
        <pre v-else style="margin:0; padding:0.85rem 1rem; font-size:0.82rem; color:#e2e8f0;">ares-agent run</pre>
      </div>
    </section>
  </div>
</template>
