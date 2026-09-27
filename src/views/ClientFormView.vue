<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { organizationsApi } from '@/api/organizations';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';

const router = useRouter();
const name = ref('');
const slug = ref('');
const slugTouched = ref(false);
const saving = ref(false);
const err = ref<string | null>(null);

watch(name, (v) => {
  if (!slugTouched.value) {
    slug.value = v.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63);
  }
});

const canSave = computed(() => name.value.trim().length >= 2 && /^[a-z0-9][a-z0-9-]{1,62}$/.test(slug.value));

async function submit() {
  err.value = null;
  saving.value = true;
  try {
    const created = await organizationsApi.create({ name: name.value.trim(), slug: slug.value });
    router.replace({ name: 'organization-detail', params: { id: created.id } });
  } catch (e: unknown) {
    const ax = e as { response?: { status?: number; data?: { detail?: string } } };
    if (ax.response?.status === 409) err.value = 'An organization with that slug already exists.';
    else err.value = ax.response?.data?.detail ?? 'Failed to create organization.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h2 class="text-2xl font-semibold mb-1">New organization</h2>
    <p class="text-sm text-zinc-500 mb-6">Create a new organization.</p>

    <form @submit.prevent="submit" class="space-y-4 bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div>
        <label class="block text-sm mb-1" for="name">Name *</label>
        <InputText id="name" v-model="name" class="w-full" required maxlength="120" />
      </div>

      <div>
        <label class="block text-sm mb-1" for="slug">Slug *</label>
        <InputText id="slug" v-model="slug" class="w-full" required pattern="^[a-z0-9][a-z0-9-]{1,62}$" @input="slugTouched = true" />
        <p class="text-xs text-zinc-500 mt-1">URL-safe identifier (lowercase, hyphens). Auto-generated from name.</p>
      </div>

      <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>

      <div class="flex gap-2 justify-end pt-2">
        <Button type="button" label="Cancel" severity="secondary" @click="router.push({ name: 'organizations' })" />
        <Button type="submit" label="Create" :disabled="!canSave" :loading="saving" />
      </div>
    </form>
  </div>
</template>
