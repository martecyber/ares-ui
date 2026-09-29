import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { Tag } from './tags';

export interface Finding {
  id: number;
  projectId: number;
  code: string | null;
  /** null when the finding has no default score yet — shown as the "P?" placeholder. */
  severity: string | null;
  title: string;
  statusId: number;
  statusName: string;
  creatorId: number;
  isDraft: boolean;
  isReadyToReport: boolean;
  reportedAt: string | null;
  resolvedAt: string | null;
  dueDate: string | null;
  iterationLabel: string | null;
  fields: FindingField[];
  scores: FindingScore[];
  affections: FindingAffection[];
  references: FindingReference[];
  statusHistory: FindingStatusHistory[];
  remediationStatus: string | null; // 'open' | 'closed' | null (null when draft)
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
}

export interface FindingField {
  id: number;
  typeId: number;
  typeTitle: string;
  fieldText: string;
  createdAt: string;
  updatedAt: string;
}

export interface FindingScore {
  id: number;
  typeId: number;
  typeTitle: string;
  score: number;
  vector: string | null;
  isDefault: boolean;
  comment: string | null;
  metadata: string | null;
  /** Set when scored via the SSVC methodology engine — links to the exact decision-tree
   *  leaf resolved to, so re-opening the score for edit can restore the wizard's path. */
  ssvcLeafNodeId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FindingAffection {
  id: number;
  code: string;
  title: string | null;
  description: string | null;
  detectedAt: Array<{
    id: string;
    type: string;
    identifier: string;
    observedAt: string | null;
    detections: Array<{ id: number; title: string; status: string; severity: string }>;
    /** Affects assets the operator has explicitly linked to this detected_at. */
    affects: Array<{ id: string; type: string; identifier: string; status: string }>;
  }>;
  /** Union of all affects across every detected_at (legacy flat view). */
  affects: Array<{ id: string; type: string; identifier: string; status: string }>;
  status: string; // 'open' | 'closed'
  createdAt: string;
  updatedAt: string;
}

export const AFFECT_STATUSES = ['open', 'resolved', 'accepted_risk', 'false_positive'] as const;
export type AffectStatus = typeof AFFECT_STATUSES[number];

export function affectStatusLabel(s: string): string {
  const m: Record<string, string> = {
    open: 'Open', resolved: 'Resolved',
    accepted_risk: 'Accepted risk', false_positive: 'False positive',
  };
  return m[s] ?? s;
}

export function affectStatusSeverity(s: string): string {
  switch (s) {
    case 'open':           return 'danger';
    case 'resolved':       return 'success';
    case 'accepted_risk':  return 'warn';
    case 'false_positive': return 'secondary';
    default:               return 'secondary';
  }
}

export interface FindingReference {
  id: number;
  catalogId: number;
  catalogCode: string;
  title: string;
  description: string | null;
  url: string | null;
  faviconUrl: string | null;
}

export interface FindingStatusHistory {
  findingId: number;
  findingStatusId: number;
  statusName: string;
  changedAt: string;
}

export interface FindingScoreType {
  id: number;
  title: string;
  description: string | null;
}

export interface FindingStatus {
  id: number;
  name: string;
  description: string | null;
  meansClosed: boolean;
}

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

export const DRAFT_STATUSES = ['drafting', 'pending_review', 'ready_to_publish'] as const;
export const PUBLISHED_STATUSES = ['open', 'resolved', 'accepted_risk', 'false_positive'] as const;

export function statusLabel(name: string): string {
  const labels: Record<string, string> = {
    drafting:         'Drafting',
    pending_review:   'Pending review',
    ready_to_publish: 'Ready to publish',
    open:             'Open',
    in_review:        'Under review',
    resolved:         'Resolved',
    accepted_risk:    'Accepted risk',
    false_positive:   'False positive',
    // legacy Spanish names kept for backward compat (pre-V169 finding_status rows)
    redactando:           'Drafting',
    revision:             'Pending review',
    listo_para_publicar:  'Ready to publish',
    abierto:              'Open',
    en_revision:          'Under review',
    resuelto:             'Resolved',
    riesgo_asumido:       'Accepted risk',
    falso_positivo:       'False positive',
  };
  return labels[name] ?? name;
}

export type StatusSeverity = 'secondary' | 'warn' | 'info' | 'danger' | 'success';

export function statusSeverity(name: string): StatusSeverity {
  switch (name) {
    case 'drafting':          return 'secondary';
    case 'pending_review':    return 'warn';
    case 'ready_to_publish':  return 'info';
    case 'open':              return 'danger';
    case 'in_review':         return 'warn';
    case 'resolved':          return 'success';
    case 'accepted_risk':     return 'warn';
    case 'false_positive':    return 'secondary';
    // legacy Spanish names
    case 'redactando':          return 'secondary';
    case 'revision':            return 'warn';
    case 'listo_para_publicar': return 'info';
    case 'abierto':              return 'danger';
    case 'en_revision':          return 'warn';
    case 'resuelto':             return 'success';
    case 'riesgo_asumido':       return 'warn';
    case 'falso_positivo':       return 'secondary';
    default:                    return 'secondary';
  }
}

export function severitySeverity(s: string | null): string {
  switch (s) {
    case 'critical': return 'critical';
    case 'high':     return 'high';
    case 'medium':   return 'medium';
    case 'low':      return 'low';
    case 'info':     return 'info';
    default:         return 'secondary';
  }
}

export interface AffectedAsset {
  id: number;
  type: string;
  identifier: string;
}

export const findingsApi = {
  list(params: { projectId?: number; projectIds?: number[]; organizationId?: number; includeDrafts?: boolean; severity?: string | string[]; statusId?: number | number[]; iterationLabel?: string; q?: string; aql?: string; sortBy?: string; sortDir?: string; page?: number; size?: number } = {}) {
    return apiClient.get<PagedResponse<Finding>>('/findings', { params }).then((r) => r.data);
  },
  /** Distinct assets touched by every finding matching the given filter — same params/
   *  coexistence rule as list(), aggregated across the whole matching set, not one page. */
  affectedAssets(params: { projectId?: number; projectIds?: number[]; organizationId?: number; includeDrafts?: boolean; severity?: string | string[]; statusId?: number | number[]; iterationLabel?: string; q?: string; aql?: string } = {}) {
    return apiClient.get<AffectedAsset[]>('/findings/affected-assets', { params }).then((r) => r.data);
  },
  listByAsset(assetId: number, opts: { projectId?: number; organizationId?: number } = {}) {
    return apiClient.get<Finding[]>('/findings/by-asset', { params: { assetId, ...opts } }).then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<Finding>(`/findings/${id}`).then((r) => r.data);
  },
  create(body: {
    projectId: number;
    title: string;
    severity?: string;
    statusId?: number;
    templateId?: number | null;
    isDraft?: boolean;
    fields?: { typeId: number; fieldText?: string }[];
    scores?: { typeId: number; score: number; vector?: string; isDefault?: boolean; ssvcLeafNodeId?: number }[];
    referenceIds?: number[];
    // Omit to create the finding with no affection yet — the escalation wizard adds one
    // separately via addAffection() once its own target/edit steps resolve it.
    affection?: { title?: string; description?: string; affectsIds?: number[]; detectedAtIds?: number[] };
  }) {
    return apiClient.post<Finding>('/findings', body).then((r) => r.data);
  },
  // projectId must be the finding's own project — the backend rejects edits attempted
  // from any other project context (e.g. a RETEST project that only has this finding
  // in scope for read-only verification).
  update(id: number, projectId: number, body: { title?: string; severity?: string; statusId?: number; dueDate?: string | null; clearDueDate?: boolean }) {
    return apiClient.patch<Finding>(`/findings/${id}`, body, { params: { projectId } }).then((r) => r.data);
  },
  updateField(findingId: number, projectId: number, fieldId: number, fieldText: string) {
    return apiClient.patch<Finding>(`/findings/${findingId}/fields/${fieldId}`, { fieldText }, { params: { projectId } }).then((r) => r.data);
  },
  addField(findingId: number, projectId: number, typeId: number, fieldText?: string) {
    return apiClient.post<Finding>(`/findings/${findingId}/fields`, { typeId, fieldText }, { params: { projectId } }).then((r) => r.data);
  },
  removeField(findingId: number, projectId: number, fieldId: number) {
    return apiClient.delete<Finding>(`/findings/${findingId}/fields/${fieldId}`, { params: { projectId } }).then((r) => r.data);
  },
  addScore(id: number, projectId: number, body: { typeId: number; score: number; vector?: string; isDefault?: boolean; comment?: string; ssvcLeafNodeId?: number }) {
    return apiClient.post<Finding>(`/findings/${id}/scores`, body, { params: { projectId } }).then((r) => r.data);
  },
  updateScore(findingId: number, projectId: number, scoreId: number, score: number, vector?: string, isDefault?: boolean, comment?: string, ssvcLeafNodeId?: number | null) {
    return apiClient.patch<Finding>(`/findings/${findingId}/scores/${scoreId}`, { score, vector, isDefault, comment, ssvcLeafNodeId }, { params: { projectId } }).then((r) => r.data);
  },
  removeScore(id: number, projectId: number, scoreId: number) {
    return apiClient.delete<Finding>(`/findings/${id}/scores/${scoreId}`, { params: { projectId } }).then((r) => r.data);
  },
  addReference(id: number, projectId: number, referenceId: number) {
    return apiClient.post<Finding>(`/findings/${id}/references/${referenceId}`, null, { params: { projectId } }).then((r) => r.data);
  },
  removeReference(id: number, projectId: number, referenceId: number) {
    return apiClient.delete<Finding>(`/findings/${id}/references/${referenceId}`, { params: { projectId } }).then((r) => r.data);
  },
  assignTag(id: number, projectId: number, tagId: number) {
    return apiClient.post<Finding>(`/findings/${id}/tags/${tagId}`, null, { params: { projectId } }).then((r) => r.data);
  },
  unassignTag(id: number, projectId: number, tagId: number) {
    return apiClient.delete<Finding>(`/findings/${id}/tags/${tagId}`, { params: { projectId } }).then((r) => r.data);
  },
  delete(id: number, projectId: number) {
    return apiClient.delete<void>(`/findings/${id}`, { params: { projectId } }).then((r) => r.data);
  },
  addAffection(id: number, projectId: number, body: { title?: string; description?: string; affectsIds?: number[]; detectedAtIds?: number[] }) {
    return apiClient.post<Finding>(`/findings/${id}/affections`, body, { params: { projectId } }).then((r) => r.data);
  },
  publish(id: number, projectId: number) {
    return apiClient.post<Finding>(`/findings/${id}/publish`, null, { params: { projectId } }).then((r) => r.data);
  },
  publishBatch(projectId: number, ids: number[]) {
    return apiClient.post<Finding[]>('/findings/publish-batch', { ids }, { params: { projectId } }).then((r) => r.data);
  },
  publishAllReady(projectId: number) {
    return apiClient.post<Finding[]>('/findings/publish-all-ready', null, { params: { projectId } }).then((r) => r.data);
  },
  saveAsTemplate(id: number, projectId: number) {
    return apiClient.post(`/findings/${id}/save-as-template`, null, { params: { projectId } }).then((r) => r.data);
  },
  markReadyToReport(id: number, projectId: number) {
    return apiClient.post<Finding>(`/findings/${id}/ready-to-report`, null, { params: { projectId } }).then((r) => r.data);
  },
  unmarkReadyToReport(id: number, projectId: number) {
    return apiClient.delete<Finding>(`/findings/${id}/ready-to-report`, { params: { projectId } }).then((r) => r.data);
  },
  listScoreTypes() {
    return apiClient.get<FindingScoreType[]>('/findings/score-types').then((r) => r.data);
  },
  listStatuses() {
    return apiClient.get<FindingStatus[]>('/findings/statuses').then((r) => r.data);
  },
  /** Manual "Report" button — email this finding directly, no workflow or Report entity
   *  involved. Only a published (non-draft) finding can be reported; the backend enforces it. */
  sendEmail(id: number, body: { emailTemplateId: number; integrationId: number; to: string[]; cc?: string[]; bcc?: string[] }) {
    return apiClient.post<void>(`/findings/${id}/send-email`, body).then(() => {});
  },
  /** "Preview" button in the "Report" dialog — the subject/HTML an actual send would produce,
   *  without sending or requiring an integration/recipients to be chosen yet. */
  previewEmail(id: number, emailTemplateId: number) {
    return apiClient.get<{ subject: string; html: string }>(`/findings/${id}/email-preview`, { params: { emailTemplateId } }).then((r) => r.data);
  },
  /** Recipients to pre-fill the "Report" dialog's To/CC/BCC with, resolved from this finding's
   *  project's "email_recipients" Rules of Engagement — purely a suggestion. */
  suggestedRecipients(id: number) {
    return apiClient.get<SuggestedRecipients>(`/findings/${id}/suggested-recipients`).then((r) => r.data);
  },
};

export interface SuggestedRecipient {
  email: string;
  label: string | null;
  ruleId: number;
  ruleNote: string | null;
}

export interface SuggestedRecipients {
  to: SuggestedRecipient[];
  cc: SuggestedRecipient[];
  bcc: SuggestedRecipient[];
}
