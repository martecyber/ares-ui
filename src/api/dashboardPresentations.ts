import { apiClient as api } from './client';
import type { DashboardLevel } from './dashboards';

// Mirrors com.martecyber.ares.dashboards.dto.DashboardPresentationDtos.PresentationSummary.
export interface PresentationSummary {
  id: number;
  name: string;
  rotationSeconds: number;
  dashboardCount: number;
}

// Mirrors ...DashboardPresentationDtos.PresentationItemDto.
export interface PresentationItemDto {
  dashboardId: number;
  dashboardName: string;
  level: DashboardLevel;
  scopeId: number | null;
  scopeLabel: string;
  /** The dashboard's effective organization (null for PLATFORM, scopeId itself for ORGANIZATION,
   *  the project's own org for PROJECT) — feeds DashboardHost's org-id prop so PROJECT-level
   *  widgets' click-through routes resolve correctly when embedded in the presentation player. */
  organizationId: number | null;
}

// Mirrors ...DashboardPresentationDtos.PresentationDto.
export interface PresentationDto {
  id: number;
  name: string;
  rotationSeconds: number;
  items: PresentationItemDto[];
}

export const presentationsApi = {
  list(): Promise<PresentationSummary[]> {
    return api.get('/dashboard-presentations').then((r) => r.data);
  },
  get(id: number): Promise<PresentationDto> {
    return api.get(`/dashboard-presentations/${id}`).then((r) => r.data);
  },
  create(name: string, rotationSeconds?: number): Promise<PresentationSummary> {
    return api.post('/dashboard-presentations', { name, rotationSeconds }).then((r) => r.data);
  },
  update(id: number, req: { name?: string; rotationSeconds?: number }): Promise<PresentationSummary> {
    return api.put(`/dashboard-presentations/${id}`, req).then((r) => r.data);
  },
  remove(id: number): Promise<void> {
    return api.delete(`/dashboard-presentations/${id}`).then(() => {});
  },
  saveItems(id: number, dashboardIds: number[]): Promise<void> {
    return api.put(`/dashboard-presentations/${id}/items`, { dashboardIds }).then(() => {});
  },
};
