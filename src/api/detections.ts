import { apiClient as api } from './client';
import type { Tag } from './tags';
import type { PagedResponse } from './organizations';

export interface DetectionReference {
  id: number;
  catalogId: number;
  catalogCode: string;
  title: string;
  description: string | null;
  url: string | null;
  faviconUrl: string | null;
  kevListed: boolean;
  exploitCount: number;
}

export interface DetectionScore {
  typeId: number;
  typeTitle: string;
  score: number;
  metadata: string | null;
  isDefault: boolean;
}

export interface DetectionAffectedAssetRef {
  id: number;
  code: string | null;
  identifier: string | null;
  type: string | null;
}

export interface Detection {
  id: number;
  projectId: number;
  assetId: number | null;
  assetCode: string | null;
  assetIdentifier: string | null;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  rawData: string | null;
  sourceType: string | null;
  sourceTemplateId: string | null;
  occurrenceCount: number;
  createdAt: string;
  updatedAt: string;
  lastSeen: string | null;
  references: DetectionReference[];
  scores: DetectionScore[];
  /**
   * Assets the operator considers impacted by this detection. By default
   * contains the detection's own assetId (set on import). May be empty
   * (operator cleared the list) or contain multiple assets of any type.
   */
  affectedAssets: DetectionAffectedAssetRef[];
  tags?: Tag[];
}

export interface EscalateRequest {
  mode: 'new_finding' | 'existing_finding';
  findingId?: number;
  title?: string;
  severity?: string;
  projectId?: number;
  assetId?: number | null;
}

/** Atomic multi-detection escalation — the escalation wizard's final step always calls this in
 *  existing_finding/existing_affection mode, since by then it has already resolved (created or
 *  picked) both ids via the richer finding/affection endpoints. The new_finding/new_affection
 *  modes still exist server-side but aren't used by the current UI. */
export interface EscalateBatchRequest {
  detectionIds: number[];
  findingMode: 'new_finding' | 'existing_finding';
  findingId?: number;
  findingTitle?: string;
  findingSeverity?: string;
  projectId?: number;
  affectionMode: 'new_affection' | 'existing_affection';
  affectionId?: number;
  affectionTitle?: string;
  affectionDescription?: string;
}

export interface EscalationResult {
  findingId: number;
  affectionId: number;
  detectionCount: number;
}

interface ListParams {
  projectId?: number;
  assetId?: number[];
  severity?: string[];
  status?: string[];
  sourceType?: string[];
  q?: string;
  aql?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  size?: number;
}

export interface DetectionAffection {
  affectionId:      number;
  affectionCode:    string;
  affectionTitle:   string | null;
  affectionDescription: string | null;
  affectionStatus:  string;
  findingId:        number | null;
  findingCode:      string | null;
  findingTitle:     string | null;
  findingSeverity:  string | null;
  findingStatusName: string | null;
}

export interface DetectionStatusHistoryItem {
  id: number;
  eventType: 'created' | 'reseen' | 'status_changed';
  fromStatus: string | null;
  toStatus: string | null;
  changedBy: number | null;
  changedByName: string | null;
  note: string | null;
  changedAt: string;
}

export const DETECTION_STATUSES = [
  'new', 'under_investigation', 'affected', 'not_affected', 'ignored',
  'fixed', 'reopened',
] as const;

export type DetectionStatus = typeof DETECTION_STATUSES[number];

// "affected" and "under_investigation" are deliberately absent as VALUES here (never a manual
// "change status" target) — affected is only reachable via the escalate flow, under_investigation
// only via "add to Research Board" / a board's resolution actions.
export const DETECTION_STATUS_TRANSITIONS: Record<string, string[]> = {
  'new':          ['not_affected', 'ignored'],
  'affected':     ['fixed', 'not_affected', 'ignored'],
  'reopened':     ['fixed', 'not_affected', 'ignored'],
  'fixed':        ['reopened'],
  'not_affected': ['reopened'],
  'ignored':      ['reopened'],
};

