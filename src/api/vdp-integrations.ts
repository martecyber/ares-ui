import { ref } from 'vue';
import { apiClient } from './client';
import { toolIconSrc } from '@/utils/tool-icons';
import type { ToolIntegration } from './tool-integrations';

/** One field of a platform's credential form — drives VdpIntegrationFormDialog.vue generically
 *  instead of the frontend hardcoding per-platform field layouts (e.g. HackerOne's extra
 *  username field). */
export interface CredentialField {
  key: string;
  label: string;
  /** 'text' or 'password' — anything else is treated as plain text. */
  inputType: string;
  placeholder: string | null;
  required: boolean;
}

/** A Bug Hunting sync platform, as reported live by whichever `ares-plugin-bughunting*` plugins
 *  are currently installed+enabled — see {@link loadBugHuntingPlatforms}. Nothing in this file
 *  hardcodes which platforms exist; an uninstalled plugin's platform simply isn't in the list. */
export interface BugHuntingPlatform {
  id: string;
  label: string;
  /** True for a platform whose API is a personal researcher token — shown in the "Bug Hunting
   *  Platforms" credential picker. False for a company-facing platform (Bugcrowd, YesWeHack)
   *  whose credentials are set up under Data Sources instead, but which can still be picked as a
   *  project's Bug Hunting Program sync source. */
  researcherFacing: boolean;
  credentialFields: CredentialField[];
  credentialHelpText: string | null;
}

// Module-level reactive cache, same pattern as tool-icons.ts's dynamicIconSrc — populated once
// (fire-and-forget, safe to call from multiple components' onMounted) and shared by every
// consumer, so all of them re-render once the fetch resolves. Empty (not an error) if
// ares-plugin-bughunting isn't installed — that's the correct state: no platforms to offer.
const bugHuntingPlatforms = ref<BugHuntingPlatform[]>([]);
let loadPromise: Promise<void> | null = null;

export function loadBugHuntingPlatforms(): Promise<void> {
  if (!loadPromise) {
    loadPromise = apiClient.get<BugHuntingPlatform[]>('/bug-hunting/platforms')
      .then((r) => { bugHuntingPlatforms.value = r.data; })
      .catch(() => { /* plugin not installed, or not logged in yet — empty list */ });
  }
  return loadPromise;
}

/** Reactive list of every currently-available Bug Hunting platform — call {@link
 *  loadBugHuntingPlatforms} first (or just await it) to ensure it's populated. */
export function bugHuntingPlatformsRef() {
  return bugHuntingPlatforms;
}

export function vdpPlatformLabel(type: string): string {
  return bugHuntingPlatforms.value.find((p) => p.id === type)?.label ?? type;
}

/** Renders a platform's logo as HTML markup for use with v-html — an <img> tag pointed at
 *  whatever {@link toolIconSrc} resolves (the same dynamic/static icon cache every other tool in
 *  the app uses), or empty markup if no icon is known for this platform. */
export function vdpLogoMarkup(type: string): string {
  const src = toolIconSrc(type);
  return src ? `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;" />` : '';
}

export interface CreateVdpIntegrationRequest {
  name: string;
  type: string;
  /** api_token for all platforms; api_username additionally for HackerOne */
  credentials: Record<string, string>;
}

export interface UpdateVdpIntegrationRequest {
  name?: string;
  credentials?: Record<string, string>;
}

// VDP integrations share the same backend /integrations endpoint —
// they are distinguished by their `type` field (bugcrowd, yeswehack, etc.)
export const vdpIntegrationsApi = {
  async list() {
    await loadBugHuntingPlatforms();
    const researcherFacingIds = new Set(
      bugHuntingPlatforms.value.filter((p) => p.researcherFacing).map((p) => p.id)
    );
    const r = await apiClient.get<{ items: ToolIntegration[]; total: number; totalPages: number }>(
      '/integrations', { params: { size: 200 } });
    return {
      ...r.data,
      items: (r.data.items ?? []).filter((i) => researcherFacingIds.has(i.type)),
    };
  },

  create(body: CreateVdpIntegrationRequest) {
    return apiClient
      .post<ToolIntegration>('/integrations', {
        name: body.name,
        type: body.type,
        scope: 'PLATFORM',
        credentials: body.credentials,
      })
      .then((r) => r.data);
  },

  update(id: number, body: UpdateVdpIntegrationRequest) {
    return apiClient.patch<ToolIntegration>(`/integrations/${id}`, body).then((r) => r.data);
  },

  delete(id: number) {
    return apiClient.delete<void>(`/integrations/${id}`);
  },

  testConnection(id: number) {
    return apiClient.post<ToolIntegration>(`/integrations/${id}/test`).then((r) => r.data);
  },

  /** All platform-level integrations a project's Bug Hunting Program can link to — includes
   *  Bugcrowd/YesWeHack even though they're managed under Data Sources now. */
  async bugHuntingProgramPlatformIntegrations() {
    await loadBugHuntingPlatforms();
    const allIds = new Set(bugHuntingPlatforms.value.map((p) => p.id));
    const r = await apiClient.get<{ items: ToolIntegration[]; total: number; totalPages: number }>(
      '/integrations', { params: { size: 200 } });
    return {
      ...r.data,
      items: (r.data.items ?? []).filter((i) => allIds.has(i.type)),
    };
  },
};
