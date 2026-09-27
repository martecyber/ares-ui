import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { Tag } from './tags';

export interface FindingTemplateField {
  id: number;
  typeId: number;
  fieldText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FindingTemplateScore {
  id: number;
  typeId: number;
  score: number;
  metadata: string | null;
  isDefault: boolean;
  /** Set when scored via the SSVC methodology engine — links to the exact decision-tree
   *  leaf resolved to, so re-opening the score for edit can restore the wizard's path. */
  ssvcLeafNodeId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FindingTemplateReference {
  id: number;
  catalogId: number;
  catalogCode: string;
  title: string;
  description: string | null;
  url: string | null;
  faviconUrl: string | null;
}

export interface FindingTemplate {
  id: number;
  /** null when the template has no default score yet — shown as the "P?" placeholder. */
  severity: string | null;
  title: string;
  creatorId: number | null;
  fields: FindingTemplateField[];
  scores: FindingTemplateScore[];
  references: FindingTemplateReference[];
  createdAt: string;
  updatedAt: string;
  /** Only platform tags (no organization of their own) can ever be assigned — FindingTemplate
   *  has no organization to match an org-scoped tag against. */
  tags: Tag[];
}

export const findingTemplatesApi = {
  list(params: { page?: number; size?: number } = {}) {
    return apiClient.get<PagedResponse<FindingTemplate>>('/finding-templates', { params }).then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<FindingTemplate>(`/finding-templates/${id}`).then((r) => r.data);
  },
  updateMeta(id: number, body: { title?: string; severity?: string }) {
    return apiClient.patch<FindingTemplate>(`/finding-templates/${id}`, body).then((r) => r.data);
  },
  updateField(templateId: number, fieldId: number, fieldText: string) {
    return apiClient.patch<FindingTemplate>(`/finding-templates/${templateId}/fields/${fieldId}`, { fieldText }).then((r) => r.data);
  },
  addField(templateId: number, typeId: number, fieldText?: string) {
    return apiClient.post<FindingTemplate>(`/finding-templates/${templateId}/fields`, { typeId, fieldText }).then((r) => r.data);
  },
  removeField(templateId: number, fieldId: number) {
    return apiClient.delete<FindingTemplate>(`/finding-templates/${templateId}/fields/${fieldId}`).then((r) => r.data);
  },
  replaceScores(id: number, scores: { typeId: number; score: number; metadata?: string; isDefault?: boolean; ssvcLeafNodeId?: number }[]) {
    return apiClient.put<FindingTemplate>(`/finding-templates/${id}/scores`, scores).then((r) => r.data);
  },
  replaceReferences(id: number, referenceIds: number[]) {
    return apiClient.put<FindingTemplate>(`/finding-templates/${id}/references`, referenceIds).then((r) => r.data);
  },
  assignTag(id: number, tagId: number) {
    return apiClient.post<FindingTemplate>(`/finding-templates/${id}/tags/${tagId}`).then((r) => r.data);
  },
  unassignTag(id: number, tagId: number) {
    return apiClient.delete<FindingTemplate>(`/finding-templates/${id}/tags/${tagId}`).then((r) => r.data);
  },
  /** Snapshot a finding into a new template (title override optional). If a template with that
   *  exact title already exists, the backend rejects with 409 + `code: 'duplicate_name'` unless
   *  `overwrite` is set — see useSaveAsTemplate's confirm-and-retry flow, which every "save as
   *  template" trigger uses to turn that into an "overwrite or rename?" prompt instead of a
   *  dead-end error. */
  fromFinding(findingId: number, body: { title?: string } = {}, overwrite = false) {
    return apiClient
      .post<FindingTemplate>(`/finding-templates/from-finding/${findingId}`, body, { params: { overwrite } })
      .then((r) => r.data);
  },
};
