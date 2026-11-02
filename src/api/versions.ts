import { ref } from 'vue';
import { apiClient } from './client';

export interface Versions {
  api:      string;
  cli:      string;
  agent:    string;
  timezone: string;
}

/** This UI build's own version (package.json, baked in at build time). */
export const uiVersion: string = typeof __ARES_UI_VERSION__ !== 'undefined' ? __ARES_UI_VERSION__ : 'dev';

/** Module-level singleton — populated on first successful fetch. */
export const platformTimezone = ref<string>('UTC');

export const versionsApi = {
  get() {
    return apiClient.get<Versions>('/versions').then((r) => {
      if (r.data.timezone) platformTimezone.value = r.data.timezone;
      return r.data;
    });
  },
};
