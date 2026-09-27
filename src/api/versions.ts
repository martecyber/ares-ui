import { ref } from 'vue';
import { apiClient } from './client';

export interface Versions {
  api:      string;
  ui:       string;
  cli:      string;
  agent:    string;
  timezone: string;
}

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
