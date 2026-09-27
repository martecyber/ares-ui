<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { adminSettingsApi } from '@/api/admin-settings';

// Comprehensive list of IANA timezone identifiers
const TIMEZONES = [
  'UTC',
  'Africa/Abidjan','Africa/Accra','Africa/Addis_Ababa','Africa/Algiers','Africa/Cairo',
  'Africa/Casablanca','Africa/Johannesburg','Africa/Lagos','Africa/Nairobi','Africa/Tunis',
  'America/Anchorage','America/Argentina/Buenos_Aires','America/Bogota','America/Caracas',
  'America/Chicago','America/Denver','America/Halifax','America/Lima','America/Los_Angeles',
  'America/Mexico_City','America/New_York','America/Phoenix','America/Santiago',
  'America/Sao_Paulo','America/St_Johns','America/Toronto','America/Vancouver',
  'Asia/Almaty','Asia/Amman','Asia/Baghdad','Asia/Bangkok','Asia/Beirut','Asia/Colombo',
  'Asia/Dhaka','Asia/Dubai','Asia/Hong_Kong','Asia/Jakarta','Asia/Jerusalem',
  'Asia/Karachi','Asia/Kathmandu','Asia/Kolkata','Asia/Kuala_Lumpur','Asia/Manila',
  'Asia/Muscat','Asia/Qatar','Asia/Riyadh','Asia/Seoul','Asia/Shanghai','Asia/Singapore',
  'Asia/Taipei','Asia/Tashkent','Asia/Tehran','Asia/Tokyo','Asia/Vladivostok',
  'Asia/Yekaterinburg',
  'Atlantic/Azores','Atlantic/Cape_Verde','Atlantic/Reykjavik',
  'Australia/Adelaide','Australia/Brisbane','Australia/Darwin','Australia/Hobart',
  'Australia/Melbourne','Australia/Perth','Australia/Sydney',
  'Europe/Amsterdam','Europe/Athens','Europe/Belgrade','Europe/Berlin','Europe/Brussels',
  'Europe/Bucharest','Europe/Budapest','Europe/Copenhagen','Europe/Dublin','Europe/Helsinki',
  'Europe/Istanbul','Europe/Kiev','Europe/Lisbon','Europe/London','Europe/Luxembourg',
  'Europe/Madrid','Europe/Moscow','Europe/Oslo','Europe/Paris','Europe/Prague',
  'Europe/Rome','Europe/Sofia','Europe/Stockholm','Europe/Vienna','Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland','Pacific/Fiji','Pacific/Guam','Pacific/Honolulu','Pacific/Midway',
  'Pacific/Port_Moresby','Pacific/Tahiti',
];

const timezone = ref('');
const saving = ref(false);
const loading = ref(true);
const successMsg = ref<string | null>(null);
const err = ref<string | null>(null);

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const s = await adminSettingsApi.get();
    timezone.value = s.timezone;
  } catch (e: any) {
    err.value = e?.response?.data?.message ?? e.message ?? 'Failed to load settings.';
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  err.value = null;
  successMsg.value = null;
  try {
    const s = await adminSettingsApi.updateTimezone(timezone.value);
    timezone.value = s.timezone;
    successMsg.value = 'Timezone saved.';
  } catch (e: any) {
    err.value = e?.response?.data?.message ?? e.message ?? 'Failed to save timezone.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Platform Configuration</h2>
        <p class="ares-page-subtitle">
          Global settings that affect all projects and scheduled tasks.
        </p>
      </div>
    </div>

    <div v-if="loading" class="ares-table-empty">Loading…</div>

    <div v-else style="max-width:480px; display:flex; flex-direction:column; gap:1.25rem;">
      <div>
        <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:0.4rem; color:var(--ares-text-muted);">
          Platform Timezone
        </label>
        <Select
          v-model="timezone"
          :options="TIMEZONES"
          filter
          filterPlaceholder="Search timezone…"
          placeholder="Select timezone…"
          style="width:100%;"
        />
        <p style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.35rem;">
          Used for scheduled task time windows and cron expressions across all projects.
        </p>
      </div>

      <p v-if="err" style="color:var(--ares-error); font-size:0.85rem;">{{ err }}</p>
      <p v-if="successMsg" style="color:var(--ares-success,#22c55e); font-size:0.85rem;">{{ successMsg }}</p>

      <div>
        <Button label="Save" icon="pi pi-check" :loading="saving" :disabled="!timezone" @click="save" />
      </div>
    </div>
  </div>
</template>
