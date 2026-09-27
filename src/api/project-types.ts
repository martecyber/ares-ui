import { apiClient } from './client';

export interface ProjectType {
  id: number;
  name: string;
  code: string;
  description: string | null;
  supertypeId: number | null;
  supertypeName: string | null;
  system: boolean;
  disabled: boolean;
  /** Set when a plugin (not an admin) owns this type's availability — e.g. "bughunting",
   *  "bughunting-hackerone". Only that plugin's own install/enable state should ever flip
   *  `disabled` back off; the admin UI must not offer a manual toggle for these. */
  requiredPluginId: string | null;
  /** The owning plugin's own metadata (null unless requiredPluginId is set) — lets the catalog
   *  render "contributed by <real plugin name>" generically instead of hardcoding which plugin
   *  contributes which type. */
  pluginDisplayName: string | null;
  pluginIcon: string | null;
  pluginIconLight: string | null;
}

export interface ProjectTypeRequest {
  name: string;
  code: string;
  description?: string;
  supertypeId: number;
}

export const projectTypesApi = {
  list() {
    return apiClient.get<ProjectType[]>('/project-types').then((r) => r.data);
  },
  create(body: ProjectTypeRequest) {
    return apiClient.post<ProjectType>('/project-types', body).then((r) => r.data);
  },
  update(id: number, body: ProjectTypeRequest) {
    return apiClient.put<ProjectType>(`/project-types/${id}`, body).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete(`/project-types/${id}`);
  },
  setDisabled(id: number, disabled: boolean) {
    return apiClient.patch<ProjectType>(`/project-types/${id}/disabled`, { disabled }).then((r) => r.data);
  },
};
