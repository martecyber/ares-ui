<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import KbSsvcMethodologiesView from './other/KbSsvcMethodologiesView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'ssvc'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="ssvc">SSVC</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="ssvc"><KbSsvcMethodologiesView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
