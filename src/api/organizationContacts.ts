import { apiClient } from './client';

export interface OrganizationContact {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string | null;
}

export const organizationContactsApi = {
  list(orgId: number): Promise<OrganizationContact[]> {
    return apiClient.get<OrganizationContact[]>(`/organizations/${orgId}/contacts`).then((r) => r.data);
  },
  create(orgId: number, body: { name: string; email: string }): Promise<OrganizationContact> {
    return apiClient.post<OrganizationContact>(`/organizations/${orgId}/contacts`, body).then((r) => r.data);
  },
  update(orgId: number, id: number, body: { name: string; email: string }): Promise<OrganizationContact> {
    return apiClient.patch<OrganizationContact>(`/organizations/${orgId}/contacts/${id}`, body).then((r) => r.data);
  },
  delete(orgId: number, id: number): Promise<void> {
    return apiClient.delete<void>(`/organizations/${orgId}/contacts/${id}`).then(() => {});
  },
};
