<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import AresBadge from '@/components/AresBadge.vue';
import { useToast } from 'primevue/usetoast';
import { confirmDialog } from '@/composables/useConfirmDialog';
import { pluginsApi, type InstalledPlugin, type PluginVersionConflict, type PluginDependencyConflict, type BrowsePlugin } from '@/api/plugins';
import { loadDynamicIcons } from '@/utils/tool-icons';
import { useThemeStore } from '@/stores/theme';
import PluginMarketplaceModal from '@/components/PluginMarketplaceModal.vue';

const toast = useToast();
const theme = useThemeStore();

function iconFor(p: { icon: string | null; iconLight: string | null }): string | null {
  return (theme.theme === 'light' && p.iconLight) ? p.iconLight : p.icon;
}

/** Every plugin ships as 1.0.0-alphaN/-betaN/-rcN for now (see the version bump convention) —
 *  surfaces that maturity as a badge so "installed" doesn't read as "production-ready". No badge
 *  once a plugin ever ships a plain release version (no suffix). */
function maturityOf(version: string): { label: string; severity: 'danger' | 'warn' | 'info' } | null {
  const v = version.toLowerCase();
  if (v.includes('alpha')) return { label: 'ALPHA', severity: 'danger' };
  if (v.includes('beta')) return { label: 'BETA', severity: 'warn' };
  if (v.includes('rc')) return { label: 'RC', severity: 'info' };
  return null;
}

// ── Installed ─────────────────────────────────────────────────────────────
const installed = ref<InstalledPlugin[]>([]);
const loadingInstalled = ref(false);
const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const showMarketplace = ref(false);

async function loadInstalled() {
  loadingInstalled.value = true;
  try { installed.value = await pluginsApi.list(); }
  finally { loadingInstalled.value = false; }
}

// Best-effort — one unreachable/misconfigured repository shouldn't block the installed list
// itself from rendering, only silently skip the "Update available" badges.
const browseByPluginId = ref<Map<string, BrowsePlugin>>(new Map());
async function loadUpdateInfo() {
  try {
    const rows = await pluginsApi.browse();
    browseByPluginId.value = new Map(rows.map((r) => [r.pluginId, r]));
  } catch { /* enhancement only — see comment above */ }
}

function updateFor(p: InstalledPlugin): BrowsePlugin | null {
  const b = browseByPluginId.value.get(p.pluginId);
  return b?.updateAvailable ? b : null;
}

async function applyUpdate(p: InstalledPlugin, entry: BrowsePlugin) {
  if (!entry.latestCompatibleVersion) return;
  uploading.value = true;
  let outcome;
  try {
    // replace=true straight away — clicking "Update" on an already-known newer, already-compatible
    // version (computed moments ago by loadUpdateInfo/PluginBrowseService) IS the confirmation;
    // re-showing the generic upgrade-confirm dialog for what the badge already told the admin
    // would be redundant. See below for the (rare) case this assumption doesn't hold.
    outcome = await pluginsApi.installFromRepository(entry.repositorySourceId, p.pluginId, entry.latestCompatibleVersion, true);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Update failed', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
    return;
  } finally {
    uploading.value = false;
  }
  if (outcome.kind === 'installed') {
    installed.value = [...installed.value.filter((x) => x.pluginId !== outcome.plugin.pluginId), outcome.plugin];
    loadDynamicIcons();
    toast.add({ severity: 'success', summary: 'Plugin updated', detail: outcome.plugin.displayName, life: 4000 });
    loadUpdateInfo();
    return;
  }
  // A version/dependency conflict here would be a rare race (someone else just installed the
  // same update, or its dependency changed) — rather than duplicating
  // PluginMarketplaceModal's own confirm-modal dance for this one-click shortcut, point the
  // admin at it, where the full flow (including "reinstall anyway") already lives.
  toast.add({
    severity: 'warn', summary: 'Could not update automatically',
    detail: 'Open "Browse plugins" to finish this update.', life: 6000,
  });
}

function onInstalledFromMarketplace(plugin: InstalledPlugin) {
  installed.value = [...installed.value.filter((x) => x.pluginId !== plugin.pluginId), plugin];
  loadUpdateInfo();
}

