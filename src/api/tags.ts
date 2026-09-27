import { apiClient } from './client';

export interface Tag {
  id: number;
  organizationId: number | null;
  name: string;
  color: string;
}

export const tagsApi = {
  /** An organization's own tags plus every platform tag (visible/assignable everywhere). */
  list(orgId: number) {
    return apiClient.get<Tag[]>(`/organizations/${orgId}/tags`).then((r) => r.data);
  },
  create(orgId: number, name: string, color: string) {
    return apiClient.post<Tag>(`/organizations/${orgId}/tags`, { name, color }).then((r) => r.data);
  },
  /** Platform tags only — no organization of their own; the only tier Exploit/FindingTemplate
   *  (platform-wide catalog entities) can ever receive. Readable by any operator. */
  listPlatform() {
    return apiClient.get<Tag[]>('/tags/platform').then((r) => r.data);
  },
  /** MSSP_ADMIN only, enforced server-side. */
  createPlatform(name: string, color: string) {
    return apiClient.post<Tag>('/tags/platform', { name, color }).then((r) => r.data);
  },
  update(id: number, patch: { name?: string; color?: string }) {
    return apiClient.patch<Tag>(`/tags/${id}`, patch).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/tags/${id}`).then((r) => r.data);
  },
};
