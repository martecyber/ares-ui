import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { BackendUnreachableError, checkBackendReachable } from '@/api/client';
import { ADMIN_ROUTES, KB_STAFF_ONLY_ROUTES } from '@/router/nav-groups';

// CLIENT_USER accounts get a reduced UI: no dashboard, no internal KB, no admin, and within
// their one organization only the Projects list, org-wide Findings and Assets overviews
// (across all their projects, always read-only), and (within a project) Findings, Assets,
// and Reports — plus Detections, but only for projects an MSSP operator has explicitly opted
// in (Project.clientsCanViewDetections). Everything else org/project-scoped is blocked here.
const CLIENT_ORG_BLOCKED_ROUTES = new Set(['org-detection-detail', 'org-workflows', 'org-workflow-editor']);
// org-project-detections/org-project-detection-detail are allowed here unconditionally —
// the backend enforces Project.clientsCanViewDetections per-project (403s otherwise), and
// the nav link itself is only shown when a project has opted in (see AppShell.vue).
const CLIENT_PROJECT_ALLOWED_ROUTES = new Set(['org-project-findings', 'org-project-finding-detail', 'org-project-assets', 'org-project-asset-detail', 'org-project-reports', 'org-project-detections', 'org-project-detection-detail']);

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    readonly?: boolean;
    adminOnly?: boolean;
    requiresOrgAccess?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  // Standalone, chrome-free "SOC big screen" player — deliberately NOT an AppShell child (like
  // login above), so there's zero nav to hide: only this view's own small overlay controls exist
  // at all. Still requires normal auth (no meta.public), just no sidebar/topbar.
  {
    path: '/presentations/:id/play',
    name: 'dashboard-presentation-play',
    component: () => import('@/views/DashboardPresentationPlayView.vue'),
  },
  {
    path: '/',
    component: () => import('@/layouts/AppShell.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'dashboard/presentations', name: 'dashboard-presentations', component: () => import('@/views/DashboardPresentationsView.vue') },

      // Profile settings
      { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue') },

      // License (linked from the sidebar footer's copyright line)
      { path: 'license', name: 'license', component: () => import('@/views/LicenseView.vue') },

      // CLI browser-login device flow ("ares configure")
      { path: 'cli-authorize', name: 'cli-authorize', component: () => import('@/views/CliAuthorizeView.vue') },

      // ── Administration (/admin/...) ──────────────────────────────
      { path: 'admin/organizations',     name: 'organizations',    component: () => import('@/views/ClientsView.vue') },
      { path: 'admin/organizations/new', name: 'organization-new', component: () => import('@/views/ClientFormView.vue'), meta: { adminOnly: true } },
      { path: 'admin/users',               name: 'users',               component: () => import('@/views/UsersView.vue'),               meta: { adminOnly: true } },
      { path: 'admin/roles',               name: 'roles',               component: () => import('@/views/RolesView.vue'),               meta: { adminOnly: true } },
      { path: 'admin/permissions',         name: 'permissions',         component: () => import('@/views/PermissionsView.vue'),         meta: { adminOnly: true } },
      { path: 'admin/project-types',    name: 'project-types',    component: () => import('@/views/ProjectTypesView.vue'),   meta: { adminOnly: true } },
      { path: 'admin/finding-field-types', name: 'finding-field-types', component: () => import('@/views/FindingFieldTypesAdminView.vue'), meta: { adminOnly: true } },
      { path: 'admin/report-field-types', name: 'report-field-types', component: () => import('@/views/ReportFieldTypesAdminView.vue'), meta: { adminOnly: true } },
      { path: 'admin/tool-integrations',  name: 'tool-integrations',  component: () => import('@/views/ToolIntegrationsView.vue'),    meta: { adminOnly: true } },
      { path: 'admin/vdp-integrations',  name: 'vdp-integrations',   component: () => import('@/views/VdpIntegrationsView.vue'),    meta: { adminOnly: true } },
      { path: 'admin/agents',             name: 'agents',             component: () => import('@/views/AgentsView.vue'),              meta: { adminOnly: true } },
      { path: 'admin/agents/installer',   name: 'agent-installer',    component: () => import('@/views/AgentInstallerView.vue'),      meta: { adminOnly: true } },
      { path: 'admin/agents/:id',         name: 'agent-detail',       component: () => import('@/views/AgentDetailView.vue'),         meta: { adminOnly: true } },
      { path: 'admin/agent-pools',        name: 'agent-pools',        component: () => import('@/views/AgentPoolsView.vue'),          meta: { adminOnly: true } },
      { path: 'admin/agent-pools/:id/timeline', name: 'agent-pool-timeline',
        component: () => import('@/views/AgentPoolTimelineView.vue'), meta: { adminOnly: true } },
      { path: 'admin/holiday-calendars',  name: 'holiday-calendars',  component: () => import('@/views/HolidayCalendarsView.vue'),    meta: { adminOnly: true } },
      { path: 'admin/messaging-integrations', name: 'messaging-integrations', component: () => import('@/views/MessagingIntegrationsView.vue'), meta: { adminOnly: true } },
      { path: 'admin/workflows',          name: 'workflows',          component: () => import('@/views/PlatformWorkflowsView.vue'), meta: { adminOnly: true } },
      { path: 'admin/workflows/:workflowId', name: 'workflow-editor', component: () => import('@/views/WorkflowEditorView.vue'),     meta: { adminOnly: true } },
      { path: 'admin/configuration',          name: 'admin-config',           component: () => import('@/views/AdminConfigView.vue'),            meta: { adminOnly: true } },
      { path: 'admin/third-party',            name: 'third-party-entries',    component: () => import('@/views/ThirdPartyEntriesView.vue'),      meta: { adminOnly: true } },

      // Admin hub pages — each groups several of the leaf routes above into tabs
      // (the leaf routes above stay as-is so existing router.push({name:...}) calls
      // and RouterLinks elsewhere keep working; the sidebar/dropdown only link to these).
      { path: 'admin/access',           name: 'admin-access',        component: () => import('@/views/admin/AdminAccessView.vue'),       meta: { adminOnly: true } },
      { path: 'admin/settings',         name: 'admin-settings',      component: () => import('@/views/admin/AdminSettingsView.vue'),     meta: { adminOnly: true } },
      { path: 'admin/integrations-hub', name: 'admin-integrations',  component: () => import('@/views/admin/AdminIntegrationsView.vue'), meta: { adminOnly: true } },
      { path: 'admin/agents-overview',  name: 'admin-agents',        component: () => import('@/views/admin/AdminAgentsView.vue'), meta: { adminOnly: true } },

      // ── Organization context (/organization/:id) ─────────────────
      { path: 'organization/:id', name: 'organization-detail', component: () => import('@/views/ClientDetailView.vue') },

      // Org-scoped lists
      { path: 'organization/:orgId/projects', name: 'org-projects', component: () => import('@/views/ProjectsView.vue') },
      { path: 'organization/:orgId/findings',    name: 'org-findings',    component: () => import('@/views/FindingsView.vue'), meta: { requiresOrgAccess: true } },
      { path: 'organization/:orgId/assets',      name: 'org-assets',      component: () => import('@/views/AssetsView.vue'),   meta: { requiresOrgAccess: true } },
      { path: 'organization/:orgId/workflows', name: 'org-workflows', component: () => import('@/views/OrgWorkflowsView.vue'), meta: { requiresOrgAccess: true } },
      { path: 'organization/:orgId/workflows/:workflowId', name: 'org-workflow-editor', component: () => import('@/views/WorkflowEditorView.vue'), meta: { requiresOrgAccess: true } },
      { path: 'organization/:orgId/settings', name: 'org-settings', component: () => import('@/views/OrgSettingsView.vue'), meta: { requiresOrgAccess: true } },

      // Org-scoped detail pages
      { path: 'organization/:orgId/findings/:id', name: 'org-finding-detail', component: () => import('@/views/FindingDetailView.vue'), meta: { readonly: true } },
      { path: 'organization/:orgId/assets/:id',   name: 'org-asset-detail',   component: () => import('@/views/AssetDetailView.vue') },
      { path: 'organization/:orgId/detections/:id', name: 'org-detection-detail', component: () => import('@/views/DetectionDetailView.vue') },

      // Project context — redirect bare :engId to dashboard
      {
        path: 'organization/:orgId/projects/:engId',
        redirect: (to) => ({ name: 'org-project-dashboard', params: to.params }),
      },

      // Project sub-pages (each has project sidebar)
      { path: 'organization/:orgId/projects/:engId/dashboard',   name: 'org-project-dashboard',   component: () => import('@/views/ProjectDashboardView.vue') },
      { path: 'organization/:orgId/projects/:engId/findings',    name: 'org-project-findings',    component: () => import('@/views/ProjectFindingsView.vue') },
      { path: 'organization/:orgId/projects/:engId/assets',      name: 'org-project-assets',      component: () => import('@/views/ProjectAssetsView.vue') },
      { path: 'organization/:orgId/projects/:engId/detections',  name: 'org-project-detections',  component: () => import('@/views/ProjectDetectionsView.vue') },
      { path: 'organization/:orgId/projects/:engId/research',    name: 'org-project-research',    component: () => import('@/views/ProjectResearchView.vue') },
      { path: 'organization/:orgId/projects/:engId/research/:boardId', name: 'org-project-research-board', component: () => import('@/views/ProjectResearchBoardView.vue') },
      { path: 'organization/:orgId/projects/:engId/scope',       name: 'org-project-scope',       component: () => import('@/views/ProjectScopeView.vue') },
      // Team moved into the Settings "Team" tab — kept as a redirect so old links/bookmarks still land somewhere.
      { path: 'organization/:orgId/projects/:engId/team',        redirect: (to) => ({ name: 'org-project-settings', params: to.params, query: { tab: 'team' } }) },
      { path: 'organization/:orgId/projects/:engId/imports',     name: 'org-project-imports',     component: () => import('@/views/ProjectImportsView.vue') },
      { path: 'organization/:orgId/projects/:engId/reports',        name: 'org-project-reports',        component: () => import('@/views/ProjectReportsView.vue') },
      { path: 'organization/:orgId/projects/:engId/testing-guides', name: 'org-project-testing-guides', component: () => import('@/views/ProjectTestingGuidesView.vue') },
      { path: 'organization/:orgId/projects/:engId/workflows',         name: 'org-project-workflows',        component: () => import('@/views/ProjectWorkflowsView.vue') },
      { path: 'organization/:orgId/projects/:engId/workflows/:workflowId', name: 'org-project-workflow-editor', component: () => import('@/views/WorkflowEditorView.vue') },
      { path: 'organization/:orgId/projects/:engId/program',           name: 'org-project-program',          component: () => import('@/views/ProjectBugHuntingProgramView.vue') },
      { path: 'organization/:orgId/projects/:engId/rules',             name: 'org-project-rules',            component: () => import('@/views/ProjectRulesView.vue') },
      { path: 'organization/:orgId/projects/:engId/settings',          name: 'org-project-settings',         component: () => import('@/views/ProjectSettingsView.vue') },
      { path: 'organization/:orgId/projects/:engId/findings/:id',    name: 'org-project-finding-detail',   component: () => import('@/views/FindingDetailView.vue') },
      { path: 'organization/:orgId/projects/:engId/assets/:id',      name: 'org-project-asset-detail',     component: () => import('@/views/AssetDetailView.vue') },
      { path: 'organization/:orgId/projects/:engId/detections/:id',  name: 'org-project-detection-detail', component: () => import('@/views/DetectionDetailView.vue') },

      // ── Knowledge Base (/kb/...) ─────────────────────────────────
      // Hub pages — each groups the leaf routes below into tabs (same pattern as the
      // Administration hubs above). The leaf routes stay as their own routes so detail
      // pages and cross-links (e.g. ReferencesBlock.vue) keep working; the dropdown/
      // sidebar only link to the hubs.
      { path: 'kb/external-databases', name: 'kb-external-databases', component: () => import('@/views/kb/KbExternalDatabasesView.vue') },
      { path: 'kb/templates',          name: 'kb-templates',          component: () => import('@/views/kb/KbTemplatesView.vue') },
      { path: 'kb/resources',          name: 'kb-resources',          component: () => import('@/views/kb/KbResourcesView.vue') },
      { path: 'kb/testing',            name: 'kb-testing',            component: () => import('@/views/kb/KbTestingView.vue') },
      { path: 'kb/other',              name: 'kb-other',              component: () => import('@/views/kb/KbOtherView.vue') },

      { path: 'kb/finding-templates',     name: 'kb-finding-templates',        component: () => import('@/views/kb/templates/KbFindingTemplatesView.vue') },
      { path: 'kb/finding-templates/:id', name: 'kb-finding-template-detail', component: () => import('@/views/kb/templates/KbFindingTemplateDetailView.vue') },
      { path: 'kb/email-templates',       name: 'kb-email-templates',          component: () => import('@/views/kb/templates/KbEmailTemplatesView.vue') },
      { path: 'kb/email-templates/:id',   name: 'kb-email-template-detail',    component: () => import('@/views/kb/templates/KbEmailTemplateDetailView.vue') },
      { path: 'kb/report-templates',      name: 'report-templates',            component: () => import('@/views/ReportTemplatesView.vue') },
      { path: 'kb/report-templates/help', name: 'report-templates-help',       component: () => import('@/views/ReportTemplateHelpView.vue') },
      { path: 'kb/dashboard-templates',      name: 'kb-dashboard-templates',        component: () => import('@/views/kb/templates/KbDashboardTemplatesView.vue') },
      { path: 'kb/dashboard-templates/:id',  name: 'kb-dashboard-template-detail',  component: () => import('@/views/kb/templates/KbDashboardTemplateDetailView.vue') },
      { path: 'kb/ssvc-methodologies',        name: 'kb-ssvc-methodologies',        component: () => import('@/views/kb/other/KbSsvcMethodologiesView.vue') },
      { path: 'kb/ssvc-methodologies/:id',    name: 'kb-ssvc-methodology-detail',   component: () => import('@/views/kb/other/KbSsvcMethodologyDetailView.vue') },
      { path: 'kb/task-templates',        name: 'kb-task-templates',           component: () => import('@/views/kb/templates/KbTaskTemplatesView.vue') },
      { path: 'kb/workflow-templates',    name: 'kb-workflow-templates',       component: () => import('@/views/kb/templates/KbWorkflowTemplatesView.vue') },
      { path: 'kb/workflow-templates/:templateId', name: 'kb-workflow-template-editor', component: () => import('@/views/WorkflowTemplateEditorView.vue') },
      { path: 'kb/wordlists',             name: 'kb-wordlists',                component: () => import('@/views/kb/resources/KbWordlistsView.vue') },
      { path: 'kb/testing-guides',        name: 'kb-testing-guides',           component: () => import('@/views/kb/testing/KbTestingGuidesView.vue') },
      { path: 'kb/testing-guides/:id',    name: 'kb-testing-guide-detail',     component: () => import('@/views/kb/testing/KbTestingGuideDetailView.vue') },
      { path: 'kb/testing-procedures',    name: 'kb-testing-procedures',       component: () => import('@/views/kb/testing/KbTestingProceduresView.vue') },
      { path: 'kb/testing-procedures/:id',name: 'kb-testing-procedure-detail', component: () => import('@/views/kb/testing/KbTestingProcedureDetailView.vue') },
      { path: 'kb/cve',               name: 'kb-cve',               component: () => import('@/views/kb/external-databases/KbCveView.vue') },
      { path: 'kb/cve/:id',           name: 'kb-cve-detail',        component: () => import('@/views/kb/external-databases/KbCveDetailView.vue') },
      { path: 'kb/cwe',               name: 'kb-cwe',               component: () => import('@/views/kb/external-databases/KbCweView.vue') },
      { path: 'kb/capec',             name: 'kb-capec',             component: () => import('@/views/kb/external-databases/KbCapecView.vue') },
      { path: 'kb/attack',            name: 'kb-attack',            component: () => import('@/views/kb/external-databases/KbAttackView.vue') },
      { path: 'kb/owasp',             name: 'kb-owasp',             component: () => import('@/views/kb/external-databases/KbOwaspView.vue') },
      { path: 'kb/exploits',          name: 'kb-exploits',          component: () => import('@/views/kb/resources/KbExploitsView.vue') },
      { path: 'kb/exploits/:id',      name: 'kb-exploit-detail',    component: () => import('@/views/kb/resources/KbExploitDetailView.vue') },
      { path: 'kb/cwe/:id',               name: 'kb-cwe-detail',              component: () => import('@/views/kb/external-databases/KbCweDetailView.vue') },
      { path: 'kb/capec/:id',             name: 'kb-capec-detail',            component: () => import('@/views/kb/external-databases/KbCapecDetailView.vue') },
      { path: 'kb/attack/techniques/:id', name: 'kb-attack-technique-detail', component: () => import('@/views/kb/external-databases/KbAttackTechniqueDetailView.vue') },
      { path: 'kb/owasp/:year/:owaspId',  name: 'kb-owasp-detail',            component: () => import('@/views/kb/external-databases/KbOwaspDetailView.vue') },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Set once the backend has answered any request successfully, so the reachability probe
// below only runs until it's confirmed — not on every single navigation.
let backendConfirmedReachable = false;

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!to.meta.public) {
    // Resolves expired-but-refreshable sessions before anything renders, and — critically —
    // clears a dead session immediately on first load instead of letting the authenticated
    // shell paint from stale localStorage until a later API call happens to 401.
    if (auth.accessToken && !auth.isAuthenticated) {
      try {
        await auth.ensureValidSession();
      } catch (err) {
        if (err instanceof BackendUnreachableError) {
          return { name: 'login', query: { next: to.fullPath, reason: 'network' } };
        }
        throw err;
      }
    }
    if (!auth.isAuthenticated) return { name: 'login', query: { next: to.fullPath } };

    // A locally-still-valid token means isAuthenticated is true above without ever having
    // made a network call — so on its own it can't tell a live backend apart from one
    // that's simply down. Probe once so we don't optimistically render the shell against
    // a dead API; keep re-probing on failure so the app recovers as soon as it's back up.
    if (!backendConfirmedReachable) {
      const reachable = await checkBackendReachable();
      if (!reachable) return { name: 'login', query: { next: to.fullPath, reason: 'network' } };
      backendConfirmedReachable = true;
    }
  }
  if (auth.isAuthenticated && auth.isClient) {
    await auth.loadClientOrgId();
    const clientOrgId = auth.clientOrgId;
    // A client account with no organization assigned (misconfigured, or its sole org was
    // later removed) has nothing to land on — log them out with a clear reason rather than
    // leaving them stuck on a 403'd page.
    if (!clientOrgId) {
      await auth.logout();
      return { name: 'login', query: { reason: 'no-org' } };
    }
    const clientHome = { name: 'organization-detail', params: { id: clientOrgId } };
    const name = String(to.name);

    if (to.meta.adminOnly || ADMIN_ROUTES.has(name) || name === 'dashboard' || name === 'dashboard-presentations' || name === 'dashboard-presentation-play' || KB_STAFF_ONLY_ROUTES.has(name) || CLIENT_ORG_BLOCKED_ROUTES.has(name)) {
      return clientHome;
    }
    const routeOrgId = Number(to.params.orgId ?? to.params.id);
    if (routeOrgId && clientOrgId && routeOrgId !== clientOrgId) {
      return clientHome;
    }
    if (name.startsWith('org-project-') && !CLIENT_PROJECT_ALLOWED_ROUTES.has(name)) {
      return { name: 'org-project-findings', params: to.params };
    }
    return;
  }
  if (to.meta.adminOnly && auth.isAuthenticated && !auth.isAdmin) {
    return { name: 'dashboard' };
  }
  // Org-level Findings/Assets require org-scoped role for operators
  if (to.meta.requiresOrgAccess && auth.isAuthenticated && !auth.isAdmin) {
    const orgId = Number(to.params.orgId);
    if (orgId) {
      try {
        const { organizationsApi } = await import('@/api/organizations');
        const res = await organizationsApi.myRole(orgId);
        if (!res.role) return { name: 'organization-detail', params: { id: orgId } };
      } catch {
        return { name: 'dashboard' };
      }
    }
  }
});

// A deploy replaces every hashed asset filename and removes the old ones. A tab left open
// across a deploy keeps running the *old* index bundle; the first time it lazy-loads a route
// it hasn't visited yet in that session, the browser requests the old build's now-404 chunk
// file and the dynamic import() rejects. vue-router surfaces that as a silent failed
// navigation — the app just sits there until the user manually reloads (the long-reported
// "a veces se cuelga, no carga los enlaces" symptom). Forcing a real navigation re-fetches the
// current index.html, which references the new build's correct chunk map, fixing it in place.
// sessionStorage-gated per target path so a genuinely broken deploy (chunk 404s even on a
// fresh load) fails once instead of reload-looping forever.
const CHUNK_LOAD_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
const CHUNK_RELOAD_KEY = 'ares:chunk-reload-path';

router.onError((error, to) => {
  if (!CHUNK_LOAD_ERROR.test(error.message)) return;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === to.fullPath) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, to.fullPath);
  window.location.href = to.fullPath;
});

// Vite's own modulepreload (eagerly preloaded chunks for links in view, not just a router
// navigation) fails the same way but never reaches router.onError — it's a window-level event.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === 'preload') return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, 'preload');
  window.location.reload();
});
