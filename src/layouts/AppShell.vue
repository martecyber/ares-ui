<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';
import { useThemeStore } from '@/stores/theme';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { organizationsApi, type Organization } from '@/api/organizations';
import { projectsApi, isAssessment, type Project } from '@/api/projects';
import { profileApi } from '@/api/profile';
import { versionsApi, type Versions } from '@/api/versions';
import { loadDynamicIcons } from '@/utils/tool-icons';
import { ADMIN_ROUTES, KB_ROUTES } from '@/router/nav-groups';
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import InputText from 'primevue/inputtext';
import CliInstallDialog from '@/components/CliInstallDialog.vue';
import logoPurpleLight from '@/assets/logo/ares-wordmark-purple-light.svg';
import logoPurpleDark from '@/assets/logo/ares-wordmark-purple-dark.svg';

const auth = useAuthStore();
const context = useContextStore();
const themeStore = useThemeStore();
const { isMobile } = useBreakpoint();

// Same "Ares purple" the wordmark text used to render in via --ares-accent: the light
// (lavender) mark on the dark theme's surface, the dark (deep purple) mark on light's.
const navbarLogo = computed(() => themeStore.theme === 'light' ? logoPurpleDark : logoPurpleLight);

const router = useRouter();
const route = useRoute();

// Mobile drawer state. Hamburger toggles; navigation auto-closes the drawer so
// tapping a link feels like a normal page transition. We also force it shut when
// the viewport grows past the mobile breakpoint (e.g. user rotates a tablet).
const mobileNavOpen = ref(false);
function toggleMobileNav() { mobileNavOpen.value = !mobileNavOpen.value; }
function closeMobileNav() { mobileNavOpen.value = false; }
watch(() => route.fullPath, closeMobileNav);
watch(isMobile, (v) => { if (!v) closeMobileNav(); });
const showCliInstall = ref(false);

// ── Menus ──────────────────────────────────────────────────────────
const userMenu    = ref();
const dashboardMenu = ref();
const kbMenu      = ref();
const adminMenu   = ref();
const orgPanel    = ref();

const userInitials = computed(() => {
  const n = auth.user?.displayName ?? auth.user?.email ?? '?';
  return n.split(/\s+/).map((w: string) => w[0]?.toUpperCase()).slice(0, 2).join('');
});

const versions = ref<Versions | null>(null);

const userMenuItems = computed(() => [
  {
    label: auth.user?.email ?? '',
    items: [
      {
        label: 'Profile Settings',
        command: () => router.push({ name: 'profile' }),
      },
      // CLI install is an MSSP operator/admin concern — client accounts have no use for it.
      ...(!auth.isClient ? [{
        label: 'CLI Install',
        command: () => { showCliInstall.value = true; },
      }] : []),
      { separator: true },
      {
        label: 'Sign out',
        command: async () => {
          context.clear();
          await auth.logout();
          router.replace('/login');
        },
      },
    ],
  },
]);

// "My Dashboard" is reachable by everyone who gets here at all (staff, effectively — CLIENT_USER
// is redirected away from both route names by the router guard); "Presentations" is the same
// staff-only SOC-screen rotation feature.
const dashboardMenuItems = computed(() => [
  { label: 'My Dashboard', command: () => router.push({ name: 'dashboard' }) },
  { label: 'Presentations', command: () => router.push({ name: 'dashboard-presentations' }) },
]);

// Each entry is a hub page with its own internal tabs (see views/kb/*), same pattern as
// Administration below. CLIENT_USER accounts only ever get External Databases — the rest
// of the Knowledge Base is internal-only (see KB_STAFF_ONLY_ROUTES in router/nav-groups.ts).
const kbMenuItems = computed(() => {
  const items = [
    { label: 'External Databases', command: () => router.push({ name: 'kb-external-databases' }) },
    !auth.isClient && { label: 'Templates', command: () => router.push({ name: 'kb-templates' }) },
    !auth.isClient && { label: 'Resources', command: () => router.push({ name: 'kb-resources' }) },
    !auth.isClient && { label: 'Testing',   command: () => router.push({ name: 'kb-testing' }) },
    !auth.isClient && { label: 'Other',     command: () => router.push({ name: 'kb-other' }) },
  ];
  return items.filter(Boolean) as { label: string; command: () => void }[];
});

