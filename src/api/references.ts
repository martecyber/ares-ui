import { apiClient } from './client';
import type { PagedResponse } from './organizations';

export interface ReferenceCatalog {
  id: number;
  code: string;
  title: string;
}

export interface ReferenceEntry {
  id: number;
  catalogId: number;
  title: string;
  description: string | null;
  url?: string | null;
  faviconUrl?: string | null;
}

export const referencesApi = {
  listCatalogs() {
    return apiClient.get<PagedResponse<ReferenceCatalog>>('/reference-catalogs', { params: { size: 50 } }).then((r) => r.data);
  },
  searchEntries(catalogId: number, search: string, size = 30) {
    return apiClient.get<PagedResponse<ReferenceEntry>>(`/reference-catalogs/${catalogId}/entries`, {
      params: { search: search || undefined, size },
    }).then((r) => r.data);
  },
  findOrCreate(catalogId: number, title: string, description: string) {
    return apiClient.post<ReferenceEntry>(`/reference-catalogs/${catalogId}/entries/find-or-create`, {
      title,
      description,
    }).then((r) => r.data);
  },
  /** Finds or creates a plain-URL reference. Title is optional — left to the backend to
   *  fetch from the page (or blank) when omitted. Also best-effort fetches a favicon. */
  createUrlEntry(url: string, title?: string) {
    return apiClient.post<ReferenceEntry>('/reference-catalogs/url-entries', {
      url,
      title: title || undefined,
    }).then((r) => r.data);
  },
  /** Fetches the stored favicon as a blob object URL for use in an &lt;img&gt; src — the
   *  endpoint is authenticated, so it can't be used directly as an &lt;img :src&gt;. Caller
   *  is responsible for revoking the returned URL (URL.revokeObjectURL) when done. */
  async faviconBlobUrl(entryId: number): Promise<string> {
    const res = await apiClient.get(`/reference-catalogs/entries/${entryId}/favicon`, { responseType: 'blob' });
    return URL.createObjectURL(res.data as Blob);
  },
};
