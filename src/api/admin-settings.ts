import { apiClient } from './client';

export interface PlatformSettings {
  timezone: string;
  /** Externally reachable base URL ('' = unset). */
  publicUrl: string;
}

export const adminSettingsApi = {
  async get(): Promise<PlatformSettings> {
    const { data } = await apiClient.get<PlatformSettings>('/admin/settings');
    return data;
  },

  async update(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const { data } = await apiClient.patch<PlatformSettings>('/admin/settings', patch);
    return data;
  },

  async updateTimezone(timezone: string): Promise<PlatformSettings> {
    const { data } = await apiClient.patch<PlatformSettings>('/admin/settings', { timezone });
    return data;
  },
};
