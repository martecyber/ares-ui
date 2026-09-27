<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import KbCveView from './external-databases/KbCveView.vue';
import KbCweView from './external-databases/KbCweView.vue';
import KbCapecView from './external-databases/KbCapecView.vue';
import KbAttackView from './external-databases/KbAttackView.vue';
import KbOwaspView from './external-databases/KbOwaspView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'cve'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="cve">CVE</Tab>
        <Tab value="cwe">CWE</Tab>
        <Tab value="capec">CAPEC</Tab>
        <Tab value="attack">ATT&CK</Tab>
        <Tab value="owasp">OWASP</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="cve"><KbCveView /></TabPanel>
        <TabPanel value="cwe"><KbCweView /></TabPanel>
        <TabPanel value="capec"><KbCapecView /></TabPanel>
        <TabPanel value="attack"><KbAttackView /></TabPanel>
        <TabPanel value="owasp"><KbOwaspView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
