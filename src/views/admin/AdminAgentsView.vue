<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import AgentsView from '@/views/AgentsView.vue';
import AgentPoolsView from '@/views/AgentPoolsView.vue';
import AgentInstallerView from '@/views/AgentInstallerView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'agents'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="agents">Agents</Tab>
        <Tab value="agent-pools">Pools</Tab>
        <Tab value="agent-installer">Installer</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="agents"><AgentsView /></TabPanel>
        <TabPanel value="agent-pools"><AgentPoolsView /></TabPanel>
        <TabPanel value="agent-installer"><AgentInstallerView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
