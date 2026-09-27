<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <h1 class="text-5xl font-bold mb-2">404</h1>
      <p class="text-zinc-600 mb-4">The page you requested does not exist.</p>
      <RouterLink to="/" class="text-blue-600 underline">Back to home</RouterLink>
    </div>
  </div>
</template>
