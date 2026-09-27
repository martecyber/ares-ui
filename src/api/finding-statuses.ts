import { apiClient } from './client';

export interface FindingStatus {
  id: number;
  name: string;
  description: string | null;
  meansClosed: boolean;
}

export const findingStatusesApi = {
  list() {
    return apiClient.get<FindingStatus[]>('/finding-statuses').then((r) => r.data);
  },
  transitions(statusId: number) {
    return apiClient.get<FindingStatus[]>(`/finding-statuses/${statusId}/transitions`).then((r) => r.data);
  },
};
