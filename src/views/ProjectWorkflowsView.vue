<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import WorkflowsListPanel from '@/components/WorkflowsListPanel.vue';

const route = useRoute();
const orgId = computed(() => Number(route.params.orgId));
const engId = computed(() => Number(route.params.engId));
</script>

<template>
  <WorkflowsListPanel
    scope-kind="project" :scope-id="engId" :org-id="orgId" :eng-id="engId"
    title="Workflows"
    subtitle="Project-scoped trigger → condition → action automations — the only scope that can launch agent tasks."
  />
</template>
