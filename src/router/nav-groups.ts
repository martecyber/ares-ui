// Route-name groupings shared between AppShell.vue's sidebar/topbar rendering and the
// router guard — the guard needs KB_STAFF_ONLY_ROUTES too, to keep CLIENT_USER accounts
// out of the internal Knowledge Base (they're only allowed into its External Databases hub).
export const ADMIN_ROUTES = new Set(['admin-access', 'admin-settings', 'admin-integrations', 'admin-agents', 'organizations', 'organization-new', 'users', 'project-types', 'roles', 'permissions', 'finding-field-types', 'report-field-types', 'tool-integrations', 'vdp-integrations', 'messaging-integrations', 'agents', 'agent-pools', 'agent-pool-timeline', 'agent-installer', 'holiday-calendars', 'workflows', 'workflow-editor', 'admin-config', 'third-party-entries']);

// Every Knowledge Base route (hubs + leaves), including its External Databases hub — used
// for sidebarMode/kbActive highlighting. See KB_STAFF_ONLY_ROUTES below for the subset the
// router guard actually blocks CLIENT_USER accounts from.
export const KB_ROUTES = new Set(['kb-external-databases', 'kb-templates', 'kb-resources', 'kb-testing', 'kb-other', 'kb-finding-templates', 'kb-finding-template-detail', 'kb-ssvc-methodologies', 'kb-ssvc-methodology-detail', 'kb-task-templates', 'kb-workflow-templates', 'kb-workflow-template-editor', 'report-templates', 'report-templates-help', 'kb-wordlists', 'kb-testing-guides', 'kb-testing-guide-detail', 'kb-testing-procedures', 'kb-testing-procedure-detail', 'kb-exploits', 'kb-exploit-detail', 'kb-cve', 'kb-cve-detail', 'kb-cwe', 'kb-cwe-detail', 'kb-capec', 'kb-capec-detail', 'kb-attack', 'kb-attack-technique-detail', 'kb-owasp', 'kb-owasp-detail']);

// The KB routes that stay internal-only — CLIENT_USER accounts are redirected home if they
// try to reach any of these (see router/index.ts's beforeEach guard). Everything in
// KB_ROUTES but not here (the External Databases hub and its CVE/CWE/CAPEC/ATT&CK/OWASP
// children) stays reachable by clients, same as before this area became a KB submenu.
export const KB_STAFF_ONLY_ROUTES = new Set(['kb-templates', 'kb-resources', 'kb-testing', 'kb-other', 'kb-finding-templates', 'kb-finding-template-detail', 'kb-ssvc-methodologies', 'kb-ssvc-methodology-detail', 'kb-task-templates', 'kb-workflow-templates', 'kb-workflow-template-editor', 'report-templates', 'report-templates-help', 'kb-wordlists', 'kb-testing-guides', 'kb-testing-guide-detail', 'kb-testing-procedures', 'kb-testing-procedure-detail', 'kb-exploits', 'kb-exploit-detail']);
