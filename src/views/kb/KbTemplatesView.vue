<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import KbFindingTemplatesView from './templates/KbFindingTemplatesView.vue';
import KbTaskTemplatesView from './templates/KbTaskTemplatesView.vue';
import KbWorkflowTemplatesView from './templates/KbWorkflowTemplatesView.vue';
import KbReportTemplatesView from './templates/KbReportTemplatesView.vue';
import KbDashboardTemplatesView from './templates/KbDashboardTemplatesView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'findings'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="findings">Findings</Tab>
        <Tab value="agent-tasks">Ares Agent Tasks</Tab>
        <Tab value="workflows">Workflows</Tab>
        <Tab value="reports">Reports</Tab>
        <Tab value="dashboards">Dashboards</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="findings"><KbFindingTemplatesView /></TabPanel>
        <TabPanel value="agent-tasks"><KbTaskTemplatesView /></TabPanel>
        <TabPanel value="workflows"><KbWorkflowTemplatesView /></TabPanel>
        <TabPanel value="reports"><KbReportTemplatesView /></TabPanel>
        <TabPanel value="dashboards"><KbDashboardTemplatesView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
