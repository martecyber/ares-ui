<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ClientsView from '@/views/ClientsView.vue';
import UsersView from '@/views/UsersView.vue';
import RolesView from '@/views/RolesView.vue';
import PermissionsView from '@/views/PermissionsView.vue';

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'organizations'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});
</script>

<template>
  <div>
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="organizations">Organizations</Tab>
        <Tab value="users">Users</Tab>
        <Tab value="roles">Roles</Tab>
        <Tab value="permissions">Permissions</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="organizations"><ClientsView /></TabPanel>
        <TabPanel value="users"><UsersView /></TabPanel>
        <TabPanel value="roles"><RolesView /></TabPanel>
        <TabPanel value="permissions"><PermissionsView /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
