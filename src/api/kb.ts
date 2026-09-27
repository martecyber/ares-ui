import { apiClient as api } from './client';

// ── Shared ────────────────────────────────────────────────────────────────

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// Ares custom PagedResponse (used by finding-templates and other REST endpoints)
export interface AresPage<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  size: number;
  hasMore: boolean;
}

export interface SyncStats {
  total: number;
  lastSync: string | null;
  version: string | null;
  synced: boolean;
}

export interface SyncResponse {
  jobId: number;
  status: string;
}

// ── CWE ───────────────────────────────────────────────────────────────────

export interface CweEntry {
  id: string;
  cweId: string;
  code: string;
  name: string;
  type: string;
  abstraction: string | null;
  status: string | null;
  description: string | null;
  extendedDescription: string | null;
  consequences: { scopes: string[]; impacts: string[]; likelihood: string | null; note: string | null }[];
  mitigations: { phases: string[]; strategy: string | null; description: string | null; effectiveness: string | null }[];
  parentIds: string[];
  childIds: string[];
  relatedCapecIds: string[];
  likelihoodOfExploit: string | null;
  applicablePlatforms: string[];
  observedExamples: string[];
  vulnerabilityMapping: { usage: string; rationale: string | null; comments: string | null } | null;
  syncedAt: string | null;
  sourceVersion: string | null;
  relatedWeaknesses: { cweId: string; nature: string; viewId: string | null; viewName: string | null }[];
  references: { url: string; name: string | null }[];
  memberships: { viewId: string | null; viewName: string | null; categoryId: string; categoryName: string | null }[];
  notes: { type: string | null; text: string }[];
  alternateTerms: { term: string; description: string | null }[];
  detectionMethods: { method: string | null; description: string | null; effectiveness: string | null }[];
}

export interface KbNameDto { id: string; name: string }

export const cweApi = {
  list(params?: { page?: number; size?: number; type?: string | string[]; abstraction?: string | string[]; q?: string; aql?: string; likelihoodOfExploit?: string | string[]; sortBy?: string; sortDir?: string }): Promise<Page<CweEntry>> {
    return api.get('/kb/cwe', { params }).then(r => r.data);
  },
  get(id: string): Promise<CweEntry> {
    return api.get(`/kb/cwe/${id}`).then(r => r.data);
  },
  names(ids: string[]): Promise<KbNameDto[]> {
    if (!ids.length) return Promise.resolve([]);
    return api.get('/kb/cwe/names', { params: { ids } }).then(r => r.data);
  },
  stats(): Promise<SyncStats> {
    return api.get('/kb/cwe/stats').then(r => r.data);
  },
  sync(): Promise<SyncResponse> {
    return api.post('/kb/cwe/sync').then(r => r.data);
  },
};

// ── CAPEC ─────────────────────────────────────────────────────────────────

export interface CapecEntry {
  id: string;
  capecId: string;
  code: string;
  name: string;
  abstraction: string | null;
  status: string | null;
  description: string | null;
  extendedDescription: string | null;
  typicalSeverity: string | null;
  likelihoodOfAttack: string | null;
  prerequisites: string[];
  mitigations: string[];
  consequences: { scopes: string[]; impacts: string[]; likelihood: string | null; note: string | null }[];
  relatedCweIds: string[];
  relatedAttackTechniqueIds: string[];
  parentCapecIds: string[];
  childCapecIds: string[];
  domains: string[];
  executionFlow: { step: number; phase: string | null; description: string | null; techniques: string[] }[];
  relatedAttackPatterns: { capecId: string; nature: string }[];
  references: { url: string; name: string | null }[];
  syncedAt: string | null;
  sourceVersion: string | null;
}

