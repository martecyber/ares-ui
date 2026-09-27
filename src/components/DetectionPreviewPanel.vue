<script setup lang="ts">
// Extracted from ProjectResearchBoardView's side panel so the same rich detection rendering
// (tabbed Info/Description/References/Raw data) is available wherever a detection needs to be
// previewed read-only — originally just the board workspace, now also the escalation wizard's
// affection-edit step when escalating directly from Detections (see EscalationWizard.vue).
import { computed, ref, watch } from 'vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import type { Detection } from '@/api/detections';
import { detectionStatusLabel, detectionStatusSeverity } from '@/api/detections';
import MarkdownView from '@/components/MarkdownView.vue';
import JsonViewer from '@/components/JsonViewer.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import AresBadge from '@/components/AresBadge.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import ReferencesBlock from '@/components/ReferencesBlock.vue';

const props = defineProps<{ detection: Detection }>();

const detailTab = ref('info');
watch(() => props.detection.id, () => { detailTab.value = 'info'; });

const parsedRaw = computed(() => {
  if (!props.detection.rawData) return null;
  try { return JSON.stringify(JSON.parse(props.detection.rawData), null, 2); }
  catch { return props.detection.rawData; }
});
const rawDataObj = computed<unknown>(() => {
  if (!props.detection.rawData) return null;
  try { return JSON.parse(props.detection.rawData); } catch { return null; }
});
</script>

<template>
  <div class="dpp-detail">
    <div class="dpp-detail-header">
      <SourceBadge v-if="detection.sourceType" :source="detection.sourceType" />
      <span class="dpp-detail-title">{{ detection.title }}</span>
    </div>
    <div class="dpp-detail-meta">
      <SeverityTag :level="detection.severity" scale="priority" />
      <AresBadge :value="detectionStatusLabel(detection.status)" :severity="detectionStatusSeverity(detection.status) as any" />
    </div>

    <Tabs v-model:value="detailTab" class="dpp-tabs">
      <TabList>
        <Tab value="info">Info</Tab>
        <Tab value="description">Description</Tab>
        <Tab value="references">References<span v-if="detection.references?.length" class="dpp-tab-count">{{ detection.references.length }}</span></Tab>
        <Tab value="raw">Raw data</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="info">
          <dl class="dpp-info-dl">
            <dt>Asset</dt>
            <dd>{{ detection.assetIdentifier ?? '—' }}</dd>
            <dt>Occurrences</dt>
            <dd>{{ detection.occurrenceCount }}</dd>
            <dt>Last seen</dt>
            <dd>{{ detection.lastSeen ? new Date(detection.lastSeen).toLocaleString() : '—' }}</dd>
            <dt>First seen</dt>
            <dd>{{ detection.createdAt ? new Date(detection.createdAt).toLocaleString() : '—' }}</dd>
            <dt>Source</dt>
            <dd>{{ detection.sourceType ?? '—' }}</dd>
            <dt v-if="detection.sourceTemplateId">Template ID</dt>
            <dd v-if="detection.sourceTemplateId">{{ detection.sourceTemplateId }}</dd>
          </dl>
        </TabPanel>
        <TabPanel value="description">
          <MarkdownView v-if="detection.description" :source="detection.description" />
          <p v-else class="dpp-tab-empty">No description.</p>
        </TabPanel>
        <TabPanel value="references">
          <ReferencesBlock v-if="detection.references?.length" :references="detection.references" />
          <p v-else class="dpp-tab-empty">No references.</p>
        </TabPanel>
        <TabPanel value="raw">
          <JsonViewer v-if="parsedRaw" :value="rawDataObj" :raw-text="parsedRaw" mode="tree" />
          <p v-else class="dpp-tab-empty">No raw data.</p>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.dpp-detail { flex: 1; min-height: 0; overflow-y: auto; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.55rem; }
.dpp-detail-header { display: flex; align-items: center; gap: 0.5rem; }
.dpp-detail-title { font-size: 0.95rem; font-weight: 600; }
.dpp-detail-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.dpp-tabs { margin-top: 0.25rem; }
.dpp-tab-count {
  margin-left: 0.3rem;
  font-size: 0.65rem;
  color: var(--ares-text-muted);
}
.dpp-tab-empty { font-size: 0.8rem; color: var(--ares-text-muted); padding: 0.5rem 0; }

.dpp-info-dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 0; font-size: 0.82rem; }
.dpp-info-dl dt { color: var(--ares-text-muted); }
.dpp-info-dl dd { margin: 0; color: var(--ares-text-1); word-break: break-word; }
</style>
