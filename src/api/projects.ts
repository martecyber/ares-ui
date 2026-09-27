import { apiClient } from './client';
import type { PagedResponse } from './organizations';

export type ProjectStatus = 'scheduled' | 'active' | 'past_due' | 'completed';

export interface ScopeEntryMatch {
  id: number;
  kind: string;
  value: string;
  inScope: boolean;
}

export interface ScopePropagationSource {
  assetId: number;
  identifier: string;
  type: string;
  relationshipType: string;
  direction: 'forward' | 'reverse';
  status: string;
  override: boolean;
  directMatches: ScopeEntryMatch[];
}

export interface ScopeExplain {
  status: string;
  override: boolean;
  directMatches: ScopeEntryMatch[];
  propagationSources: ScopePropagationSource[];
}

export interface Project {
  id: number;
  organizationId: number;
  organizationName: string;
  name: string;
  code: string | null;
  typeId: number | null;
  typeName: string | null;
  typeCode: string | null;
  /** Code of the parent type; null for root project types. */
  supertypeCode?: string | null;
  /** Computed by backend: scheduled | active | past_due | completed */
  status: ProjectStatus;
  /** ISO date: "YYYY-MM-DD" */
  startDate: string | null;
  /** ISO date: "YYYY-MM-DD" */
  endDate: string | null;
  completedAt: string | null;
  ownerUserId: number | null;
  scopeEntries: ScopeEntry[];
  members: ProjectMember[];
  createdAt: string;
  updatedAt: string | null;
  /** Iteration cadence for MONITOR projects: weekly|biweekly|monthly|quarterly|semiannual|annual */
  iterationCadence?: string | null;
  /** When true, MONITOR iterations advance automatically with the calendar; when false
   *  (default), advancing to a new iteration requires manual approval. */
  autoAdvanceIterations?: boolean;
  /** When true, CLIENT_USER/CLIENT_ADMIN accounts can view this project's Detections
   *  read-only. Off by default. */
  clientsCanViewDetections?: boolean;
}

export interface ScopeEntry {
  id: number;
  projectId: number;
  kind: string;
  value: string;
  notes: string | null;
  metadata: string | null;
  inScope: boolean;
  /** 'manual' or platform name for imported entries (e.g. 'bugcrowd'). */
  source: string;
  /** External ID on the originating platform; null for manual entries. */
  externalId: string | null;
  /** Ares-side: when this record was first created in Ares. */
  createdAt: string;
  /** Ares-side: when this record was last modified in Ares. Null for synced entries that haven't changed. */
  updatedAt: string | null;
  /** Platform-side: when the scope target was created on the originating platform. Null for manual entries. */
  platformCreatedAt: string | null;
  /** Platform-side: when the scope target was last updated on the originating platform. Null for manual entries. */
  platformUpdatedAt: string | null;
}

export interface ProjectMember {
  userId: number;
  userEmail: string;
  userDisplayName: string;
  role: string;
  addedAt: string;
}

export interface CreateProjectRequest {
  organizationId: number;
  name: string;
  typeId?: number;
  code?: string;
  startDate?: string;
  endDate?: string;
  ownerUserId?: number;
  iterationCadence?: string | null;
  autoAdvanceIterations?: boolean;
}

export interface UpdateProjectRequest {
  name?: string;
  typeId?: number;
  startDate?: string;
  endDate?: string;
  ownerUserId?: number;
  iterationCadence?: string | null;
  autoAdvanceIterations?: boolean | null;
  clientsCanViewDetections?: boolean | null;
}

export const SCOPE_KINDS = [
  { label: 'Domain',          value: 'domain'         },
  { label: 'Domain Wildcard', value: 'domain_wildcard' },
  { label: 'URL',             value: 'url'            },
  { label: 'URL Wildcard',    value: 'url_wildcard'   },
  { label: 'IP',              value: 'ip'             },
  { label: 'IP Wildcard',     value: 'ip_wildcard'    },
  { label: 'CIDR',            value: 'cidr'           },
  { label: 'Android App',     value: 'android_app'    },
  { label: 'iOS App',         value: 'ios_app'        },
  { label: 'Windows App',     value: 'windows_app'    },
  { label: 'Hardware',        value: 'hardware'       },
  { label: 'Other',           value: 'other'          },
];