export const capecApi = {
  list(params?: { page?: number; size?: number; abstraction?: string | string[]; severity?: string | string[]; cwe?: string; q?: string; aql?: string; likelihoodOfAttack?: string | string[]; sortBy?: string; sortDir?: string }): Promise<Page<CapecEntry>> {
    return api.get('/kb/capec', { params }).then(r => r.data);
  },
  get(id: string): Promise<CapecEntry> {
    return api.get(`/kb/capec/${id}`).then(r => r.data);
  },
  names(ids: string[]): Promise<KbNameDto[]> {
    if (!ids.length) return Promise.resolve([]);
    return api.get('/kb/capec/names', { params: { ids } }).then(r => r.data);
  },
  stats(): Promise<SyncStats> {
    return api.get('/kb/capec/stats').then(r => r.data);
  },
  sync(): Promise<SyncResponse> {
    return api.post('/kb/capec/sync').then(r => r.data);
  },
};

// ── ATT&CK ────────────────────────────────────────────────────────────────

export type AttackMatrix = 'enterprise-attack' | 'mobile-attack' | 'ics-attack';

export interface AttackTactic {
  id: string;
  stixId: string;
  attackId: string;
  name: string;
  description: string | null;
  shortName: string;
  matrix: string;
  order: number;
}

export interface AttackTechnique {
  id: string;
  stixId: string;
  attackId: string;
  name: string;
  description: string | null;
  matrix: string;
  subtechnique: boolean;
  tactics: string[];
  platforms: string[];
  dataSources: string[];
  detection: string | null;
  permissionsRequired: string[];
  references: { url: string; name: string | null }[];
  deprecated: boolean;
  revoked: boolean;
}

export interface AttackMitigation {
  id: string;
  stixId: string;
  attackId: string;
  name: string;
  description: string | null;
  matrix: string;
  deprecated: boolean;
}

export interface AttackSyncStats {
  tactics: number;
  techniques: number;
  mitigations: number;
  lastSync: string | null;
  synced: boolean;
}

export const attackApi = {
  tactics(matrix: AttackMatrix = 'enterprise-attack'): Promise<AttackTactic[]> {
    return api.get('/kb/attack/tactics', { params: { matrix } }).then(r => r.data);
  },
  techniques(params?: { matrix?: AttackMatrix; tactic?: string; subtechniques?: boolean; q?: string; aql?: string; page?: number; size?: number }): Promise<Page<AttackTechnique>> {
    return api.get('/kb/attack/techniques', { params }).then(r => r.data);
  },
  allTechniques(matrix: AttackMatrix = 'enterprise-attack'): Promise<AttackTechnique[]> {
    return api.get('/kb/attack/techniques/all', { params: { matrix } }).then(r => r.data);
  },
  techniqueNames(ids: string[]): Promise<KbNameDto[]> {
    if (!ids.length) return Promise.resolve([]);
    return api.get('/kb/attack/techniques/names', { params: { ids } }).then(r => r.data);
  },
  getTechnique(id: string, matrix: AttackMatrix = 'enterprise-attack'): Promise<AttackTechnique> {
    return api.get(`/kb/attack/techniques/${id}`, { params: { matrix } }).then(r => r.data);
  },
  techniqueMitigations(id: string, matrix: AttackMatrix = 'enterprise-attack'): Promise<AttackMitigation[]> {
    return api.get(`/kb/attack/techniques/${id}/mitigations`, { params: { matrix } }).then(r => r.data);
  },
  techniqueSubtechniques(id: string, matrix: AttackMatrix = 'enterprise-attack'): Promise<KbNameDto[]> {
    return api.get(`/kb/attack/techniques/${id}/subtechniques`, { params: { matrix } }).then(r => r.data);
  },
  mitigations(params?: { matrix?: AttackMatrix; q?: string; page?: number; size?: number }): Promise<Page<AttackMitigation>> {
    return api.get('/kb/attack/mitigations', { params }).then(r => r.data);
  },
  allMitigations(matrix: AttackMatrix = 'enterprise-attack'): Promise<AttackMitigation[]> {
    return api.get('/kb/attack/mitigations/all', { params: { matrix } }).then(r => r.data);
  },
  stats(): Promise<AttackSyncStats> {
    return api.get('/kb/attack/stats').then(r => r.data);
  },
  sync(): Promise<SyncResponse> {
    return api.post('/kb/attack/sync').then(r => r.data);
  },
};