// Each entry is now a single hub page with its own internal tabs (see views/admin/*),
// rather than a submenu of leaf items — keeps the dropdown/sidebar flat regardless of
// how many settings screens live inside a given area.
const adminMenuItems = computed(() => {
  const isAdmin = auth.isAdmin;
  const items = [
    isAdmin && { label: 'Access',        command: () => router.push({ name: 'admin-access' }) },
    isAdmin && { label: 'Configuration', command: () => router.push({ name: 'admin-settings' }) },
    isAdmin && { label: 'Integrations',  command: () => router.push({ name: 'admin-integrations' }) },
    { label: 'Agents', command: () => router.push({ name: 'admin-agents' }) },
    isAdmin && { label: 'Workflows', command: () => router.push({ name: 'workflows' }) },
  ];
  return items.filter(Boolean) as { label: string; command: () => void }[];
});

// ── Organization switcher ──────────────────────────────────────────
const allOrgs = ref<Organization[]>([]);
const orgSearch = ref('');

const filteredOrgs = computed(() => {
  const q = orgSearch.value.trim().toLowerCase();
  if (!q) return allOrgs.value;
  return allOrgs.value.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
});

function openOrgPanel(e: Event) {
  // Clients have exactly one org — the button is just a fixed way back to it, not a
  // picker — and it must work from anywhere (e.g. browsing the External Databases,
  // where there's otherwise no easy way back to the organization's views).
  if (auth.isClient) {
    if (auth.clientOrgId) router.push({ name: 'organization-detail', params: { id: auth.clientOrgId } });
    return;
  }
  orgSearch.value = '';
  orgPanel.value.toggle(e);
}

function selectOrg(org: Organization) {
  context.setOrg({ id: org.id, name: org.name, slug: org.slug, hasLogo: org.hasLogo });
  orgPanel.value.hide();

  // Smart redirect: stay in the same "section" but for the new org
  const current = String(route.name);
  if (PROJECT_ROUTES.has(current)) {
    router.push({ name: 'org-projects', params: { orgId: org.id } });
  } else if (['org-findings', 'org-finding-detail'].includes(current)) {
    router.push({ name: 'org-findings', params: { orgId: org.id } });
  } else if (['org-assets', 'org-asset-detail'].includes(current)) {
    router.push({ name: 'org-assets', params: { orgId: org.id } });
  } else if (current === 'org-projects') {
    router.push({ name: 'org-projects', params: { orgId: org.id } });
  } else {
    router.push({ name: 'organization-detail', params: { id: org.id } });
  }
}

// ── Project switcher ────────────────────────────────────────────
const engPanel = ref();
const allProjects = ref<Project[]>([]);
const engSearch = ref('');

const filteredProjects = computed(() => {
  const q = engSearch.value.trim().toLowerCase();
  if (!q) return allProjects.value;
  return allProjects.value.filter((e) => e.name.toLowerCase().includes(q));
});

const PROJECT_ROUTES = new Set([
  'org-project-dashboard','org-project-scope','org-project-rules',
  'org-project-assets','org-project-detections','org-project-research','org-project-research-board','org-project-findings',
  'org-project-imports','org-project-reports','org-project-testing-guides',
  'org-project-finding-detail','org-project-asset-detail','org-project-detection-detail',
  'org-project-workflows','org-project-workflow-editor','org-project-settings',
]);

// Project switcher is stable (always shown) but locked until there's an org to pick from —
// a project always belongs to one org, so there's nothing to switch between at platform level.
const hasOrgContext = computed(() => !!orgId.value);

function openEngPanel(e: Event) {
  if (!hasOrgContext.value) return;
  engSearch.value = '';
  engPanel.value.toggle(e);
}

function selectProject(eng: Project) {
  context.setProject({ id: eng.id, name: eng.name, code: eng.code, typeCode: eng.typeCode ?? null, supertypeCode: eng.supertypeCode ?? null, clientsCanViewDetections: eng.clientsCanViewDetections ?? false });
  engPanel.value.hide();

  const current = String(route.name);
  const oId = orgId.value;
  const eId = eng.id;
  const p = { orgId: oId, engId: eId };

  // Detail pages go to their parent list; other project pages stay in same section
  const detailToList: Record<string, string> = {
    'org-project-finding-detail':    'org-project-findings',
    'org-project-asset-detail':      'org-project-assets',
    'org-project-detection-detail':  'org-project-detections',
    'org-project-research-board':    'org-project-research',
  };
  const target = detailToList[current]
    ?? (PROJECT_ROUTES.has(current) ? current : 'org-project-dashboard');
  router.push({ name: target, params: p });
}

