import { apiClient as api } from './client';
import discordIcon  from '@/assets/icons/discord.svg';
import slackIcon    from '@/assets/icons/slack.svg';
import teamsIcon    from '@/assets/icons/teams.svg';
import telegramIcon from '@/assets/icons/telegram.svg';
import webhookIcon  from '@/assets/icons/webhook.svg';
import matrixIcon   from '@/assets/icons/matrix.svg';
import emailIcon    from '@/assets/icons/email.svg';

export type MessagingKind = 'discord' | 'slack' | 'telegram' | 'teams' | 'webhook' | 'matrix' | 'email';

// Platform catalog for the "New integration" picker (IntegrationPickerDialog) — same
// shape/convention as VDP_PLATFORM_TYPES / INTEGRATION_TYPES elsewhere.
export const MESSAGING_PLATFORM_TYPES = [
  { id: 'discord',  label: 'Discord',         color: '#5865F2', disabled: false, logo: discordIcon },
  { id: 'slack',    label: 'Slack',           color: '#4A154B', disabled: false, logo: slackIcon },
  { id: 'teams',    label: 'Microsoft Teams', color: '#6264A7', disabled: false, logo: teamsIcon },
  { id: 'telegram', label: 'Telegram',        color: '#26A5E4', disabled: false, logo: telegramIcon },
  { id: 'webhook',  label: 'Generic Webhook', color: '#6b7280', disabled: false, logo: webhookIcon },
  { id: 'matrix',   label: 'Matrix',          color: '#0DBD8B', disabled: false, logo: matrixIcon },
  { id: 'email',    label: 'Email (SMTP)',    color: '#6b7280', disabled: false, logo: emailIcon },
] as const;

export function messagingPlatformLabel(kind: string): string {
  return MESSAGING_PLATFORM_TYPES.find((p) => p.id === kind)?.label ?? kind;
}

/** Non-secret slice of an email integration's stored config, returned only for kind === 'email'
 *  so the edit dialog can prefill real values instead of showing everything blank. Excludes
 *  password (write-only, like every other kind's secret fields). */
export interface EmailConfigPreview {
  host: string | null;
  port: number | null;
  username: string | null;
  fromAddress: string | null;
  useTls: boolean | null;
}

export interface MessagingIntegration {
  id: number;
  name: string;
  kind: MessagingKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  emailConfig?: EmailConfigPreview | null;
}

export interface CreateIntegrationRequest {
  name: string;
  kind: MessagingKind;
  /** Per-kind shape: discord/slack/teams = {webhookUrl}, telegram = {botToken,chatId},
   *  webhook = {url, headers?: Record<string, string>}. */
  config: Record<string, unknown>;
}

export interface UpdateIntegrationRequest {
  name?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface MessagingGrant {
  id: number;
  integrationId: number;
  organizationId: number;
  /** Null = org-wide grant. */
  projectId: number | null;
  active: boolean;
  createdAt: string;
}

export interface CreateGrantRequest {
  organizationId: number;
  /** Omit or pass null to grant the whole org. */
  projectId?: number | null;
}

export const messagingApi = {
  // ── Integrations (admin) ────────────────────────────────────────────
  list(): Promise<MessagingIntegration[]> {
    return api.get('/messaging-integrations').then(r => r.data);
  },
  get(id: number): Promise<MessagingIntegration> {
    return api.get(`/messaging-integrations/${id}`).then(r => r.data);
  },
  create(req: CreateIntegrationRequest): Promise<MessagingIntegration> {
    return api.post('/messaging-integrations', req).then(r => r.data);
  },
  update(id: number, req: UpdateIntegrationRequest): Promise<MessagingIntegration> {
    return api.patch(`/messaging-integrations/${id}`, req).then(r => r.data);
  },
  delete(id: number): Promise<void> {
    return api.delete(`/messaging-integrations/${id}`).then(() => {});
  },
  /** Sends a sample message through the integration so operators can verify config. */
  /** `to`/`cc`/`bcc` matter only for email-kind integrations — see MessagingIntegrationsView.vue's
   *  "Send test" flow, which prompts for a destination address before calling this for those
   *  (every other transport already knows its destination from its own config). */
  test(id: number, body?: { title?: string; body?: string; severity?: string; to?: string[]; cc?: string[]; bcc?: string[] }): Promise<void> {
    return api.post(`/messaging-integrations/${id}/test`, body ?? {}).then(() => {});
  },

  // ── Grants (admin) ───────────────────────────────────────────────────
  listGrants(integrationId: number): Promise<MessagingGrant[]> {
    return api.get(`/messaging-integrations/${integrationId}/grants`).then((r) => r.data);
  },
  createGrant(integrationId: number, req: CreateGrantRequest): Promise<MessagingGrant> {
    return api.post(`/messaging-integrations/${integrationId}/grants`, req).then((r) => r.data);
  },
  revokeGrant(integrationId: number, grantId: number): Promise<void> {
    return api.delete(`/messaging-integrations/${integrationId}/grants/${grantId}`).then(() => {});
  },
};
