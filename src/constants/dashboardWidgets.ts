import type { DashboardLevel, DashboardWidgetType } from '@/api/dashboards';

/** Entities the dashboard AQL_COUNT/AQL_CHART widgets can query, per level — restricted to
 *  entities that both (a) DashboardWidgetDataService's server-side dispatch supports
 *  (com.martecyber.ares.dashboards.DashboardWidgetDataService) and (b) have a real list view to
 *  click through to at that level (see dashboardNavigation.ts's dashboardEntityListRoute) — e.g.
 *  there's no organization-wide Detections list, so "detection" is absent at ORGANIZATION level,
 *  and nothing here is scoped enough to query at all at PLATFORM level (see LEVEL_TYPES below,
 *  which drops AQL_COUNT/AQL_CHART from the platform catalog entirely rather than offer entities
 *  with nowhere to land). Mirrors DashboardService.saveWidgets' server-side validation of the
 *  same sets — defense in depth, this is what actually drives the entity picker's contents. */
export const DASHBOARD_AQL_ENTITIES_BY_LEVEL: Record<DashboardLevel, { value: string; label: string }[]> = {
  PLATFORM: [],
  ORGANIZATION: [
    { value: 'finding', label: 'Findings' },
    { value: 'asset', label: 'Assets' },
  ],
  PROJECT: [
    { value: 'finding', label: 'Findings' },
    { value: 'asset', label: 'Assets' },
    { value: 'detection', label: 'Detections' },
  ],
};

/** Sort keys an AQL_LIST widget can offer per entity — deliberately a curated subset, not the full
 *  AQL field list from aqlApi.fields(). Each entity's listByAql resolves sortBy through its own
 *  small hardcoded switch (FindingService.buildFindingSort / DetectionService.buildSort /
 *  AssetService.buildAssetSort) that silently falls back to createdAt for anything it doesn't
 *  recognize — so offering a field that switch doesn't have would look configured but silently do
 *  nothing. Keep this in sync by hand with those three switches. */
export const DASHBOARD_LIST_SORT_FIELDS_BY_ENTITY: Record<string, { value: string; label: string }[]> = {
  finding: [
    { value: 'createdAt', label: 'Created' },
    { value: 'reportedAt', label: 'Reported' },
    { value: 'updatedAt', label: 'Updated' },
    { value: 'dueDate', label: 'Due date' },
    { value: 'slaDeadline', label: 'SLA deadline' },
    { value: 'priority', label: 'Priority' },
    { value: 'title', label: 'Title' },
  ],
  asset: [
    { value: 'createdAt', label: 'Created' },
    { value: 'identifier', label: 'Identifier' },
    { value: 'type', label: 'Type' },
    { value: 'code', label: 'Code' },
  ],
  detection: [
    { value: 'createdAt', label: 'Created' },
    { value: 'lastSeen', label: 'Last seen' },
    { value: 'severity', label: 'Severity' },
    { value: 'status', label: 'Status' },
    { value: 'title', label: 'Title' },
    { value: 'source', label: 'Source' },
  ],
};

export interface WidgetCatalogEntry {
  type: DashboardWidgetType;
  label: string;
  /** Size for this widget type in grid cells. Every type declares a real minW/maxW/minH/maxH
   *  range — the bounds are chosen per widget from its own markup/CSS (card padding, table
   *  overflow behavior, text-wrap/ellipsis handling) so the whole range stays legible, not just
   *  the default. When a dimension is omitted, that dimension is fixed at its default
   *  (DashboardHost.vue's `layout` computed pins min=max=default for it). */
  defaultW: number;
  defaultH: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  /** True only for AQL_COUNT/AQL_CHART/AQL_LIST — every other type is a fixed, pre-configured
   *  widget with nothing for the operator to fill in beyond an optional title override.
   *  Configurable widgets can also be reconfigured after the fact (DashboardEditorAddWidgetDialog's
   *  edit mode), not just at add-time. */
  configurable: boolean;
}