async function loadProjects(oId: number) {
  try {
    const res = await projectsApi.list({ organizationId: oId, size: 500 });
    allProjects.value = res.items;
  } catch { /* silent */ }
}

onMounted(async () => {
  try {
    const res = await organizationsApi.list({ size: 500, status: 'active', operatorView: auth.isOperator });
    allOrgs.value = res.items;
  } catch { /* silent */ }

  // Refresh profile to get up-to-date hasAvatar without requiring a profile page visit
  try {
    const profile = await profileApi.me();
    auth.updateUser({ hasAvatar: profile.hasAvatar, displayName: profile.displayName ?? '' });
  } catch { /* silent */ }

  try { versions.value = await versionsApi.get(); } catch { /* silent */ }

  loadDynamicIcons(); // fire-and-forget — plugin-provided source icons for SourceBadge etc.
});

// ── Layout context ─────────────────────────────────────────────────
type SidebarMode = 'none' | 'org' | 'project' | 'admin' | 'kb' | 'dashboard';

const ORG_ROUTES    = new Set(['organization-detail','org-projects','org-findings','org-finding-detail','org-assets','org-asset-detail','org-detection-detail','org-workflows','org-workflow-editor','org-settings']);
const DASHBOARD_ROUTES = new Set(['dashboard', 'dashboard-presentations']);

const sidebarMode = computed((): SidebarMode => {
  const name = String(route.name ?? '');
  if (PROJECT_ROUTES.has(name)) return 'project';
  if (ORG_ROUTES.has(name))        return 'org';
  if (ADMIN_ROUTES.has(name))      return 'admin';
  if (KB_ROUTES.has(name))         return 'kb';
  if (DASHBOARD_ROUTES.has(name))  return 'dashboard';
  return 'none';
});

const dashboardActive = computed(() => route.name === 'dashboard' || route.name === 'dashboard-presentations');
const kbActive     = computed(() => KB_ROUTES.has(String(route.name)));
const adminActive  = computed(() => ADMIN_ROUTES.has(String(route.name)));

// org-detail uses :id, sub-routes use :orgId, fallback to context store, then (for clients, who
// only ever have the one) their fixed org — so orgId reliably resolves even on non-org-scoped
// pages like Knowledge Base, letting the now-always-visible project switcher load their projects.
const orgId = computed(() => Number(route.params.orgId) || Number(route.params.id) || context.org?.id || (auth.isClient ? auth.clientOrgId ?? undefined : undefined));

// engId from route params for project sub-routes
const engId = computed(() => Number(route.params.engId) || context.project?.id);

const engNavItems = computed(() => {
  const oId = orgId.value;
  const eId = engId.value;
  if (!oId || !eId) return [];
  const p = { orgId: oId, engId: eId };
  const isAssess = isAssessment(context.project?.typeCode, context.project?.supertypeCode);
  if (auth.isClient) {
    return [
      { name: 'org-project-findings', params: p, label: 'Findings' },
      { name: 'org-project-assets',   params: p, label: 'Assets'   },
      // Detections stay hidden unless the project's MSSP team explicitly opted the
      // project in (Project.clientsCanViewDetections, set from ProjectSettingsView).
      ...(context.project?.clientsCanViewDetections
        ? [{ name: 'org-project-detections', params: p, label: 'Detections' }] : []),
      { name: 'org-project-reports',  params: p, label: 'Reports'  },
    ];
  }
  const items = [
    { name: 'org-project-dashboard',  params: p, label: 'Dashboard'  },
    { name: 'org-project-scope',      params: p, label: 'Scope'      },
    { name: 'org-project-rules',      params: p, label: 'Rules'      },
    { name: 'org-project-assets',     params: p, label: 'Assets'     },
    { name: 'org-project-detections', params: p, label: 'Detections' },
    { name: 'org-project-research',   params: p, label: 'Research'   },
    { name: 'org-project-findings',   params: p, label: 'Findings'   },
    ...(isAssess ? [{ name: 'org-project-testing-guides', params: p, label: 'Testing Guides' }] : []),
    { name: 'org-project-imports',    params: p, label: 'Imports'    },
    { name: 'org-project-reports',    params: p, label: 'Reports'    },
    { name: 'org-project-workflows',  params: p, label: 'Workflows'  },
    // Settings is visible to every project member, mirroring Organization Settings — its
    // General tab (project update/delete, MSSP_ADMIN-only server-side) and Team tab (viewable
    // by anyone, assign/change/add admin-gated) are shown/hidden internally by
    // ProjectSettingsView based on auth.isAdmin, same pattern as OrgSettingsView's own tabs.
    { name: 'org-project-settings',   params: p, label: 'Settings'   },
  ];
  return items;
});

