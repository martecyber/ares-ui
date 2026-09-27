<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Select from 'primevue/select';
import { aqlApi, type AqlFieldInfo } from '@/api/aql';

const props = defineProps<{ modelValue: string | null; entityType: string }>();
const emit = defineEmits<{ 'update:modelValue': [string | null] }>();

// Only PHYSICAL_COLUMN/VIRTUAL/ARRAY_COLUMN fields resolve to a JPA Path the backend's
// projection query can SELECT — matches AqlQueryableEntityRegistry.queryProjected's own
// PostgresColumnField restriction (RELATION/JSONB_PATH/KB_MATERIALIZED aren't projectable).
const PROJECTABLE_KINDS = new Set(['PHYSICAL_COLUMN', 'VIRTUAL', 'ARRAY_COLUMN']);

const fields = ref<AqlFieldInfo[]>([]);

watch(() => props.entityType, async (t) => {
  if (!t) { fields.value = []; return; }
  try { fields.value = await aqlApi.fields(t); } catch { fields.value = []; }
}, { immediate: true });

const options = computed(() =>
  fields.value
    .filter((f) => PROJECTABLE_KINDS.has(f.kind))
    .map((f) => ({ label: `${f.name} : ${f.type.toLowerCase()}`, value: f.name }))
);
</script>

<template>
  <Select
    :model-value="modelValue"
    :options="options"
    option-label="label"
    option-value="value"
    placeholder="Select field…"
    class="w-full"
    filter
    @update:model-value="(v) => emit('update:modelValue', v)"
  />
</template>
