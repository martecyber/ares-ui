<script setup lang="ts">
defineProps<{ page: number; totalPages: number; total: number }>();
defineEmits<{ prev: []; next: [] }>();
</script>

<template>
  <div v-if="totalPages > 0" class="app-pagination">
    <button class="ares-btn ares-btn-sm" :disabled="page === 0" @click="$emit('prev')">
      <i class="pi pi-chevron-left" />
    </button>
    <span class="app-pagination__info">
      Page {{ page + 1 }} / {{ totalPages }}
      <span class="app-pagination__total">({{ total }} total)</span>
    </span>
    <button class="ares-btn ares-btn-sm" :disabled="page >= totalPages - 1" @click="$emit('next')">
      <i class="pi pi-chevron-right" />
    </button>
  </div>
</template>

<style scoped>
.app-pagination {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.25rem;
  justify-content: center;
}
.app-pagination__info {
  font-size: 0.82rem;
  color: var(--ares-text-muted);
  min-width: 140px;
  text-align: center;
}
.app-pagination__total {
  opacity: 0.7;
}
</style>
