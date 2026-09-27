import { apiClient } from './client';

export type ProjectTestingGuideItemStatus = 'pending' | 'done' | 'not_applicable';

export interface ProjectTestingGuideItem {
  id: number;
  projectTestingGuideId: number;
  guidePointId: number | null;
  title: string;
  description: string | null;
  sortOrder: number;
  status: ProjectTestingGuideItemStatus;
  notes: string | null;
  updatedAt: string;
  updatedBy: number | null;
}

export interface ProjectTestingGuide {
  id: number;
  projectId: number;
  guideId: number | null;
  name: string;
  assignedAt: string;
  items: ProjectTestingGuideItem[];
}

export const ITEM_STATUSES: { value: ProjectTestingGuideItemStatus; label: string; severity: string }[] = [
  { value: 'pending',        label: 'Pending',        severity: 'secondary' },
  { value: 'done',           label: 'Done',           severity: 'success'   },
  { value: 'not_applicable', label: 'N/A',            severity: 'warn'      },
];

export function itemStatusMeta(status: string) {
  return ITEM_STATUSES.find(s => s.value === status) ?? ITEM_STATUSES[0];
}

export const projectTestingGuidesApi = {
  list(projectId: number) {
    return apiClient.get<ProjectTestingGuide[]>(`/projects/${projectId}/testing-guides`).then(r => r.data);
  },
  assign(projectId: number, guideId: number) {
    return apiClient.post<ProjectTestingGuide>(`/projects/${projectId}/testing-guides`, { guideId }).then(r => r.data);
  },
  resync(projectId: number, ptgId: number) {
    return apiClient.post<ProjectTestingGuide>(`/projects/${projectId}/testing-guides/${ptgId}/resync`).then(r => r.data);
  },
  remove(projectId: number, ptgId: number) {
    return apiClient.delete<void>(`/projects/${projectId}/testing-guides/${ptgId}`).then(r => r.data);
  },
  updateItem(projectId: number, ptgId: number, itemId: number, body: { status?: string; notes?: string }) {
    return apiClient.patch<ProjectTestingGuideItem>(`/projects/${projectId}/testing-guides/${ptgId}/items/${itemId}`, body).then(r => r.data);
  },
};
