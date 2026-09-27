<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import KbTestingGuidesView from './testing/KbTestingGuidesView.vue';
import KbTestingProceduresView from './testing/KbTestingProceduresView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'guides'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="guides">Testing Guides</Tab>
        <Tab value="procedures">Testing Procedures</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="guides"><KbTestingGuidesView /></TabPanel>
        <TabPanel value="procedures"><KbTestingProceduresView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
