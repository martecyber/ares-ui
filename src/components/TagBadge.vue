<script setup lang="ts">
import { computed } from 'vue';
import { contrastTextColor } from '@/utils/color';

const props = defineProps<{
  name: string;
  color: string;
  /** Shows a small "×" button and emits `remove` when clicked. */
  removable?: boolean;
}>();

defineEmits<{ remove: [] }>();

const textColor = computed(() => contrastTextColor(props.color));
</script>

<template>
  <span class="tag-badge" :style="{ background: color, color: textColor }">
    {{ name }}
    <button v-if="removable" type="button" class="tag-badge-x" :style="{ color: textColor }" @click="$emit('remove')">×</button>
  </span>
</template>

<style scoped>
.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--ares-radius);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.tag-badge-x {
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.7;
  font-size: 0.95rem;
  line-height: 1;
  padding: 0;
}
.tag-badge-x:hover { opacity: 1; }
</style>
