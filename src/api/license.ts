import { apiClient } from './client';

export interface LicenseInfo {
  spdxId: string;
  licenseName: string;
  licenseUrl: string;
  copyrightHolder: string;
  copyrightYear: number;
  sourceUrlCore: string;
  sourceUrlUi: string;
  sourceUrlAgent: string;
  sourceUrlCli: string;
}

export const licenseApi = {
  info() {
    return apiClient.get<LicenseInfo>('/license').then((r) => r.data);
  },
  /** Full AGPL-3.0 text, verbatim — served by ares-core so the UI never carries its own copy. */
  text() {
    return apiClient.get<string>('/license/text', { responseType: 'text' }).then((r) => r.data);
  },
};