export const SCOPE_KIND_META: Record<string, { label: string; color: string }> = {
  domain:          { label: 'Domain',   color: '#2563EB' }, // blue-600
  domain_wildcard: { label: '*.Domain', color: '#4F46E5' }, // indigo-600
  url:             { label: 'URL',      color: '#16A34A' }, // green-600
  url_wildcard:    { label: 'URL/*',    color: '#0D9488' }, // teal-600
  ip:              { label: 'IP',       color: '#D97706' }, // amber-600
  ip_wildcard:     { label: 'IP.*',     color: '#EA580C' }, // orange-600
  cidr:            { label: 'CIDR',     color: '#DC2626' }, // red-600
  android_app:     { label: 'Android',  color: '#15803D' }, // green-700
  ios_app:         { label: 'iOS',      color: '#0369A1' }, // sky-700
  windows_app:     { label: 'Windows',  color: '#0078D4' }, // Windows blue
  hardware:        { label: 'Hardware', color: '#7C3AED' }, // violet-600
  text_contains:   { label: 'Text',     color: '#9333EA' }, // purple-600
  other:           { label: 'Other',    color: '#4B5563' }, // gray-600
};

export const STATUS_OPTIONS: { label: string; value: ProjectStatus }[] = [
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Active',    value: 'active' },
  { label: 'Past Due',  value: 'past_due' },
  { label: 'Completed', value: 'completed' },
];

export function statusSeverity(status: ProjectStatus | string): 'info' | 'success' | 'danger' | 'secondary' | 'warn' {
  switch (status) {
    case 'scheduled': return 'info';
    case 'active':    return 'success';
    case 'past_due':  return 'danger';
    case 'completed': return 'secondary';
    default:          return 'secondary';
  }
}

/** Returns true for BH master type and all platform subtypes (BH_BC, BH_YWH, etc.). */
export function isBugHunting(typeCode: string | null | undefined): boolean {
  if (!typeCode) return false;
  return typeCode === 'BH' || typeCode.startsWith('BH_');
}

/** Returns true for MONITOR master type and any user-defined subtypes of it. */
export function isMonitoring(typeCode: string | null | undefined, supertypeCode?: string | null): boolean {
  if (!typeCode) return false;
  return typeCode === 'MONITOR' || typeCode.startsWith('MONITOR_') || supertypeCode === 'MONITOR';
}

/** Returns true for ASSESS master type and any user-defined subtypes of it. */
export function isAssessment(typeCode: string | null | undefined, supertypeCode?: string | null): boolean {
  if (!typeCode) return false;
  return typeCode === 'ASSESS' || typeCode.startsWith('ASSESS_') || supertypeCode === 'ASSESS';
}

/** Returns true for RETEST master type and any user-defined subtypes of it — all behave like the root. */
export function isRetest(typeCode: string | null | undefined, supertypeCode?: string | null): boolean {
  if (!typeCode) return false;
  return typeCode === 'RETEST' || typeCode.startsWith('RETEST_') || supertypeCode === 'RETEST';
}

export const ITERATION_CADENCES = [
  { label: 'Weekly',      value: 'weekly'     },
  { label: 'Bi-Weekly',   value: 'biweekly'   },
  { label: 'Monthly',     value: 'monthly'    },
  { label: 'Quarterly',   value: 'quarterly'  },
  { label: 'Semi-Annual', value: 'semiannual' },
  { label: 'Annual',      value: 'annual'     },
] as const;

export type IterationCadence = typeof ITERATION_CADENCES[number]['value'];

export interface MonitorStats {
  byStatus: Record<string, number>;
  outOfSla: number;
  currentIterationLabel: string | null;
  /** Non-null only when it differs from currentIterationLabel — a new period has started
   *  but the manual approval jump hasn't happened yet. */
  pendingIterationLabel: string | null;
  awaitingApproval: boolean;
  autoAdvanceIterations: boolean;
  byIteration: Array<{ label: string; reported: number; resolved: number; openAtEnd: number }>;
  /** Detections that entered each area during an iteration — a detection can count in more than
   *  one column if it transitioned through multiple areas within the same iteration (e.g.
   *  opened then closed in the same period counts for both). */
  detectionsByIteration: Array<{ label: string; opened: number; escalated: number; closed: number }>;
}

export function statusLabel(status: ProjectStatus | string): string {
  switch (status) {
    case 'scheduled': return 'Scheduled';
    case 'active':    return 'Active';
    case 'past_due':  return 'Past Due';
    case 'completed': return 'Completed';
    default:          return status;
  }
}

