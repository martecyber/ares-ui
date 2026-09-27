<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ToolIntegrationsView from '@/views/ToolIntegrationsView.vue';
import VdpIntegrationsView from '@/views/VdpIntegrationsView.vue';
import MessagingIntegrationsView from '@/views/MessagingIntegrationsView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'tool-integrations'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="tool-integrations">Data Sources</Tab>
        <Tab value="vdp-integrations">Bug Hunting Platforms</Tab>
        <Tab value="messaging-integrations">Notifications</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="tool-integrations"><ToolIntegrationsView /></TabPanel>
        <TabPanel value="vdp-integrations"><VdpIntegrationsView /></TabPanel>
        <TabPanel value="messaging-integrations"><MessagingIntegrationsView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
