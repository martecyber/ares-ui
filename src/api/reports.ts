import { apiClient } from './client';
import type { PagedResponse } from './organizations';

export interface PriorityColor {
  bgColor: string;   // 6-digit hex, no '#'
  textColor: string; // 6-digit hex, no '#'
  /** Literal text stamped into the generated report for findings of this level.
   *  Blank/absent falls back to the P0-P4 default. */
  label?: string | null;
}

export interface ReportTemplate {
  id: number;
  name: string;
  description: string | null;
  format: string;
  isGeneric: boolean;
  isActive: boolean;
  originalFilename: string;
  createdBy: number | null;
  projectTypeIds: number[];
  variables: ReportTemplateVariable[];
  magicColor: string;
  priorityColors: Record<string, PriorityColor> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTemplateVariable {
  id: number;
  variableName: string;
  sourceType: 'system' | 'field_type';
  systemField: string | null;
  fieldTypeId: number | null;
}

export interface ReportFieldType {
  id: number;
  name: string;
  label: string;
  description: string | null;
  sortOrder: number;
  required: boolean;
  templates: ReportFieldTemplate[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportFieldTemplate {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: number;
  organizationId: number;
  projectId: number | null;
  type: string;
  format: string;
  status: string;
  title: string;
  templateId: number | null;
  fileId: number | null;
  downloadable: boolean;
  generatedBy: number | null;
  error: string | null;
  findingCount: number;
  fieldValues: ReportFieldValue[];
  createdAt: string;
  completedAt: string | null;
  publishedAt: string | null;
}

export interface ReportFieldValue {
  fieldTypeId: number | null;
  fieldName: string;
  content: string | null;
}

export interface TemplateVariable {
  variable: string;
  type: 'system' | 'report_field' | 'mapped' | 'unknown';
  resolved: boolean;
  fieldLabel?: string;
}

export const SYSTEM_FIELDS = [
  { value: 'project.name',       label: 'Project name' },
  { value: 'project.code',       label: 'Project code' },
  { value: 'project.start_date', label: 'Project start date' },
  { value: 'project.end_date',   label: 'Project end date' },
  { value: 'report.date',           label: 'Report generation date' },
  { value: 'findings.count',        label: 'Total findings count' },
  { value: 'finding.code',          label: 'Finding code (in loop)' },
  { value: 'finding.title',         label: 'Finding title (in loop)' },
  { value: 'finding.severity',      label: 'Finding severity (in loop)' },
];

export type ReportStatusSeverity = 'warn' | 'success' | 'danger' | 'secondary';

export function reportStatusSeverity(s: string): ReportStatusSeverity {
  switch (s) {
    case 'draft':      return 'warn';
    case 'published':  return 'success';
    case 'failed':     return 'danger';
    case 'generating': return 'secondary';
    case 'completed':  return 'success';
    case 'pending':    return 'secondary';
    default:           return 'secondary';
  }
}

export function reportStatusLabel(s: string): string {
  const m: Record<string, string> = {
    generating: 'Generating', draft: 'Draft', published: 'Published',
    failed: 'Failed', completed: 'Draft', pending: 'Pending',
  };
  return m[s] ?? s;
}

// ── Report field types ────────────────────────────────────────────────────────

export const reportFieldTypesApi = {
  list() {
    return apiClient.get<ReportFieldType[]>('/report-field-types').then((r) => r.data);
  },
  create(body: { name: string; label: string; description?: string; sortOrder?: number; required?: boolean }) {
    return apiClient.post<ReportFieldType>('/report-field-types', body).then((r) => r.data);
  },
  update(id: number, body: Partial<{ label: string; description: string; sortOrder: number; required: boolean }>) {
    return apiClient.patch<ReportFieldType>(`/report-field-types/${id}`, body).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/report-field-types/${id}`).then((r) => r.data);
  },
  createTemplate(typeId: number, body: { name: string; content: string; isDefault?: boolean }) {
    return apiClient.post<ReportFieldTemplate>(`/report-field-types/${typeId}/templates`, body).then((r) => r.data);
  },
  updateTemplate(typeId: number, tplId: number, body: Partial<{ name: string; content: string; isDefault: boolean }>) {
    return apiClient.patch<ReportFieldTemplate>(`/report-field-types/${typeId}/templates/${tplId}`, body).then((r) => r.data);
  },
  deleteTemplate(typeId: number, tplId: number) {
    return apiClient.delete<void>(`/report-field-types/${typeId}/templates/${tplId}`).then((r) => r.data);
  },
};

// ── Report templates ──────────────────────────────────────────────────────────

export const reportTemplatesApi = {
  list(projectTypeId?: number) {
    return apiClient
      .get<ReportTemplate[]>('/report-templates', { params: projectTypeId ? { projectTypeId } : undefined })
      .then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<ReportTemplate>(`/report-templates/${id}`).then((r) => r.data);
  },
  upload(file: File, name: string, description: string, isGeneric: boolean) {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('description', description);
    form.append('isGeneric', String(isGeneric));
    return apiClient.post<ReportTemplate>('/report-templates', form).then((r) => r.data);
  },
  update(id: number, body: {
    name?: string; description?: string; isGeneric?: boolean; isActive?: boolean;
    projectTypeIds?: number[];
    variables?: { variableName: string; sourceType: string; systemField?: string; fieldTypeId?: number }[];
    magicColor?: string;
    priorityColors?: Record<string, PriorityColor>;
  }) {
    return apiClient.patch<ReportTemplate>(`/report-templates/${id}`, body).then((r) => r.data);
  },
  updateFile(id: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<ReportTemplate>(`/report-templates/${id}/file`, form).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/report-templates/${id}`).then((r) => r.data);
  },
  download(id: number) {
    return apiClient.get<Blob>(`/report-templates/${id}/download`, { responseType: 'blob' }).then((r) => r.data);
  },
  analyze(id: number) {
    return apiClient.get<TemplateVariable[]>(`/report-templates/${id}/analyze`).then((r) => r.data);
  },
};

// ── Reports ───────────────────────────────────────────────────────────────────

export const reportsApi = {
  list(params: { organizationId?: number; projectId?: number; status?: string } = {}) {
    return apiClient.get<PagedResponse<Report>>('/reports', { params }).then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<Report>(`/reports/${id}`).then((r) => r.data);
  },
  create(body: {
    projectId: number;
    organizationId: number;
    title?: string;
    findingIds?: number[];
    iterationFrom?: string | null;
    iterationTo?: string | null;
    customFields?: Record<string, string>;
  }) {
    return apiClient.post<Report>('/reports', body).then((r) => r.data);
  },
  generate(body: {
    projectId: number;
    organizationId: number;
    templateId?: number;
    title?: string;
    findingIds?: number[];
    customFields?: Record<string, string>;
  }) {
    return apiClient.post<Report>('/reports/generate', body).then((r) => r.data);
  },
  generateDocument(id: number, templateId?: number) {
    return apiClient.post<Report>(`/reports/${id}/generate-document`, templateId ? { templateId } : {}).then((r) => r.data);
  },
  /** Alternative to generateDocument — emails the report via a KB EmailTemplate instead of
   *  rendering a DOCX. Only valid for a single-finding report (see `Report.findingCount`). */
  sendEmail(id: number, body: { emailTemplateId: number; integrationId: number; to: string[]; cc?: string[]; bcc?: string[] }) {
    return apiClient.post<void>(`/reports/${id}/send-email`, body).then(() => {});
  },
  exportJson(id: number) {
    return apiClient.get<Blob>(`/reports/${id}/export-json`, { responseType: 'blob' }).then((r) => r.data);
  },
  publish(id: number) {
    return apiClient.post<Report>(`/reports/${id}/publish`).then((r) => r.data);
  },
  uploadDocument(id: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<Report>(`/reports/${id}/documents`, form).then((r) => r.data);
  },
  download(id: number) {
    return apiClient.get<Blob>(`/reports/${id}/download`, { responseType: 'blob' }).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/reports/${id}`).then((r) => r.data);
  },
};
