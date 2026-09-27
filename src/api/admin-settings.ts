import { apiClient } from './client';

export interface PlatformSettings {
  timezone: string;
}

export const adminSettingsApi = {
  async get(): Promise<PlatformSettings> {
    const { data } = await apiClient.get<PlatformSettings>('/admin/settings');
    return data;
  },

  async updateTimezone(timezone: string): Promise<PlatformSettings> {
    const { data } = await apiClient.patch<PlatformSettings>('/admin/settings', { timezone });
    return data;
  },
};
