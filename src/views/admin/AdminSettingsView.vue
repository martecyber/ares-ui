<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ProjectTypesView from '@/views/ProjectTypesView.vue';
import FindingFieldTypesAdminView from '@/views/FindingFieldTypesAdminView.vue';
import ReportFieldTypesAdminView from '@/views/ReportFieldTypesAdminView.vue';
import HolidayCalendarsView from '@/views/HolidayCalendarsView.vue';
import AdminConfigView from '@/views/AdminConfigView.vue';
import ThirdPartyEntriesView from '@/views/ThirdPartyEntriesView.vue';
import AdminPluginsView from '@/views/admin/AdminPluginsView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'project-types'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="project-types">Project Types</Tab>
        <Tab value="finding-field-types">Finding Field Types</Tab>
        <Tab value="report-field-types">Report Field Types</Tab>
        <Tab value="holiday-calendars">Holiday Calendars</Tab>
        <Tab value="platform-configuration">Platform Configuration</Tab>
        <Tab value="third-party">Third-Party Entries</Tab>
        <Tab value="plugins">Plugins</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="project-types"><ProjectTypesView /></TabPanel>
        <TabPanel value="finding-field-types"><FindingFieldTypesAdminView /></TabPanel>
        <TabPanel value="report-field-types"><ReportFieldTypesAdminView /></TabPanel>
        <TabPanel value="holiday-calendars"><HolidayCalendarsView /></TabPanel>
        <TabPanel value="platform-configuration"><AdminConfigView /></TabPanel>
        <TabPanel value="third-party"><ThirdPartyEntriesView /></TabPanel>
        <TabPanel value="plugins"><AdminPluginsView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
