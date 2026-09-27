<script setup lang="ts">
import WorkflowsListPanel from '@/components/WorkflowsListPanel.vue';
</script>

<template>
  <WorkflowsListPanel
    scope-kind="platform" :scope-id="0"
    title="Workflows"
    subtitle="Platform-wide trigger → condition → action automations."
  />
</template>
