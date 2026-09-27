import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { Tag } from './tags';

export interface Asset {
  id: number;
  organizationId: number;
  code: string;
  type: string;
  identifier: string;
  metadata: string | null;
  createdAt: string;
  updatedAt: string | null;
  thirdParty?: boolean;
  /** Only meaningful when type === 'host'. Defaults to 'unknown' when not classified. */
  hostSubtype?: string | null;
  /** Only meaningful when type === 'host'. Ordered list of every hostname ever observed —
   *  index 0 is the "primary" hostname. Tools only ever append to it. */
  hostnames?: string[];
  /** Only meaningful when type === 'host'. When false, `identifier` ("Name") is auto-derived
   *  from `hostnames` (or a "host-{ip}" fallback); when true, a user has pinned it manually. */
  nameOverride?: boolean;
  tags?: Tag[];
}

/** Sub-classification for `host` assets. 'unknown' is the default when not identified. */
export const HOST_SUBTYPES = [
  'pc', 'server', 'vm', 'container', 'router', 'firewall', 'switch', 'wifi_ap', 'other', 'unknown',
] as const;
export type HostSubtypeKey = typeof HOST_SUBTYPES[number];

export const HOST_SUBTYPE_LABELS: Record<string, string> = {
  pc:        'PC',
  server:    'Server',
  vm:        'Virtual Machine',
  container: 'Container',
  router:    'Router',
  firewall:  'Firewall',
  switch:    'Switch',
  wifi_ap:   'WiFi AP',
  other:     'Other',
  unknown:   'Unknown',
};

/** Stored under metadata.interfaceType for `interface` assets. */
export const INTERFACE_TYPES = ['ethernet', 'wireless', 'virtual', 'loopback', 'other'] as const;
export type InterfaceTypeKey = typeof INTERFACE_TYPES[number];

export const INTERFACE_TYPE_LABELS: Record<string, string> = {
  ethernet: 'Ethernet',
  wireless: 'Wireless',
  virtual:  'Virtual',
  loopback: 'Loopback',
  other:    'Other',
};

export interface AssetRelationship {
  fromAssetId: number;
  toAssetId: number;
  type: string;
  directional: boolean;
  createdAt: string;
}

export interface AssetRelationshipDetail {
  relatedAssetId: number;
  relatedCode: string;
  relatedIdentifier: string;
  relatedType: string;
  linkType: string;
  direction: 'outgoing' | 'incoming';
}

export type ServiceVisibilityState = 'OPEN' | 'FILTERED' | 'CLOSED';

export interface ServiceVisibility {
  sourceIp: string;
  /** Free-text NAC profile tag. Empty string means "no NAC profile declared". */
  nacProfile: string;
  state: ServiceVisibilityState;
  firstSeen: string;
  lastSeen: string;
}

export interface ServiceHostInfo {
  hostId: number;
  hostIdentifier: string;
  hostCode: string;
}

export interface AssetNeighborhood {
  assets: Asset[];
  relationships: AssetRelationship[];
}

export interface AssetOrphanInfo {
  id: number;
  identifier: string;
  type: string;
  code: string;
}

