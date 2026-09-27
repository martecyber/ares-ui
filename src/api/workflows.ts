import { apiClient as api } from './client';
import type { PagedResponse } from './organizations';

// Mirrors com.martecyber.ares.workflows.WorkflowNodeType — only Phase A's supported types are
// usable in the editor today; the rest exist so the graph JSON schema/vocabulary is already
// stable for later phases.
// ACTION_SYNC retired — folded into ACTION_INTEGRATION_CALL (see
// com.martecyber.ares.integrations.DataSourceSyncIntegrationActionHandler).
export type WorkflowNodeType =
  | 'TRIGGER_MANUAL' | 'TRIGGER_CRON' | 'TRIGGER_WEBHOOK' | 'TRIGGER_EVENT' | 'TRIGGER_CALL_TOPIC'
  | 'CONDITION' | 'ASSIGN_VARIABLE' | 'ACTION_AGENT_TASK' | 'ACTION_NOTIFICATION'
  | 'ACTION_CALL_WORKFLOW' | 'ACTION_WEBHOOK_CALL' | 'ACTION_INTEGRATION_CALL'
  | 'ACTION_MANAGE_TAGS' | 'ACTION_REPORT_FINDING' | 'ACTION_UPDATE_DETECTION_STATUS' | 'LOOP' | 'END';

export const PHASE_A_NODE_TYPES: WorkflowNodeType[] = [
  'TRIGGER_MANUAL', 'TRIGGER_CRON', 'TRIGGER_WEBHOOK', 'CONDITION', 'ASSIGN_VARIABLE',
  'ACTION_AGENT_TASK', 'ACTION_NOTIFICATION',
];

// Mirrors com.martecyber.ares.workflows.integrations — one entry per registered
// IntegrationActionHandler type, for ACTION_INTEGRATION_CALL's node editor.
export interface IntegrationActionDescriptor { code: string; label: string }
export interface IntegrationInstanceDescriptor { id: number; label: string }
export interface IntegrationActionCatalogEntry {
  type: string;
  typeLabel: string;
  actions: IntegrationActionDescriptor[];
  instances: IntegrationInstanceDescriptor[];
}

export type WorkflowEdgeHandle = 'success' | 'error' | 'true' | 'false' | 'loop_body' | 'loop_done' | null;

export interface WorkflowGraphNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: { label: string; config: Record<string, unknown> };
}

export interface WorkflowGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: WorkflowEdgeHandle;
}

