import { apiClient } from './client';

export interface SsvcRoleSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  usesPriorityMapping: boolean;
  /** True once any finding/template score references a node in this role's tree —
   *  the tree can then only be edited cosmetically. */
  locked: boolean;
  /** False when the role has no tree yet (just created). */
  hasTree: boolean;
}

export interface SsvcMethodology {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  roles: SsvcRoleSummary[];
}

export interface SsvcTreeNodeOption {
  id: number;
  code: string;
  label: string;
  helpText: string | null;
  child: SsvcTreeNode | null;
}

export interface SsvcTreeNode {
  id: number;
  nodeType: 'branch' | 'leaf';
  // branch
  decisionPointCode: string | null;
  decisionPointName: string | null;
  decisionPointHelp: string | null;
  options: SsvcTreeNodeOption[] | null;
  // leaf
  outcomeCode: string | null;
  outcomeLabel: string | null;
  outcomeDescription: string | null;
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | null;
}

/** One entry of a role's reusable, named outcome palette — persisted directly on the
 *  role, independent of whether any tree leaf currently references it. */
export interface SsvcRoleOutcome {
  code: string;
  label: string;
  description: string | null;
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | null;
}

export interface SsvcRoleDetail {
  id: number;
  methodologyId: number;
  methodologyCode: string;
  methodologyIsSystem: boolean;
  code: string;
  name: string;
  description: string | null;
  usesPriorityMapping: boolean;
  locked: boolean;
  tree: SsvcTreeNode | null;
  outcomes: SsvcRoleOutcome[];
}

// Write-side tree shape — no ids, server assigns fresh ones on every replace.
export interface SsvcTreeNodeInput {
  nodeType: 'branch' | 'leaf';
  decisionPointCode?: string;
  decisionPointName?: string;
  decisionPointHelp?: string;
  options?: SsvcTreeNodeOptionInput[];
  outcomeCode?: string;
  outcomeLabel?: string;
  outcomeDescription?: string;
  priorityLevel?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
}

export interface SsvcTreeNodeOptionInput {
  code: string;
  label: string;
  helpText?: string;
  child: SsvcTreeNodeInput;
}

export const ssvcMethodologiesApi = {
  list() {
    return apiClient.get<SsvcMethodology[]>('/ssvc-methodologies').then((r) => r.data);
  },
  getDetail(id: number) {
    return apiClient.get<SsvcMethodology>(`/ssvc-methodologies/${id}`).then((r) => r.data);
  },
  create(body: { code: string; name: string; description?: string }) {
    return apiClient.post<SsvcMethodology>('/ssvc-methodologies', body).then((r) => r.data);
  },
  update(id: number, body: { name?: string; description?: string }) {
    return apiClient.patch<SsvcMethodology>(`/ssvc-methodologies/${id}`, body).then((r) => r.data);
  },
  remove(id: number) {
    return apiClient.delete<void>(`/ssvc-methodologies/${id}`).then((r) => r.data);
  },
  createRole(methodologyId: number, body: { code: string; name: string; description?: string; usesPriorityMapping?: boolean }) {
    return apiClient.post<SsvcRoleSummary>(`/ssvc-methodologies/${methodologyId}/roles`, body).then((r) => r.data);
  },
  getRoleDetail(roleId: number) {
    return apiClient.get<SsvcRoleDetail>(`/ssvc-roles/${roleId}`).then((r) => r.data);
  },
  updateRole(roleId: number, body: { code?: string; name?: string; description?: string; outcomes?: SsvcRoleOutcome[] }) {
    return apiClient.patch<SsvcRoleSummary>(`/ssvc-roles/${roleId}`, body).then((r) => r.data);
  },
  removeRole(roleId: number) {
    return apiClient.delete<void>(`/ssvc-roles/${roleId}`).then((r) => r.data);
  },
  replaceTree(roleId: number, root: SsvcTreeNodeInput) {
    return apiClient.put<SsvcRoleDetail>(`/ssvc-roles/${roleId}/tree`, { root }).then((r) => r.data);
  },
  /** Resolves which role a tree node (typically a score's leaf) belongs to — used to
   *  restore the methodology+role selection when editing an existing SSVC score. */
  getRoleIdForNode(nodeId: number) {
    return apiClient.get<{ roleId: number }>(`/ssvc-tree-nodes/${nodeId}/role`).then((r) => r.data.roleId);
  },
  exportOne(id: number) {
    return apiClient.get(`/ssvc-methodologies/${id}/export`, { responseType: 'blob' }).then((r) => r.data as Blob);
  },
  exportZip(ids: number[]) {
    return apiClient.post('/ssvc-methodologies/export-zip', ids, { responseType: 'blob' }).then((r) => r.data as Blob);
  },
  importFiles(files: File[]): Promise<{ imported: number; errors: string[] }> {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return apiClient.post('/ssvc-methodologies/import', form).then((r) => r.data);
  },
};
