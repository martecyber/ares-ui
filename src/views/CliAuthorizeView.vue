<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { cliDeviceAuthApi, type CliDeviceInfo } from '@/api/cli-device-auth';

const route = useRoute();
const router = useRouter();

const code = typeof route.query.code === 'string' ? route.query.code : '';

const loading = ref(true);
const error = ref<string | null>(null);
const info = ref<CliDeviceInfo | null>(null);
const acting = ref(false);
const result = ref<'approved' | 'denied' | null>(null);

onMounted(load);

async function load() {
  loading.value = true;
  error.value = null;
  if (!code) {
    error.value = 'Missing authorization code — open this page from the link/command shown by the Ares CLI.';
    loading.value = false;
    return;
  }
  try {
    info.value = await cliDeviceAuthApi.info(code);
    if (info.value.status !== 'PENDING') {
      error.value = 'This authorization request is no longer pending — it may have expired or already been used. Run `ares configure` again to get a new one.';
    }
  } catch {
    error.value = 'This authorization request was not found or has expired. Run `ares configure` again to get a new one.';
  } finally {
    loading.value = false;
  }
}

async function approve() {
  acting.value = true;
  try {
    await cliDeviceAuthApi.approve(code);
    result.value = 'approved';
  } catch {
    error.value = 'Could not approve this request — it may have expired. Run `ares configure` again.';
  } finally {
    acting.value = false;
  }
}

async function deny() {
  acting.value = true;
  try {
    await cliDeviceAuthApi.deny(code);
    result.value = 'denied';
  } catch {
    error.value = 'Could not update this request.';
  } finally {
    acting.value = false;
  }
}
</script>

<template>
  <div style="max-width: 460px; margin: 3rem auto;">
    <div class="ares-card" style="text-align: center; padding: 2rem 1.75rem;">
      <i class="pi pi-desktop" style="font-size: 1.8rem; color: var(--p-primary-color); margin-bottom: 0.75rem; display: block;" />
      <h2 class="ares-page-title" style="margin-bottom: 0.25rem;">Authorize Ares CLI</h2>

      <template v-if="loading">
        <p style="color: var(--ares-text-muted); font-size: 0.85rem; margin-top: 1rem;">Loading request…</p>
      </template>

      <template v-else-if="result">
        <div style="margin-top: 1.25rem;">
          <i :class="result === 'approved' ? 'pi pi-check-circle' : 'pi pi-times-circle'"
             :style="{ fontSize: '2rem', color: result === 'approved' ? 'var(--ares-success, #4ade80)' : 'var(--ares-text-muted)' }" />
          <p style="margin: 0.75rem 0 0; color: var(--ares-text-1);">
            {{ result === 'approved' ? 'CLI authorized. You can return to your terminal.' : 'Request denied.' }}
          </p>
        </div>
      </template>

      <template v-else-if="error">
        <Message severity="error" :closable="false" style="margin-top: 1rem; text-align: left;">{{ error }}</Message>
        <Button label="Back to dashboard" text style="margin-top: 1rem;" @click="router.replace('/dashboard')" />
      </template>

      <template v-else-if="info">
        <p style="color: var(--ares-text-2); font-size: 0.85rem; margin: 0.5rem 0 1.5rem;">
          The Ares CLI{{ info.clientInfo ? ` on ${info.clientInfo}` : '' }} wants to sign in as you and receive an API key.
        </p>

        <div style="background: var(--ares-surface-2); border: 1px solid var(--ares-border); border-radius: var(--ares-radius); padding: 0.9rem; margin-bottom: 1.5rem;">
          <p style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ares-text-muted); margin: 0 0 0.4rem;">Confirmation code</p>
          <p style="font-size: 1.5rem; font-weight: 700; letter-spacing: 0.08em; font-family: monospace; margin: 0; color: var(--ares-text);">{{ info.userCode }}</p>
        </div>

        <p style="font-size: 0.78rem; color: var(--ares-text-muted); margin-bottom: 1.5rem;">
          Make sure this matches the code shown in your terminal before approving.
        </p>

        <div style="display: flex; gap: 0.6rem; justify-content: center;">
          <Button label="Deny" severity="secondary" outlined :loading="acting" @click="deny" />
          <Button label="Authorize" icon="pi pi-check" :loading="acting" @click="approve" />
        </div>
      </template>
    </div>
  </div>
</template>
