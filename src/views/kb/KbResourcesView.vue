<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import KbWordlistsView from './resources/KbWordlistsView.vue';
import KbExploitsView from './resources/KbExploitsView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'wordlists'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="wordlists">Wordlists</Tab>
        <Tab value="exploits">Exploits</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="wordlists"><KbWordlistsView /></TabPanel>
        <TabPanel value="exploits"><KbExploitsView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
