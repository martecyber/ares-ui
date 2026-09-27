import { apiClient } from './client';

export interface PluginRepositorySourceRow {
  id: number;
  name: string;
  baseUrl: string;
  official: boolean;
  enabled: boolean;
  addedAt: string;
}

export const pluginRepositoriesApi = {
  list() {
    return apiClient.get<PluginRepositorySourceRow[]>('/plugins/repositories').then((r) => r.data);
  },

  add(name: string | null, baseUrl: string) {
    return apiClient
      .post<PluginRepositorySourceRow>('/plugins/repositories', { name, baseUrl })
      .then((r) => r.data);
  },

  setEnabled(id: number, enabled: boolean) {
    return apiClient
      .patch<PluginRepositorySourceRow>(`/plugins/repositories/${id}/enabled`, { enabled })
      .then((r) => r.data);
  },

  remove(id: number) {
    return apiClient.delete<void>(`/plugins/repositories/${id}`);
  },
};
