import { apiClient } from './client';
import type { PagedResponse } from './organizations';
import type { RouteLocationRaw } from 'vue-router';
import { cveApi, cweApi, capecApi, attackApi, owaspApi } from './kb';

export interface TestingProcedureExternalRef {
  id: number | null;
  refType: string;
  refKey: string;
  refLabel: string | null;
}

export interface TestingProcedureGuidePointRef {
  guidePointId: number;
  pointTitle: string;
  guideId: number;
  guideName: string;
}

export interface TestingProcedure {
  id: number;
  title: string;
  /** Rich HTML. Null in list rows; populated on detail. */
  content: string | null;
  tags: string[];
  creatorId: number | null;
  createdAt: string;
  updatedAt: string;
  guidePoints: TestingProcedureGuidePointRef[] | null;
  externalRefs: TestingProcedureExternalRef[] | null;
}

export interface TestingProcedureForm {
  title: string;
  content?: string | null;
  tags?: string[];
  guidePointIds?: number[];
  externalRefs?: { refType: string; refKey: string; refLabel?: string | null }[];
}

export const EXTERNAL_REF_TYPES = [
  { value: 'cve',    label: 'CVE'    },
  { value: 'cwe',    label: 'CWE'    },
  { value: 'capec',  label: 'CAPEC'  },
  { value: 'attack', label: 'ATT&CK' },
  { value: 'owasp',  label: 'OWASP'  },
] as const;

export type ExternalRefType = typeof EXTERNAL_REF_TYPES[number]['value'];

export function externalRefTypeLabel(type: string): string {
  return EXTERNAL_REF_TYPES.find(t => t.value === type)?.label ?? type.toUpperCase();
}

export interface ExternalRefOption { refKey: string; refLabel: string; }

/** Searches the given external database and returns picker options ({ refKey, refLabel }). */
export async function searchExternalRefs(type: ExternalRefType, q: string): Promise<ExternalRefOption[]> {
  const query = q.trim();
  switch (type) {
    case 'cve': {
      const p = await cveApi.list({ q: query, size: 20 });
      return p.items.map(e => ({ refKey: e.id, refLabel: e.cveId }));
    }
    case 'cwe': {
      const p = await cweApi.list({ q: query, size: 20 });
      return p.content.map(e => ({ refKey: e.id, refLabel: `${e.code || 'CWE-' + e.cweId}: ${e.name}` }));
    }
    case 'capec': {
      const p = await capecApi.list({ q: query, size: 20 });
      return p.content.map(e => ({ refKey: e.id, refLabel: `CAPEC-${e.capecId}: ${e.name}` }));
    }
    case 'attack': {
      const p = await attackApi.techniques({ q: query, size: 20 });
      return p.content.map(e => ({ refKey: e.id, refLabel: `${e.attackId}: ${e.name}` }));
    }
    case 'owasp': {
      const items = await owaspApi.list({ q: query });
      return items.map(e => ({ refKey: `${e.year}/${e.owaspId}`, refLabel: `${e.owaspId} (${e.year}): ${e.name}` }));
    }
    default:
      return [];
  }
}

/** Builds a router location that opens the external DB entry a ref points at. */
export function externalRefRoute(ref: { refType: string; refKey: string }): RouteLocationRaw | null {
  switch (ref.refType) {
    case 'cve':    return { name: 'kb-cve-detail',    params: { id: ref.refKey } };
    case 'cwe':    return { name: 'kb-cwe-detail',    params: { id: ref.refKey } };
    case 'capec':  return { name: 'kb-capec-detail',  params: { id: ref.refKey } };
    case 'attack': return { name: 'kb-attack-technique-detail', params: { id: ref.refKey } };
    case 'owasp': {
      const [year, owaspId] = ref.refKey.split('/');
      return { name: 'kb-owasp-detail', params: { year, owaspId } };
    }
    default: return null;
  }
}

export const kbTestingProceduresApi = {
  list(params?: { q?: string; page?: number; size?: number }) {
    return apiClient.get<PagedResponse<TestingProcedure>>('/kb/testing-procedures', { params }).then(r => r.data);
  },
  listByGuidePoint(guidePointId: number) {
    return apiClient.get<PagedResponse<TestingProcedure>>('/kb/testing-procedures', { params: { guidePointId } })
      .then(r => r.data.items);
  },
  get(id: number) {
    return apiClient.get<TestingProcedure>(`/kb/testing-procedures/${id}`).then(r => r.data);
  },
  create(body: TestingProcedureForm) {
    return apiClient.post<TestingProcedure>('/kb/testing-procedures', body).then(r => r.data);
  },
  update(id: number, body: TestingProcedureForm) {
    return apiClient.put<TestingProcedure>(`/kb/testing-procedures/${id}`, body).then(r => r.data);
  },
  delete(id: number) {
    return apiClient.delete<void>(`/kb/testing-procedures/${id}`).then(r => r.data);
  },
  deleteBatch(ids: number[]) {
    return apiClient.delete<void>('/kb/testing-procedures', { data: ids }).then(r => r.data);
  },
  exportOne(id: number): Promise<Blob> {
    return apiClient.get(`/kb/testing-procedures/${id}/export`, { responseType: 'blob' }).then((r) => r.data);
  },
  exportZip(ids: number[]): Promise<Blob> {
    return apiClient.post('/kb/testing-procedures/export-zip', ids, { responseType: 'blob' }).then((r) => r.data);
  },
  importFiles(files: File[]): Promise<{ imported: number; errors: string[] }> {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return apiClient.post('/kb/testing-procedures/import', form).then((r) => r.data);
  },
};
