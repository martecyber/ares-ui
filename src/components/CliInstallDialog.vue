<script setup lang="ts">
import { ref, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [v: boolean] }>();

const toast = useToast();
const base = window.location.origin;

interface Variant {
  id: string;
  label: string;
  command: (base: string) => string;
}

interface Method {
  id: 'deb' | 'rpm' | 'exe' | 'ps' | 'sh';
  label: string;
  icon: string;
  shell: string;
  requirements: string[];
  command: (base: string) => string;
  download?: (base: string) => { url: string; filename: string };
  scriptDownload?: (base: string) => { url: string; filename: string };
  /** True when `command` is prose ("double-click and follow the wizard"), not a literal
   *  command to copy/paste — rendered as plain text instead of a terminal-style code block. */
  instructionsOnly?: boolean;
  /** Only set where the package format is shared but the package manager isn't
   *  (.rpm is installed with dnf/yum on Red Hat/Fedora but zypper on openSUSE). */
  variants?: Variant[];
}

const METHODS: Method[] = [
  {
    id: 'deb', label: 'Debian based', icon: '/img/sources/debian.svg',
    shell: 'bash',
    requirements: ['Python 3.10 or later'],
    command: () => 'sudo apt install ./ares_cli.deb',
    download: (b) => ({ url: `${b}/api/v1/cli/ares_cli.deb`, filename: 'ares_cli.deb' }),
  },
  {
    id: 'rpm', label: 'Red Hat based', icon: '/img/sources/redhat.svg',
    shell: 'bash',
    requirements: ['Python 3.10 or later'],
    command: () => 'sudo dnf install ./ares_cli.rpm',
    download: (b) => ({ url: `${b}/api/v1/cli/ares_cli.rpm`, filename: 'ares_cli.rpm' }),
    variants: [
      { id: 'dnf', label: 'dnf / yum', command: () => 'sudo dnf install ./ares_cli.rpm' },
      { id: 'zypper', label: 'zypper (openSUSE)', command: () => 'sudo zypper install ./ares_cli.rpm' },
    ],
  },
  {
    id: 'exe', label: 'Windows (.exe)', icon: '/img/sources/windows.svg',
    shell: '',
    requirements: ['Python 3.10 or later (the installer checks for it)'],
    command: () => 'Run the downloaded installer and follow the setup wizard.',
    download: (b) => ({ url: `${b}/api/v1/cli/ares_cli_setup.exe`, filename: 'ares_cli_setup.exe' }),
    instructionsOnly: true,
  },
  {
    id: 'ps', label: 'Windows (PowerShell)', icon: '/img/sources/powershell.svg',
    shell: 'PowerShell',
    requirements: ['Python 3.10 or later', 'PowerShell 5.1 or later'],
    command: (b) => `iwr -UseBasicParsing "${b}/api/v1/cli/install.ps1" | iex`,
    scriptDownload: (b) => ({ url: `${b}/api/v1/cli/install.ps1`, filename: 'install.ps1' }),
  },
  {
    id: 'sh', label: 'macOS / Linux (script)', icon: '/img/sources/gnubash.svg',
    shell: 'bash',
    requirements: ['Python 3.10 or later', 'curl (usually pre-installed)'],
    command: (b) => `curl -fsSL "${b}/api/v1/cli/install.sh" | bash`,
    scriptDownload: (b) => ({ url: `${b}/api/v1/cli/install.sh`, filename: 'install.sh' }),
  },
];

const selected = ref<Method | null>(null);
const variantId = ref<string | null>(null);

const activeVariant = computed(() =>
  selected.value?.variants?.find(v => v.id === variantId.value) ?? selected.value?.variants?.[0] ?? null
);
const installCommand = computed(() => {
  if (!selected.value) return '';
  return (activeVariant.value?.command ?? selected.value.command)(base);
});
const download = computed(() => selected.value?.download?.(base) ?? null);
const scriptDownload = computed(() => selected.value?.scriptDownload?.(base) ?? null);
const nextShellLabel = computed(() => (selected.value?.id === 'exe' || selected.value?.id === 'ps') ? 'PowerShell' : 'bash');

function selectMethod(m: Method) {
  selected.value = m;
  variantId.value = m.variants?.[0]?.id ?? null;
  const dl = m.download?.(base);
  if (dl) triggerDownload(dl.url, dl.filename);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() =>
    toast.add({ severity: 'success', summary: 'Copied', life: 2000 })
  );
}

