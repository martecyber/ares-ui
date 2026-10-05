import { apiClient } from './client';
import type { Finding } from './findings';
import type { PagedResponse } from './organizations';

export interface AffectStatusHistoryItem {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  changedBy: number | null;
  changedByName: string | null;
  note: string | null;
  changedAt: string;
}

export const affectionsApi = {
  update(id: number, body: { title?: string | null; description?: string | null }) {
    return apiClient.patch<Finding>(`/affections/${id}`, body).then((r) => r.data);
  },
  /** Hard-deletes the affection from its finding (not a resolve/close) — MSSP_ADMIN only. */
  delete(id: number) {
    return apiClient.delete(`/affections/${id}`).then(() => undefined);
  },
  addDetectedAt(id: number, assetId: number) {
    return apiClient.post<Finding>(`/affections/${id}/detected-at/${assetId}`).then((r) => r.data);
  },
  removeDetectedAt(id: number, assetId: number) {
    return apiClient.delete<Finding>(`/affections/${id}/detected-at/${assetId}`).then((r) => r.data);
  },
  addAffects(id: number, assetId: number) {
    return apiClient.post<Finding>(`/affections/${id}/affects/${assetId}`).then((r) => r.data);
  },
  removeAffects(id: number, assetId: number) {
    return apiClient.delete<Finding>(`/affections/${id}/affects/${assetId}`).then((r) => r.data);
  },
  updateAffectStatus(id: number, assetId: number, status: string, note?: string) {
    return apiClient.patch<Finding>(`/affections/${id}/affects/${assetId}/status`, { status, note }).then((r) => r.data);
  },
  /** Newest first, paginated (default 20/page) — an (affection, asset) pair with a long retest
   *  history can otherwise accumulate an unbounded number of status-change rows. */
  getAffectHistory(id: number, assetId: number, page = 0, size = 10) {
    return apiClient
      .get<PagedResponse<AffectStatusHistoryItem>>(`/affections/${id}/affects/${assetId}/history`, { params: { page, size } })
      .then((r) => r.data);
  },
  addDetection(id: number, detectionId: number) {
    return apiClient.post<import('./findings').Finding>(`/affections/${id}/detections/${detectionId}`).then((r) => r.data);
  },
  /**
   * Replaces the full list of affects assets linked to a specific detected_at
   * within the affection. Pass an empty array to clear.
   */
  setAffectsForDetected(id: number, detectedAssetId: number, assetIds: number[]) {
    return apiClient
      .put<Finding>(`/affections/${id}/detected-at/${detectedAssetId}/affects`, { assetIds })
      .then((r) => r.data);
  },
};
