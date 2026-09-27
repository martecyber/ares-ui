import { apiClient } from './client';

export interface EditorImageUploadResult {
  id: number;
  /** Absolute URL — safe to embed directly in Markdown as ![alt](url). */
  url: string;
}

export const editorImagesApi = {
  upload(file: File): Promise<EditorImageUploadResult> {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<EditorImageUploadResult>('/editor-images', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};
