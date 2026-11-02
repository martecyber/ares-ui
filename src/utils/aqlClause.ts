/** Helpers for building AQL text in the UI (e.g. a chart bar's click-through filter). AQL only
 *  understands double-quoted strings, with \" and \\ as the only escapes. */

/** Label AqlGroupCountSupport returns for a NULL group value. */
export const AQL_NONE_LABEL = '(none)';

export function aqlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `field == "value"`, or `field == null` for the backend's "(none)" bucket. */
export function aqlEquals(field: string, value: string): string {
  return value === AQL_NONE_LABEL ? `${field} == null` : `${field} == ${aqlString(value)}`;
}

/** `field >= start AND field < end` for a date bucket, both as ISO-8601 instants. */
export function aqlDateRange(field: string, start: Date, end: Date): string {
  return `${field} >= ${aqlString(start.toISOString())} AND ${field} < ${aqlString(end.toISOString())}`;
}

/** ANDs clauses together, parenthesizing each non-empty one so an OR inside a widget's own
 *  filter can't swallow the extra conditions. */
export function aqlAnd(...clauses: (string | null | undefined)[]): string {
  const parts = clauses.map((c) => c?.trim()).filter((c): c is string => !!c);
  if (parts.length <= 1) return parts[0] ?? '';
  return parts.map((c) => `(${c})`).join(' AND ');
}
