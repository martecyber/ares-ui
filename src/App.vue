<script setup lang="ts">
import { RouterView } from 'vue-router';
import Toast from 'primevue/toast';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
</script>

<template>
  <RouterView />
  <Toast position="top-right" />
  <ConfirmDialog />
</template>
