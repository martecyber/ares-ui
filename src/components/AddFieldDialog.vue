<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import type { FindingFieldType } from '@/api/finding-field-types';

const props = defineProps<{
  visible: boolean;
  fieldTypes: FindingFieldType[];
  existingTypeIds: number[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  add: [typeId: number];
}>();

const selectedTypeId = ref<number | null>(null);

const availableTypes = computed(() =>
  props.fieldTypes
    .filter((t) => !props.existingTypeIds.includes(t.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
);

watch(() => props.visible, (open) => {
  if (open) selectedTypeId.value = availableTypes.value[0]?.id ?? null;
});

function close() { emit('update:visible', false); }

function confirm() {
  if (!selectedTypeId.value) return;
  emit('add', selectedTypeId.value);
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)" modal header="Add field" style="width: 420px;">
    <div v-if="availableTypes.length" style="display:flex; flex-direction:column; gap:0.5rem;">
      <label style="font-size:0.8rem; color:var(--ares-text-muted);">Field type</label>
      <Select v-model="selectedTypeId" :options="availableTypes" option-label="title" option-value="id"
        placeholder="Select a field type" style="width:100%;" />
    </div>
    <p v-else style="margin:0; font-size:0.85rem; color:var(--ares-text-muted);">All available field types are already present here.</p>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button label="Add" :disabled="!selectedTypeId" @click="confirm" />
    </template>
  </Dialog>
</template>