const CATALOG: WidgetCatalogEntry[] = [
  // Stat card: label line + a big number, centered, in a padded .ares-stat-card. minH=2 is the
  // floor that content actually fits at (already the shipped default); minW=2 is tight for a long
  // title but the title is user-editable, so a short one always fits. maxW/maxH give headroom for
  // an operator who wants a more prominent tile without ballooning past "still just a stat card".
  { type: 'AQL_COUNT', label: 'Count (AQL)', defaultW: 3, defaultH: 2, minW: 2, maxW: 6, minH: 2, maxH: 4, configurable: true },
  // Canvas-based chart (chart.js) — needs enough room for axis/legend labels not to overlap at the
  // low end, and doesn't gain much readability past a fairly generous cap at the high end.
  { type: 'AQL_CHART', label: 'Chart (AQL)', defaultW: 4, defaultH: 3, minW: 3, maxW: 8, minH: 3, maxH: 8, configurable: true },
  // Replaces the old bespoke URGENT_FINDINGS_LIST/RECENT_FINDINGS_TABLE — a small AQL-filtered,
  // sortable row list over finding/asset/detection. Height is a plain row count (one row ~=
  // 1 grid unit of list content plus a fixed header); width is free too since AqlListWidget's
  // table columns just wrap/scroll rather than break.
  { type: 'AQL_LIST', label: 'List (AQL)', defaultW: 6, defaultH: 6, minW: 4, maxW: 12, minH: 4, maxH: 16, configurable: true },

  // Width-resizable (down to a compact 6 cols) so it can sit narrower alongside another widget;
  // height has a real range too as a self-service escape hatch if a browser/zoom combination
  // still doesn't quite fit the default — see the card-height math in the dashboards-remodel
  // follow-up. minH=9/defaultH=9 is sized for one row of cards + the search bar with margin.
  { type: 'ORG_CAROUSEL', label: 'Organizations', defaultW: 12, defaultH: 9, minW: 6, maxW: 12, minH: 7, maxH: 14, configurable: false },
  // minH=12 is the computed minimum for 5 full week-rows, each a fixed height regardless of
  // content (day number + one truncated projects line + one truncated OoO line; holidays show
  // inline next to the day number) — a 6th week (some months span one) scrolls internally
  // instead (see ScheduleCalendarWidget.vue's .schedule-body) rather than growing the widget.
  { type: 'SCHEDULE_CALENDAR', label: 'Schedule calendar', defaultW: 8, defaultH: 12, minW: 6, maxW: 12, minH: 12, maxH: 18, configurable: false },
  // Plain scrollable card list with ellipsis/line-clamp on its text — safe to resize freely in
  // both axes, the cards just get narrower/taller without breaking.
  { type: 'CONTINUOUS_PROJECTS', label: 'Continuous projects', defaultW: 4, defaultH: 12, minW: 3, maxW: 8, minH: 4, maxH: 24, configurable: false },

  // Table body scrolls internally (overflow:auto), so height can shrink well past the default;
  // width has room to grow for the Name column, or shrink some before Status/Start crowd it.
  { type: 'ACTIVE_PROJECTS_LIST', label: 'Active projects', defaultW: 6, defaultH: 5, minW: 4, maxW: 12, minH: 3, maxH: 10, configurable: false },
  // Logo + name + code identity card — a single flex row, wraps cleanly, legible down to a fairly
  // narrow width since the logo box has a fixed size and the text just reflows under it.
  { type: 'ORG_INFO_STRIP', label: 'Organization info', defaultW: 4, defaultH: 2, minW: 3, maxW: 8, minH: 2, maxH: 3, configurable: false },

  // Same identity-card shape as ORG_INFO_STRIP, plus type/start/end as a few extra fields.
  { type: 'PROJECT_IDENTITY_STRIP', label: 'Project identity', defaultW: 6, defaultH: 2, minW: 4, maxW: 12, minH: 2, maxH: 3, configurable: false },
  // A row of 4 .ares-info-card cells (CSS grid, repeat(4,1fr)) — each cell's label+value is short
  // enough to stay legible down to minW=6 (half-width, ~2 cols' worth per cell).
  { type: 'PROJECT_INFO_STRIP', label: 'Project info', defaultW: 12, defaultH: 2, minW: 6, maxW: 12, minH: 2, maxH: 3, configurable: false },
  // A single progress bar + label row — narrows/grows cleanly, nothing to break.
  { type: 'PROJECT_DATE_PROGRESS', label: 'Date progress', defaultW: 12, defaultH: 2, minW: 6, maxW: 12, minH: 2, maxH: 3, configurable: false },
  // Same stat-card shape as AQL_COUNT, same bounds reasoning.
  { type: 'MONITOR_STATS', label: 'Out of SLA (monitor)', defaultW: 2, defaultH: 2, minW: 2, maxW: 4, minH: 2, maxH: 4, configurable: false },
  // Table body scrolls internally — same reasoning as ACTIVE_PROJECTS_LIST, slightly narrower cap
  // since its 3 columns (Type/Summary/Active) are already compact at the default width.
  { type: 'PROJECT_RULES_LIST', label: 'Project rules', defaultW: 4, defaultH: 4, minW: 3, maxW: 8, minH: 3, maxH: 10, configurable: false },
  { type: 'PROJECT_SCOPE_SUMMARY', label: 'Scope summary', defaultW: 4, defaultH: 4, minW: 3, maxW: 8, minH: 3, maxH: 10, configurable: false },
  { type: 'PROJECT_TEAM_LIST', label: 'Team members', defaultW: 4, defaultH: 4, minW: 3, maxW: 8, minH: 3, maxH: 10, configurable: false },
];

