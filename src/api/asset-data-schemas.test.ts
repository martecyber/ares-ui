import { describe, it, expect } from 'vitest';
import { classifyTxtRecord, dataFieldsFor } from '@/api/asset-data-schemas';
import { assetLabel } from '@/composables/useAssetList';
describe('classifyTxtRecord', () => {
  it.each([
    ['v=spf1 include:_spf.google.com ~all', 'SPF'],
    ['"v=spf1 -all"', 'SPF'],
    ['v=DMARC1; p=reject; rua=mailto:d@example.com', 'DMARC'],
    ['v=DKIM1; k=rsa; p=MIGf', 'DKIM'],
    ['k=rsa; p=MIGfMA0', 'DKIM'],
    ['v=STSv1; id=2024', 'MTA-STS'],
    ['google-site-verification=abc123', 'Domain verification'],
    ['MS=ms12345678', 'Other'],
  ])('%s -> %s', (v, kind) => expect(classifyTxtRecord(v)).toBe(kind));
});

describe('display name field', () => {
  it.each(['ip', 'domain', 'network', 'web_application', 'android_app', 'text_data'])('%s gets a top-level Display name row first', (type) => {
    const keys = dataFieldsFor(type, {}).map((f) => f.key);
    expect(keys[0]).toBe('displayName');
    expect(keys).not.toContain('name');
  });

  it('host keeps its own pinnable Name and no Display name', () => {
    expect(dataFieldsFor('host', {}).map((f) => f.key)).not.toContain('displayName');
  });

  it('technology keeps its imported Product (metadata.name)', () => {
    expect(dataFieldsFor('technology', {}).map((f) => f.key)).toContain('name');
  });

  it('assetLabel prefers the display name', () => {
    expect(assetLabel({ identifier: '10.0.0.25', displayName: 'Mail server' })).toBe('Mail server');
    expect(assetLabel({ identifier: '10.0.0.25', displayName: '  ' })).toBe('10.0.0.25');
    expect(assetLabel({ identifier: '10.0.0.25' })).toBe('10.0.0.25');
  });
});
