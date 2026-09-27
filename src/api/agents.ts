import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { AgentPool } from './agent-pools';
import type { AgentTask } from './agent-tasks';

export type AgentStatus = 'online' | 'stale' | 'offline' | 'pending' | 'disabled';

export interface AgentCapability {
  tool: string;
  path: string;
  version?: string | null;
  canRoot?: boolean | null;
}

/** A tool the platform knows about (an installed, enabled plugin's AgentToolSpec) that this
 *  agent currently can't run, and why — missing binary, version too old, needs root, or its
 *  plugin's customBuilder module isn't synced/allowed. Purely advisory: task dispatch only
 *  ever reads `capabilities`, never this list — see UnavailableToolEntry's own doc, ares-core. */
export interface AgentUnavailableTool {
  toolId: string;
  reason: string;
}

export interface Agent {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  version: string | null;
  capabilities: string;       // JSONB string — parse client-side
  /** JSONB string (array of AgentUnavailableTool) — parse with parseUnavailableTools. */
  unavailableTools: string;
  /** How many tasks the agent is allowed to run concurrently. Default 1. */
  maxConcurrentTasks: number;
  status: AgentStatus;
  lastSeenAt: string | null;
  registeredAt: string;
  registeredByUser: number | null;
  enrolled: boolean;
}

export interface CreateAgentResponse {
  agent: Agent;
  /** Plaintext enrollment code — shown ONCE; not retrievable later. */
  enrollmentCode: string;
}

export function parseCapabilities(raw: string | null | undefined): AgentCapability[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function parseUnavailableTools(raw: string | null | undefined): AgentUnavailableTool[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export const agentsApi = {
  list(opts: { page?: number; size?: number } = {}) {
    return apiClient
      .get<PagedResponse<Agent>>('/agents', { params: { ...opts, size: opts.size ?? 200 } })
      .then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<Agent>(`/agents/${id}`).then((r) => r.data);
  },
  create(body: { name: string; description?: string }) {
    return apiClient.post<CreateAgentResponse>('/agents', body).then((r) => r.data);
  },
  update(id: number, body: { name?: string; description?: string; enabled?: boolean; maxConcurrentTasks?: number }) {
    return apiClient.patch<Agent>(`/agents/${id}`, body).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/agents/${id}`).then((r) => r.data);
  },
  /** Pools this agent belongs to. */
  pools(id: number) {
    return apiClient.get<AgentPool[]>(`/agents/${id}/pools`).then((r) => r.data);
  },
  /** Recent tasks (any status) executed by this agent — for the detail view. */
  tasks(id: number, opts: { page?: number; size?: number } = {}) {
    return apiClient
      .get<PagedResponse<AgentTask>>(`/agents/${id}/tasks`, { params: { size: 20, ...opts } })
      .then((r) => r.data);
  },
  /** Public — returns the latest published agent version. UI highlights outdated rows. */
  latestVersion() {
    return apiClient.get<{ latest: string }>('/agent/dist/version').then((r) => r.data);
  },
  /**
   * Public — which installer formats this server can actually build right now.
   * py/zip are always true; deb/rpm need fpm and exe needs NSIS to be on PATH.
   */
  formats() {
    return apiClient
      .get<Record<'py' | 'zip' | 'deb' | 'rpm' | 'exe', boolean>>('/agent/dist/formats')
      .then((r) => r.data);
  },
};