// ── CVE ───────────────────────────────────────────────────────────────────

export interface CveReference {
  url: string;
  name: string | null;
  tags: string[];
}

export interface CveVersionRange {
  version: string | null;
  status: string | null;
  lessThan: string | null;
  lessThanOrEqual: string | null;
  versionType: string | null;
}

export interface CveAffectedProduct {
  vendor: string | null;
  product: string | null;
  defaultStatus: string | null;
  versions: CveVersionRange[];
}

export interface CveScore {
  source: string | null;
  sourceRole: string | null;  // "CNA" | "ADP"
  version: string | null;
  score: number | null;
  vector: string | null;
  severity: string | null;
  isDefault: boolean;
}

/** CISA's own SSVC assessment, when published on this CVE (display-only — CISA never
 *  publishes a computed outcome, since the tree's 4th decision point, Mission and
 *  Well-Being Impact, is organization-specific). CVSS remains the source of severity. */
export interface CveSsvcAssessment {
  role: string | null;
  exploitation: string | null;
  automatable: string | null;
  technicalImpact: string | null;
  version: string | null;
  timestamp: string | null;
}

export interface CveEntry {
  id: string;
  cveId: string;
  state: string | null;
  description: string | null;
  /** Top-level fields mirror the default score for quick display / list view. */
  cvssScore: number | null;
  cvssVector: string | null;
  cvssVersion: string | null;
  severity: string | null;
  cvssScores: CveScore[];
  ssvc: CveSsvcAssessment | null;
  cwes: string[];
  affectedProducts: CveAffectedProduct[];
  references: CveReference[];
  publishedAt: string | null;
  lastModifiedAt: string | null;
  syncedAt: string | null;
  /** Denormalized from the CISA KEV catalog — lets the list be sorted/filtered by KEV status. */
  kevListed: boolean;
  kevDateAdded: string | null;
  /** Same denormalization, from VulnCheck's KEV catalog. */
  vulncheckKevListed: boolean;
  vulncheckKevDateAdded: string | null;
}

export interface CveSyncStats {
  total: number;
  critical: number;
  high: number;
  lastSync: string | null;
  lastCommit: string | null;
  synced: boolean;
}

export interface CveSeverityDto { id: string; severity: string | null }
export interface CveDescriptionDto { id: string; description: string | null }

export const cveApi = {
  list(params?: { page?: number; size?: number; severity?: string | string[]; kev?: string | string[]; poc?: string | string[]; q?: string; aql?: string; sortBy?: string; sortDir?: string }): Promise<AresPage<CveEntry>> {
    return api.get('/kb/cve', { params }).then(r => r.data);
  },
  get(id: string): Promise<CveEntry> {
    return api.get(`/kb/cve/${id}`).then(r => r.data);
  },
  severities(ids: string[]): Promise<CveSeverityDto[]> {
    if (!ids.length) return Promise.resolve([]);
    return api.get('/kb/cve/severities', { params: { ids } }).then(r => r.data);
  },
  descriptions(ids: string[]): Promise<CveDescriptionDto[]> {
    if (!ids.length) return Promise.resolve([]);
    return api.get('/kb/cve/descriptions', { params: { ids } }).then(r => r.data);
  },
  stats(): Promise<CveSyncStats> {
    return api.get('/kb/cve/stats').then(r => r.data);
  },
  /** Delta update: fetch + git diff since last synced commit. */
  sync(): Promise<SyncResponse> {
    return api.post('/kb/cve/sync').then(r => r.data);
  },
  /** Full rescan: fetch latest + walk all ~250k CVE JSON files. Takes several minutes. */
  syncFull(): Promise<SyncResponse> {
    return api.post('/kb/cve/sync/full').then(r => r.data);
  },
};

// ── CISA KEV (Known Exploited Vulnerabilities) ─────────────────────────────