function pickFile() { fileInputRef.value?.click(); }

// ── Same-version info modal ──────────────────────────────────────────────
const showVersionInfo = ref(false);
const versionInfoMessage = ref('');

// ── Missing-dependency info modal ─────────────────────────────────────────
const showDependencyMissing = ref(false);
const dependencyConflict = ref<PluginDependencyConflict | null>(null);

/** Confirm wording for an upgrade/downgrade conflict. Resolves to whether the caller should
 *  retry with replace=true. */
async function confirmVersionChange(name: string, c: PluginVersionConflict): Promise<boolean> {
  const isUpgrade = c.conflict === 'upgrade';
  return confirmDialog({
    header: isUpgrade ? 'Upgrade plugin' : 'Downgrade plugin',
    message: isUpgrade
      ? `"${name}" is already installed at version ${c.installedVersion}. Upgrade it to version ${c.newVersion}?`
      : `"${name}" is already installed at version ${c.installedVersion}, which is NEWER than version ${c.newVersion}. Downgrade it anyway?`,
    acceptLabel: isUpgrade ? 'Upgrade' : 'Downgrade',
    acceptSeverity: isUpgrade ? 'success' : 'warn',
    acceptIcon: 'pi pi-refresh',
  });
}

async function onFileChosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await attemptUpload(file, false);
  if (fileInputRef.value) fileInputRef.value.value = '';
}

async function attemptUpload(file: File, replace: boolean) {
  uploading.value = true;
  let outcome;
  try {
    outcome = await pluginsApi.upload(file, replace);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Install failed', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
    return;
  } finally {
    uploading.value = false;
  }

  if (outcome.kind === 'installed') {
    installed.value = [...installed.value.filter((p) => p.pluginId !== outcome.plugin.pluginId), outcome.plugin];
    loadDynamicIcons();
    toast.add({ severity: 'success', summary: 'Plugin installed', detail: outcome.plugin.displayName, life: 4000 });
    return;
  }

  if (outcome.kind === 'missingDependency') {
    dependencyConflict.value = outcome.conflict;
    showDependencyMissing.value = true;
    return;
  }

  const c = outcome.conflict;
  if (c.conflict === 'same') {
    versionInfoMessage.value = `"${file.name}" is already installed at version ${c.installedVersion} — nothing to do.`;
    showVersionInfo.value = true;
    return;
  }
  if (await confirmVersionChange(file.name, c)) {
    await attemptUpload(file, true);
  }
}

async function toggleEnabled(p: InstalledPlugin) {
  try {
    const updated = await pluginsApi.setEnabled(p.id, !p.enabled);
    const idx = installed.value.findIndex((x) => x.id === p.id);
    if (idx !== -1) installed.value[idx] = updated;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.detail ?? e.message, life: 4000 });
  }
}

async function uninstall(p: InstalledPlugin) {
  const ok = await confirmDialog({
    header: 'Uninstall plugin',
    message: `Uninstall "${p.displayName}"? This removes it immediately — no restart needed.`,
  });
  if (!ok) return;
  try {
    await pluginsApi.uninstall(p.id);
    installed.value = installed.value.filter((x) => x.id !== p.id);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Uninstall failed', detail: e?.response?.data?.detail ?? e.message, life: 4000 });
  }
}

