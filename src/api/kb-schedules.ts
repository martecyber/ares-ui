import { apiClient } from './client';
import { KB_CRON_PRESETS, humanCron } from './integration-schedules';

export { KB_CRON_PRESETS as CRON_PRESETS, humanCron };

export interface KbSyncSchedule {
  id: number;
  syncType: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

/** Sync types and their display labels. CVE only allows 'cve_update' (delta). */
export const KB_SYNC_TYPES = {
  cve_update: 'CVE — Update only',
  cwe:        'CWE',
  capec:      'CAPEC',
  attack:     'ATT&CK',
  owasp:      'OWASP Top 10',
  cisa_kev:   'CISA KEV',
  vulncheck_kev: 'VulnCheck KEV',
} as const;

export const kbSchedulesApi = {
  list(syncType: string) {
    return apiClient.get<KbSyncSchedule[]>('/kb/schedules', { params: { type: syncType } }).then(r => r.data);
  },
  create(syncType: string, cronExpression: string) {
    return apiClient.post<KbSyncSchedule>('/kb/schedules', { syncType, cronExpression }).then(r => r.data);
  },
  setEnabled(id: number, enabled: boolean) {
    return apiClient.patch<KbSyncSchedule>(`/kb/schedules/${id}/enabled`, { enabled }).then(r => r.data);
  },
  delete(id: number) {
    return apiClient.delete(`/kb/schedules/${id}`);
  },
};
