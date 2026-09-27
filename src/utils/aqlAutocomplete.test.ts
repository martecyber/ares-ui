import { describe, it, expect } from 'vitest';
import { computeAqlSuggestions, applyAqlSuggestion } from './aqlAutocomplete';
import type { AqlFieldInfo } from '@/api/aql';

const fields: AqlFieldInfo[] = [
  { name: 'priority', type: 'PRIORITY', kind: 'PHYSICAL_COLUMN', operators: ['EQ','NEQ','GT','GTE','LT','LTE'], allowedValues: ['P0','P1','P2','P3','P4'] },
  { name: 'status', type: 'STRING', kind: 'PHYSICAL_COLUMN', operators: ['EQ','NEQ','CONTAINS'], allowedValues: ['new','solved'] },
  { name: 'title', type: 'STRING', kind: 'PHYSICAL_COLUMN', operators: ['EQ','NEQ','CONTAINS'], allowedValues: [] },
  { name: 'isDraft', type: 'BOOLEAN', kind: 'PHYSICAL_COLUMN', operators: ['EQ','NEQ'], allowedValues: [] },
  { name: 'createdAt', type: 'DATE', kind: 'PHYSICAL_COLUMN', operators: ['EQ','NEQ','GT','GTE','LT','LTE'], allowedValues: [] },
];

function labels(text: string, cursor: number) {
  return computeAqlSuggestions(text, cursor, fields).map(s => s.label);
}

describe('computeAqlSuggestions', () => {
  it('suggests fields at start', () => {
    expect(labels('pri', 3)).toContain('priority');
  });

  it('suggests operators right after a known field name with trailing space', () => {
    expect(labels('priority ', 9)).toEqual(expect.arrayContaining(['==', '!=', '>', '>=', '<', '<=']));
  });

  it('suggests operators mid-typing (no space) right after field name', () => {
    // "priority=" -> tokenizes as word("priority"), op("=") in progress
    expect(labels('priority=', 9)).toEqual(expect.arrayContaining(['==']));
  });

  it('suggests values after a completed operator with trailing space', () => {
    expect(labels('priority == ', 12)).toEqual(expect.arrayContaining(['P0','P1','P2','P3','P4']));
  });

  it('suggests values filtered by prefix, no space needed', () => {
    expect(labels('priority==P', 11)).toEqual(['P0','P1','P2','P3','P4']);
  });

  it('suggests boolean true/false for boolean fields', () => {
    expect(labels('isDraft == ', 11)).toEqual(expect.arrayContaining(['true', 'false']));
  });

  it('suggests relative "now" offsets for date fields', () => {
    expect(labels('createdAt >= ', 13)).toEqual(expect.arrayContaining(['now', 'now-7d', 'now+1d']));
  });

  it('filters date suggestions by prefix, no space needed', () => {
    expect(labels('createdAt>=now-', 15)).toEqual(expect.arrayContaining(['now-1h', 'now-1d', 'now-7d', 'now-30d']));
  });

  it('suggests AND/OR/field after a completed comparison', () => {
    const ls = labels('priority == P0 ', 15);
    expect(ls).toContain('AND');
    expect(ls).toContain('OR');
    expect(ls).toContain('status');
  });

  it('does not suggest AND/OR as the very first token', () => {
    const ls = labels('', 0);
    expect(ls).not.toContain('AND');
    expect(ls).not.toContain('OR');
    expect(ls).toContain('NOT');
  });

  it('handles NOT/minus prefixed field suggestion', () => {
    expect(labels('-stat', 5)).toContain('status');
  });

  it('resolves operators correctly after a dash-prefixed field', () => {
    expect(labels('-status ', 8)).toEqual(expect.arrayContaining(['==', '!=', '~=']));
  });

  it('bails out inside a quoted string', () => {
    expect(labels('title ~= "sql', 13)).toEqual([]);
  });

  it('bails out inside a list literal', () => {
    expect(labels('priority == [P0,', 16)).toEqual([]);
  });

  it('applyAqlSuggestion inserts field then positions cursor after the space', () => {
    const s = computeAqlSuggestions('pri', 3, fields).find(x => x.label === 'priority')!;
    const { text, cursor } = applyAqlSuggestion('pri', s);
    expect(text).toBe('priority ');
    expect(cursor).toBe(9);
  });

  it('applyAqlSuggestion for an operator then value works end-to-end', () => {
    let text = 'priority ';
    let cursor = text.length;
    let s = computeAqlSuggestions(text, cursor, fields).find(x => x.label === '==')!;
    ({ text, cursor } = applyAqlSuggestion(text, s));
    expect(text).toBe('priority == ');
    s = computeAqlSuggestions(text, cursor, fields).find(x => x.label === 'P0')!;
    ({ text, cursor } = applyAqlSuggestion(text, s));
    expect(text).toBe('priority == P0 ');
  });
});
