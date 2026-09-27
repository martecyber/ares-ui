import { apiClient as api } from './client';

export type CaidoAction = 'PULL_SCOPE' | 'PUSH_FINDINGS';

/** A Caido project available on the linked instance/API. */
export interface CaidoKnownProject {
  id: string;
  name: string;
}

export const CAIDO_ACTIONS: { id: CaidoAction; label: string }[] = [
  { id: 'PULL_SCOPE',    label: 'Push Scope' },
  { id: 'PUSH_FINDINGS', label: 'Pull Findings' },
];

// ── Caido API integration (push-based: Ares → Caido GraphQL) ─────────────────────

export interface CaidoApiIntegration {
  id: number;
  label: string;
  baseUrl: string;
  enabled: boolean;
  /** unknown | ok | error */
  connectionStatus: string;
  connectionError?: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaidoApiGrant {
  id: number;
  integrationId: number;
  organizationId: number;
  projectId: number | null;
  capabilities: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GrantedCaidoApiIntegration {
  integrationId: number;
  label: string;
  enabled: boolean;
  connectionStatus: string;
  lastTestedAt: string | null;
  capabilities: string[];
}

export interface CaidoApiTask {
  id: number;
  integrationId: number;
  integrationLabel: string | null;
  projectId: number;
  caidoProjectId: string;
  caidoProjectName: string | null;
  action: CaidoAction;
  cronExpression: string | null;
  enabled: boolean;
  status: string;
  error: string | null;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface CreateCaidoApiIntegrationRequest { label: string; baseUrl: string; accessToken?: string; enabled?: boolean }
export interface UpdateCaidoApiIntegrationRequest { label?: string; baseUrl?: string; accessToken?: string; enabled?: boolean }
export interface CreateCaidoApiGrantRequest { organizationId: number; projectId?: number | null; capabilities?: string[] }
export interface CreateCaidoApiTaskRequest {
  integrationId: number;
  caidoProjectId: string;
  caidoProjectName?: string;
  action: CaidoAction;
  cronExpression?: string | null;
  enabled?: boolean;
  excludedScopeValues?: string[];
}
export interface UpdateCaidoApiTaskRequest {
  caidoProjectName?: string;
  cronExpression?: string | null;
  enabled?: boolean;
}

export const caidoApiIntegrationApi = {
  // ── Integrations (admin) ──────────────────────────────────────────────────
  list(): Promise<CaidoApiIntegration[]> {
    return api.get('/caido-api/integrations').then((r) => r.data);
  },
  create(body: CreateCaidoApiIntegrationRequest): Promise<CaidoApiIntegration> {
    return api.post('/caido-api/integrations', body).then((r) => r.data);
  },
  update(id: number, body: UpdateCaidoApiIntegrationRequest): Promise<CaidoApiIntegration> {
    return api.patch(`/caido-api/integrations/${id}`, body).then((r) => r.data);
  },
  delete(id: number): Promise<void> {
    return api.delete(`/caido-api/integrations/${id}`).then((r) => r.data);
  },
  testConnection(id: number): Promise<CaidoApiIntegration> {
    return api.post(`/caido-api/integrations/${id}/test`).then((r) => r.data);
  },
  caidoProjects(id: number): Promise<CaidoKnownProject[]> {
    return api.get(`/caido-api/integrations/${id}/caido-projects`).then((r) => r.data);
  },

  // ── Grants (admin) ────────────────────────────────────────────────────────
  listGrants(id: number): Promise<CaidoApiGrant[]> {
    return api.get(`/caido-api/integrations/${id}/grants`).then((r) => r.data);
  },
  createGrant(id: number, body: CreateCaidoApiGrantRequest): Promise<CaidoApiGrant> {
    return api.post(`/caido-api/integrations/${id}/grants`, body).then((r) => r.data);
  },
  deleteGrant(id: number, grantId: number): Promise<void> {
    return api.delete(`/caido-api/integrations/${id}/grants/${grantId}`).then((r) => r.data);
  },

  // ── Per-project tasks (admin + operator) ──────────────────────────────────
  grantedIntegrations(projectId: number): Promise<GrantedCaidoApiIntegration[]> {
    return api.get(`/caido-api/projects/${projectId}/integrations`).then((r) => r.data);
  },
  listTasks(projectId: number): Promise<CaidoApiTask[]> {
    return api.get(`/caido-api/projects/${projectId}/tasks`).then((r) => r.data);
  },
  createTask(projectId: number, body: CreateCaidoApiTaskRequest): Promise<CaidoApiTask> {
    return api.post(`/caido-api/projects/${projectId}/tasks`, body).then((r) => r.data);
  },
  updateTask(projectId: number, taskId: number, body: UpdateCaidoApiTaskRequest): Promise<CaidoApiTask> {
    return api.patch(`/caido-api/projects/${projectId}/tasks/${taskId}`, body).then((r) => r.data);
  },
  deleteTask(projectId: number, taskId: number): Promise<void> {
    return api.delete(`/caido-api/projects/${projectId}/tasks/${taskId}`).then((r) => r.data);
  },
  runTask(projectId: number, taskId: number): Promise<CaidoApiTask> {
    return api.post(`/caido-api/projects/${projectId}/tasks/${taskId}/run`).then((r) => r.data);
  },
};
