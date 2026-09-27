import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { Finding } from './findings';

export interface ProjectRetestFinding {
  linkId: number;
  linkedAt: string;
  linkedByName: string | null;
  originProjectId: number;
  originProjectName: string | null;
  originProjectCode: string | null;
  finding: Finding;
}

export const projectRetestApi = {
  list(projectId: number) {
    return apiClient
      .get<ProjectRetestFinding[]>(`/projects/${projectId}/retest/findings`)
      .then((r) => r.data);
  },
  searchCandidates(projectId: number, params: { severity?: string; page?: number; size?: number } = {}) {
    return apiClient
      .get<PagedResponse<Finding>>(`/projects/${projectId}/retest/candidates`, { params })
      .then((r) => r.data);
  },
  link(projectId: number, findingIds: number[]) {
    return apiClient
      .post<void>(`/projects/${projectId}/retest/findings`, { findingIds })
      .then((r) => r.data);
  },
  unlink(projectId: number, findingId: number) {
    return apiClient
      .delete<void>(`/projects/${projectId}/retest/findings/${findingId}`)
      .then((r) => r.data);
  },
};
