import { apiClient } from './client';
import type { PagedResponse } from './organizations';

export type AgentTaskStatus =
  | 'pending' | 'dispatched' | 'running' | 'uploading'
  | 'completed' | 'failed' | 'cancelled';

export interface AgentTask {
  id: number;
  name: string | null;
  projectId: number;
  poolId: number;
  agentId: number | null;
  /** Resolved agent display name; null until a pool member claims the task. */
  agentName: string | null;
  tool: string;
  format: string;
  args: string;          // JSON string
  sourceIp: string | null;
  nacProfile: string | null;
  status: AgentTaskStatus;
  priority: number;
  createdBy: number | null;
  createdAt: string;
  /** Future ISO timestamp ⇒ task stays pending until then. */
  scheduledFor: string | null;
  dispatchedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  scheduleId: number | null;
  /** Groups all tasks created by the same schedule fire. NULL for one-shot tasks. */
  scheduleRunId: number | null;
  /** Total execution time in ms — set when complete()/fail() runs. NULL while still pending/running. */
  actualDurationMs: number | null;
  importId: number | null;
  exitCode: number | null;
  error: string | null;
  /** Minutes after dispatch/start before this task is auto-cancelled. Null = no timeout. */
  timeoutMinutes: number | null;
}

/** One declarative argument — mirrors AgentToolSpec.Field (ares-core) field-for-field.
 *  Interpreted generically by ToolConfigForm.vue to render one form control per field,
 *  the same way ares-agent's Python interpreter walks it to build the tool's argv. */
export interface AgentToolSpecField {
  key: string;
  /** 'string' | 'number' | 'enum' | 'boolean_flag' | 'server_fetch' */
  type: 'string' | 'number' | 'enum' | 'boolean_flag' | 'server_fetch';
  /** CLI flag this field's value is emitted after. Null for an enum field whose value
   *  IS the flag (e.g. nmap's scanType: -sS/-sT/...), or a boolean_flag field with no
   *  configured flag (invalid — every boolean_flag declares one in practice). */
  flag: string | null;
  /** Only for type: 'enum'. */
  options?: string[] | null;
  /** Only for type: 'string' — a regex the value must fully match. */
  pattern?: string | null;
  /** Only for type: 'number'. */
  min?: number | null;
  max?: number | null;
  /** Unconditionally mandatory. False (the default) for anything optional or only
   *  conditionally required — see requiredIfField/requiredIfEquals. */
  required?: boolean;
  requiredIfField?: string | null;
  requiredIfEquals?: string | null;
  /** True for an array-valued field emitted as one repeated `flag value` pair per
   *  entry (e.g. custom HTTP headers: each array element is a whole "Name: value"
   *  string). The form renders this as an add/remove list of text inputs. */
  repeat?: boolean;
  /** Only for type: 'server_fetch' — a URL path with a single {value} placeholder,
   *  resolved against this ares-core instance. ToolConfigForm renders this as a KB
   *  resource picker (currently: wordlists) instead of a plain text input. */
  urlTemplate?: string | null;
  /** When set, the emitted value is this string with {value} substituted for the
   *  field's actual value (e.g. "User-Agent: {value}") — cosmetic for the form (still
   *  shown as a plain input), only changes what the agent puts on the argv line. */
  valueTemplate?: string | null;
  /** Pre-filled when the operator hasn't touched this field. */
  defaultValue?: string | null;
  /** 'rate_limit' | 'concurrency' | 'headers' | null — ties this field to the matching
   *  Rules-of-Engagement lock (see useEngagementRuleLocks) purely for UI transparency:
   *  ToolConfigForm shows a locked, non-editable value (with an "Override rule"
   *  opt-out) instead of a plain input when an active rule caps/injects that value.
   *  Never affects what gets submitted on its own — the server enforces the rule
   *  regardless of what the form showed. */
  ruleBinding?: 'rate_limit' | 'concurrency' | 'headers' | null;
}

export interface AgentToolSpecCustomBuilder {
  module: string;
  sha256: string;
}

/** Mirrors AgentToolSpec (ares-core) field-for-field — the full declarative shape of one
 *  agent-executable tool, sourced from GET /agent-tasks/tools (and its project-scoped and
 *  template-scoped siblings), which all now return this instead of the old static
 *  ToolDescriptor. Drives the tool picker, ToolConfigForm.vue's generic field rendering,
 *  and targets-source filtering (validScopeKinds/validAssetTypes) all at once. */
