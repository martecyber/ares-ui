// The Jobs list page (and its jobsApi list/get/cancel/activeCount client) was removed — job
// progress is now surfaced through whatever created the job instead (a workflow run's step
// detail, or the triggering integration's own status). JobDto itself is still needed: the
// "Sync now" one-off trigger (tool-integrations.ts) is a legitimate non-workflow surface that
// still creates and returns a Job directly.
export interface JobDto {
  id: number;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  organizationId: number | null;
  projectId: number | null;
  createdBy: number | null;
  payload: string | null;
  result: string | null;
  error: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
