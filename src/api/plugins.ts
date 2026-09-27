import { apiClient } from './client';

export interface InstalledPlugin {
  id: number;
  pluginId: string;
  version: string;
  displayName: string;
  vendor: string | null;
  license: string | null;
  description: string | null;
  sdkVersion: string;
  icon: string | null;
  iconLight: string | null;
  source: 'marketplace' | 'upload';
  enabled: boolean;
  installedAt: string;
}

/** One row of `GET /plugins/browse` — a plugin known to at least one enabled repository, merged
 *  with this instance's own installed state (see backend PluginBrowseEntryDto). */
export interface BrowsePlugin {
  pluginId: string;
  displayName: string;
  vendor: string | null;
  icon: string | null;
  iconLight: string | null;
  description: string | null;
  repositorySourceId: number;
  repositoryName: string;
  latestVersion: string;
  latestCompatibleVersion: string | null;
  installable: boolean;
  installedVersion: string | null;
  updateAvailable: boolean;
}

/** One row of `GET /plugins/browse/{pluginId}/versions` — a single published version, flagged for
 *  whether THIS instance can install it (see backend PluginBrowseVersionDto). */
export interface BrowsePluginVersion {
  version: string;
  sdkVersion: string;
  publishedAt: string;
  releaseNotes: string | null;
  yanked: boolean;
  compatible: boolean;
  incompatibleReason: string | null;
}

/** A plugin with this id is already installed — {@code conflict} says how the version being
 *  installed compares to it (see backend PluginVersions). Nothing was touched; re-submit the
 *  same install call with {@code replace: true} to proceed (skip that for "same" — there's
 *  nothing useful to redo). */
export interface PluginVersionConflict {
  conflict: 'same' | 'upgrade' | 'downgrade';
  installedVersion: string;
  newVersion: string;
}

/** A plugin the install depends on (its manifest's `dependsOn`) isn't installed at all, or is
 *  installed but disabled — see backend PluginDependencyException. Nothing was touched. */
export interface PluginDependencyConflict {
  pluginId: string;
  dependencyId: string;
  dependencyDisabled: boolean;
  detail: string;
}

export type InstallOutcome =
  | { kind: 'installed'; plugin: InstalledPlugin }
  | { kind: 'conflict'; conflict: PluginVersionConflict }
  | { kind: 'missingDependency'; conflict: PluginDependencyConflict };

function isVersionConflict(data: unknown): data is PluginVersionConflict {
  return !!data && typeof data === 'object' && 'conflict' in data && 'installedVersion' in data;
}

function isDependencyConflict(data: unknown): data is PluginDependencyConflict {
  return !!data && typeof data === 'object' && 'dependencyId' in data;
}

export const pluginsApi = {
  list() {
    return apiClient.get<InstalledPlugin[]>('/plugins').then((r) => r.data);
  },

  async upload(file: File, replace = false): Promise<InstallOutcome> {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await apiClient.post<InstalledPlugin>('/plugins', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { replace },
      });
      return { kind: 'installed', plugin: data };
    } catch (e: any) {
      if (e?.response?.status === 409 && isVersionConflict(e.response.data)) {
        return { kind: 'conflict', conflict: e.response.data };
      }
      if (e?.response?.status === 422 && isDependencyConflict(e.response.data)) {
        return { kind: 'missingDependency', conflict: e.response.data };
      }
      throw e;
    }
  },

  setEnabled(id: number, enabled: boolean) {
    return apiClient.patch<InstalledPlugin>(`/plugins/${id}/enabled`, { enabled }).then((r) => r.data);
  },

  uninstall(id: number) {
    return apiClient.delete<void>(`/plugins/${id}`);
  },

  browse() {
    return apiClient.get<BrowsePlugin[]>('/plugins/browse').then((r) => r.data);
  },

  browseVersions(pluginId: string, repositoryId: number) {
    return apiClient
      .get<BrowsePluginVersion[]>(`/plugins/browse/${pluginId}/versions`, { params: { repositoryId } })
      .then((r) => r.data);
  },

  async installFromRepository(repositoryId: number, pluginId: string, version: string, replace = false): Promise<InstallOutcome> {
    try {
      const { data } = await apiClient.post<InstalledPlugin>('/plugins/install', { repositoryId, pluginId, version, replace });
      return { kind: 'installed', plugin: data };
    } catch (e: any) {
      if (e?.response?.status === 409 && isVersionConflict(e.response.data)) {
        return { kind: 'conflict', conflict: e.response.data };
      }
      if (e?.response?.status === 422 && isDependencyConflict(e.response.data)) {
        return { kind: 'missingDependency', conflict: e.response.data };
      }
      throw e;
    }
  },
};
