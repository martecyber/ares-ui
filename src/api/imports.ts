import { apiClient as api } from './client';
import type { PagedResponse } from './organizations';

export interface ScanImport {
  id: number;
  projectId: number;
  tool: string;
  format: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  filename: string | null;
  assetsCreated: number;
  detectionsCreated: number;
  detectionsUpdated: number;
  sourceIp: string | null;
  nacProfile: string | null;
  visibilityRecorded: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  hasRollbackableChanges: boolean;
}

export interface ScanImportRollbackBlockedItem {
  entityType: 'asset' | 'detection';
  entityId: number;
  reason: string;
}

export interface ScanImportRollbackResult {
  assetsDeleted: number;
  assetsReverted: number;
  detectionsDeleted: number;
  detectionsReverted: number;
  blocked: ScanImportRollbackBlockedItem[];
}

export interface ImportTool {
  toolId: string;
  formatId: string;
  displayName: string;
  extensions: string[];
  /** Only present when toolId is owned by an installed plugin (see ImportService.listAvailableTools) — falls back to toolIconSrc() otherwise. */
  icon?: string | null;
  iconLight?: string | null;
}

export const importsApi = {
  /** Newest first, paginated (default 20/page) — a long-lived MONITOR project's rescans can
   *  otherwise accumulate an unbounded number of rows. */
  list(projectId: number, page = 0, size = 20): Promise<PagedResponse<ScanImport>> {
    return api.get(`/projects/${projectId}/imports`, { params: { page, size } }).then((r) => r.data);
  },

  /** Single-row poll, e.g. right after {@link run} — status starts "running" and flips to
   *  "completed"/"failed" once the background processing (see ImportService#startImport on the
   *  server) finishes. */
  get(projectId: number, importId: number): Promise<ScanImport> {
    return api.get(`/projects/${projectId}/imports/${importId}`).then((r) => r.data);
  },

  tools(projectId: number): Promise<ImportTool[]> {
    return api.get(`/projects/${projectId}/imports/tools`).then((r) => r.data);
  },

  /** Returns as soon as the import is queued (status "running") — processing happens in the
   *  background server-side, so this no longer carries the final assetsCreated/detectionsCreated
   *  counts. Poll {@link get} (or just re-{@link list}) for the outcome. */
  run(projectId: number, tool: string, format: string, file: File,
      sourceIp?: string | null, nacProfile?: string | null): Promise<ScanImport> {
    const form = new FormData();
    form.append('tool', tool);
    form.append('format', format);
    form.append('file', file);
    if (sourceIp && sourceIp.trim())   form.append('sourceIp',   sourceIp.trim());
    if (nacProfile && nacProfile.trim()) form.append('nacProfile', nacProfile.trim());
    return api.post(`/projects/${projectId}/imports`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  rollbackPreview(projectId: number, importId: number): Promise<ScanImportRollbackResult> {
    return api.get(`/projects/${projectId}/imports/${importId}/rollback-preview`).then((r) => r.data);
  },

  rollback(projectId: number, importId: number): Promise<ScanImportRollbackResult> {
    return api.post(`/projects/${projectId}/imports/${importId}/rollback`).then((r) => r.data);
  },
};
