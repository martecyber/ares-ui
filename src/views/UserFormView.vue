<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usersApi } from '@/api/users';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Message from 'primevue/message';

const router = useRouter();

const email = ref('');
const displayName = ref('');
const password = ref('');
const saving = ref(false);
const err = ref<string | null>(null);

const canSave = computed(
  () => /\S+@\S+\.\S+/.test(email.value)
    && displayName.value.trim().length >= 2
    && password.value.length >= 8,
);

async function submit() {
  err.value = null;
  saving.value = true;
  try {
    await usersApi.create({
      email: email.value.trim(),
      displayName: displayName.value.trim(),
      password: password.value,
    });
    router.replace({ name: 'users' });
  } catch (e: unknown) {
    const ax = e as { response?: { status?: number; data?: { detail?: string } } };
    if (ax.response?.status === 409) err.value = 'A user with that email already exists.';
    else err.value = ax.response?.data?.detail ?? 'Failed to create user.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h2 class="text-2xl font-semibold mb-1">New user</h2>
    <p class="text-sm text-zinc-500 mb-6">Create a system access account.</p>

    <form @submit.prevent="submit" class="space-y-4 bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div>
        <label class="block text-sm mb-1" for="email">Email *</label>
        <InputText id="email" v-model="email" type="email" class="w-full" required />
      </div>
      <div>
        <label class="block text-sm mb-1" for="name">Display name *</label>
        <InputText id="name" v-model="displayName" class="w-full" required maxlength="120" />
      </div>
      <div>
        <label class="block text-sm mb-1" for="password">Initial password *</label>
        <Password id="password" v-model="password" class="w-full" input-class="w-full" :feedback="false" toggle-mask required />
        <p class="text-xs text-zinc-500 mt-1">Minimum 8 characters. The user should change it on first login.</p>
      </div>

      <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>

      <div class="flex gap-2 justify-end pt-2">
        <Button type="button" label="Cancel" severity="secondary" @click="router.push({ name: 'users' })" />
        <Button type="submit" label="Create" :disabled="!canSave" :loading="saving" />
      </div>
    </form>
  </div>
</template>
