import { describe, expect, it } from 'vitest';
import type { AssetLinkTypeDef } from '@/api/assets';
import { linkableTypes, linkOptionsBetween, linkOptionsFor } from './useAssetLinkTypes';

const defs: AssetLinkTypeDef[] = [
  { linkType: 'domain_subdomain', fromType: 'domain', toTypes: ['domain'], manual: false },
  { linkType: 'domain_email',     fromType: 'domain', toTypes: ['email'],  manual: true },
  { linkType: 'person_email',     fromType: 'person', toTypes: ['email'],  manual: true },
  { linkType: 'email_credential', fromType: 'email',  toTypes: ['credential'], manual: true },
];

describe('linkOptionsFor', () => {
  it('skips auto-computed links', () => {
    expect(linkOptionsFor(defs, 'domain').map((o) => o.linkType)).toEqual(['domain_email']);
  });

  it('includes both directions for a type', () => {
    const opts = linkOptionsFor(defs, 'email');
    expect(opts.map((o) => [o.direction, o.linkType, o.otherTypes])).toEqual([
      ['in',  'domain_email',     ['domain']],
      ['in',  'person_email',     ['person']],
      ['out', 'email_credential', ['credential']],
    ]);
    expect(new Set(opts.map((o) => o.key)).size).toBe(opts.length);
  });
});

describe('linkOptionsBetween', () => {
  it('keeps only options whose other side matches the target type', () => {
    expect(linkOptionsBetween(defs, 'email', 'person').map((o) => o.linkType)).toEqual(['person_email']);
    expect(linkOptionsBetween(defs, 'person', 'email')[0].direction).toBe('out');
    expect(linkOptionsBetween(defs, 'domain', 'credential')).toEqual([]);
  });
});

describe('linkableTypes', () => {
  it('collects counterpart types in either direction', () => {
    expect([...linkableTypes(defs, 'email')].sort()).toEqual(['credential', 'domain', 'person']);
    expect(linkableTypes(defs, 'directory').size).toBe(0);
  });
});