function close() {
  selected.value = null;
  variantId.value = null;
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Install Ares CLI"
    modal
    :style="{ width: 'min(640px, 96vw)' }"
    :pt="{ content: { style: 'padding: 1.25rem' } }"
    @update:visible="close"
  >
    <p style="font-size:0.82rem; color:var(--ares-text-muted); margin:0 0 1rem;">
      Select your installation method to download the CLI and see install instructions.
    </p>

    <div class="picker-grid">
      <button
        v-for="m in METHODS" :key="m.id"
        type="button"
        :class="['picker-card', { 'picker-card--active': selected?.id === m.id }]"
        @click="selectMethod(m)"
      >
        <div class="picker-logo">
          <img :src="m.icon" :alt="m.label" />
        </div>
        <span class="picker-label">{{ m.label }}</span>
      </button>
    </div>

    <div v-if="selected" class="detail">
      <div v-if="download" class="dl-confirm">
        <i class="pi pi-check-circle" />
        Downloading <strong>{{ download.filename }}</strong>…
      </div>

      <p class="section-label">Requirements</p>
      <ul class="req-list">
        <li v-for="r in selected.requirements" :key="r">{{ r }}</li>
      </ul>

      <p class="section-label">Install</p>

      <div v-if="selected.variants" class="variant-toggle">
        <button
          v-for="v in selected.variants" :key="v.id"
          type="button"
          :class="['variant-btn', { 'variant-btn--active': (activeVariant?.id) === v.id }]"
          @click="variantId = v.id"
        >{{ v.label }}</button>
      </div>

      <p v-if="selected.instructionsOnly" style="font-size:0.85rem; color:var(--ares-text-1); margin:0;">
        {{ installCommand }}
      </p>
      <div v-else class="cmd-block">
        <div class="cmd-header">
          <span>{{ selected.shell || selected.label }}</span>
          <Button icon="pi pi-copy" text size="small" style="color:var(--ares-text-muted);"
            v-tooltip.left="'Copy'" @click="copy(installCommand)" />
        </div>
        <pre>{{ installCommand }}</pre>
      </div>

      <p v-if="scriptDownload" style="font-size:0.78rem; color:var(--ares-text-muted); margin:0.5rem 0 0;">
        Prefer to review before running?
        <a :href="scriptDownload.url" :download="scriptDownload.filename" style="color:var(--p-primary-color);">
          Download {{ scriptDownload.filename }}
        </a>
        or
        <a :href="`${base}/api/v1/cli/ares_cli.py`" download style="color:var(--p-primary-color);">download ares_cli.py directly</a>.
      </p>

      <p class="section-label">Next</p>
      <p style="font-size:0.82rem; color:var(--ares-text-1); margin:0 0 0.5rem;">
        Opens your browser to log in and authorize the CLI — no API key to paste.
      </p>
      <div class="cmd-block">
        <div class="cmd-header">
          <span>{{ nextShellLabel }}</span>
          <Button icon="pi pi-copy" text size="small" style="color:var(--ares-text-muted);"
            v-tooltip.left="'Copy'" @click="copy('ares configure')" />
        </div>
        <pre>ares configure</pre>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.6rem;
}

.picker-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 0.5rem 0.65rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-2);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.8rem;
  transition: border-color 0.12s, background 0.12s, transform 0.1s;
  width: 100%;
}
.picker-card:hover {
  border-color: var(--p-primary-400);
  background: color-mix(in srgb, var(--p-primary-500) 8%, var(--ares-surface-raised));
  transform: translateY(-1px);
}
.picker-card--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 12%, var(--ares-surface-raised));
}

.picker-logo {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px;
}
.picker-logo img { width: 100%; height: 100%; object-fit: contain; }

.picker-label { font-weight: 600; text-align: center; line-height: 1.2; }

.detail {
  margin-top: 1.25rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--ares-border);
}

.dl-confirm {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--ares-success, #4ade80);
  margin-bottom: 1rem;
}

.section-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ares-text-muted);
  margin: 0.9rem 0 0.4rem;
}
.section-label:first-of-type { margin-top: 0; }

.req-list {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.82rem;
  color: var(--ares-text-1);
  line-height: 1.7;
  list-style: disc;
}

.variant-toggle {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.variant-btn {
  font-family: inherit;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 0.3rem 0.65rem;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  background: var(--ares-surface-raised);
  color: var(--ares-text-2);
  cursor: pointer;
}
.variant-btn--active {
  border-color: var(--p-primary-500);
  background: color-mix(in srgb, var(--p-primary-500) 14%, var(--ares-surface-raised));
  color: var(--ares-text);
}

.cmd-block {
  background: var(--p-surface-800);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
}
.cmd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.65rem;
  border-bottom: 1px solid var(--ares-border);
  background: var(--p-surface-700);
  font-size: 0.72rem;
  color: var(--ares-text-muted);
}
.cmd-block pre {
  margin: 0;
  padding: 0.7rem 0.85rem;
  font-size: 0.8rem;
  color: #e2e8f0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

</style>
