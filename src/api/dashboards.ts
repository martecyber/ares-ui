import { apiClient as api } from './client';

// Mirrors com.martecyber.ares.dashboards.DashboardLevel.
export type DashboardLevel = 'PLATFORM' | 'ORGANIZATION' | 'PROJECT';

// Mirrors com.martecyber.ares.dashboards.DashboardWidgetType.
export type DashboardWidgetType =
  | 'AQL_COUNT' | 'AQL_CHART' | 'AQL_LIST'
  | 'ORG_CAROUSEL' | 'SCHEDULE_CALENDAR' | 'CONTINUOUS_PROJECTS'
  | 'ACTIVE_PROJECTS_LIST' | 'ORG_INFO_STRIP'
  | 'PROJECT_IDENTITY_STRIP' | 'PROJECT_INFO_STRIP' | 'PROJECT_DATE_PROGRESS' | 'MONITOR_STATS'
  | 'PROJECT_RULES_LIST' | 'PROJECT_SCOPE_SUMMARY' | 'PROJECT_TEAM_LIST';

// Mirrors DashboardWidgetDataService's AQL_LIST dispatch — the same finding/asset/detection
// keys used by DASHBOARD_AQL_ENTITIES_BY_LEVEL for AQL_COUNT/AQL_CHART.
export type DashboardAqlEntity = 'finding' | 'asset' | 'detection';

export interface DashboardSummary {
  id: number;
  level: DashboardLevel;
  name: string;
  isDefault: boolean;
  /** Set on dashboard templates (KB-managed reusable layouts); always null/empty on a real
   *  scope's dashboard. */
  description: string | null;
}

export interface DashboardWidgetDto {
  id: number;
  /** Null when the stored type isn't a current DashboardWidgetType (a type renamed/removed after
   *  this row was seeded) — `typeName` still carries the raw stored string in that case, so it
   *  can render as an "unsupported widget" placeholder instead of vanishing from the grid. */
  type: DashboardWidgetType | null;
  typeName: string;
  title: string | null;
  config: Record<string, any>;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

export interface DashboardDto {
  id: number;
  level: DashboardLevel;
  scopeId: number | null;
  name: string;
  isDefault: boolean;
  isTemplate: boolean;
  description: string | null;
  /** Opt-in gate, set from this dashboard's own edit view — must be true before it can be added
   *  to a (staff-only) SOC-screen presentation's rotation. See DashboardPresentationsView. */
  presentable: boolean;
  widgets: DashboardWidgetDto[];
}

export interface WidgetInput {
  id?: number | null;
  type: DashboardWidgetType;
  title?: string | null;
  config: Record<string, any>;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

export interface AqlCountData { count: number }
// `series` is null when the widget has no seriesField configured — a single implicit series,
// same shape every pre-existing widget already receives.
export interface AqlChartBucket { label: string; series: string | null; count: number }
export interface AqlChartData { buckets: AqlChartBucket[] }
// Raw FindingDto/DetectionDto/Asset rows, straight off listByAql — shape depends on
// widget.config.entity, resolved by AqlListWidget.vue at render time.
export interface AqlListData { items: Record<string, any>[] }

/** One row in the "add a dashboard to this presentation" picker (GET /dashboards/browse) — spans
 *  every level, staff-only. `scopeLabel` is resolved server-side ("Platform" / org name /
 *  "<org> / <project>") so a presentation editor can show a readable cross-level list with no
 *  further lookups. */
export interface DashboardBrowseEntry {
  id: number;
  name: string;
  level: DashboardLevel;
  scopeId: number | null;
  scopeLabel: string;
  isDefault: boolean;
}

export const dashboardsApi = {
  list(level: DashboardLevel, scopeId?: number | null): Promise<DashboardSummary[]> {
    return api.get('/dashboards', { params: { level, scopeId: scopeId ?? undefined } }).then((r) => r.data);
  },
  get(id: number): Promise<DashboardDto> {
    return api.get(`/dashboards/${id}`).then((r) => r.data);
  },
  /** Fetches a single widget's server-computed data, independently of the rest of the dashboard —
   *  see DashboardHost.vue's per-widget loading. `_skipUnreachableRedirect` opts this call out of
   *  client.ts's global "backend unreachable → bounce to login" handling: a slow/heavy widget
   *  timing out is this call's own error to surface inline, not a session-ending event.
   *  `signal` lets the caller abort a still-in-flight request (e.g. the dashboard was swapped or
   *  rotated away before this one resolved) instead of letting it linger — a request queued
   *  behind an ever-growing backlog of never-cancelled ones is how a widget with real data to
   *  return can end up looking like it never finishes loading during a rotating presentation. */
  widgetData(dashboardId: number, widgetId: number, signal?: AbortSignal): Promise<AqlCountData | AqlChartData | AqlListData | null> {
    return api
      .get(`/dashboards/${dashboardId}/widgets/${widgetId}/data`, { signal, _skipUnreachableRedirect: true } as any)
      .then((r) => (r.status === 204 ? null : r.data));
  },
  create(level: DashboardLevel, scopeId: number | null, name: string): Promise<DashboardSummary> {
    return api.post('/dashboards', { level, scopeId, name }).then((r) => r.data);
  },
  setDefault(id: number): Promise<DashboardSummary> {
    return api.put(`/dashboards/${id}`, { isDefault: true }).then((r) => r.data);
  },
  remove(id: number): Promise<void> {
    return api.delete(`/dashboards/${id}`).then(() => {});
  },
  saveWidgets(id: number, widgets: WidgetInput[]): Promise<void> {
    return api.put(`/dashboards/${id}/widgets`, { widgets }).then(() => {});
  },
  browse(q?: string): Promise<DashboardBrowseEntry[]> {
    return api.get('/dashboards/browse', { params: { q: q || undefined } }).then((r) => r.data);
  },
  update(id: number, body: { name?: string; description?: string; presentable?: boolean }): Promise<DashboardSummary> {
    return api.put(`/dashboards/${id}`, body).then((r) => r.data);
  },

  // ── Templates — KB-managed, reusable widget layouts, one per level ─────────
  listTemplates(level: DashboardLevel): Promise<DashboardSummary[]> {
    return api.get('/dashboards/templates', { params: { level } }).then((r) => r.data);
  },
  createTemplate(body: { level: DashboardLevel; name: string; description?: string }): Promise<DashboardSummary> {
    return api.post('/dashboards/templates', body).then((r) => r.data);
  },
  /** Instantiates a real dashboard at `scopeId`, seeded from a template's current widgets. */
  createFromTemplate(templateId: number, body: { scopeId: number | null; name?: string }): Promise<DashboardSummary> {
    return api.post(`/dashboards/from-template/${templateId}`, body).then((r) => r.data);
  },
  /** Snapshots an existing dashboard's current widget layout into a brand-new template — the
   *  reverse of createFromTemplate. The source dashboard is untouched. If a template at that
   *  level already has this exact name, the backend rejects with 409 + `code: 'duplicate_name'`
   *  unless `overwrite` is set — see useSaveAsTemplate's confirm-and-retry flow. */
  saveAsTemplate(dashboardId: number, body: { name?: string; description?: string }, overwrite = false): Promise<DashboardSummary> {
    return api.post(`/dashboards/${dashboardId}/save-as-template`, body, { params: { overwrite } }).then((r) => r.data);
  },
};
