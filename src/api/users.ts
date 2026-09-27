import { apiClient } from './client';
import type { PagedResponse } from './organizations';
export type { RoleOption } from './roles';
export { rolesApi } from './roles';

export interface UserSummary {
  id: number;
  email: string;
  displayName: string;
  status: string;
  mfaEnforced: boolean;
  roles: string[];
  createdAt: string;
  /** Assigned holiday calendar (nullable). */
  holidayCalendarId: number | null;
  holidayCalendarName: string | null;
}

export interface CreateUserRequest {
  email: string;
  displayName: string;
  password: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  status?: string;
  mfaEnforced?: boolean;
}

export const usersApi = {
  list(params: { page?: number; size?: number } = {}) {
    return apiClient.get<PagedResponse<UserSummary>>('/users', { params }).then((r) => r.data);
  },
  get(id: number) {
    return apiClient.get<UserSummary>(`/users/${id}`).then((r) => r.data);
  },
  create(body: CreateUserRequest) {
    return apiClient.post<UserSummary>('/users', body).then((r) => r.data);
  },
  update(id: number, body: UpdateUserRequest) {
    return apiClient.patch<UserSummary>(`/users/${id}`, body).then((r) => r.data);
  },
  resetPassword(id: number, newPassword: string) {
    return apiClient.post<void>(`/users/${id}/reset-password`, { newPassword }).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/users/${id}`).then((r) => r.data);
  },
  hardDelete(id: number) {
    return apiClient.delete<void>(`/users/${id}/permanent`).then((r) => r.data);
  },
  assignRole(id: number, roleId: number, organizationId: number) {
    return apiClient.post<void>(`/users/${id}/roles`, null, { params: { roleId, organizationId } }).then((r) => r.data);
  },
  removeRole(id: number, roleId: number, organizationId: number) {
    return apiClient.delete<void>(`/users/${id}/roles/${roleId}`, { params: { organizationId } }).then((r) => r.data);
  },
  /** Assigns the user's holiday calendar — pass null to clear. */
  setHolidayCalendar(id: number, calendarId: number | null) {
    return apiClient.put<UserSummary>(`/users/${id}/holiday-calendar`, { calendarId }).then((r) => r.data);
  },
};
