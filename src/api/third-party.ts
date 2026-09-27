import { apiClient } from './client';
import type { PagedResponse } from './organizations';

export interface KbThirdPartyEntry {
  id: number;
  kind: string;
  value: string;
  category: string;
  notes: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KbThirdPartyEntryForm {
  kind: string;
  value: string;
  category: string;
  notes?: string | null;
  enabled?: boolean;
}

export const KB_TP_KINDS = ['domain', 'domain_wildcard', 'url', 'url_wildcard', 'ip', 'cidr', 'text_contains'] as const;
export const KB_TP_CATEGORIES = ['social_media', 'cdn', 'analytics', 'advertising', 'cloud', 'payment', 'other'] as const;

export const kbThirdPartyApi = {
  list(params?: { category?: string; kind?: string; enabled?: boolean; q?: string; page?: number; size?: number; sortBy?: string; sortDir?: string }) {
    return apiClient.get<PagedResponse<KbThirdPartyEntry>>('/kb/third-party-entries', { params }).then(r => r.data);
  },
  create(body: KbThirdPartyEntryForm) {
    return apiClient.post<KbThirdPartyEntry>('/kb/third-party-entries', body).then(r => r.data);
  },
  update(id: number, body: KbThirdPartyEntryForm) {
    return apiClient.put<KbThirdPartyEntry>(`/kb/third-party-entries/${id}`, body).then(r => r.data);
  },
  toggle(id: number) {
    return apiClient.patch<void>(`/kb/third-party-entries/${id}/toggle`).then(r => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/kb/third-party-entries/${id}`).then(r => r.data);
  },
  reclassify() {
    return apiClient.post<number>('/kb/third-party-entries/reclassify').then(r => r.data);
  },
};
