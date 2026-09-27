import { apiClient } from './client';

export interface ApiToken {
  id: number;
  userId: number;
  name: string;
  scopes: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export const apiTokensApi = {
  list(): Promise<ApiToken[]> {
    return apiClient.get('/users/me/api-tokens').then(r => r.data);
  },
  create(body: { name: string; scopes?: string; expiresAt?: string | null }): Promise<{ token: string; metadata: ApiToken }> {
    return apiClient.post('/users/me/api-tokens', body).then(r => r.data);
  },
  revoke(tokenId: number): Promise<void> {
    return apiClient.delete(`/users/me/api-tokens/${tokenId}`).then(r => r.data);
  },
};
