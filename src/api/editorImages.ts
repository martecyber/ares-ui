import { apiClient } from './client';

export interface EditorImageUploadResult {
  id: number;
  /** Absolute URL — safe to embed directly in Markdown as ![alt](url). Not directly loadable as
   *  a raw <img src> (the endpoint requires auth) — MarkdownView.vue resolves it via an
   *  authenticated fetch + blob URL instead. */
  url: string;
}

export const editorImagesApi = {
  /** organizationId/projectId scope who can later view the image — omit both only for genuinely
   *  platform-wide content (KB templates, testing procedures, report field types), where access
   *  falls back to "any MSSP staff member" instead of a specific org/project. */
  upload(file: File, scope: { organizationId?: number; projectId?: number } = {}): Promise<EditorImageUploadResult> {
    const form = new FormData();
    form.append('file', file);
    if (scope.organizationId != null) form.append('organizationId', String(scope.organizationId));
    if (scope.projectId != null) form.append('projectId', String(scope.projectId));
    return apiClient.post<EditorImageUploadResult>('/editor-images', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};
