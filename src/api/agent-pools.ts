import { apiClient } from './client';

export interface AgentPool {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  memberCount: number;
  createdAt: string;
}

export interface AgentPoolGrant {
  id: number;
  agentPoolId: number;
  organizationId: number;
  projectId: number | null;
  active: boolean;
  createdAt: string;
}

export const agentPoolsApi = {
  list() {
    return apiClient.get<AgentPool[]>('/agent-pools').then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<AgentPool>(`/agent-pools/${id}`).then((r) => r.data);
  },
  create(body: { name: string; description?: string }) {
    return apiClient.post<AgentPool>('/agent-pools', body).then((r) => r.data);
  },
  update(id: number, body: { name?: string; description?: string; enabled?: boolean }) {
    return apiClient.patch<AgentPool>(`/agent-pools/${id}`, body).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/agent-pools/${id}`).then((r) => r.data);
  },

  // Members
  listMembers(id: number) {
    return apiClient.get<number[]>(`/agent-pools/${id}/members`).then((r) => r.data);
  },
  setMembers(id: number, agentIds: number[]) {
    return apiClient.put<void>(`/agent-pools/${id}/members`, { agentIds }).then((r) => r.data);
  },

  // Grants
  listGrants(id: number) {
    return apiClient.get<AgentPoolGrant[]>(`/agent-pools/${id}/grants`).then((r) => r.data);
  },
  createGrant(id: number, body: { organizationId: number; projectId?: number | null }) {
    return apiClient.post<AgentPoolGrant>(`/agent-pools/${id}/grants`, body).then((r) => r.data);
  },
  revokeGrant(id: number, grantId: number) {
    return apiClient.delete<void>(`/agent-pools/${id}/grants/${grantId}`).then((r) => r.data);
  },

  // Project scope
  listForProject(projectId: number) {
    return apiClient.get<AgentPool[]>(`/projects/${projectId}/agent-pools`).then((r) => r.data);
  },

  /**
   * Gantt-style snapshot of the last `hours` of activity in this pool:
   * agents (with slot count), tasks intersecting the window, queue size.
   */
  getTimeline(id: number, hours = 24) {
    return apiClient
      .get<PoolTimeline>(`/agent-pools/${id}/timeline`, { params: { hours } })
      .then((r) => r.data);
  },
};

export interface PoolTimelineAgent {
  id: number;
  name: string;
  maxConcurrentTasks: number;
  status: 'online' | 'stale' | 'offline' | 'pending' | 'disabled';
  lastSeenAt: string | null;
}

export interface PoolTimelineTask {
  id: number;
  agentId: number | null;
  name: string | null;
  tool: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  dispatchedAt: string | null;
  scheduledFor: string | null;
  scheduleRunId: number | null;
}

export interface QueueSample {
  ts: string;
  count: number;
}

export interface PoolTimeline {
  poolId: number;
  poolName: string;
  windowStart: string;
  windowEnd: string;
  /** Server's "now" — separates the historical zone (left) from the 6h forecast zone (right). */
  nowTs: string;
  agents: PoolTimelineAgent[];
  tasks: PoolTimelineTask[];
  queueSize: number;
  /** Queue depth at each of 25 evenly-spaced samples from windowStart to nowTs (historical only). */
  queueSamples: QueueSample[];
}