const STATUS_LABELS: Record<string, string> = {
  'new':                 'New',
  'under_investigation': 'Under Investigation',
  'affected':            'Affected',
  'reopened':            'Reopened',
  'fixed':               'Fixed',
  'not_affected':        'Not Affected',
  'ignored':             'Ignored',
};

export function detectionStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type DetectionStatusSeverity = 'info' | 'contrast' | 'warn' | 'danger' | 'success' | 'secondary';

export function detectionStatusSeverity(status: string): DetectionStatusSeverity {
  switch (status) {
    case 'new':                 return 'info';
    case 'under_investigation': return 'contrast';
    case 'affected':            return 'warn';
    case 'reopened':            return 'danger';
    case 'fixed':               return 'success';
    case 'not_affected':
    case 'ignored':
    default:                    return 'secondary';
  }
}

export const detectionsApi = {
  list(params: ListParams = {}): Promise<{ items: Detection[]; total: number; totalPages: number; page: number; size: number }> {
    return api.get('/detections', { params }).then((r) => r.data);
  },

  get(id: number): Promise<Detection> {
    return api.get(`/detections/${id}`).then((r) => r.data);
  },

  updateStatus(id: number, status: string, note?: string): Promise<Detection> {
    return api.patch(`/detections/${id}/status`, { status, note }).then((r) => r.data);
  },

  /** Newest first, paginated (default 20/page) — a long-lived MONITOR project's detection can
   *  otherwise accumulate an unbounded number of "reseen" rows across rescans. */
  getHistory(id: number, page = 0, size = 10): Promise<PagedResponse<DetectionStatusHistoryItem>> {
    return api.get(`/detections/${id}/history`, { params: { page, size } }).then((r) => r.data);
  },

  escalate(id: number, req: EscalateRequest): Promise<Detection> {
    return api.post(`/detections/${id}/escalate`, req).then((r) => r.data);
  },

  escalateBatch(req: EscalateBatchRequest): Promise<EscalationResult> {
    return api.post('/detections/escalate-batch', req).then((r) => r.data);
  },

  getAffections(id: number): Promise<DetectionAffection[]> {
    return api.get(`/detections/${id}/affections`).then((r) => r.data);
  },

  sources(projectId: number): Promise<string[]> {
    return api.get('/detections/sources', { params: { projectId } }).then((r) => r.data);
  },

  detectionAssets(projectId: number): Promise<{ id: number; code: string | null; identifier: string | null }[]> {
    return api.get('/detections/assets', { params: { projectId } }).then((r) => r.data);
  },

  /** Replaces the full list of affected assets. Pass an empty array to clear. */
  setAffectedAssets(id: number, assetIds: number[]): Promise<Detection> {
    return api.put(`/detections/${id}/affected-assets`, { assetIds }).then((r) => r.data);
  },

  // ── HTTP request/response samples ──────────────────────────────────────────
  listHttpSamples(id: number): Promise<DetectionHttpSample[]> {
    return api.get(`/detections/${id}/http-samples`).then((r) => r.data);
  },
  createHttpSample(id: number, body: HttpSampleInput): Promise<DetectionHttpSample> {
    return api.post(`/detections/${id}/http-samples`, body).then((r) => r.data);
  },
  updateHttpSample(id: number, sampleId: number, body: HttpSampleInput): Promise<DetectionHttpSample> {
    return api.patch(`/detections/${id}/http-samples/${sampleId}`, body).then((r) => r.data);
  },
  deleteHttpSample(id: number, sampleId: number): Promise<void> {
    return api.delete(`/detections/${id}/http-samples/${sampleId}`).then((r) => r.data);
  },
  assignTag(id: number, tagId: number): Promise<Detection> {
    return api.post(`/detections/${id}/tags/${tagId}`).then((r) => r.data);
  },
  unassignTag(id: number, tagId: number): Promise<Detection> {
    return api.delete(`/detections/${id}/tags/${tagId}`).then((r) => r.data);
  },
};

export interface DetectionHttpSample {
  id: number;
  detectionId: number;
  label: string | null;
  requestContent: string | null;
  responseContent: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface HttpSampleInput {
  label?: string;
  requestContent?: string;
  responseContent?: string;
  notes?: string;
}