export interface AgentToolSpec {
  toolId: string;
  displayName: string;
  binary: string;
  /** Must match the ImportParser formatId this tool's results are parsed with. */
  resultFormat: string;
  /** Scope-entry kinds operators may pick when targeting via scope_entries. */
  validScopeKinds: string[];
  /** Asset types operators may pick when targeting via project_assets. */
  validAssetTypes: string[];
  /** null = no limit. 1 = this tool refuses more than one target per task (wpscan,
   *  ffuf) — the batchSize field must then be exactly 1. */
  maxTargets: number | null;
  targetEmission: 'positional' | 'joined' | 'list-file' | 'single-flag';
  targetFlag?: string | null;
  minVersion?: string | null;
  requiresRoot: boolean;
  /** Set only for a tool whose command construction can't be expressed by `fields`
   *  alone (ffuf today) — the form still renders every declared field normally, this
   *  is purely informational (e.g. to note the tool needs plugin-code support on the
   *  agent side). */
  customBuilder?: AgentToolSpecCustomBuilder | null;
  fields: AgentToolSpecField[];
}

/** Selector that the server resolves to a concrete `targets` list at task creation or schedule fire. */
export type TargetSelector =
  | { type: 'scope_entries';   kinds?: string[];     excludeValues?: string[] }
  | { type: 'project_assets';  assetTypes?: string[]; scopeStrict?: boolean; excludeValues?: string[] };

export interface PreviewTargetsResponse {
  count: number;
  /** Up to 1000 fully-resolved items — used by the dialog's exclude picker. */
  items: string[];
  /** Legacy alias kept for any older consumers; new code reads `items`. */
  sample?: string[];
}

export interface AgentTaskSchedule {
  id: number;
  name: string | null;
  projectId: number;
  poolId: number;
  tool: string;
  format: string;
  args: string;
  sourceIp: string | null;
  nacProfile: string | null;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  /** ISO timestamp — schedule lies dormant until then. */
  startAt: string | null;
  /** Max targets per task when the schedule fires. Null = no splitting. */
  batchSize: number | null;
  /** Per-fire target cap for coverage rotation. Null = no cap. */
  maxTargetsPerRun: number | null;
  /** Targets already visited in the current rotation cycle (JSONB array). */
  coveredValues: string[] | null;
  /** Duration (ms) of the most recently closed run. NULL until the first run finishes. */
  lastRunDurationMs: number | null;
  /** Running average over the last 10 closed runs. NULL until the first run finishes. */
  avgRunDurationMs: number | null;
  /** Minutes after dispatch/start before each fired task is auto-cancelled. Null = no timeout. */
  timeoutMinutes: number | null;
}

/** One execution of a schedule's cron — groups the N tasks it created. */
export interface AgentScheduleRun {
  id: number;
  scheduleId: number;
  startedAt: string;
  completedAt: string | null;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  totalDurationMs: number | null;
}

export const agentTaskSchedulesApi = {
  list(projectId: number) {
    return apiClient.get<AgentTaskSchedule[]>(`/projects/${projectId}/agent-task-schedules`).then((r) => r.data);
  },
  create(projectId: number, body: {
    name?: string | null;
    poolId: number;
    tool: string;
    format?: string;
    args: Record<string, unknown>;
    nacProfile?: string | null;
    cronExpression: string;
    enabled?: boolean;
    /** ISO timestamp. When in the future, the schedule waits until then before first fire. */
    startAt?: string | null;
    /** Max targets per task. Null = no splitting. */
    batchSize?: number | null;
    /** Per-fire target cap for coverage rotation. Null = no cap. */
    maxTargetsPerRun?: number | null;
    /** Minutes after dispatch/start before each fired task is auto-cancelled. Null = no timeout. */
    timeoutMinutes?: number | null;
  }) {
    return apiClient.post<AgentTaskSchedule>(`/projects/${projectId}/agent-task-schedules`, body).then((r) => r.data);
  },
  update(projectId: number, id: number, body: Partial<{
    name: string | null; poolId: number; tool: string; format: string; args: Record<string, unknown>;
    nacProfile: string | null; cronExpression: string; enabled: boolean; startAt: string | null;
    batchSize: number | null; maxTargetsPerRun: number | null; timeoutMinutes: number | null;
  }>) {
    return apiClient.patch<AgentTaskSchedule>(`/projects/${projectId}/agent-task-schedules/${id}`, body).then((r) => r.data);
  },
  delete(projectId: number, id: number) {
    return apiClient.delete<void>(`/projects/${projectId}/agent-task-schedules/${id}`).then((r) => r.data);
  },
  runNow(projectId: number, id: number) {
    return apiClient.post<AgentTaskSchedule>(`/projects/${projectId}/agent-task-schedules/${id}/run`).then((r) => r.data);
  },
  listRuns(projectId: number, scheduleId: number, limit = 20) {
    return apiClient
      .get<AgentScheduleRun[]>(`/projects/${projectId}/agent-task-schedules/${scheduleId}/runs`,
        { params: { limit } })
      .then((r) => r.data);
  },
};

