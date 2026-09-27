import { apiClient } from './client';

export type ProjectRuleType =
  | 'time_window'
  | 'rate_limit'
  | 'required_header'
  | 'required_user_agent'
  | 'severity_override'
  | 'max_concurrency'
  | 'excluded_vuln_type'
  | 'email_recipients';

export interface ProjectRule {
  id: number;
  projectId: number;
  ruleType: ProjectRuleType;
  enabled: boolean;
  note: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateProjectRuleBody {
  ruleType: ProjectRuleType;
  enabled?: boolean;
  note?: string | null;
  config: Record<string, unknown>;
}

export interface UpdateProjectRuleBody {
  enabled?: boolean;
  note?: string | null;
  config?: Record<string, unknown>;
}

export const RULE_TYPE_LABELS: Record<ProjectRuleType, string> = {
  time_window:         'Time Window',
  rate_limit:          'Rate Limit',
  required_header:     'Required Header',
  required_user_agent: 'Required User-Agent',
  severity_override:   'Severity Override',
  max_concurrency:     'Max Concurrency',
  excluded_vuln_type:  'Out of Scope Vuln Type',
  email_recipients:    'Report Email Recipients',
};

export const projectRulesApi = {
  list(projectId: number) {
    return apiClient.get<ProjectRule[]>(`/projects/${projectId}/rules`).then((r) => r.data);
  },
  create(projectId: number, body: CreateProjectRuleBody) {
    return apiClient.post<ProjectRule>(`/projects/${projectId}/rules`, body).then((r) => r.data);
  },
  update(projectId: number, id: number, body: UpdateProjectRuleBody) {
    return apiClient.patch<ProjectRule>(`/projects/${projectId}/rules/${id}`, body).then((r) => r.data);
  },
  delete(projectId: number, id: number) {
    return apiClient.delete<void>(`/projects/${projectId}/rules/${id}`).then((r) => r.data);
  },
};
