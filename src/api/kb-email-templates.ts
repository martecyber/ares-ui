import { apiClient } from './client';
import type { PagedResponse } from './organizations';

/** One severity level's override on this template — falls back to the bare P0-P4 label and the
 *  default SeverityTag.vue palette when unset. Mirrors ReportTemplate's own priorityColors
 *  (DOCX report templates), keyed the same way: raw severity, not P0-P4. */
export interface PriorityDisplayEntry {
  label: string;
  color: string;
}

export type EmailPriorityColors = Partial<Record<'critical' | 'high' | 'medium' | 'low' | 'info', PriorityDisplayEntry>>;

export interface EmailTemplate {
  id: number;
  name: string;
  subjectTemplate: string | null;
  /** Sanitized HTML. Null in list rows; populated on detail. */
  htmlContent: string | null;
  priorityColors: EmailPriorityColors | null;
  creatorId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateForm {
  name: string;
  subjectTemplate?: string | null;
  htmlContent?: string | null;
  priorityColors?: EmailPriorityColors | null;
}

export const kbEmailTemplatesApi = {
  list(params?: { q?: string; page?: number; size?: number }) {
    return apiClient.get<PagedResponse<EmailTemplate>>('/kb/email-templates', { params }).then(r => r.data);
  },
  get(id: number) {
    return apiClient.get<EmailTemplate>(`/kb/email-templates/${id}`).then(r => r.data);
  },
  create(body: EmailTemplateForm) {
    return apiClient.post<EmailTemplate>('/kb/email-templates', body).then(r => r.data);
  },
  update(id: number, body: EmailTemplateForm) {
    return apiClient.put<EmailTemplate>(`/kb/email-templates/${id}`, body).then(r => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/kb/email-templates/${id}`).then(r => r.data);
  },
};
