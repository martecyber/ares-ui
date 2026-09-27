import { apiClient as api } from './client';
import type { Detection } from './detections';

export interface ResearchBoardMember {
  userId: number;
  email: string | null;
  displayName: string | null;
  addedAt: string;
}

export interface ResearchBoardSummary {
  id: number;
  projectId: number;
  title: string;
  leadUserId: number | null;
  leadName: string | null;
  status: 'active' | 'archived';
  verdict: 'affected' | 'not_affected' | null;
  resultAffectionId: number | null;
  /** Denormalized from the affection — lets the archived tab deep-link straight to the finding. */
  resultFindingId: number | null;
  members: ResearchBoardMember[];
  detectionCount: number;
  archivedAt: string | null;
  updatedAt: string;
}

export interface ResearchBoardDetail {
  id: number;
  projectId: number;
  title: string;
  notes: string | null;
  leadUserId: number | null;
  leadName: string | null;
  status: 'active' | 'archived';
  verdict: 'affected' | 'not_affected' | null;
  resultAffectionId: number | null;
  resultFindingId: number | null;
  members: ResearchBoardMember[];
  detections: Detection[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const researchBoardsApi = {
  list(projectId: number, archived = false): Promise<ResearchBoardSummary[]> {
    return api.get(`/projects/${projectId}/research-boards`, { params: { archived } }).then((r) => r.data);
  },

  create(projectId: number, body: { title: string; detectionIds: number[] }): Promise<ResearchBoardDetail> {
    return api.post(`/projects/${projectId}/research-boards`, body).then((r) => r.data);
  },

  get(projectId: number, id: number): Promise<ResearchBoardDetail> {
    return api.get(`/projects/${projectId}/research-boards/${id}`).then((r) => r.data);
  },

  update(projectId: number, id: number, body: { title?: string; notes?: string }): Promise<ResearchBoardDetail> {
    return api.patch(`/projects/${projectId}/research-boards/${id}`, body).then((r) => r.data);
  },

  remove(projectId: number, id: number): Promise<void> {
    return api.delete(`/projects/${projectId}/research-boards/${id}`).then(() => undefined);
  },

  addDetections(projectId: number, id: number, detectionIds: number[]): Promise<ResearchBoardDetail> {
    return api.post(`/projects/${projectId}/research-boards/${id}/detections`, { detectionIds }).then((r) => r.data);
  },

  /** Plain removal when neither option is given; moves the detection to another board (existing
   *  or brand new) when one is — the source board deletes its own link either way. */
  removeDetection(
    projectId: number, id: number, detectionId: number,
    opts?: { moveToBoardId?: number; newBoardTitle?: string },
  ): Promise<ResearchBoardDetail> {
    return api.delete(`/projects/${projectId}/research-boards/${id}/detections/${detectionId}`, {
      params: opts,
    }).then((r) => r.data);
  },

  addMember(projectId: number, id: number, userId: number): Promise<ResearchBoardDetail> {
    return api.post(`/projects/${projectId}/research-boards/${id}/members`, { userId }).then((r) => r.data);
  },

  removeMember(projectId: number, id: number, userId: number): Promise<ResearchBoardDetail> {
    return api.delete(`/projects/${projectId}/research-boards/${id}/members/${userId}`).then((r) => r.data);
  },

  /** id is the source board (deleted); targetBoardId survives with the merged content — returns
   *  the surviving (target) board. */
  merge(projectId: number, id: number, targetBoardId: number, title: string): Promise<ResearchBoardDetail> {
    return api.post(`/projects/${projectId}/research-boards/${id}/merge`, { targetBoardId, title }).then((r) => r.data);
  },

  /** Called after the escalation wizard has already linked+transitioned the board's detections
   *  to affectionId itself (via detectionsApi.escalateBatch) — this just archives the board with
   *  verdict "affected" and records the result. */
  escalate(projectId: number, id: number, affectionId: number): Promise<ResearchBoardDetail> {
    return api.post(`/projects/${projectId}/research-boards/${id}/escalate`, { affectionId }).then((r) => r.data);
  },

  /** Moves every current detection to "not_affected" and archives the board with that verdict. */
  notAffected(projectId: number, id: number, note?: string): Promise<ResearchBoardDetail> {
    return api.post(`/projects/${projectId}/research-boards/${id}/not-affected`, { note }).then((r) => r.data);
  },
};