/** Cross-project task entry returned by GET /api/v1/agent-tasks. */
export interface GlobalAgentTask {
  id: number;
  name: string | null;
  projectId: number;
  projectName: string | null;
  projectCode: string | null;
  organizationId: number | null;
  poolId: number;
  poolName: string | null;
  agentId: number | null;
  agentName: string | null;
  tool: string;
  format: string;
  /** JSON string — same tool-specific field set the create form's config panel captured. */
  args: string;
  nacProfile: string | null;
  status: AgentTaskStatus;
  priority: number;
  createdAt: string;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  scheduleId: number | null;
  actualDurationMs: number | null;
  exitCode: number | null;
  error: string | null;
  timeoutMinutes: number | null;
}

export const globalAgentTasksApi = {
  list(params?: { status?: string[]; tool?: string[]; poolId?: number; sortBy?: string; sortDir?: string; page?: number; size?: number }) {
    return apiClient
      .get<import('./organizations').PagedResponse<GlobalAgentTask>>('/agent-tasks', { params })
      .then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<GlobalAgentTask>(`/agent-tasks/${id}`).then((r) => r.data);
  },
  tools() {
    return apiClient.get<AgentToolSpec[]>('/agent-tasks/tools').then((r) => r.data);
  },
};

export const CRON_PRESETS = [
  { label: 'Hourly',                     value: '0 * * * *'  },
  { label: 'Every 6 hours',              value: '0 */6 * * *' },
  { label: 'Daily at 03:00',             value: '0 3 * * *'   },
  { label: 'Daily at 08:00',             value: '0 8 * * *'   },
  { label: 'Weekly (Mondays at 02:00)',  value: '0 2 * * 1'   },
];

export const agentTasksApi = {
  list(projectId: number, page = 0, size = 50) {
    return apiClient.get<PagedResponse<AgentTask>>(`/projects/${projectId}/agent-tasks`,
      { params: { page, size } }).then((r) => r.data);
  },
  tools(projectId: number) {
    return apiClient.get<AgentToolSpec[]>(`/projects/${projectId}/agent-tasks/tools`).then((r) => r.data);
  },
  create(projectId: number, body: {
    name?: string | null;
    poolId: number;
    tool: string;
    format?: string;
    /** Args may include either a literal `targets: string[]` or a `targetsFrom: TargetSelector` (mutually exclusive). */
    args: Record<string, unknown>;
    /** NAC profile is operator-declared; sourceIp is now resolved by the agent at runtime. */
    nacProfile?: string | null;
    priority?: number;
    /** ISO timestamp. Future ⇒ delayed one-shot. Null/past ⇒ run ASAP. */
    scheduledFor?: string | null;
    /**
     * Max targets per task. When set and targets > batchSize, the server creates one task
     * per batch and returns an array of N tasks. Null = no splitting.
     */
    batchSize?: number | null;
    /** Skip time_window rule enforcement — for passive scans safe to run outside testing hours. */
    bypassTimeWindow?: boolean;
    /** Minutes after dispatch/start before this task is auto-cancelled. Null = no timeout. */
    timeoutMinutes?: number | null;
  }) {
    return apiClient.post<AgentTask[]>(`/projects/${projectId}/agent-tasks`, body).then((r) => r.data);
  },
  cancel(projectId: number, taskId: number) {
    return apiClient.post<AgentTask>(`/projects/${projectId}/agent-tasks/${taskId}/cancel`).then((r) => r.data);
  },
  previewTargets(projectId: number, targetsFrom: TargetSelector) {
    return apiClient
      .post<PreviewTargetsResponse>(`/projects/${projectId}/agent-tasks/preview-targets`, { targetsFrom })
      .then((r) => r.data);
  },
};
