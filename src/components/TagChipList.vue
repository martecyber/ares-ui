<script setup lang="ts">
import { computed } from 'vue';
import TagBadge from '@/components/TagBadge.vue';
import type { Tag } from '@/api/tags';

const props = withDefaults(defineProps<{
  tags: Tag[] | undefined;
  limit?: number;
}>(), {
  limit: 3,
});

const shown = computed(() => (props.tags ?? []).slice(0, props.limit));
const overflow = computed(() => Math.max(0, (props.tags?.length ?? 0) - props.limit));
const overflowNames = computed(() => (props.tags ?? []).slice(props.limit).map((t) => t.name).join(', '));
</script>

<template>
  <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.25rem;">
    <TagBadge v-for="tag in shown" :key="tag.id" :name="tag.name" :color="tag.color" />
    <span v-if="overflow > 0" class="tag-overflow" :title="overflowNames">+{{ overflow }}</span>
    <span v-if="!tags?.length" style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
  </div>
</template>

<style scoped>
.tag-overflow {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  background: var(--ares-surface-sunken, rgba(0,0,0,0.12));
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 1px 7px;
  cursor: default;
}
</style>
