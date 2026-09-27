import type { DashboardLevel } from '@/api/dashboards';
import type { RouteLocationRaw } from 'vue-router';

/**
 * Where an AQL_COUNT/AQL_CHART widget's click should land — the entity's list view, scoped to the
 * dashboard's own context, with the widget's AQL applied via QueryBar's `initialAql` deep link.
 * Returns null when no such list view exists for that (entity, level) pair — finding/asset have
 * no platform-wide list view (every browsing surface in the app is org- or project-scoped), and
 * detection has no organization-wide one either (only project-scoped) — those combinations render
 * as a static, non-clickable widget instead of a dead link.
 */
export function dashboardEntityListRoute(
  entity: string,
  level: DashboardLevel,
  scopeId: number | null,
  orgId: number | null,
  aql: string,
): RouteLocationRaw | null {
  const query = { aql };
  if (level === 'ORGANIZATION' && scopeId != null) {
    if (entity === 'finding') return { name: 'org-findings', params: { orgId: scopeId }, query };
    if (entity === 'asset') return { name: 'org-assets', params: { orgId: scopeId }, query };
    return null;
  }
  if (level === 'PROJECT' && scopeId != null && orgId != null) {
    if (entity === 'finding') return { name: 'org-project-findings', params: { orgId, engId: scopeId }, query };
    if (entity === 'asset') return { name: 'org-project-assets', params: { orgId, engId: scopeId }, query };
    if (entity === 'detection') return { name: 'org-project-detections', params: { orgId, engId: scopeId }, query };
    return null;
  }
  return null;
}

/**
 * Where an AQL_LIST widget's row click should land — that specific record's detail view, mirroring
 * dashboardEntityListRoute's scoping rules but without the `aql` deep-link query (a single record
 * has nothing left to filter). Same null-for-unsupported-combination contract.
 */
export function dashboardEntityDetailRoute(
  entity: string,
  level: DashboardLevel,
  scopeId: number | null,
  orgId: number | null,
  recordId: number | string,
): RouteLocationRaw | null {
  if (level === 'ORGANIZATION' && scopeId != null) {
    if (entity === 'finding') return { name: 'org-finding-detail', params: { orgId: scopeId, id: recordId } };
    if (entity === 'asset') return { name: 'org-asset-detail', params: { orgId: scopeId, id: recordId } };
    return null;
  }
  if (level === 'PROJECT' && scopeId != null && orgId != null) {
    if (entity === 'finding') {
      return { name: 'org-project-finding-detail', params: { orgId, engId: scopeId, id: recordId } };
    }
    if (entity === 'asset') {
      return { name: 'org-project-asset-detail', params: { orgId, engId: scopeId, id: recordId } };
    }
    if (entity === 'detection') {
      return { name: 'org-project-detection-detail', params: { orgId, engId: scopeId, id: recordId } };
    }
    return null;
  }
  return null;
}
