import { apiClient } from './client';
import { toolIconSrc, whiteBackingSrc } from '@/utils/tool-icons';

export interface ToolIntegration {
  id: number;
  toolId: number | null;
  name: string;
  type: string;
  scope: string;
  organizationId: number | null;
  status: string;
  connectionStatus: string;
  connectionError?: string | null;
  lastSyncAt: string | null;
  settings: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationGrant {
  id: number;
  integrationId: number;
  organizationId: number;
  projectId: number | null;
  capabilities: string[];
  /** Tenable MSSP only: managed account UUID */
  accountId?: string | null;
  /** Tenable MSSP only: managed account display name */
  accountName?: string | null;
  /** Greenbone/OpenVAS only: GVM task UUID this grant syncs/launches */
  taskId?: string | null;
  /** Greenbone/OpenVAS only: GVM task display name */
  taskName?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const INTEGRATION_TYPES = [
  { id: 'tenable', label: 'Tenable Account', icon: 'pi-shield', color: '#00C7B7', disabled: false,
    capabilities: [
      { id: 'SYNC_ASSETS', label: 'Sync Assets' },
      { id: 'SYNC_VULNS',  label: 'Sync Vulnerabilities' },
    ],
    logo: toolIconSrc('tenable') },
  { id: 'tenable-mssp', label: 'Tenable MSSP', icon: 'pi-shield', color: '#00C7B7', disabled: false,
    capabilities: [
      { id: 'SYNC_ASSETS', label: 'Sync Assets' },
      { id: 'SYNC_VULNS',  label: 'Sync Vulnerabilities' },
    ],
    logo: toolIconSrc('tenable') },
  { id: 'qualys', label: 'Qualys', icon: 'pi-cloud', color: '#ED2E26', disabled: false,
    capabilities: [
      { id: 'SYNC_ASSETS', label: 'Sync Assets' },
      { id: 'SYNC_VULNS',  label: 'Sync Vulnerabilities' },
    ],
    logo: toolIconSrc('qualys'), logoBacking: whiteBackingSrc('qualys') },
  { id: 'action1', label: 'Action1', icon: 'pi-desktop', color: '#2BABE4', disabled: false,
    capabilities: [
      { id: 'SYNC_ASSETS', label: 'Sync Assets' },
      { id: 'SYNC_VULNS',  label: 'Sync Vulnerabilities' },
    ],
    logo: toolIconSrc('action1') },
  { id: 'crowdstrike', label: 'CrowdStrike', icon: 'pi-shield', color: '#EC0000', disabled: false,
    capabilities: [
      { id: 'SYNC_ASSETS', label: 'Sync Assets' },
      { id: 'SYNC_VULNS',  label: 'Sync Vulnerabilities' },
    ],
    logo: toolIconSrc('crowdstrike') },
  // FortiRecon and Shodan (asset+vuln enrichment) both moved to plugins (ares-plugin-fortirecon,
  // ares-plugin-shodan — loaded via the Plugin Manager): FortiRecon because its API docs are
  // private, Shodan because it grew into its own capability (domain/host/IP -> assets +
  // detections) worth shipping independently of ares-core. Neither has a static entry here
  // anymore; installing either plugin makes it show up via mergeWithDynamicTypes() instead, fed
  // by GET /api/v1/integrations/types. The older "shodan-task" connector (org-wide HOST_INFO/
  // SEARCH, its own dedicated tables) that used to live in ares-core, unreachable from this UI,
  // was removed outright 2026-09-26 — fully superseded by ares-plugin-shodan.
  { id: 'caido-api', label: 'Caido', icon: 'pi-send', color: '#E64980', disabled: false,
    capabilities: [
      { id: 'PULL_SCOPE',    label: 'Push Scope' },
      { id: 'PUSH_FINDINGS', label: 'Pull Findings' },
    ],
    logo: toolIconSrc('caido') },
  { id: 'greenbone', label: 'Greenbone VM', icon: 'pi-shield', color: '#0E823E', disabled: false,
    capabilities: [
      { id: 'LAUNCH_SCAN', label: 'Launch Scan' },
      { id: 'SYNC_VULNS',  label: 'Sync Results' },
    ],
    logo: toolIconSrc('greenbone') },
  // Bug Hunting platform org-facing Data Source connectors (distinct from the personal
  // researcher token used under Bug Hunting Platforms, see vdp-integrations.ts) were removed for
  // now — not implemented, revisit later.
];

// & { logoLight? } since none of the static entries above set it (only a plugin-synthesized
// entry in mergeWithDynamicTypes does) — TypeScript's inferred union from the literals alone
// wouldn't otherwise accept that extra optional key.
export type IntegrationTypeOption = typeof INTEGRATION_TYPES[number] & { logoLight?: string };

/** One entry of GET /api/v1/integrations/types — every currently-registered integration type,
 *  built-in or plugin-provided (see com.martecyber.ares.plugins on the backend). */
export interface RegisteredIntegrationType {
  type: string;
  label: string;
  capabilities: { code: string; label: string }[];
  /** Only ever set for a plugin-provided type — its plugin.json-configured icon (a URL, or an
   *  ares-ui-relative path). Null for a built-in type, which keeps its own curated icon below. */
  icon: string | null;
  /** Light-theme override for {@link icon}, same convention as the static list's own {@code
   *  logoLight}. Null when the plugin didn't configure one — every consumer then falls back to
   *  {@link icon} on both themes. */
  iconLight: string | null;
}

/** Merges the curated static list (own icon/color/logo) with whatever the backend currently has
 *  registered — a type only known dynamically (a plugin) gets a generic entry synthesized here so
 *  it still shows up in the "new integration" picker, using that plugin's own configured icon
 *  when it has one (falls back to a generic box icon otherwise); a static entry the backend
 *  doesn't actually have registered (shouldn't normally happen for a built-in type) is dropped
 *  rather than offered as a dead end. */
export function mergeWithDynamicTypes(dynamic: RegisteredIntegrationType[]): IntegrationTypeOption[] {
  const byId = new Map(dynamic.map((d) => [d.type, d]));
  const merged: IntegrationTypeOption[] = INTEGRATION_TYPES.filter((t) => t.disabled || byId.has(t.id));
  const known = new Set(merged.map((t) => t.id));
  for (const d of dynamic) {
    if (known.has(d.type)) continue;
    merged.push({
      id: d.type, label: d.label, icon: 'pi-box', color: 'var(--ares-text-muted)', disabled: false,
      capabilities: d.capabilities.map((c) => ({ id: c.code, label: c.label })),
      logo: d.icon ?? '',
      logoLight: d.iconLight ?? undefined,
    });
  }
  return merged;
}

// VDP platform types that must be excluded from the tool integrations list
const VDP_TYPES = new Set(['hackerone', 'intigriti']);


export const toolIntegrationsApi = {
  /** dataSourceOnly=true excludes Workflow-only action shims (KB sync, Bug Hunting sync) — pass
   *  it from the Data Sources "new integration" picker; leave it off for the Workflow editor's
   *  own (separate) action catalog. */
  listTypes(dataSourceOnly = false) {
    return apiClient
      .get<RegisteredIntegrationType[]>('/integrations/types', { params: { dataSourceOnly } })
      .then((r) => r.data);
  },

  list(params: { type?: string; status?: string; page?: number; size?: number } = {}) {
    return apiClient.get<{ items: ToolIntegration[]; total: number; totalPages: number }>('/integrations', { params })
      .then((r) => ({
        ...r.data,
        items: (r.data.items ?? []).filter((i) => !VDP_TYPES.has(i.type)),
      }));
  },

  get(id: number) {
    return apiClient.get<ToolIntegration>(`/integrations/${id}`).then((r) => r.data);
  },

  create(body: {
    name: string;
    type: string;
    scope?: string;
    organizationId?: number;
    credentials?: Record<string, string>;
    settings?: string;
  }) {
    return apiClient.post<ToolIntegration>('/integrations', body).then((r) => r.data);
  },

  update(id: number, body: {
    name?: string;
    status?: string;
    settings?: string;
    credentials?: Record<string, string>;
  }) {
    return apiClient.patch<ToolIntegration>(`/integrations/${id}`, body).then((r) => r.data);
  },

  delete(id: number) {
    return apiClient.delete<void>(`/integrations/${id}`);
  },

  testConnection(id: number) {
    return apiClient.post<ToolIntegration>(`/integrations/${id}/test`).then((r) => r.data);
  },

  listGrants(id: number) {
    return apiClient.get<IntegrationGrant[]>(`/integrations/${id}/grants`).then((r) => r.data);
  },

  listMsspAccounts(id: number) {
    return apiClient.get<{ id: string; name: string }[]>(`/integrations/${id}/mssp-accounts`).then((r) => r.data);
  },

  listGreenboneTasks(id: number) {
    return apiClient.get<{ id: string; name: string; status: string }[]>(`/integrations/${id}/greenbone-tasks`).then((r) => r.data);
  },

  createGrant(id: number, body: {
    organizationId: number; projectId?: number; capabilities: string[];
    accountId?: string; accountName?: string;
    taskId?: string; taskName?: string;
  }) {
    return apiClient.post<IntegrationGrant>(`/integrations/${id}/grants`, body).then((r) => r.data);
  },

  revokeGrant(id: number, grantId: number) {
    return apiClient.delete<void>(`/integrations/${id}/grants/${grantId}`);
  },
};