// Operator org-level access: track the user's role in the current org
// MSSP_ADMINs always have full access; operators need an org-scoped role.
const currentOrgRole = ref<string | null>(null);

async function loadOrgRole(id: number) {
  if (auth.isAdmin) { currentOrgRole.value = 'MSSP_ADMIN'; return; }
  try {
    const res = await organizationsApi.myRole(id);
    currentOrgRole.value = res.role || null;
  } catch {
    currentOrgRole.value = null;
  }
}

/** Operators can see org-level Findings/Assets only if admin or have an org role. */
const hasOrgAccess = computed(() => auth.isAdmin || !!currentOrgRole.value);

watch(orgId, (id) => {
  if (id) { loadProjects(id); loadOrgRole(id); }
}, { immediate: true });

// Restore org context from route params after page refresh or direct URL navigation
watch([orgId, allOrgs], ([id, orgs]) => {
  if (!id || !orgs.length) return;
  if (context.org?.id === id) return;
  const found = (orgs as Organization[]).find(o => o.id === id);
  if (found) context.restoreOrg({ id: found.id, name: found.name, slug: found.slug, hasLogo: found.hasLogo });
}, { immediate: true });

// Restore project context from route params after page refresh or direct URL navigation
watch([engId, allProjects], ([id, projects]) => {
  if (!id || !projects.length) return;
  if (context.project?.id === id) return;
  const found = (projects as Project[]).find(p => p.id === id);
  if (found) context.setProject({ id: found.id, name: found.name, code: found.code, typeCode: found.typeCode ?? null, supertypeCode: found.supertypeCode ?? null, clientsCanViewDetections: found.clientsCanViewDetections ?? false });
}, { immediate: true });

const orgNavItems = computed(() => {
  const id = orgId.value;
  if (!id) return [];
  const items = [
    { name: 'organization-detail', params: { id },        label: 'Dashboard' },
    { name: 'org-projects',        params: { orgId: id }, label: 'Projects'  },
  ];
  // Findings/Assets at org level require admin or org-level role. CLIENT_USER accounts get
  // the org-wide Findings and Assets overviews (read-only, across all their projects).
  if (hasOrgAccess.value) {
    items.push({ name: 'org-findings', params: { orgId: id }, label: 'Findings' });
    items.push({ name: 'org-assets',   params: { orgId: id }, label: 'Assets'   });
    if (!auth.isClient) {
      items.push({ name: 'org-workflows', params: { orgId: id }, label: 'Workflows' });
    }
  }
  // Org update (OrgSettingsView) is MSSP_ADMIN/CLIENT_ADMIN server-side — not
  // MSSP_OPERATOR and not plain CLIENT_USER, same access the old EditOrgModal's save had.
  if (auth.isAdmin || auth.isClientAdmin) {
    items.push({ name: 'org-settings', params: { orgId: id }, label: 'Settings' });
  }
  return items;
});

// Flat list of admin hub pages for the sidebar — each hub has its own internal tabs
// (see views/admin/*) instead of nesting further sub-items here.
const adminNavItems = computed(() => {
  if (auth.isClient) return [];
  const isAdmin = auth.isAdmin;
  const items = [
    isAdmin && { to: { name: 'admin-access' },       label: 'Access' },
    isAdmin && { to: { name: 'admin-settings' },     label: 'Configuration' },
    isAdmin && { to: { name: 'admin-integrations' }, label: 'Integrations' },
    { to: { name: 'admin-agents' }, label: 'Agents' },
    isAdmin && { to: { name: 'workflows' }, label: 'Workflows' },
  ];
  return items.filter(Boolean) as { to: object; label: string }[];
});

