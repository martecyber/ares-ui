import { apiClient } from './client';
import type { PagedResponse } from './organizations';

export interface KbWordlistFolder {
  id: number;
  parentId: number | null;
  name: string;
  createdAt: string;
}

export interface KbWordlist {
  id: number;
  folderId: number | null;
  name: string;
  description: string | null;
  sizeBytes: number;
  sha256: string | null;
  lineCount: number | null;
  sourceRepoId: number | null;
  sourceRepoPath: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface KbWordlistRepo {
  id: number;
  repoUrl: string;
  branch: string;
  pathFilter: string | null;
  importAllTypes: boolean;
  hasToken: boolean;
  autoSync: boolean;
  syncIntervalHours: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  fileCount: number;
  createdAt: string;
}

export const kbWordlistsApi = {
  listFolders() {
    return apiClient.get<KbWordlistFolder[]>('/kb/wordlists/folders').then(r => r.data);
  },

  createFolder(name: string, parentId?: number) {
    return apiClient.post<KbWordlistFolder>('/kb/wordlists/folders', { name, parentId }).then(r => r.data);
  },

  deleteFolder(id: number) {
    return apiClient.delete(`/kb/wordlists/folders/${id}`);
  },

  list(folderId: number | null | undefined, page = 0, size = 50,
       q?: string, sortBy?: string, sortDir?: 'asc' | 'desc') {
    const params: Record<string, unknown> = { page, size };
    if (folderId != null) params.folderId = folderId;
    else if (folderId === null) params.root = true;
    if (q)       params.q       = q;
    if (sortBy)  params.sortBy  = sortBy;
    if (sortDir) params.sortDir = sortDir;
    return apiClient
      .get<PagedResponse<KbWordlist>>('/kb/wordlists', { params })
      .then(r => r.data);
  },

  upload(file: File, folderId?: number | null, description?: string) {
    const fd = new FormData();
    fd.append('file', file);
    if (folderId != null) fd.append('folderId', String(folderId));
    if (description) fd.append('description', description);
    return apiClient.post<KbWordlist>('/kb/wordlists', fd).then(r => r.data);
  },

  uploadZip(file: File, folderId?: number | null, importAllTypes?: boolean) {
    const fd = new FormData();
    fd.append('file', file);
    if (folderId != null) fd.append('folderId', String(folderId));
    if (importAllTypes) fd.append('importAllTypes', 'true');
    return apiClient.post<KbWordlist[]>('/kb/wordlists/upload-zip', fd).then(r => r.data);
  },

  delete(id: number) {
    return apiClient.delete(`/kb/wordlists/${id}`);
  },

  bulkDelete(ids: number[]) {
    return apiClient.delete('/kb/wordlists/bulk', { data: ids });
  },

  downloadUrl(id: number) {
    return `/api/v1/kb/wordlists/${id}/content`;
  },
  /** Fetches the raw text of a wordlist for in-browser preview. */
  previewContent(id: number): Promise<string> {
    return apiClient.get<string>(`/kb/wordlists/${id}/content`, {
      responseType: 'text',
      transformResponse: [(data) => data],
    }).then(r => r.data as string);
  },

  listRepos() {
    return apiClient.get<KbWordlistRepo[]>('/kb/wordlists/repos').then(r => r.data);
  },

  createRepo(body: {
    repoUrl: string; branch?: string; pathFilter?: string;
    githubToken?: string; importAllTypes?: boolean; autoSync: boolean; syncIntervalHours: number;
  }) {
    return apiClient.post<KbWordlistRepo>('/kb/wordlists/repos', body).then(r => r.data);
  },

  updateRepo(id: number, body: Partial<{
    branch: string; pathFilter: string; githubToken: string;
    importAllTypes: boolean; autoSync: boolean; syncIntervalHours: number;
  }>) {
    return apiClient.patch<KbWordlistRepo>(`/kb/wordlists/repos/${id}`, body).then(r => r.data);
  },

  deleteRepo(id: number) {
    return apiClient.delete(`/kb/wordlists/repos/${id}`);
  },

  syncRepo(id: number) {
    return apiClient.post<{ status: string }>(`/kb/wordlists/repos/${id}/sync`).then(r => r.data);
  },
};