export interface CisaKevEntry {
  id: number;
  cveId: string;
  vendorProject: string | null;
  product: string | null;
  vulnerabilityName: string | null;
  dateAdded: string | null;
  shortDescription: string | null;
  requiredAction: string | null;
  dueDate: string | null;
  knownRansomwareCampaignUse: boolean;
  notes: string | null;
  cwes: string[];
  syncedAt: string | null;
}

/** Slim projection returned by the batch `/status` lookup — used to flag CVE rows/references. */
export interface CisaKevStatusDto {
  id: string;
  vulnerabilityName: string | null;
  dateAdded: string | null;
  dueDate: string | null;
  knownRansomwareCampaignUse: boolean;
  requiredAction: string | null;
}

export interface CisaKevSyncStats {
  total: number;
  ransomware: number;
  lastSync: string | null;
  synced: boolean;
}

export const cisaKevApi = {
  list(params?: { page?: number; size?: number; q?: string; sortBy?: string; sortDir?: string }): Promise<Page<CisaKevEntry>> {
    return api.get('/kb/cisa-kev', { params }).then(r => r.data);
  },
  get(id: string): Promise<CisaKevEntry> {
    return api.get(`/kb/cisa-kev/${id}`).then(r => r.data);
  },
  /** Batch lookup — returns only the ids that ARE in the KEV catalog (absent = not listed). */
  status(ids: string[]): Promise<CisaKevStatusDto[]> {
    if (!ids.length) return Promise.resolve([]);
    return api.get('/kb/cisa-kev/status', { params: { ids } }).then(r => r.data);
  },
  stats(): Promise<CisaKevSyncStats> {
    return api.get('/kb/cisa-kev/stats').then(r => r.data);
  },
  sync(): Promise<SyncResponse> {
    return api.post('/kb/cisa-kev/sync').then(r => r.data);
  },
  /** Wipes the existing KEV catalog and re-fetches it from scratch. */
  syncFull(): Promise<SyncResponse> {
    return api.post('/kb/cisa-kev/sync/full').then(r => r.data);
  },
};

// ── VulnCheck KEV (extended, community tier) ───────────────────────────────

export interface VulnCheckKevEntry {
  id: number;
  /** One row per CVE now (AQL-wide initiative, Phase 4 — cve_kev_detail is keyed (cveId,
   *  source)), not one row per feed entry — a feed entry covering several CVEs used to come back
   *  as a single row with `cve: string[]`; it now comes back as N rows, one per CVE. */
  cveId: string;
  vendorProject: string | null;
  product: string | null;
  vulnerabilityName: string | null;
  shortDescription: string | null;
  requiredAction: string | null;
  dueDate: string | null;
  dateAdded: string | null;
  cisaDateAdded: string | null;
  knownRansomwareCampaignUse: boolean;
  reportedExploitedByCanaries: boolean | null;
  cwes: string[];
  xdbUrls: string[];
  reportedExploitationUrls: string[];
  syncedAt: string | null;
}

export interface VulnCheckKevStatusDto {
  id: string;
  vulnerabilityName: string | null;
  dateAdded: string | null;
  dueDate: string | null;
  knownRansomwareCampaignUse: boolean;
  reportedExploitedByCanaries: boolean;
  requiredAction: string | null;
}

export interface VulnCheckKevSyncStats {
  total: number;
  ransomware: number;
  lastSync: string | null;
  apiKeyConfigured: boolean;
  synced: boolean;
}