const CATALOG_BY_TYPE = new Map(CATALOG.map((e) => [e.type, e]));

// Mirrors com.martecyber.ares.dashboards.DashboardWidgetType.allowedAt — kept in sync by hand
// (the backend enforces the same gate server-side as defense in depth, this is what actually
// drives the "Add widget" picker's contents). AQL_COUNT/AQL_CHART are absent from PLATFORM:
// there's no entity that's both queryable and has somewhere to click through to at that level
// (see DASHBOARD_AQL_ENTITIES_BY_LEVEL above).
const LEVEL_TYPES: Record<DashboardLevel, DashboardWidgetType[]> = {
  PLATFORM: ['ORG_CAROUSEL', 'SCHEDULE_CALENDAR', 'CONTINUOUS_PROJECTS'],
  ORGANIZATION: ['AQL_COUNT', 'AQL_CHART', 'AQL_LIST', 'ACTIVE_PROJECTS_LIST', 'ORG_INFO_STRIP'],
  PROJECT: ['AQL_COUNT', 'AQL_CHART', 'AQL_LIST', 'PROJECT_IDENTITY_STRIP', 'PROJECT_INFO_STRIP', 'PROJECT_DATE_PROGRESS', 'MONITOR_STATS', 'PROJECT_RULES_LIST', 'PROJECT_SCOPE_SUMMARY', 'PROJECT_TEAM_LIST'],
};

export function widgetCatalogFor(level: DashboardLevel): WidgetCatalogEntry[] {
  return LEVEL_TYPES[level].map((t) => CATALOG_BY_TYPE.get(t)!);
}

/** A stand-in for a widget whose type is null/unrecognized (a type renamed/removed after the
 *  widget row was seeded — see DashboardWidget.getType() server-side). Fixed-size, not
 *  configurable, not resizable — DashboardWidgetRenderer.vue renders it as an error placeholder
 *  the operator can remove, rather than the widget crashing or silently vanishing from the grid. */
const UNKNOWN_WIDGET_ENTRY: WidgetCatalogEntry = {
  type: 'AQL_COUNT', label: 'Unsupported widget', defaultW: 3, defaultH: 2, configurable: false,
};

export function widgetCatalogEntry(type: DashboardWidgetType | null | undefined): WidgetCatalogEntry {
  if (!type) return UNKNOWN_WIDGET_ENTRY;
  return CATALOG_BY_TYPE.get(type) ?? UNKNOWN_WIDGET_ENTRY;
}
