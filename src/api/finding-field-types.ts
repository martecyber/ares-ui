import { apiClient } from './client';

export interface FindingFieldType {
  id: number;
  name: string;
  title: string;
  description: string | null;
  isSystem: boolean;
  isRequired: boolean;
  sortOrder: number;
}

export const findingFieldTypesApi = {
  list(): Promise<FindingFieldType[]> {
    return apiClient.get<FindingFieldType[]>('/findings/field-types').then((r) => r.data);
  },
  create(body: { name: string; title: string; description?: string; required: boolean; sortOrder: number }): Promise<FindingFieldType> {
    return apiClient.post<FindingFieldType>('/findings/field-types', body).then((r) => r.data);
  },
  update(id: number, body: { title?: string; description?: string; required?: boolean; sortOrder?: number }): Promise<FindingFieldType> {
    return apiClient.patch<FindingFieldType>(`/findings/field-types/${id}`, body).then((r) => r.data);
  },
  delete(id: number): Promise<void> {
    return apiClient.delete<void>(`/findings/field-types/${id}`).then((r) => r.data);
  },
};