export const vulncheckKevApi = {
  list(params?: { page?: number; size?: number; q?: string; sortBy?: string; sortDir?: string }): Promise<Page<VulnCheckKevEntry>> {
    return api.get('/kb/vulncheck-kev', { params }).then(r => r.data);
  },
  get(id: string): Promise<VulnCheckKevEntry> {
    return api.get(`/kb/vulncheck-kev/${id}`).then(r => r.data);
  },
  status(ids: string[]): Promise<VulnCheckKevStatusDto[]> {
    if (!ids.length) return Promise.resolve([]);
    return api.get('/kb/vulncheck-kev/status', { params: { ids } }).then(r => r.data);
  },
  stats(): Promise<VulnCheckKevSyncStats> {
    return api.get('/kb/vulncheck-kev/stats').then(r => r.data);
  },
  /** Write-only — the stored key is never returned by any endpoint. */
  setApiKey(apiKey: string): Promise<{ configured: boolean }> {
    return api.put('/kb/vulncheck-kev/api-key', { apiKey }).then(r => r.data);
  },
  sync(): Promise<SyncResponse> {
    return api.post('/kb/vulncheck-kev/sync').then(r => r.data);
  },
  /** Wipes the existing VulnCheck KEV catalog and re-fetches it from scratch. */
  syncFull(): Promise<SyncResponse> {
    return api.post('/kb/vulncheck-kev/sync/full').then(r => r.data);
  },
};

// ── OWASP ────────────────────────────────────────────────────────────────

export interface OwaspEntry {
  id: string;
  owaspId: string;
  year: number;
  rank: number;
  name: string;
  description: string | null;
  cwes: string[];
  preventions: string[];
  syncedAt: string | null;
}

export interface OwaspSyncStats {
  total: number;
  years: number[];
  lastSync: string | null;
  synced: boolean;
}

// ── Finding Templates ─────────────────────────────────────────────────────

export interface FindingTemplateFieldDto {
  id: number;
  typeId: number;
  fieldText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FindingTemplateScoreDto {
  id: number;
  typeId: number;
  score: number | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FindingTemplate {
  id: number;
  severity: string;
  title: string;
  creatorId: number | null;
  fields: FindingTemplateFieldDto[];
  scores: FindingTemplateScoreDto[];
  createdAt: string;
  updatedAt: string;
}

export const findingTemplateApi = {
  list(params?: { q?: string; aql?: string; sortBy?: string; sortDir?: string; page?: number; size?: number }): Promise<AresPage<FindingTemplate>> {
    return api.get('/finding-templates', { params }).then(r => r.data);
  },
  get(id: number): Promise<FindingTemplate> {
    return api.get(`/finding-templates/${id}`).then(r => r.data);
  },
  create(data: {
    title: string;
    fields?: { typeId: number; fieldText: string }[];
    scores?: { typeId: number; score: number; metadata?: string; ssvcLeafNodeId?: number }[];
    referenceIds?: number[];
  }): Promise<FindingTemplate> {
    return api.post('/finding-templates', data).then(r => r.data);
  },
  delete(id: number): Promise<void> {
    return api.delete(`/finding-templates/${id}`).then(() => undefined);
  },
  bulkDelete(ids: number[]): Promise<number> {
    return api.post('/finding-templates/bulk-delete', ids).then(r => r.data.deleted as number);
  },
  exportOne(id: number): Promise<Blob> {
    return api.get(`/finding-templates/${id}/export`, { responseType: 'blob' }).then(r => r.data);
  },
  exportZip(ids: number[]): Promise<Blob> {
    return api.post('/finding-templates/export-zip', ids, { responseType: 'blob' }).then(r => r.data);
  },
  importFiles(files: File[]): Promise<{ imported: number; errors: string[] }> {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return api.post('/finding-templates/import', form).then(r => r.data);
  },
};

export const owaspApi = {
  list(params?: { q?: string; aql?: string; year?: number }): Promise<OwaspEntry[]> {
    return api.get('/kb/owasp', { params }).then(r => r.data);
  },
  get(id: string, year?: number): Promise<OwaspEntry> {
    return api.get(`/kb/owasp/${id}`, { params: year ? { year } : undefined }).then(r => r.data);
  },
  years(): Promise<number[]> {
    return api.get('/kb/owasp/years').then(r => r.data);
  },
  stats(): Promise<OwaspSyncStats> {
    return api.get('/kb/owasp/stats').then(r => r.data);
  },
  seed(): Promise<SyncResponse> {
    return api.post('/kb/owasp/seed').then(r => r.data);
  },
};
