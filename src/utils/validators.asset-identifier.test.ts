import { describe, expect, it } from 'vitest';
import { validateAssetIdentifier } from './validators';

describe('validateAssetIdentifier', () => {
  it.each([
    ['ip', '10.0.0.1'], ['ip', '2001:db8::1'],
    ['network', '192.168.1.0/24'], ['network', '2001:db8::/32'],
    ['domain', 'Example.com.'], ['domain', '*.example.com'], ['domain', '_dmarc.example.com'], ['domain', 'intranet'],
    ['email', 'john.doe@example.com'],
    ['service', '10.0.0.1:443/tcp'], ['service', 'api.example.com:8443/tcp'],
    ['web_application', 'https://app.example.com'], ['web_endpoint', 'http://10.0.0.1:8080/api?x=1'],
    ['host', 'Web server 01'], ['technology', 'nginx 1.25'],
  ])('accepts %s %s', (type, v) => {
    expect(validateAssetIdentifier(type, v)).toBeNull();
  });

  it.each([
    ['ip', '10.0.0.256'], ['network', '10.0.0.0'], ['network', '10.0.0.0/33'],
    ['domain', '10.0.0.1'], ['domain', 'https://example.com'], ['domain', 'exa mple.com'], ['domain', 'example..com'],
    ['email', 'no-at'], ['email', 'john@'], ['email', 'john@*.example.com'],
    ['service', '10.0.0.1'], ['service', '10.0.0.1:70000/tcp'],
    ['web_application', 'example.com'], ['host', ''], ['host', 'x'.repeat(256)],
  ])('rejects %s %s', (type, v) => {
    expect(validateAssetIdentifier(type, v)).not.toBeNull();
  });

  it('allows long DNS TXT values up to 4096 characters', () => {
    expect(validateAssetIdentifier('text_data', 'v=DKIM1; k=rsa; p=' + 'A'.repeat(700))).toBeNull();
    expect(validateAssetIdentifier('text_data', 'x'.repeat(4097))).not.toBeNull();
  });
});