export interface WebEndpointHttpSample {
  id: number;
  assetId: number;
  label: string | null;
  requestContent: string | null;
  responseContent: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface AssetToolSighting {
  id: number;
  tool: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** Organization-level view of an asset's discovery history — which PROJECTS have seen it, never
 *  which tool each one used (that detail is exclusive to the project itself). */
export interface AssetToolSightingProject {
  projectId: number;
  projectName: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export const ASSET_TYPES = [
  'host', 'ip', 'service', 'interface',
  'domain', 'web_application', 'web_endpoint',
  'technology',
  'system', 'directory', 'network',
  'android_app', 'ios_app', 'windows_app',
  'hardware', 'software',
  'text_data', 'email', 'credential', 'person', 'location',
] as const;

export type AssetTypeKey = typeof ASSET_TYPES[number];

export const ASSET_TYPE_LABELS: Record<string, string> = {
  host:            'Host',
  ip:              'IP Address',
  service:         'Service',
  interface:       'Interface',
  domain:          'Domain',
  web_application: 'Web Application',
  web_endpoint:    'Web Endpoint',
  technology:      'Technology',
  system:          'System',
  directory:       'Directory',
  network:         'Network',
  android_app:     'Android App',
  ios_app:         'iOS App',
  windows_app:     'Windows App',
  hardware:        'Hardware Device',
  software:        'Software',
  text_data:       'Text Data',
  email:           'Email Address',
  credential:      'Credential',
  person:          'Person',
  location:        'Location',
};

export const ASSET_TYPE_ICONS: Record<string, string> = {
  host:            'pi-server',
  ip:              'pi-sitemap',
  service:         'pi-bolt',
  interface:       'pi-link',
  domain:          'pi-globe',
  web_application: 'pi-window-maximize',
  web_endpoint:    'pi-directions',
  technology:      'pi-microchip',
  system:          'pi-objects-column',
  directory:       'pi-users',
  network:         'pi-wifi',
  android_app:     'pi-android',
  ios_app:         'pi-apple',
  windows_app:     'pi-desktop',
  hardware:        'pi-box',
  software:        'pi-folder',
  text_data:       'pi-file-word',
  email:           'pi-envelope',
  credential:      'pi-key',
  person:          'pi-user',
  location:        'pi-map-marker',
};

export const ASSET_LINK_TYPES: Partial<Record<string, string[]>> = {
  host:            ['host_interface', 'host_technology'],
  interface:       ['interface_ip', 'interface_service', 'interface_access_point'],
  domain:          ['domain_cname', 'domain_a', 'domain_aaaa', 'domain_mx', 'domain_ns', 'domain_txt', 'domain_ptr', 'domain_soa', 'domain_caa', 'domain_srv', 'domain_host'],
  web_application: ['webapp_service', 'webapp_domain', 'webapp_endpoint', 'webapp_technology'],
  web_endpoint:    ['endpoint_child', 'endpoint_technology'],
  system:          ['system_host'],
  directory:       ['directory_domain', 'directory_host'],
  network:         ['network_subnet', 'network_ip'],
  android_app:     ['app_technology'],
  ios_app:         ['app_technology'],
  windows_app:     ['app_technology'],
  hardware:        ['hardware_host'],
  software:        ['software_technology'],
};

export const ASSET_LINK_LABELS: Record<string, string> = {
  host_interface:      'Has interface',
  host_technology:     'Uses technology',
  interface_ip:        'Has IP',
  interface_service:   'Exposes service',
  interface_access_point: 'Connects to AP →',
  domain_cname:        'CNAME →',
  domain_a:            'A record →',
  domain_aaaa:         'AAAA record →',
  domain_mx:           'MX record →',
  domain_ns:           'NS record →',
  domain_txt:          'TXT record →',
  domain_ptr:          'PTR record →',
  domain_soa:          'SOA record →',
  domain_caa:          'CAA record →',
  domain_srv:          'SRV record →',
  domain_host:         'Local host →',
  webapp_service:      'Hosted on service →',
  webapp_domain:       'Served via domain →',
  webapp_endpoint:     'Root endpoint →',
  webapp_technology:   'Uses technology',
  endpoint_child:      'Child endpoint →',
  endpoint_technology: 'Uses technology',
  system_host:         'Comprises →',
  directory_domain:    'DNS domain →',
  directory_host:      'Domain controller →',
  network_subnet:      'Subnet →',
  network_ip:          'Contains IP →',
  app_technology:      'Uses technology',
  hardware_host:       'Runs host →',
  software_technology: 'Uses technology',
};

export const assetsApi = {
  list(params: { organizationId?: number; projectId?: number; type?: string; q?: string; aql?: string;
                  scopeStatus?: string[]; protocol?: string;
                  types?: string[]; hostSubtypes?: string[]; visibility?: string[];
                  sortBy?: string; sortDir?: string;
                  page?: number; size?: number } = {}) {
    return apiClient.get<PagedResponse<Asset>>('/assets', { params }).then((r) => r.data);
  },

  /** Fetches every page and returns all assets — for graph views that need the full dataset.
   *  `onPage` fires after each page so callers can render progressively. */
  async listAll(
    params: { organizationId?: number; projectId?: number; type?: string } = {},
    onPage?: (items: Asset[], loaded: number, total: number) => void,
  ): Promise<Asset[]> {
    const PAGE = 500;
    const all: Asset[] = [];
    let page = 0;
    while (true) {
      const res = await apiClient
        .get<PagedResponse<Asset>>('/assets', { params: { ...params, page, size: PAGE } })
        .then((r) => r.data);
      all.push(...res.items);
      onPage?.(res.items, all.length, res.total);
      if (!res.hasMore) break;
      page++;
    }
    return all;
  },
  get(id: number) {
    return apiClient.get<Asset>(`/assets/${id}`).then((r) => r.data);
  },
  create(body: { organizationId: number; type: string; identifier: string; metadata?: string; hostSubtype?: string;
                 hostnames?: string[] }) {
    return apiClient.post<Asset>('/assets', body).then((r) => r.data);
  },
  update(id: number, body: { type?: string; identifier?: string; metadata?: string; hostSubtype?: string;
                              hostnames?: string[]; nameOverride?: boolean }) {
    return apiClient.patch<Asset>(`/assets/${id}`, body).then((r) => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/assets/${id}`).then((r) => r.data);
  },
  bulkDelete(ids: number[]) {
    return apiClient.delete<void>('/assets/bulk', { data: { ids } }).then((r) => r.data);
  },
  previewOrphans(ids: number[]) {
    return apiClient.post<AssetOrphanInfo[]>('/assets/bulk/orphan-preview', { ids }).then((r) => r.data);
  },
  merge(sourceId: number, req: {
    targetId: number;
    fields: { key: string; mode: 'source' | 'target' | 'merge' | 'custom'; customValue?: string | string[] }[];
  }): Promise<Asset> {
    return apiClient.post<Asset>(`/assets/${sourceId}/merge`, req).then((r) => r.data);
  },
  listOrgRelationships(organizationId: number) {
    return apiClient.get<AssetRelationship[]>('/assets/relationships', { params: { organizationId } }).then((r) => r.data);
  },
  listProjectRelationships(projectId: number) {
    return apiClient.get<AssetRelationship[]>('/assets/relationships', { params: { projectId } }).then((r) => r.data);
  },
  listRelationships(id: number) {
    return apiClient.get<AssetRelationshipDetail[]>(`/assets/${id}/relationships`).then((r) => r.data);
  },
  addRelationship(id: number, body: { toAssetId: number; linkType: string }) {
    return apiClient.post<AssetRelationship>(`/assets/${id}/relationships`, body).then((r) => r.data);
  },
  removeRelationship(id: number, toAssetId: number, linkType: string) {
    return apiClient.delete<void>(`/assets/${id}/relationships`, { params: { toAssetId, linkType } }).then((r) => r.data);
  },
  reachable(orgId: number, fromIds: number[]) {
    return apiClient.get<Asset[]>('/assets/reachable', { params: { orgId, fromIds } }).then((r) => r.data);
  },

  /** Assets + relationships within `maxHops` of a focus asset (both in/out edges) — for graph-view pickers. */
  neighborhood(orgId: number, assetId: number, maxHops: number) {
    return apiClient
      .get<AssetNeighborhood>('/assets/neighborhood', { params: { orgId, assetId, maxHops } })
      .then((r) => r.data);
  },

  // Service visibility (service-type assets only)
  visibility(id: number) {
    return apiClient.get<ServiceVisibility[]>(`/assets/${id}/visibility`).then((r) => r.data);
  },

  /**
   * Bulk aggregate visibility per asset ID. Asset IDs with no records are absent from the response.
   * Result values are 'OPEN' | 'FILTERED' | 'CLOSED'.
   */
  visibilityAggregates(ids: number[]) {
    if (!ids.length) return Promise.resolve({} as Record<number, ServiceVisibilityState>);
    return apiClient
      .get<Record<number, ServiceVisibilityState>>('/assets/visibility-aggregates', { params: { ids } })
      .then((r) => r.data);
  },

  /**
   * Bulk host-of-service lookup. For each service asset id, returns the host that owns it
   * (via service → interface → host chain). Services without a complete chain are absent.
   */
  serviceHosts(ids: number[]) {
    if (!ids.length) return Promise.resolve({} as Record<number, ServiceHostInfo>);
    return apiClient
      .get<Record<number, ServiceHostInfo>>('/assets/service-hosts', { params: { ids } })
      .then((r) => r.data);
  },

  // Tool sightings (all asset types) — project context only; see AssetToolSighting's own
  // isolation rationale on the backend (AssetToolSighting.java).
  listToolSightings(assetId: number, projectId: number) {
    return apiClient.get<AssetToolSighting[]>(`/assets/${assetId}/tool-sightings`, { params: { projectId } }).then((r) => r.data);
  },

  // Organization context — which projects have discovered this asset, never which tool.
  listToolSightingProjects(assetId: number, organizationId: number) {
    return apiClient.get<AssetToolSightingProject[]>(`/assets/${assetId}/tool-sighting-projects`, { params: { organizationId } }).then((r) => r.data);
  },

  // HTTP Samples (web_endpoint only)
  listHttpSamples(assetId: number) {
    return apiClient.get<WebEndpointHttpSample[]>(`/assets/${assetId}/http-samples`).then((r) => r.data);
  },
  createHttpSample(assetId: number, body: { label?: string; requestContent?: string; responseContent?: string; notes?: string }) {
    return apiClient.post<WebEndpointHttpSample>(`/assets/${assetId}/http-samples`, body).then((r) => r.data);
  },
  updateHttpSample(assetId: number, sampleId: number, body: { label?: string; requestContent?: string; responseContent?: string; notes?: string }) {
    return apiClient.patch<WebEndpointHttpSample>(`/assets/${assetId}/http-samples/${sampleId}`, body).then((r) => r.data);
  },
  deleteHttpSample(assetId: number, sampleId: number) {
    return apiClient.delete<void>(`/assets/${assetId}/http-samples/${sampleId}`).then((r) => r.data);
  },

  // Tags
  assignTag(assetId: number, tagId: number) {
    return apiClient.post<Asset>(`/assets/${assetId}/tags/${tagId}`).then((r) => r.data);
  },
  unassignTag(assetId: number, tagId: number) {
    return apiClient.delete<Asset>(`/assets/${assetId}/tags/${tagId}`).then((r) => r.data);
  },
};