export interface WorkflowGraphDefinition {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export type WorkflowScopeKind = 'platform' | 'organization' | 'project';

export interface WorkflowTrigger {
  id: number;
  nodeId: string;
  triggerType: 'manual' | 'cron' | 'webhook' | 'event';
  config: string;
  enabled: boolean;
  nextRunAt: string | null;
}

export interface Workflow {
  id: number;
  scopeKind: WorkflowScopeKind;
  scopeId: number;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'disabled';
  /** Raw JSON string — parse with JSON.parse to get a WorkflowGraphDefinition. */
  graphDefinition: string;
  version: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  /** True for a workflow auto-created by one of the legacy sync schedulers (KB sync, integration
   *  schedule, Shodan task, Caido task, Bug Hunting program sync) — read-only here; manage it from
   *  its origin page instead (see managedBy). */
  locked: boolean;
  /** Which origin system owns this workflow when locked is true, e.g. "kb-sync:cve_update". Null
   *  for an ordinary, user-authored workflow. */
  managedBy: string | null;
  triggers: WorkflowTrigger[];
  /** Non-blocking save-time advisories (e.g. "no agent in the selected pool currently reports
   *  this tool") — only ever populated on the response of a create/update call, never on a
   *  plain get/list (see WorkflowDto's own doc, ares-core). Always [] otherwise. */
  warnings: WorkflowSaveWarning[];
}

export interface WorkflowSaveWarning {
  nodeId: string;
  message: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  graphDefinition: WorkflowGraphDefinition;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  status?: string;
  graphDefinition?: WorkflowGraphDefinition;
}

export interface WorkflowRun {
  id: number;
  workflowId: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerNodeId: string;
  triggeredBy: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface WorkflowStepRun {
  id: number;
  nodeId: string;
  nodeType: string;
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';
  output: string | null;
  error: string | null;
  refType: string | null;
  refId: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WebhookInfo {
  token: string;
  secret: string;
  enabled: boolean;
  requestCount: number;
  lastTriggeredAt: string | null;
}

export interface WorkflowRunDetail extends WorkflowRun {
  context: string;
  /** Raw JSON string — the graph as it existed when this run started. */
  graphSnapshot: string;
  steps: WorkflowStepRun[];
}

export const workflowsApi = {
  // ── Scope-listed CRUD ────────────────────────────────────────────
  listPlatform(): Promise<Workflow[]> {
    return api.get('/admin/workflows').then((r) => r.data);
  },
  createPlatform(req: CreateWorkflowRequest): Promise<Workflow> {
    return api.post('/admin/workflows', req).then((r) => r.data);
  },
  listForOrg(orgId: number): Promise<Workflow[]> {
    return api.get(`/organizations/${orgId}/workflows`).then((r) => r.data);
  },
  createForOrg(orgId: number, req: CreateWorkflowRequest): Promise<Workflow> {
    return api.post(`/organizations/${orgId}/workflows`, req).then((r) => r.data);
  },
  listForProject(projectId: number): Promise<Workflow[]> {
    return api.get(`/projects/${projectId}/workflows`).then((r) => r.data);
  },
  createForProject(projectId: number, req: CreateWorkflowRequest): Promise<Workflow> {
    return api.post(`/projects/${projectId}/workflows`, req).then((r) => r.data);
  },

  // ── Shared (id alone is unambiguous once access is checked) ──────
  get(id: number): Promise<Workflow> {
    return api.get(`/workflows/${id}`).then((r) => r.data);
  },
  update(id: number, req: UpdateWorkflowRequest): Promise<Workflow> {
    return api.patch(`/workflows/${id}`, req).then((r) => r.data);
  },
  delete(id: number): Promise<void> {
    return api.delete(`/workflows/${id}`).then(() => {});
  },
  runManualTrigger(workflowId: number, triggerId: number, context?: Record<string, unknown>): Promise<WorkflowRun> {
    return api.post(`/workflows/${workflowId}/triggers/${triggerId}/run`, context ?? {}).then((r) => r.data);
  },
  listRuns(workflowId: number, page = 0, size = 20): Promise<PagedResponse<WorkflowRun>> {
    return api.get(`/workflows/${workflowId}/runs`, { params: { page, size } }).then((r) => r.data);
  },
  getRun(workflowId: number, runId: number): Promise<WorkflowRunDetail> {
    return api.get(`/workflows/${workflowId}/runs/${runId}`).then((r) => r.data);
  },

  // ── Webhook triggers ──────────────────────────────────────────────
  /** 404s until the workflow has been saved at least once with this TRIGGER_WEBHOOK node —
   *  the endpoint is provisioned on save, not on node creation in the (unsaved) canvas. */
  getWebhookInfo(workflowId: number, nodeId: string): Promise<WebhookInfo> {
    return api.get(`/workflows/${workflowId}/webhook/${nodeId}`).then((r) => r.data);
  },
  regenerateWebhookSecret(workflowId: number, nodeId: string): Promise<WebhookInfo> {
    return api.post(`/workflows/${workflowId}/webhook/${nodeId}/regenerate-secret`).then((r) => r.data);
  },

  // ── Outbound webhook (ACTION_WEBHOOK_CALL) signing secret ────────
  /** Write-only — never returns the plaintext, only whether one is configured. */
  getOutboundWebhookSecretStatus(workflowId: number, nodeId: string): Promise<{ configured: boolean }> {
    return api.get(`/workflows/${workflowId}/outbound-secret/${nodeId}`).then((r) => r.data);
  },
  setOutboundWebhookSecret(workflowId: number, nodeId: string, secret: string): Promise<{ configured: boolean }> {
    return api.put(`/workflows/${workflowId}/outbound-secret/${nodeId}`, { secret }).then((r) => r.data);
  },
  clearOutboundWebhookSecret(workflowId: number, nodeId: string): Promise<void> {
    return api.delete(`/workflows/${workflowId}/outbound-secret/${nodeId}`).then(() => {});
  },

  // ── ACTION_CALL_WORKFLOW topic autocomplete ───────────────────────
  /** Topics reachable (per the backend's vertical-hierarchy rule) from the given scope — scope-
   *  based rather than workflow-id-based so it works before the workflow being edited is saved. */
  reachableTopics(scopeKind: WorkflowScopeKind, scopeId: number): Promise<string[]> {
    return api.get('/workflows/topics', { params: { scopeKind, scopeId } }).then((r) => r.data);
  },

  // ── ACTION_INTEGRATION_CALL catalog ───────────────────────────────
  /** One entry per registered integration-action handler type (backend's IntegrationActionRegistry)
   *  reachable from this scope — each carrying its own actions + configured instances, so the node
   *  editor's Integration → Instance → Action cascade always reflects whatever's actually deployed,
   *  no frontend-side list to keep in sync. Only project scope has anything to return today. */
  integrationActionCatalog(scopeKind: WorkflowScopeKind, scopeId: number): Promise<IntegrationActionCatalogEntry[]> {
    return api.get('/workflows/integration-actions', { params: { scopeKind, scopeId } }).then((r) => r.data);
  },
};

/** Full public URL an external caller POSTs to — mirrors how CliInstallDialog.vue/
 *  AgentEnrollDialog.vue build absolute URLs for copy-paste display (window.location.origin,
 *  not the API client's own possibly-relative baseURL). */
export function webhookPublicUrl(token: string): string {
  return `${window.location.origin}/api/v1/webhooks/in/${token}`;
}