// Mirrors dashboardMenuItems above — now also drives the left sidebar shown on /dashboard and
// /dashboard/presentations (see sidebarMode === 'dashboard' below), same pattern as KB/Admin.
const dashboardNavItems = computed(() => [
  { to: { name: 'dashboard' }, label: 'My Dashboard' },
  { to: { name: 'dashboard-presentations' }, label: 'Presentations' },
]);

// Flat list of KB hub pages for the sidebar — mirrors kbMenuItems above (each hub has its
// own internal tabs, see views/kb/*). CLIENT_USER accounts only get External Databases.
const kbNavItems = computed(() => {
  const items = [
    { to: { name: 'kb-external-databases' }, label: 'External Databases' },
    !auth.isClient && { to: { name: 'kb-templates' }, label: 'Templates' },
    !auth.isClient && { to: { name: 'kb-resources' }, label: 'Resources' },
    !auth.isClient && { to: { name: 'kb-testing' },   label: 'Testing' },
    !auth.isClient && { to: { name: 'kb-other' },     label: 'Other' },
  ];
  return items.filter(Boolean) as { to: object; label: string }[];
});

// ── Mobile drawer: two-column master/detail ───────────────────────
// Left rail = top-level sections (Dashboard, KB, Databases, Admin, plus the
// active Org/Project context). Selecting a rail entry surfaces its children
// in the right panel. Dashboard is a leaf so it navigates directly.
type MobileSection =
  { key: string; label: string; icon: string; kind: 'flat'; links: { to: object; label: string }[] };

const mobileSections = computed<MobileSection[]>(() => {
  const list: MobileSection[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: 'pi pi-th-large',
      kind: 'flat',
      links: dashboardNavItems.value,
    },
  ];
  list.push({
    key: 'kb',
    label: 'Knowledge Base',
    icon: 'pi pi-book',
    kind: 'flat',
    links: kbNavItems.value,
  });
  if (adminNavItems.value.length) {
    list.push({
      key: 'admin',
      label: 'Admin',
      icon: 'pi pi-cog',
      kind: 'flat',
      links: adminNavItems.value,
    });
  }
  if (orgNavItems.value.length) {
    list.push({
      key: 'org',
      label: context.org?.name || 'Org',
      icon: 'pi pi-building',
      kind: 'flat',
      links: orgNavItems.value.map(i => ({ to: { name: i.name, params: i.params }, label: i.label })),
    });
  }
  if (engNavItems.value.length) {
    list.push({
      key: 'project',
      label: context.project?.code || context.project?.name || 'Project',
      icon: 'pi pi-folder-open',
      kind: 'flat',
      links: engNavItems.value.map(i => ({ to: { name: i.name, params: i.params }, label: i.label })),
    });
  }
  return list;
});

const activeMobilePanel = ref<string>('kb');

const activeMobileSection = computed(() =>
  mobileSections.value.find(s => s.key === activeMobilePanel.value) ?? mobileSections.value[0],
);

function selectMobilePanel(section: MobileSection) {
  activeMobilePanel.value = section.key;
}

