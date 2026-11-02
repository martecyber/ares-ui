import { describe, expect, it } from 'vitest';
import { aqlAnd, aqlDateRange, aqlEquals, aqlString } from './aqlClause';

describe('aqlClause', () => {
  it('quotes with double quotes and escapes', () => {
    expect(aqlString('a "b" \\ c')).toBe('"a \\"b\\" \\\\ c"');
    expect(aqlString("it's")).toBe('"it\'s"');
  });

  it('maps the (none) bucket to a null check', () => {
    expect(aqlEquals('status', 'open')).toBe('status == "open"');
    expect(aqlEquals('status', '(none)')).toBe('status == null');
  });

  it('builds an ISO date range', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-02-01T00:00:00Z');
    expect(aqlDateRange('createdAt', start, end))
      .toBe('createdAt >= "2026-01-01T00:00:00.000Z" AND createdAt < "2026-02-01T00:00:00.000Z"');
  });

  it('parenthesizes only when combining', () => {
    expect(aqlAnd('', 'a == "1"')).toBe('a == "1"');
    expect(aqlAnd('x == 1 OR y == 2', 'a == "1"')).toBe('(x == 1 OR y == 2) AND (a == "1")');
    expect(aqlAnd(null, undefined)).toBe('');
  });
});
