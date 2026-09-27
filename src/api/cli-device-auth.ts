import { apiClient } from './client';

export interface CliDeviceInfo {
  userCode: string;
  clientInfo: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CONSUMED' | 'EXPIRED';
}

export const cliDeviceAuthApi = {
  info(code: string): Promise<CliDeviceInfo> {
    return apiClient.get('/cli/device/info', { params: { code } }).then(r => r.data);
  },
  approve(code: string): Promise<void> {
    return apiClient.post('/users/me/cli-device-auth/approve', { code }).then(r => r.data);
  },
  deny(code: string): Promise<void> {
    return apiClient.post('/users/me/cli-device-auth/deny', { code }).then(r => r.data);
  },
};
