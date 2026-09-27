<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import ReportTemplatesView from '@/views/ReportTemplatesView.vue';
import KbEmailTemplatesView from './KbEmailTemplatesView.vue';

const kind = ref<'document' | 'email'>('document');
</script>

<template>
  <div>
    <div style="display:flex; gap:0.5rem; margin-bottom:1.25rem;">
      <Button label="Document" icon="pi pi-file-word" size="small"
        :severity="kind === 'document' ? undefined : 'secondary'"
        :outlined="kind !== 'document'" @click="kind = 'document'" />
      <Button label="Email" icon="pi pi-envelope" size="small"
        :severity="kind === 'email' ? undefined : 'secondary'"
        :outlined="kind !== 'email'" @click="kind = 'email'" />
    </div>

    <ReportTemplatesView v-if="kind === 'document'" />
    <KbEmailTemplatesView v-else />
  </div>
</template>