export const projectsApi = {
  schedule(start: string, end: string) {
    return apiClient.get<Project[]>('/projects/schedule', { params: { start, end } }).then((r) => r.data);
  },
  previewCode(organizationId: number, typeId?: number) {
    return apiClient.get<{ code: string }>('/projects/preview-code', { params: { organizationId, typeId } })
      .then((r) => r.data.code);
  },
  list(params: { organizationId?: number; status?: ProjectStatus | string; page?: number; size?: number } = {}) {
    return apiClient.get<PagedResponse<Project>>('/projects', { params }).then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<Project>(`/projects/${id}`).then((r) => r.data);
  },
  create(body: CreateProjectRequest) {
    return apiClient.post<Project>('/projects', body).then((r) => r.data);
  },
  update(id: number, body: UpdateProjectRequest) {
    return apiClient.patch<Project>(`/projects/${id}`, body).then((r) => r.data);
  },
  complete(id: number) {
    return apiClient.post<Project>(`/projects/${id}/complete`).then((r) => r.data);
  },
  reopen(id: number) {
    return apiClient.post<Project>(`/projects/${id}/reopen`).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/projects/${id}`).then((r) => r.data);
  },
  addScope(id: number, body: { kind: string; value: string; notes?: string; metadata?: string; inScope?: boolean }) {
    return apiClient.post<ScopeEntry[]>(`/projects/${id}/scope`, body).then((r) => r.data);
  },
  removeScope(id: number, entryId: number) {
    return apiClient.delete<void>(`/projects/${id}/scope/${entryId}`).then((r) => r.data);
  },
  deriveAssets(id: number) {
    return apiClient.post<{ derived: number; skipped: number }>(`/projects/${id}/scope/derive`).then((r) => r.data);
  },
  classifyScope(id: number) {
    return apiClient.post<{ scheduled: boolean }>(`/projects/${id}/classify-scope`).then((r) => r.data);
  },
  classifyScopeStatus(id: number) {
    return apiClient.get<{ running: boolean }>(`/projects/${id}/classify-scope/status`).then((r) => r.data);
  },
  getScopeStatuses(id: number) {
    return apiClient.get<Record<string, { status: string; override: boolean }>>(`/projects/${id}/scope-status`).then((r) => r.data);
  },
  setScopeOverride(id: number, assetId: number, status: string) {
    return apiClient.patch<{ status: string; override: boolean }>(`/projects/${id}/scope-status/${assetId}`, { status }).then((r) => r.data);
  },
  clearScopeOverride(id: number, assetId: number) {
    return apiClient.delete<void>(`/projects/${id}/scope-status/${assetId}/override`).then((r) => r.data);
  },
  explainScope(id: number, assetId: number) {
    return apiClient.get<ScopeExplain>(`/projects/${id}/assets/${assetId}/scope-explain`).then((r) => r.data);
  },
  myRole(id: number): Promise<'admin' | 'lead' | 'operator' | null> {
    return apiClient.get<{ role: string }>(`/projects/${id}/my-role`)
      .then((r) => (r.data.role || null) as 'admin' | 'lead' | 'operator' | null);
  },
  addMember(id: number, body: { userId: number; role?: string }) {
    return apiClient.post<ProjectMember>(`/projects/${id}/members`, body).then((r) => r.data);
  },
  removeMember(id: number, userId: number, role: string) {
    return apiClient.delete<void>(`/projects/${id}/members/${userId}`, { params: { role } }).then((r) => r.data);
  },
  listAssets(id: number) {
    return apiClient.get<number[]>(`/projects/${id}/assets`).then((r) => r.data);
  },
  addAsset(id: number, assetId: number) {
    return apiClient.post<void>(`/projects/${id}/assets/${assetId}`).then((r) => r.data);
  },
  removeAsset(id: number, assetId: number) {
    return apiClient.delete<void>(`/projects/${id}/assets/${assetId}`).then((r) => r.data);
  },
  /** Hides a relationship from this project's graph — the relationship itself (org-wide)
   *  is untouched; use assetsApi.removeRelationship for a permanent org-level delete. */
  hideRelationship(id: number, fromAssetId: number, toAssetId: number, linkType: string) {
    return apiClient
      .delete<void>(`/projects/${id}/relationships`, { params: { fromAssetId, toAssetId, linkType } })
      .then((r) => r.data);
  },
  addAssetManually(id: number, type: string, identifier: string, metadata?: Record<string, unknown>, hostSubtype?: string,
                   hostnames?: string[]): Promise<{ id: number; code: string; type: string; identifier: string; created: boolean }> {
    return apiClient.post(`/projects/${id}/assets/manual`, { type, identifier, metadata, hostSubtype, hostnames }).then((r) => r.data);
  },
  monitorStats(id: number) {
    return apiClient.get<MonitorStats>(`/projects/${id}/monitor-stats`).then((r) => r.data);
  },
  approveIteration(id: number) {
    return apiClient.post<Project>(`/projects/${id}/approve-iteration`).then(() => projectsApi.monitorStats(id));
  },
};
