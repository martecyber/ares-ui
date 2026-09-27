import { apiClient } from './client';
import type { AqlVariableRef } from '@/utils/aqlAutocomplete';

/** Mirrors com.martecyber.ares.aql.dto.AqlFieldDto. `type` is `'STRING' | 'NUMBER' | 'BOOLEAN' |
 *  'DATE' | 'ENUM' | 'PRIORITY'` for an ordinary comparable field, or `list[string]` (a plain
 *  HAS-only array) / `list[<entity>]` (e.g. `list[cwe]` — a non-comparable nesting point, only
 *  queryable via its own `<field>.<leaf>` entries) for a list-shaped one — not a fixed union since
 *  the entity name inside `list[...]` is open-ended (whatever registries exist). */
export interface AqlFieldInfo {
  name: string;
  type: string;
  kind: string;
  operators: string[];
  allowedValues: string[];
}

export interface AqlValidateResult {
  valid: boolean;
}

// Field lists are effectively static for the lifetime of a session (the registry is fixed at
// app boot) — cache per entity so navigating between views with the same entity's QueryBar
// doesn't refetch every mount.
const fieldsCache = new Map<string, Promise<AqlFieldInfo[]>>();
let entitiesCache: Promise<string[]> | null = null;

export const aqlApi = {
  fields(entity: string): Promise<AqlFieldInfo[]> {
    let pending = fieldsCache.get(entity);
    if (!pending) {
      pending = apiClient.get<AqlFieldInfo[]>('/aql/fields', { params: { entity } })
        .then((r) => r.data)
        .catch((err) => { fieldsCache.delete(entity); throw err; });
      fieldsCache.set(entity, pending);
    }
    return pending;
  },
  /** Every AQL-registered entity name (excludes relation-only ones with no standalone `?aql=`
   *  surface, e.g. attackTactic/cveKevDetail — filtered server-side). Cached for the session,
   *  same rationale as fields(). */
  entities(): Promise<string[]> {
    if (!entitiesCache) {
      entitiesCache = apiClient.get<string[]>('/aql/entities')
        .then((r) => r.data)
        .catch((err) => { entitiesCache = null; throw err; });
    }
    return entitiesCache;
  },
  /** Parses+resolves q against entity's registry without executing it. Rejects (with the
   *  backend's problem-detail body on err.response.data.detail) on a syntax error or unknown field.
   *  projectId/organizationId are optional and only needed so a query using {{...}} context
   *  variables (see variables() below) validates correctly against real scope. */
  validate(entity: string, q: string, projectId?: number | null, organizationId?: number | null): Promise<AqlValidateResult> {
    return apiClient.get<AqlValidateResult>('/aql/validate', { params: { entity, q, projectId, organizationId } }).then((r) => r.data);
  },
  /** {{...}} context variables available for autocomplete — `now` always, iteration variables only
   *  for a project with an iteration cadence set, SLA-period variables only when some org scope is
   *  resolvable. Not cached (unlike fields()/entities()): which variables apply depends on scope,
   *  which changes across views/dialogs far more often than the field registry does. */
  variables(projectId?: number | null, organizationId?: number | null): Promise<AqlVariableRef[]> {
    return apiClient.get<AqlVariableRef[]>('/aql/variables', { params: { projectId, organizationId } })
      .then((r) => r.data)
      .catch(() => []);
  },
};