// Default the active rail entry to whatever matches the current route when the
// drawer opens (project context if on a project page, etc.).
watch(mobileNavOpen, (open) => {
  if (!open) return;
  const mode = sidebarMode.value;
  if (mode === 'project') activeMobilePanel.value = 'project';
  else if (mode === 'org') activeMobilePanel.value = 'org';
  else if (mode === 'admin') activeMobilePanel.value = 'admin';
  else if (mode === 'kb') activeMobilePanel.value = 'kb';
  else activeMobilePanel.value = 'kb';
});
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh; overflow:hidden;">

    <!-- ── Topbar ───────────────────────────────────────────────── -->
    <nav class="ares-navbar">

      <!-- Brand + global nav (left) -->
      <div class="ares-navbar-left">
        <!-- Hamburger — only on mobile. Toggles the slide-over sidebar drawer. -->
        <button
          class="ares-mobile-menu-btn"
          :aria-label="mobileNavOpen ? 'Close menu' : 'Open menu'"
          :aria-expanded="mobileNavOpen"
          @click="toggleMobileNav"
        >
          <i :class="mobileNavOpen ? 'pi pi-times' : 'pi pi-bars'" />
        </button>
        <span style="display:inline-flex; align-items:flex-start; gap:0.4rem;">
          <img :src="navbarLogo" alt="ARES" class="ares-navbar-brand" />
          <span class="ares-beta-badge">Beta</span>
        </span>

        <div class="ares-topnav">
          <button class="ares-topnav-link ares-topnav-dropdown" :class="{ 'ares-topnav-link--active': dashboardActive }" @click="dashboardMenu.toggle($event)">
            Dashboard
            <i class="pi pi-chevron-down ares-topnav-chevron" />
          </button>
          <Menu ref="dashboardMenu" :model="dashboardMenuItems" popup />

          <button class="ares-topnav-link ares-topnav-dropdown" :class="{ 'ares-topnav-link--active': kbActive }" @click="kbMenu.toggle($event)">
            Knowledge Base
            <i class="pi pi-chevron-down ares-topnav-chevron" />
          </button>
          <Menu ref="kbMenu" :model="kbMenuItems" popup />

          <template v-if="auth.isAdmin">
            <button class="ares-topnav-link ares-topnav-dropdown" :class="{ 'ares-topnav-link--active': adminActive }" @click="adminMenu.toggle($event)">
              Administration
              <i class="pi pi-chevron-down ares-topnav-chevron" />
            </button>
            <Menu ref="adminMenu" :model="adminMenuItems" popup />
          </template>
        </div>
      </div>

      <!-- Right side -->
      <div class="ares-navbar-end">

        <!-- Org switcher button — for clients, a fixed "back to my org" button (no picker,
             they only have one); for MSSP staff, opens the org picker. Stable/always shown
             (not gated to being inside an org/project context) so it works as a jump-to point
             from anywhere, e.g. the platform dashboard or Knowledge Base. -->
        <button class="ares-org-switcher-btn" @click="openOrgPanel($event)">
          <img
            v-if="auth.isClient ? auth.clientOrgHasLogo : context.org?.hasLogo"
            :src="organizationsApi.logoUrl((auth.isClient ? auth.clientOrgId : context.org?.id)!)"
            :alt="auth.isClient ? (auth.clientOrgName ?? '') : context.org!.name"
            style="width:18px; height:18px; border-radius: var(--ares-radius); object-fit:contain; flex-shrink:0;"
          />
          <span class="ares-org-switcher-label">
            {{ (auth.isClient ? auth.clientOrgName : context.org?.name) ?? 'Organization' }}
          </span>
          <i v-if="!auth.isClient" class="pi pi-chevron-down" style="font-size:0.6rem; opacity:0.65;" />
        </button>

        <!-- Org switcher popover -->
        <Popover ref="orgPanel">
          <div class="ares-org-popover">
            <div class="ares-org-popover-search">
              <InputText
                v-model="orgSearch"
                placeholder="Search organizations…"
                class="w-full"
                autofocus
              />
            </div>
            <div class="ares-org-popover-list">
              <button
                v-for="org in filteredOrgs"
                :key="org.id"
                class="ares-org-option"
                :class="{ 'ares-org-option--active': context.org?.id === org.id }"
                @click="selectOrg(org)"
              >
                <span style="display:flex; align-items:center; gap:0.5rem; width:100%;">
                  <img
                    v-if="org.hasLogo"
                    :src="organizationsApi.logoUrl(org.id)"
                    :alt="org.name"
                    style="width:22px; height:22px; border-radius: var(--ares-radius); object-fit:contain; flex-shrink:0; background:var(--p-surface-700);"
                  />
                  <span v-else style="width:22px; height:22px; border-radius: var(--ares-radius); background:var(--p-surface-700); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="pi pi-building" style="font-size:0.65rem; color:var(--ares-text-muted);" />
                  </span>
                  <span style="display:flex; flex-direction:column; min-width:0;">
                    <span class="ares-org-option-name">{{ org.name }}</span>
                    <span class="ares-org-option-slug">{{ org.slug }}</span>
                  </span>
                </span>
              </button>
              <div v-if="!filteredOrgs.length" class="ares-org-popover-empty">
                No organizations found.
              </div>
            </div>
          </div>
        </Popover>

        <!-- Project switcher button — stable (always shown), but locked (no org to pick a
             project from yet) until there's an org context, e.g. at the platform level. -->
        <button
          class="ares-project-switcher-btn"
          :class="{ 'ares-project-switcher-btn--locked': !hasOrgContext }"
          :disabled="!hasOrgContext"
          @click="openEngPanel($event)"
        >
          <span class="ares-project-switcher-label">
            {{ context.project ? (context.project.code ?? context.project.name) : 'Project' }}
          </span>
          <i v-if="hasOrgContext" class="pi pi-chevron-down" style="font-size:0.6rem; opacity:0.65;" />
        </button>
        <Popover ref="engPanel">
          <div class="ares-org-popover">
            <div class="ares-org-popover-search">
              <InputText v-model="engSearch" placeholder="Search projects…" class="w-full" autofocus />
            </div>
            <div class="ares-org-popover-list">
              <button
                v-for="eng in filteredProjects"
                :key="eng.id"
                class="ares-org-option"
                :class="{ 'ares-org-option--active': context.project?.id === eng.id }"
                @click="selectProject(eng)"
              >
                <span class="ares-org-option-name">{{ eng.name }}</span>
                <span class="ares-org-option-slug">{{ eng.code ?? eng.typeName }}</span>
              </button>
              <div v-if="!filteredProjects.length" class="ares-org-popover-empty">
                No projects found.
              </div>
            </div>
          </div>
        </Popover>

        <!-- Theme toggle -->
        <button
          class="ares-jobs-badge-btn"
          :title="themeStore.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="themeStore.toggle()"
        >
          <i :class="themeStore.theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" style="font-size:1rem;" />
        </button>

        <!-- User menu -->
        <button class="ares-user-btn" @click="(e) => userMenu.toggle(e)">
          <span class="ares-user-avatar">
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="avatar" style="width:100%; height:100%; object-fit:cover; border-radius: 50%;" />
            <template v-else>{{ userInitials }}</template>
          </span>
          <span style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            {{ auth.user?.displayName || auth.user?.email }}
          </span>
          <i class="pi pi-chevron-down" style="font-size:0.65rem; opacity:0.7;" />
        </button>
        <Menu ref="userMenu" :model="userMenuItems" popup />
      </div>
    </nav>

    <!-- ── Body ─────────────────────────────────────────────────── -->
    <div style="display:flex; flex:1; overflow:hidden; position:relative;">

      <!-- Mobile backdrop. Click-to-close behind the drawer. Only renders on
           mobile because the underlying media-query rules hide it on desktop. -->
      <div
        v-if="mobileNavOpen"
        class="ares-sidebar-backdrop"
        @click="closeMobileNav"
      />

      <!-- Sidebar.
           Desktop: only rendered when a sidebar mode is active (project / org / admin / kb).
           Mobile: always rendered as the slide-over drawer host. When sidebarMode === 'none'
           (dashboard, plain org detail) we still want a hamburger that surfaces the global
           topnav links + context switchers from inside the drawer. -->
      <aside
        v-if="sidebarMode !== 'none' || isMobile"
        class="ares-sidebar"
        :class="{ 'ares-sidebar--open': mobileNavOpen, 'ares-sidebar--mobile': isMobile }"
      >

        <!-- Mobile: two-column master/detail drawer. Left rail = section icons,
             right panel = selected section's submenu. -->
        <div v-if="isMobile" class="ares-mobile-drawer">
          <nav class="ares-mobile-rail">
            <button
              v-for="section in mobileSections"
              :key="section.key"
              class="ares-mobile-rail-btn"
              :class="{ 'ares-mobile-rail-btn--active': activeMobilePanel === section.key }"
              :title="section.label"
              @click="selectMobilePanel(section)"
            >
              <i :class="section.icon" />
              <span class="ares-mobile-rail-label">{{ section.label }}</span>
            </button>
          </nav>

          <div class="ares-mobile-panel">
            <template v-if="activeMobileSection?.key === 'project' && context.project">
              <div class="ares-mobile-panel-header" style="display:flex; align-items:center; gap:0.5rem; padding-right:0.85rem;">
                <RouterLink
                  :to="{ name: 'org-projects', params: { orgId } }"
                  class="ares-mobile-panel-back"
                  title="Back to projects"
                >
                  <i class="pi pi-arrow-left" />
                </RouterLink>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0;">
                  {{ context.project.name }}
                </span>
              </div>
              <div v-if="context.project.code" class="ares-mobile-panel-subtitle">
                {{ context.project.code }}
              </div>
            </template>
            <div v-else class="ares-mobile-panel-header">{{ activeMobileSection?.label }}</div>

            <nav v-if="activeMobileSection?.kind === 'flat'" class="ares-nav">
              <RouterLink
                v-for="link in activeMobileSection.links"
                :key="link.label"
                :to="link.to"
                class="ares-nav-link"
              >
                <span class="ares-nav-label">{{ link.label }}</span>
              </RouterLink>
            </nav>
          </div>
        </div>

        <template v-else-if="sidebarMode === 'dashboard'">
          <div class="ares-sidebar-section-label">Dashboard</div>
          <nav class="ares-nav">
            <RouterLink v-for="item in dashboardNavItems" :key="item.label" :to="item.to" class="ares-nav-link">
              <span class="ares-nav-label">{{ item.label }}</span>
            </RouterLink>
          </nav>
        </template>

        <template v-else-if="sidebarMode === 'project'">
          <div class="ares-sidebar-section-label" style="display:flex; align-items:center; gap:0.5rem; padding-right:0.5rem;">
            <RouterLink
              :to="{ name: 'org-projects', params: { orgId: orgId } }"
              style="display:flex; align-items:center; color:var(--ares-text-muted); flex-shrink:0;"
              title="Back to projects"
            >
              <i class="pi pi-arrow-left" style="font-size:0.75rem;" />
            </RouterLink>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              {{ context.project?.name ?? 'Project' }}
            </span>
          </div>
          <div v-if="context.project?.code" style="font-size:0.65rem; color:var(--ares-accent); padding:0 0.85rem 0.6rem; font-family:monospace; letter-spacing:0.03em;">
            {{ context.project.code }}
          </div>
          <nav class="ares-nav">
            <RouterLink v-for="item in engNavItems" :key="item.name" :to="{ name: item.name, params: item.params }" class="ares-nav-link">
              <span class="ares-nav-label">{{ item.label }}</span>
            </RouterLink>
          </nav>
        </template>

        <template v-else-if="sidebarMode === 'org'">
          <div class="ares-sidebar-section-label">Organization</div>
          <nav class="ares-nav">
            <RouterLink v-for="item in orgNavItems" :key="item.name" :to="{ name: item.name, params: item.params }" class="ares-nav-link">
              <span class="ares-nav-label">{{ item.label }}</span>
            </RouterLink>
          </nav>
        </template>

        <template v-else-if="sidebarMode === 'admin'">
          <div class="ares-sidebar-section-label">Administration</div>
          <nav class="ares-nav">
            <RouterLink v-for="item in adminNavItems" :key="item.label" :to="item.to" class="ares-nav-link">
              <span class="ares-nav-label">{{ item.label }}</span>
            </RouterLink>
          </nav>
        </template>

        <template v-else-if="sidebarMode === 'kb'">
          <div class="ares-sidebar-section-label">Knowledge Base</div>
          <nav class="ares-nav">
            <template v-for="item in kbNavItems" :key="item.label">
              <RouterLink v-if="item.to" :to="item.to" class="ares-nav-link">
                <span class="ares-nav-label">{{ item.label }}</span>
              </RouterLink>
              <span v-else class="ares-nav-link ares-nav-link--disabled">
                <span class="ares-nav-label">{{ item.label }}</span>
              </span>
            </template>
          </nav>
        </template>

        <div style="margin-top:auto; padding:0.75rem; border-top:1px solid var(--ares-border); font-size:0.68rem; color:var(--ares-text-muted); line-height:1.5;">
          <div>Ares ASM · <RouterLink :to="{ name: 'license' }" style="color:inherit;">© {{ new Date().getFullYear() }} Martín Romera</RouterLink></div>
          <div v-if="versions">api {{ versions.api }}</div>
          <div v-if="versions">ui {{ versions.ui }}</div>
        </div>
      </aside>

      <!-- Main content -->
      <main class="ares-page" style="padding:1.5rem;">
        <RouterView />
      </main>
    </div>

    <CliInstallDialog v-model:visible="showCliInstall" />
  </div>
</template>
