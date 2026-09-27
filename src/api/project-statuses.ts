import { apiClient } from './client';

export interface ProjectStatus {
  id: number;
  name: string;
  description: string | null;
  meansClosed: boolean;
}

export const projectStatusesApi = {
  list() {
    return apiClient.get<ProjectStatus[]>('/project-statuses').then((r) => r.data);
  },
};
