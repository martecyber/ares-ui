<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import ProgressSpinner from 'primevue/progressspinner';
import AresBadge from '@/components/AresBadge.vue';
import { useToast } from 'primevue/usetoast';
import { confirmDialog } from '@/composables/useConfirmDialog';
import {
  pluginsApi, type BrowsePlugin, type BrowsePluginVersion,
  type InstallOutcome, type PluginVersionConflict, type PluginDependencyConflict, type InstalledPlugin,
} from '@/api/plugins';
import { pluginRepositoriesApi, type PluginRepositorySourceRow } from '@/api/plugin-repositories';
import { loadDynamicIcons } from '@/utils/tool-icons';
import { compareVersions } from '@/utils/pluginVersions';

const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ installed: [plugin: InstalledPlugin] }>();

const toast = useToast();
const activeTab = ref('browse');

// ── Browse ────────────────────────────────────────────────────────────────
const browseList = ref<BrowsePlugin[]>([]);
const loadingBrowse = ref(false);
const search = ref('');

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return browseList.value;
  return browseList.value.filter((p) =>
    p.displayName.toLowerCase().includes(q) || p.pluginId.toLowerCase().includes(q) || (p.vendor ?? '').toLowerCase().includes(q));
});

async function loadBrowse() {
  loadingBrowse.value = true;
  try { browseList.value = await pluginsApi.browse(); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Could not load plugins', detail: e?.response?.data?.detail ?? e.message, life: 5000 }); }
  finally { loadingBrowse.value = false; }
}

function statusOf(p: BrowsePlugin): { label: string; severity: 'success' | 'info' | 'secondary' | 'warn' } {
  if (!p.installedVersion) return { label: 'Not installed', severity: 'secondary' };
  if (p.updateAvailable) return { label: 'Update available', severity: 'warn' };
  return { label: 'Installed', severity: 'success' };
}

// ── Selection + preview panel ───────────────────────────────────────────────
const selectedPlugin = ref<BrowsePlugin | null>(null);
const selectedVersion = ref<string | null>(null);
const versionsByPlugin = ref<Map<string, BrowsePluginVersion[]>>(new Map());
const loadingVersions = ref(false);

const selectedVersions = computed(() =>
  selectedPlugin.value ? versionsByPlugin.value.get(selectedPlugin.value.pluginId) ?? [] : []);

const versionOptions = computed(() => selectedVersions.value.map((v) => ({
  label: `v${v.version}` + (v.yanked ? ' (yanked)' : !v.compatible ? ' (incompatible)' : ''),
  value: v.version,
  disabled: !v.compatible,
})));

/** Label/disabled state for the header's Install button — mirrors what the backend will actually
 *  decide (see PluginService#install's own same/upgrade/downgrade conflict check) so the button
 *  never claims something the confirm dialog then contradicts. Disabled outright for the
 *  already-installed version — nothing useful to redo, unlike an up/downgrade. */
const installButtonState = computed(() => {
  const p = selectedPlugin.value;
  const v = selectedVersion.value;
  if (!p || !v) return { label: 'Install', disabled: true };
  if (!p.installedVersion) return { label: 'Install', disabled: false };
  const cmp = compareVersions(v, p.installedVersion);
  if (cmp === 0) return { label: 'Installed', disabled: true };
  return cmp > 0 ? { label: 'Upgrade', disabled: false } : { label: 'Downgrade', disabled: false };
});

async function selectPlugin(p: BrowsePlugin) {
  selectedPlugin.value = p;
  selectedVersion.value = p.latestCompatibleVersion;
  if (versionsByPlugin.value.has(p.pluginId)) return;
  loadingVersions.value = true;
  try {
    const versions = await pluginsApi.browseVersions(p.pluginId, p.repositorySourceId);
    versionsByPlugin.value = new Map(versionsByPlugin.value).set(p.pluginId, versions);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Could not load versions', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    loadingVersions.value = false;
  }
}

// ── Install / update (with the same version/dependency conflict dance
// AdminPluginsView.vue's own upload flow uses) ───────────────────────────
const installing = ref<string | null>(null); // pluginId currently installing, for a per-row spinner

const showVersionInfo = ref(false);
const versionInfoMessage = ref('');
const showDependencyMissing = ref(false);
const dependencyConflict = ref<PluginDependencyConflict | null>(null);

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

async function install(p: BrowsePlugin, version: string, displayName: string, replace = false) {
  installing.value = p.pluginId;
  let outcome: InstallOutcome;
  try {
    outcome = await pluginsApi.installFromRepository(p.repositorySourceId, p.pluginId, version, replace);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Install failed', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
    installing.value = null;
    return;
  }
  installing.value = null;

  if (outcome.kind === 'installed') {
    emit('installed', outcome.plugin);
    loadDynamicIcons();
    toast.add({ severity: 'success', summary: 'Plugin installed', detail: outcome.plugin.displayName, life: 4000 });
    await loadBrowse();
    // The reload above replaces browseList with fresh objects — repoint the selection (if this
    // plugin is the one currently shown in the preview panel) so its installedVersion/
    // updateAvailable badges update instead of staying frozen on the pre-install snapshot.
    if (selectedPlugin.value?.pluginId === p.pluginId) {
      selectedPlugin.value = browseList.value.find((x) => x.pluginId === p.pluginId) ?? null;
    }
    return;
  }
  if (outcome.kind === 'missingDependency') {
    dependencyConflict.value = outcome.conflict;
    showDependencyMissing.value = true;
    return;
  }
  const c = outcome.conflict;
  if (c.conflict === 'same') {
    versionInfoMessage.value = `"${displayName}" is already installed at version ${c.installedVersion} — nothing to do.`;
    showVersionInfo.value = true;
    return;
  }
  if (await confirmVersionChange(displayName, c)) {
    await install(p, version, displayName, true);
  }
}

function installLatest(p: BrowsePlugin) {
  if (!p.latestCompatibleVersion) return;
  install(p, p.latestCompatibleVersion, p.displayName);
}

function installSelected() {
  if (!selectedPlugin.value || !selectedVersion.value) return;
  install(selectedPlugin.value, selectedVersion.value, selectedPlugin.value.displayName);
}

// ── Repositories ─────────────────────────────────────────────────────────
const repos = ref<PluginRepositorySourceRow[]>([]);
const loadingRepos = ref(false);
const addingRepo = ref(false);
const newRepoName = ref('');
const newRepoUrl = ref('');

async function loadRepos() {
  loadingRepos.value = true;
  try { repos.value = await pluginRepositoriesApi.list(); }
  finally { loadingRepos.value = false; }
}

async function addRepo() {
  if (!newRepoUrl.value.trim()) return;
  addingRepo.value = true;
  try {
    const added = await pluginRepositoriesApi.add(newRepoName.value.trim() || null, newRepoUrl.value.trim());
    repos.value = [...repos.value, added];
    newRepoName.value = '';
    newRepoUrl.value = '';
    toast.add({ severity: 'success', summary: 'Repository added', detail: added.name, life: 3000 });
    await loadBrowse();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Could not add repository', detail: e?.response?.data?.detail ?? e.message, life: 6000 });
  } finally {
    addingRepo.value = false;
  }
}

async function toggleRepoEnabled(r: PluginRepositorySourceRow) {
  const updated = await pluginRepositoriesApi.setEnabled(r.id, !r.enabled);
  const idx = repos.value.findIndex((x) => x.id === r.id);
  if (idx !== -1) repos.value[idx] = updated;
  await loadBrowse();
}

async function removeRepo(r: PluginRepositorySourceRow) {
  const ok = await confirmDialog({
    header: 'Remove repository',
    message: `Remove "${r.name}"? Plugins already installed from it are unaffected — this only stops it being browsable.`,
  });
  if (!ok) return;
  try {
    await pluginRepositoriesApi.remove(r.id);
    repos.value = repos.value.filter((x) => x.id !== r.id);
    await loadBrowse();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Could not remove repository', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  }
}

watch(visible, (v) => {
  if (!v) return;
  activeTab.value = 'browse';
  search.value = '';
  selectedPlugin.value = null;
  selectedVersion.value = null;
  loadBrowse();
  loadRepos();
});
</script>

<template>
  <Dialog v-model:visible="visible" header="Browse plugins" modal style="width:64rem; max-width:95vw;">
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="browse">Browse</Tab>
        <Tab value="repositories">Repositories</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="browse">
          <InputText v-model="search" placeholder="Search plugins…" class="w-full" style="margin-bottom:0.85rem;" />

          <div v-if="loadingBrowse" class="ares-table-empty"><ProgressSpinner style="width:32px;height:32px;" /></div>
          <div v-else-if="!filtered.length" class="ares-table-empty" style="color:var(--ares-text-muted);">
            {{ browseList.length ? 'No plugins match your search.' : 'No repositories are enabled, or none carry any plugins yet.' }}
          </div>
          <div v-else class="browse-layout">
            <div class="browse-list">
              <div
                v-for="p in filtered" :key="p.pluginId + p.repositorySourceId"
                class="browse-row" :class="{ 'browse-row--active': selectedPlugin?.pluginId === p.pluginId }"
                @click="selectPlugin(p)"
              >
                <img v-if="p.icon" :src="p.icon" alt="" class="browse-icon" />
                <i v-else class="pi pi-box browse-icon-fallback" />
                <div style="flex:1; min-width:0;">
                  <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                    <span style="font-weight:700; font-size:0.88rem;">{{ p.displayName }}</span>
                    <AresBadge :value="statusOf(p).label" :severity="statusOf(p).severity" />
                  </div>
                  <div style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.1rem;">
                    {{ p.vendor || 'Unknown vendor' }}
                  </div>
                </div>
                <Button
                  v-if="p.updateAvailable" label="Update" size="small" severity="warn"
                  :loading="installing === p.pluginId" @click.stop="installLatest(p)"
                />
                <Button
                  v-else-if="!p.installedVersion" label="Install" size="small"
                  :disabled="!p.installable" :loading="installing === p.pluginId" @click.stop="installLatest(p)"
                />
              </div>
            </div>

            <div class="browse-detail">
              <div v-if="!selectedPlugin" class="ares-table-empty" style="color:var(--ares-text-muted); height:100%;">
                Select a plugin to see its details.
              </div>
              <template v-else>
                <div class="browse-detail-header">
                  <div style="display:flex; align-items:center; gap:0.85rem; flex:1; min-width:0;">
                    <img v-if="selectedPlugin.icon" :src="selectedPlugin.icon" alt="" class="browse-detail-icon" />
                    <i v-else class="pi pi-box browse-icon-fallback" style="width:48px; height:48px; font-size:1.6rem;" />
                    <div style="min-width:0;">
                      <div style="font-weight:700; font-size:1.1rem;">{{ selectedPlugin.displayName }}</div>
                      <div style="font-size:0.8rem; color:var(--ares-text-muted);">
                        {{ selectedPlugin.vendor || 'Unknown vendor' }} · {{ selectedPlugin.repositoryName }}
                      </div>
                    </div>
                  </div>

                  <div class="browse-detail-install">
                    <Select
                      v-model="selectedVersion"
                      :options="versionOptions"
                      option-label="label" option-value="value" option-disabled="disabled"
                      :loading="loadingVersions"
                      placeholder="Select a version…"
                      style="min-width:11rem;"
                    />
                    <Button
                      :label="installButtonState.label" icon="pi pi-download"
                      :disabled="installButtonState.disabled" :loading="installing === selectedPlugin.pluginId"
                      @click="installSelected"
                    />
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.75rem; flex-wrap:wrap;">
                  <AresBadge :value="statusOf(selectedPlugin).label" :severity="statusOf(selectedPlugin).severity" />
                  <AresBadge v-if="!selectedPlugin.installable" value="Incompatible" severity="danger" />
                  <span v-if="selectedPlugin.installedVersion" style="font-size:0.78rem; color:var(--ares-text-muted);">
                    installed v{{ selectedPlugin.installedVersion }}
                  </span>
                </div>

                <p class="browse-detail-description">
                  {{ selectedPlugin.description || 'No description provided.' }}
                </p>
              </template>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="repositories">
          <div v-if="loadingRepos" class="ares-table-empty"><ProgressSpinner style="width:32px;height:32px;" /></div>
          <div v-else style="display:flex; flex-direction:column; gap:0.6rem; margin-bottom:1rem;">
            <div v-for="r in repos" :key="r.id" class="repo-row">
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <span style="font-weight:600;">{{ r.name }}</span>
                  <AresBadge v-if="r.official" value="Official" severity="info" />
                  <AresBadge v-if="!r.enabled" value="Disabled" severity="secondary" />
                </div>
                <div style="font-size:0.75rem; color:var(--ares-text-muted); word-break:break-all;">{{ r.baseUrl }}</div>
              </div>
              <Button
                :icon="r.enabled ? 'pi pi-pause' : 'pi pi-play'" text size="small" :severity="r.enabled ? 'warn' : 'secondary'"
                :title="r.enabled ? 'Disable' : 'Enable'" @click="toggleRepoEnabled(r)"
              />
              <Button v-if="!r.official" icon="pi pi-trash" text size="small" severity="danger" title="Remove" @click="removeRepo(r)" />
            </div>
          </div>

          <div class="add-repo-form">
            <div style="font-size:0.78rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.5rem;">Add repository</div>
            <div style="display:flex; gap:0.5rem;">
              <InputText v-model="newRepoName" placeholder="Name (optional)" style="flex:0 0 40%;" size="small" />
              <InputText v-model="newRepoUrl" placeholder="https://…" style="flex:1;" size="small" @keyup.enter="addRepo" />
              <Button label="Add" size="small" :loading="addingRepo" :disabled="!newRepoUrl.trim()" @click="addRepo" />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

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
        <div style="display:flex; justify-content:flex-end;">
          <Button label="OK" size="small" @click="showDependencyMissing = false" />
        </div>
      </div>
    </Dialog>
  </Dialog>
</template>

<style scoped>
.browse-layout {
  display: flex;
  gap: 1rem;
  height: 60vh;
  max-height: 32rem;
}
.browse-list {
  flex: 0 0 40%;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-right: 0.25rem;
}
.browse-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s;
}
.browse-row:hover { border-color: var(--ares-accent-muted); }
.browse-row--active {
  border-color: var(--ares-accent-muted);
  background: color-mix(in srgb, var(--ares-accent-bg) 6%, var(--ares-surface-raised));
}
.browse-icon, .browse-icon-fallback {
  width: 30px; height: 30px; flex-shrink: 0; object-fit: contain; border-radius: var(--ares-radius);
}
.browse-icon-fallback {
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; color: var(--ares-text-muted); opacity: 0.6;
}
.browse-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0 0.25rem;
}
.browse-detail-icon {
  width: 48px; height: 48px; flex-shrink: 0; object-fit: contain; border-radius: var(--ares-radius);
}
.browse-detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.browse-detail-description {
  font-size: 0.85rem;
  color: var(--ares-text-2);
  line-height: 1.5;
  margin: 0.85rem 0;
  white-space: pre-line;
}
.browse-detail-install {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.repo-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.65rem 0.85rem; border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
}
.add-repo-form {
  padding: 0.85rem; border: 1px dashed var(--ares-border); border-radius: var(--ares-radius);
}
</style>
