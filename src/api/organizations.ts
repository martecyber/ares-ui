import { apiClient } from './client';

export interface SlaSettings {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  status: string;
  settings: string | null;
  hasLogo: boolean;
  sla: SlaSettings;
  createdAt: string;
  updatedAt: string | null;
}

export interface OrgDashboard {
  stats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    dueIn7Days: number;
    slaPassed: number;
  };
  activeProjects: Array<{
    id: number;
    name: string;
    code: string | null;
    status: string;
    startDate: string | null;
  }>;
  urgentFindings: Array<{
    id: number;
    code: string | null;
    title: string;
    severity: string;
    statusName: string;
    projectId: number;
    slaDeadline: string | null;
  }>;
}

export interface PagedResponse<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  settings?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  status?: string;
  settings?: string;
  sla?: Partial<SlaSettings>;
}

export const organizationsApi = {
  list(params: { status?: string; page?: number; size?: number; operatorView?: boolean } = {}) {
    return apiClient.get<PagedResponse<Organization>>('/organizations', { params }).then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<Organization>(`/organizations/${id}`).then((r) => r.data);
  },
  dashboard(id: number) {
    return apiClient.get<OrgDashboard>(`/organizations/${id}/dashboard`).then((r) => r.data);
  },
  myRole(id: number): Promise<{ role: string }> {
    return apiClient.get(`/organizations/${id}/my-role`).then((r) => r.data);
  },
  listOperators(id: number): Promise<{ userId: number; roleId: number; roleCode: string; roleName: string; email: string; displayName: string }[]> {
    return apiClient.get(`/organizations/${id}/operators`).then((r) => r.data);
  },
  addOperator(id: number, userId: number, roleCode = 'MSSP_OPERATOR'): Promise<void> {
    return apiClient.post(`/organizations/${id}/operators`, { userId, roleCode }).then((r) => r.data);
  },
  removeOperator(id: number, userId: number, roleCode = 'MSSP_OPERATOR'): Promise<void> {
    return apiClient.delete(`/organizations/${id}/operators/${userId}`, { params: { roleCode } }).then((r) => r.data);
  },
  create(body: CreateOrganizationRequest) {
    return apiClient.post<Organization>('/organizations', body).then((r) => r.data);
  },
  update(id: number, body: UpdateOrganizationRequest) {
    return apiClient.patch<Organization>(`/organizations/${id}`, body).then((r) => r.data);
  },
  archive(id: number) {
    return apiClient.delete<void>(`/organizations/${id}`).then((r) => r.data);
  },
  uploadLogo(id: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<void>(`/organizations/${id}/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  deleteLogo(id: number) {
    return apiClient.delete<void>(`/organizations/${id}/logo`).then((r) => r.data);
  },
  logoUrl(id: number) {
    return `${apiClient.defaults.baseURL}/organizations/${id}/logo`;
  },
};
