import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { AgentToolSpec } from './agent-tasks';

/**
 * Reusable agent-task configuration. The `args` field is a JSON-encoded string
 * matching the shape of `agent_task.args` (tool-specific keys + optionally
 * `targets` or `targetsFrom`). Scheduling / pool / project are NOT stored — the
 * operator picks those when applying the template to a new task.
 */
export interface AgentTaskTemplate {
  id: number;
  name: string;
  description: string | null;
  tool: string;
  format: string;
  /** JSON string. Parse with `JSON.parse(template.args)` to read the args. */
  args: string;
  nacProfile: string | null;
  /** Suggested minutes-to-timeout for tasks created from this template. Null = no default. */
  timeoutMinutes: number | null;
  creatorId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrUpdateAgentTaskTemplate {
  name: string;
  description?: string | null;
  tool: string;
  format?: string;
  args: Record<string, unknown>;
  nacProfile?: string | null;
  timeoutMinutes?: number | null;
}

export const agentTaskTemplatesApi = {
  list(params: { page?: number; size?: number } = {}) {
    return apiClient
      .get<PagedResponse<AgentTaskTemplate>>('/agent-task-templates', { params })
      .then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<AgentTaskTemplate>(`/agent-task-templates/${id}`).then((r) => r.data);
  },
  /** If a template with that exact name already exists, the backend rejects with 409 +
   *  `code: 'duplicate_name'` unless `overwrite` is set — see useSaveAsTemplate's confirm-and-
   *  retry flow, which every "save as template" trigger uses to turn that into an "overwrite or
   *  rename?" prompt instead of a dead-end error. */
  create(body: CreateOrUpdateAgentTaskTemplate, overwrite = false) {
    return apiClient.post<AgentTaskTemplate>('/agent-task-templates', body, { params: { overwrite } }).then((r) => r.data);
  },
  update(id: number, body: CreateOrUpdateAgentTaskTemplate) {
    return apiClient.put<AgentTaskTemplate>(`/agent-task-templates/${id}`, body).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete(`/agent-task-templates/${id}`).then(() => undefined);
  },
  /** Snapshot a live task into a new template. Pass an empty body to use defaults. */
  fromTask(taskId: number, body: { name?: string; description?: string } = {}, overwrite = false) {
    return apiClient
      .post<AgentTaskTemplate>(`/agent-task-templates/from-task/${taskId}`, body, { params: { overwrite } })
      .then((r) => r.data);
  },
  /** Project-agnostic tool catalog (for the KB edit dialog). */
  tools() {
    return apiClient.get<AgentToolSpec[]>('/agent-task-templates/tools').then((r) => r.data);
  },
  exportOne(id: number): Promise<Blob> {
    return apiClient.get(`/agent-task-templates/${id}/export`, { responseType: 'blob' }).then((r) => r.data);
  },
  exportZip(ids: number[]): Promise<Blob> {
    return apiClient.post('/agent-task-templates/export-zip', ids, { responseType: 'blob' }).then((r) => r.data);
  },
  importFiles(files: File[]): Promise<{ imported: number; errors: string[] }> {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return apiClient.post('/agent-task-templates/import', form).then((r) => r.data);
  },
};
