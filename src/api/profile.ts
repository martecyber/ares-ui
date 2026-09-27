import { apiClient as api } from './client';

export interface ProfileDto {
  id: number;
  email: string;
  displayName: string | null;
  hasAvatar: boolean;
  roles: string[];
  /** Resolved opt-in holiday calendar; null when the user hasn't picked one. */
  holidayCalendarId: number | null;
  holidayCalendarName: string | null;
}

/** Single holiday day inside the current user's assigned calendar — same shape
 *  the dashboard renders next to OoO bars. */
export interface HolidayDayDto {
  id: number;
  calendarId: number;
  day: string;
  label: string | null;
}

export interface UpdateProfileRequest {
  displayName?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface OutOfOfficeDto {
  id: number;
  userId: number;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface CreateOooRequest {
  startDate: string;
  endDate: string;
  reason?: string;
}

export const profileApi = {
  me(): Promise<ProfileDto> {
    return api.get('/profile/me').then(r => r.data);
  },
  update(req: UpdateProfileRequest): Promise<ProfileDto> {
    return api.patch('/profile/me', req).then(r => r.data);
  },
  changePassword(req: ChangePasswordRequest): Promise<void> {
    return api.post('/profile/me/password', req).then(() => {});
  },
  uploadAvatar(file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    return api.post('/profile/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(() => {});
  },
  deleteAvatar(): Promise<void> {
    return api.delete('/profile/me/avatar').then(() => {});
  },
  avatarUrl(userId: number): string {
    return `/api/v1/profile/${userId}/avatar`;
  },

  listOoo(params?: { start?: string; end?: string }): Promise<OutOfOfficeDto[]> {
    return api.get('/profile/me/ooo', { params }).then(r => r.data);
  },
  createOoo(req: CreateOooRequest): Promise<OutOfOfficeDto> {
    return api.post('/profile/me/ooo', req).then(r => r.data);
  },
  deleteOoo(id: number): Promise<void> {
    return api.delete(`/profile/me/ooo/${id}`).then(() => {});
  },
  userOoo(userId: number, params?: { start?: string; end?: string }): Promise<OutOfOfficeDto[]> {
    return api.get(`/profile/${userId}/ooo`, { params }).then(r => r.data);
  },

  /** Holiday days within [start, end] for the user's currently-assigned calendar
   *  (read-only: assignment happens admin-side via the user-edit dialog). */
  listMyHolidays(params: { start: string; end: string }): Promise<HolidayDayDto[]> {
    return api.get('/profile/me/holidays', { params }).then(r => r.data);
  },
};
