import { apiClient as api } from './client';

export interface HolidayCalendar {
  id: number;
  name: string;
  description: string | null;
  dayCount: number;
}

export interface HolidayCalendarDay {
  id: number;
  calendarId: number;
  /** ISO date (yyyy-MM-dd). */
  day: string;
  label: string | null;
}

export interface CreateCalendarRequest {
  name: string;
  description?: string | null;
}

export interface UpdateCalendarRequest {
  name?: string;
  description?: string | null;
}

export interface CreateDayRequest {
  day: string;
  label?: string | null;
}

export const holidaysApi = {
  list(): Promise<HolidayCalendar[]> {
    return api.get('/holiday-calendars').then((r) => r.data);
  },
  get(id: number): Promise<HolidayCalendar> {
    return api.get(`/holiday-calendars/${id}`).then((r) => r.data);
  },
  create(req: CreateCalendarRequest): Promise<HolidayCalendar> {
    return api.post('/holiday-calendars', req).then((r) => r.data);
  },
  update(id: number, req: UpdateCalendarRequest): Promise<HolidayCalendar> {
    return api.patch(`/holiday-calendars/${id}`, req).then((r) => r.data);
  },
  delete(id: number): Promise<void> {
    return api.delete(`/holiday-calendars/${id}`).then(() => {});
  },
  listDays(id: number): Promise<HolidayCalendarDay[]> {
    return api.get(`/holiday-calendars/${id}/days`).then((r) => r.data);
  },
  addDay(id: number, req: CreateDayRequest): Promise<HolidayCalendarDay> {
    return api.post(`/holiday-calendars/${id}/days`, req).then((r) => r.data);
  },
  deleteDay(id: number, dayId: number): Promise<void> {
    return api.delete(`/holiday-calendars/${id}/days/${dayId}`).then(() => {});
  },
};
