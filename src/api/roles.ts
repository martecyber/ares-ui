import { apiClient } from './client';

export interface RoleOption {
  id: number;
  code: string;
  name: string;
  description: string | null;
  system: boolean;
  permissionCodes: string[];
}

export interface PermissionOption {
  id: number;
  code: string;
  description: string | null;
}

export const rolesApi = {
  list(): Promise<RoleOption[]> {
    return apiClient.get<RoleOption[]>('/roles').then((r) => r.data);
  },
  get(id: number): Promise<RoleOption> {
    return apiClient.get<RoleOption>(`/roles/${id}`).then((r) => r.data);
  },
  create(body: { code: string; name: string; description?: string }): Promise<RoleOption> {
    return apiClient.post<RoleOption>('/roles', body).then((r) => r.data);
  },
  delete(id: number): Promise<void> {
    return apiClient.delete<void>(`/roles/${id}`).then((r) => r.data);
  },
  addPermission(roleId: number, permissionId: number): Promise<RoleOption> {
    return apiClient.post<RoleOption>(`/roles/${roleId}/permissions/${permissionId}`).then((r) => r.data);
  },
  removePermission(roleId: number, permissionId: number): Promise<RoleOption> {
    return apiClient.delete<RoleOption>(`/roles/${roleId}/permissions/${permissionId}`).then((r) => r.data);
  },
};

export const permissionsApi = {
  list(): Promise<PermissionOption[]> {
    return apiClient.get<PermissionOption[]>('/permissions').then((r) => r.data);
  },
};
