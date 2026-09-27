import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { WorkflowGraphDefinition, WorkflowScopeKind } from './workflows';

/**
 * Reusable workflow graph. Platform-wide — the row itself isn't owned by any org/project, so
 * `graphDefinition` has already had scope-bound resource ids (pool, integration) stripped
 * server-side and instantiates cleanly wherever `scopeKind` allows. The instantiated workflow
 * lands in draft status with those nodes showing their normal "not configured" fallback until an
 * operator fills them back in via the editor.
 */
export interface WorkflowTemplate {
  id: number;
  name: string;
  description: string | null;
  /** Which `Workflow.scopeKind` level this template is meant to be instantiated at — gates which
   *  node types the template editor's palette offers, same rule the live workflow editor already
   *  applies (see WorkflowCanvas's `availableActionTypes`). */
  scopeKind: WorkflowScopeKind;
  /** JSON string — same shape as workflow.graphDefinition. Parse with `JSON.parse(...)`. */
  graphDefinition: string;
  creatorId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrUpdateWorkflowTemplate {
  name: string;
  description?: string | null;
  scopeKind: WorkflowScopeKind;
  graphDefinition: string;
}

export const workflowTemplatesApi = {
  list(params: { page?: number; size?: number } = {}) {
    return apiClient
      .get<PagedResponse<WorkflowTemplate>>('/workflow-templates', { params })
      .then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<WorkflowTemplate>(`/workflow-templates/${id}`).then((r) => r.data);
  },
  /** If a template with that exact name already exists, the backend rejects with 409 +
   *  `code: 'duplicate_name'` unless `overwrite` is set — see useSaveAsTemplate's confirm-and-
   *  retry flow, which every "save as template" trigger uses to turn that into an "overwrite or
   *  rename?" prompt instead of a dead-end error. */
  create(body: CreateOrUpdateWorkflowTemplate, overwrite = false) {
    return apiClient.post<WorkflowTemplate>('/workflow-templates', body, { params: { overwrite } }).then((r) => r.data);
  },
  update(id: number, body: CreateOrUpdateWorkflowTemplate) {
    return apiClient.put<WorkflowTemplate>(`/workflow-templates/${id}`, body).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete(`/workflow-templates/${id}`).then(() => undefined);
  },
  /** Snapshot a live workflow's (stripped) graph into a new template. Pass an empty body to use
   *  the source workflow's own name and scopeKind. */
  fromWorkflow(workflowId: number, body: { name?: string; description?: string; scopeKind?: WorkflowScopeKind } = {}, overwrite = false) {
    return apiClient
      .post<WorkflowTemplate>(`/workflow-templates/from-workflow/${workflowId}`, body, { params: { overwrite } })
      .then((r) => r.data);
  },
  exportOne(id: number): Promise<Blob> {
    return apiClient.get(`/workflow-templates/${id}/export`, { responseType: 'blob' }).then((r) => r.data);
  },
  exportZip(ids: number[]): Promise<Blob> {
    return apiClient.post('/workflow-templates/export-zip', ids, { responseType: 'blob' }).then((r) => r.data);
  },
  importFiles(files: File[]): Promise<{ imported: number; errors: string[] }> {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return apiClient.post('/workflow-templates/import', form).then((r) => r.data);
  },
};

/** Parses a template's `graphDefinition` JSON string into the typed shape `CreateWorkflowRequest`
 *  expects, for the "New from template" instantiation flow. */
export function parseTemplateGraph(template: WorkflowTemplate): WorkflowGraphDefinition {
  return JSON.parse(template.graphDefinition);
}
