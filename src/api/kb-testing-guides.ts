import { apiClient } from './client';
import type { PagedResponse } from './organizations';

export interface TestingGuidePoint {
  id: number;
  guideId: number;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestingGuide {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  pointCount: number;
  creatorId: number | null;
  createdAt: string;
  updatedAt: string;
  /** Populated on the detail endpoint only. */
  points: TestingGuidePoint[] | null;
}

export interface TestingGuideForm {
  name: string;
  description?: string | null;
  enabled?: boolean;
}

export interface TestingGuidePointForm {
  title: string;
  description?: string | null;
  sortOrder?: number;
}

export const kbTestingGuidesApi = {
  list(params?: { page?: number; size?: number }) {
    return apiClient.get<PagedResponse<TestingGuide>>('/kb/testing-guides', { params }).then(r => r.data);
  },
  get(id: number) {
    return apiClient.get<TestingGuide>(`/kb/testing-guides/${id}`).then(r => r.data);
  },
  create(body: TestingGuideForm) {
    return apiClient.post<TestingGuide>('/kb/testing-guides', body).then(r => r.data);
  },
  update(id: number, body: TestingGuideForm) {
    return apiClient.put<TestingGuide>(`/kb/testing-guides/${id}`, body).then(r => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/kb/testing-guides/${id}`).then(r => r.data);
  },
  addPoint(guideId: number, body: TestingGuidePointForm) {
    return apiClient.post<TestingGuidePoint>(`/kb/testing-guides/${guideId}/points`, body).then(r => r.data);
  },
  updatePoint(guideId: number, pointId: number, body: TestingGuidePointForm) {
    return apiClient.put<TestingGuidePoint>(`/kb/testing-guides/${guideId}/points/${pointId}`, body).then(r => r.data);
  },
  deletePoint(guideId: number, pointId: number) {
    return apiClient.delete<void>(`/kb/testing-guides/${guideId}/points/${pointId}`).then(r => r.data);
  },
  reorderPoints(guideId: number, orderedIds: number[]) {
    return apiClient.post<TestingGuidePoint[]>(`/kb/testing-guides/${guideId}/points/reorder`, { orderedIds }).then(r => r.data);
  },
  exportOne(id: number): Promise<Blob> {
    return apiClient.get(`/kb/testing-guides/${id}/export`, { responseType: 'blob' }).then((r) => r.data);
  },
  exportZip(ids: number[]): Promise<Blob> {
    return apiClient.post('/kb/testing-guides/export-zip', ids, { responseType: 'blob' }).then((r) => r.data);
  },
  importFiles(files: File[]): Promise<{ imported: number; errors: string[] }> {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return apiClient.post('/kb/testing-guides/import', form).then((r) => r.data);
  },
};