onMounted(() => { loadInstalled(); loadUpdateInfo(); });
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Plugins</h2>
        <p class="ares-page-subtitle">
          Plugins package integrations/importers as separate JARs — useful for anything whose API
          docs are private and can't be published in the main repo. Install, enable/disable, and
          uninstall all take effect immediately — no restart needed.
        </p>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <Button icon="pi pi-compass" text severity="secondary" v-tooltip.top="'Browse plugins'" @click="showMarketplace = true" />
        <Button icon="pi pi-upload" text severity="secondary" :loading="uploading" v-tooltip.top="'Upload plugin JAR'" @click="pickFile" />
        <input ref="fileInputRef" type="file" accept=".jar" style="display:none;" @change="onFileChosen" />
      </div>
    </div>

    <div v-if="loadingInstalled" class="ares-table-empty">Loading…</div>
    <template v-else-if="!installed.length">
      <div class="ares-card" style="text-align:center; padding:3rem; color:var(--ares-text-muted);">
        <i class="pi pi-box" style="font-size:2rem; opacity:0.4; display:block; margin-bottom:0.75rem;" />
        No plugins installed yet.
      </div>
    </template>
    <template v-else>
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <div v-for="p in installed" :key="p.id" class="plugin-card" :style="p.enabled ? {} : { opacity: '0.6' }">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
            <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
              <img v-if="iconFor(p)" :src="iconFor(p)!" alt="" class="plugin-icon" />
              <i v-else class="pi pi-box plugin-icon-fallback" />
              <div style="min-width:0;">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <span style="font-weight:700;">{{ p.displayName }}</span>
                  <span style="font-size:0.75rem; color:var(--ares-text-muted);">v{{ p.version }}</span>
                  <AresBadge v-if="maturityOf(p.version)" :value="maturityOf(p.version)!.label" :severity="maturityOf(p.version)!.severity" />
                  <AresBadge v-if="p.source === 'marketplace'" value="Verified" severity="success" />
                  <AresBadge v-else value="Custom" severity="secondary" />
                  <AresBadge v-if="updateFor(p)" value="Update available" severity="warn" />
                </div>
                <div style="font-size:0.78rem; color:var(--ares-text-muted); margin-top:0.15rem;">
                  {{ p.vendor || 'Unknown vendor' }}<span v-if="p.license"> · {{ p.license }}</span>
                  <span> · type: {{ p.pluginId }}</span>
                </div>
                <div v-if="p.description" style="font-size:0.8rem; margin-top:0.35rem;">{{ p.description }}</div>
              </div>
            </div>
            <div style="display:flex; gap:0.4rem; flex-shrink:0;">
              <Button
                v-if="updateFor(p)"
                label="Update" icon="pi pi-arrow-circle-up" size="small" severity="warn"
                :loading="uploading" @click="applyUpdate(p, updateFor(p)!)"
              />
              <Button
                :icon="p.enabled ? 'pi pi-pause' : 'pi pi-play'"
                text size="small" :severity="p.enabled ? 'warn' : 'secondary'"
                :title="p.enabled ? 'Disable' : 'Enable'"
                @click="toggleEnabled(p)"
              />
              <Button icon="pi pi-trash" text size="small" severity="danger" title="Uninstall" @click="uninstall(p)" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <PluginMarketplaceModal v-model:visible="showMarketplace" @installed="onInstalledFromMarketplace" />

    <!-- ── "Already installed at this version" info modal ──────────────── -->
    <Dialog v-model:visible="showVersionInfo" header="Already installed" modal style="width:26rem;">
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <p style="margin:0;">{{ versionInfoMessage }}</p>
        <div style="display:flex; justify-content:flex-end;">
          <Button label="OK" size="small" @click="showVersionInfo = false" />
        </div>
      </div>
    </Dialog>

    <!-- ── "Missing dependency" info modal ──────────────────────────────── -->
    <Dialog v-model:visible="showDependencyMissing" header="Can't install — missing dependency" modal style="width:28rem;">
      <div v-if="dependencyConflict" style="display:flex; flex-direction:column; gap:1rem;">
        <p style="margin:0;">{{ dependencyConflict.detail }}</p>
        <p style="margin:0; font-size:0.85rem; color:var(--ares-text-muted);">
          <template v-if="dependencyConflict.dependencyDisabled">
            Enable "{{ dependencyConflict.dependencyId }}" below, then try installing "{{ dependencyConflict.pluginId }}" again.
          </template>
          <template v-else>
            Install "{{ dependencyConflict.dependencyId }}" first, then try installing "{{ dependencyConflict.pluginId }}" again.
          </template>
        </p>
        <div style="display:flex; justify-content:flex-end;">
          <Button label="OK" size="small" @click="showDependencyMissing = false" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.plugin-card {
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 1rem 1.25rem;
}
.plugin-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: var(--ares-radius);
}
.plugin-icon-fallback {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: var(--ares-text-muted);
  opacity: 0.6;
}
</style>
