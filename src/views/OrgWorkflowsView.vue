<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import WorkflowsListPanel from '@/components/WorkflowsListPanel.vue';

const route = useRoute();
const orgId = computed(() => Number(route.params.orgId));
</script>

<template>
  <WorkflowsListPanel
    scope-kind="organization" :scope-id="orgId" :org-id="orgId"
    title="Workflows"
    subtitle="Organization-wide trigger → condition → action automations."
  />
</template>
