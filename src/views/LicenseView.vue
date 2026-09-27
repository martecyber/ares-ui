<script setup lang="ts">
import { computed, ref } from 'vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Button from 'primevue/button';
import Message from 'primevue/message';
import AresBadge from '@/components/AresBadge.vue';
import { licenseApi, type LicenseInfo } from '@/api/license';
import { versionsApi, type Versions } from '@/api/versions';

const info = ref<LicenseInfo | null>(null);
const loadError = ref(false);
licenseApi.info().then((v) => { info.value = v; }).catch(() => { loadError.value = true; });

const versions = ref<Versions | null>(null);
versionsApi.get().then((v) => { versions.value = v; }).catch(() => { /* version display is best-effort */ });

const fullText = ref('');
const loadingText = ref(false);
const textError = ref(false);
const showText = ref(false);

async function toggleFullText() {
  showText.value = !showText.value;
  if (showText.value && !fullText.value && !loadingText.value) {
    loadingText.value = true;
    try { fullText.value = await licenseApi.text(); }
    catch { textError.value = true; }
    finally { loadingText.value = false; }
  }
}

interface ComponentTab { key: string; name: string; description: string; sourceUrl: string; version: string | null; }
const components = computed<ComponentTab[]>(() => !info.value ? [] : [
  { key: 'core', name: 'ares-core', description: 'Backend REST API', sourceUrl: info.value.sourceUrlCore, version: versions.value?.api ?? null },
  { key: 'ui', name: 'ares-ui', description: 'Web UI', sourceUrl: info.value.sourceUrlUi, version: versions.value?.ui ?? null },
  { key: 'agent', name: 'ares-agent', description: 'Agent that runs scans on enrolled machines', sourceUrl: info.value.sourceUrlAgent, version: versions.value?.agent ?? null },
  { key: 'cli', name: 'ares-cli', description: 'Command-line interface', sourceUrl: info.value.sourceUrlCli, version: versions.value?.cli ?? null },
]);
const activeTab = ref('core');
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">License</h2>
        <p class="ares-page-subtitle">Source and licensing information for each Ares ASM component.</p>
      </div>
    </div>

    <Message v-if="loadError" severity="error" :closable="false">Failed to load license information.</Message>

    <Tabs v-else-if="components.length" v-model:value="activeTab">
      <TabList>
        <Tab v-for="c in components" :key="c.key" :value="c.key">{{ c.name }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-for="c in components" :key="c.key" :value="c.key">
          <section class="ares-card license-card">
            <div class="ares-card-section-header">
              <span class="section-header-label">{{ c.name }}</span>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <AresBadge v-if="c.version" :value="`v${c.version}`" severity="secondary" />
                <AresBadge :value="info!.spdxId" severity="info" />
              </div>
            </div>

            <div class="license-body">
              <p class="license-component-desc">{{ c.description }}</p>
              <p class="license-copyright">Copyright © {{ info!.copyrightYear }} {{ info!.copyrightHolder }}</p>
              <p class="license-name">Licensed under the {{ info!.licenseName }}.</p>

              <div class="license-links">
                <a :href="c.sourceUrl" target="_blank" rel="noopener noreferrer" class="license-link">
                  <i class="pi pi-github" /> Source code
                </a>
                <a :href="info!.licenseUrl" target="_blank" rel="noopener noreferrer" class="license-link">
                  <i class="pi pi-external-link" /> License text (gnu.org)
                </a>
              </div>

              <Button
                :label="showText ? 'Hide full license text' : 'View full license text'"
                :icon="showText ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                severity="secondary" text size="small"
                @click="toggleFullText"
              />

              <pre v-if="showText" class="license-text">{{ loadingText ? 'Loading…' : (textError ? 'Failed to load license text.' : fullText) }}</pre>
            </div>
          </section>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.license-card { padding: 0; overflow: hidden; }
.license-body { padding: 1.25rem; }

.license-component-desc {
  margin: 0 0 0.9rem;
  font-size: 0.82rem;
  color: var(--ares-text-muted);
}
.license-copyright {
  margin: 0 0 0.3rem;
  font-size: 0.9rem;
  color: var(--ares-text);
  font-weight: 600;
}
.license-name {
  margin: 0 0 1.1rem;
  font-size: 0.85rem;
  color: var(--ares-text-2);
}

.license-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1.1rem;
}
.license-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  color: var(--ares-text-2);
  font-size: 0.82rem;
  text-decoration: none;
  transition: border-color 0.12s, color 0.12s;
}
.license-link:hover {
  border-color: var(--ares-accent);
  color: var(--ares-text);
}
.license-link i { font-size: 0.8rem; }

.license-text {
  margin-top: 1rem;
  max-height: 480px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--ares-text-2);
  background: var(--ares-surface-sunken);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.9rem;
}
</style>
