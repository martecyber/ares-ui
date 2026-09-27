import { apiClient } from './client';

export type BugHuntingPlatform =
  | 'bugcrowd'
  | 'yeswehack'
  | 'intigriti'
  | 'hackerone'
  | 'generic';

export interface BugHuntingProgram {
  projectId: number;
  platform: BugHuntingPlatform;
  integrationId: number | null;
  programHandle: string | null;
  syncEnabled: boolean;
  syncIntervalHours: number;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'failed' | 'partial' | 'never' | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBugHuntingProgramRequest {
  integrationId?: number | null;
  programHandle?: string | null;
  syncEnabled?: boolean;
  syncIntervalHours?: number;
}

export const PLATFORM_LABELS: Record<BugHuntingPlatform, string> = {
  bugcrowd:   'Bugcrowd',
  yeswehack:  'YesWeHack',
  intigriti:  'Intigriti',
  hackerone:  'HackerOne',
  generic:    'Generic (no platform)',
};

export const bugHuntingProgramsApi = {
  get(projectId: number) {
    return apiClient
      .get<BugHuntingProgram>(`/projects/${projectId}/bug-hunting-program`)
      .then((r) => r.data);
  },
  upsert(projectId: number, body: UpsertBugHuntingProgramRequest) {
    return apiClient
      .put<BugHuntingProgram>(`/projects/${projectId}/bug-hunting-program`, body)
      .then((r) => r.data);
  },
  triggerSync(projectId: number) {
    return apiClient
      .post<{ jobId: number }>(`/projects/${projectId}/bug-hunting-program/sync`)
      .then((r) => r.data.jobId);
  },
  disconnect(projectId: number) {
    return apiClient
      .delete<void>(`/projects/${projectId}/bug-hunting-program`)
      .then((r) => r.data);
  },
};
