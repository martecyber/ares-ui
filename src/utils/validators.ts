/**
 * Pure validators for inline-edited asset data fields. Each returns an error
 * message string when invalid, or null when valid, matching the `validate`
 * prop signature expected by EditableField.vue.
 */

const HOSTNAME_RE = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z]{2,63}$|^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

/** Permissive client-side IPv4/IPv6 literal check (no DNS resolution). */
export function isValidIpLiteral(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  if (IPV4_RE.test(v)) return true;
  return v.includes(':') && IPV6_RE.test(v);
}

function containsUnsafeChars(v: string): boolean {
  if (v.includes('<') || v.includes('>')) return true;
  for (let i = 0; i < v.length; i++) {
    const code = v.charCodeAt(i);
    if (code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) return true;
  }
  return false;
}

export function validateHostname(s: string): string | null {
  const v = s.trim();
  if (!v) return 'Hostname cannot be empty.';
  if (v.length > 253) return 'Hostname is too long.';
  if (!HOSTNAME_RE.test(v)) return 'Not a valid hostname or domain.';
  return null;
}

export function validateMac(s: string): string | null {
  const v = s.trim();
  if (!v) return 'MAC address cannot be empty.';
  if (!MAC_RE.test(v)) return 'Expected format like aa:bb:cc:dd:ee:ff.';
  return null;
}

export function validatePort(s: string): string | null {
  const v = s.trim();
  if (!v) return 'Port cannot be empty.';
  if (!/^\d+$/.test(v)) return 'Port must be a number.';
  const n = Number(v);
  if (n < 1 || n > 65535) return 'Port must be between 1 and 65535.';
  return null;
}

export function validateStatusCode(s: string): string | null {
  const v = s.trim();
  if (!v) return 'Status code cannot be empty.';
  if (!/^\d+$/.test(v)) return 'Status code must be a number.';
  const n = Number(v);
  if (n < 100 || n > 599) return 'Status code must be between 100 and 599.';
  return null;
}

/** Optional non-negative integer, used for fields like scan result length/word count. */
export function validateNonNegativeInt(s: string): string | null {
  const v = s.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return 'Must be a non-negative whole number.';
  return null;
}

/** Loosely bounded integer check, used for fields like WiFi channel (1-196). */
export function validateChannel(s: string): string | null {
  const v = s.trim();
  if (!v) return null; // channel is optional
  if (!/^\d+$/.test(v)) return 'Channel must be a number.';
  const n = Number(v);
  if (n < 1 || n > 196) return 'Channel must be between 1 and 196.';
  return null;
}

export function validateIp(s: string): string | null {
  const v = s.trim();
  if (!v) return 'IP address cannot be empty.';
  if (!isValidIpLiteral(v)) return 'Not a valid IPv4 or IPv6 address.';
  return null;
}

export function validateUrl(s: string): string | null {
  const v = s.trim();
  if (!v) return 'URL cannot be empty.';
  if (v.length > 2048) return 'URL is too long.';
  let parsed: URL;
  try { parsed = new URL(v); } catch { return 'Not a valid URL.'; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'URL must start with http:// or https://.';
  return null;
}

/** Generic free-text guard: length cap plus rejecting control characters and angle brackets. */
export function validateSafeText(s: string, maxLen = 200): string | null {
  const v = s.trim();
  if (v.length > maxLen) return `Must be ${maxLen} characters or fewer.`;
  if (containsUnsafeChars(v)) return 'Contains characters that are not allowed.';
  return null;
}

/** Same as validateSafeText but the field is required (non-empty). */
export function validateSafeTextRequired(s: string, maxLen = 200): string | null {
  const v = s.trim();
  if (!v) return 'This field cannot be empty.';
  return validateSafeText(s, maxLen);
}

/** Manual-entry limits, mirroring backend AssetIdentifierRules.maxLength (the column is TEXT). */
export const ASSET_IDENTIFIER_MAX = 255;
export const TEXT_DATA_IDENTIFIER_MAX = 4096;

export function assetIdentifierMaxLength(type: string): number {
  return type === 'text_data' ? TEXT_DATA_IDENTIFIER_MAX : ASSET_IDENTIFIER_MAX;
}

const DNS_LABEL_RE = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/i;

/** Domain syntax as the backend accepts it: optional "*." wildcard, underscores, single labels. */
function validateDomainIdentifier(v: string): string | null {
  const d = v.replace(/\.$/, '');
  if (isValidIpLiteral(d)) return 'That is an IP address — use the IP type.';
  if (d.includes('/')) return 'Use a bare hostname, without scheme or path.';
  const labels = d.startsWith('*.') ? d.slice(2) : d;
  if (!labels || d.length > 253 || !labels.split('.').every((l) => DNS_LABEL_RE.test(l))) return 'Not a valid domain.';
  return null;
}

/**
 * Client-side mirror of the backend AssetIdentifierRules, for immediate feedback on manual
 * asset entry. The backend stays authoritative (it also normalizes case/whitespace).
 */
export function validateAssetIdentifier(type: string, s: string): string | null {
  const v = s.trim();
  if (!v) return 'Identifier is required.';
  const max = assetIdentifierMaxLength(type);
  if (v.length > max) return `Must be ${max} characters or fewer.`;
  switch (type) {
    case 'ip':
      return isValidIpLiteral(v) ? null : 'Not a valid IPv4 or IPv6 address.';
    case 'network': {
      const m = v.match(/^(.+?)\s*\/\s*(\d{1,3})$/);
      if (!m) return 'Use CIDR notation, e.g. 192.168.1.0/24.';
      if (!isValidIpLiteral(m[1])) return 'Not a valid network address.';
      const max = m[1].includes(':') ? 128 : 32;
      return Number(m[2]) <= max ? null : `Prefix length must be between 0 and ${max}.`;
    }
    case 'domain':
      return validateDomainIdentifier(v);
    case 'email': {
      const at = v.lastIndexOf('@');
      if (at < 1 || at === v.length - 1 || /\s/.test(v.slice(0, at))) return 'Not a valid email address.';
      const dom = v.slice(at + 1);
      return dom.startsWith('*.') || validateDomainIdentifier(dom) ? 'Not a valid email address.' : null;
    }
    case 'service': {
      const m = v.match(/^(.+):(\d{1,5})\/([a-z0-9]+)$/i);
      if (!m) return 'Expected host:port/protocol, e.g. 10.0.0.1:443/tcp.';
      if (!isValidIpLiteral(m[1]) && validateDomainIdentifier(m[1])) return 'Not a valid host or IP.';
      return validatePort(m[2]);
    }
    case 'web_application':
    case 'web_endpoint':
      return validateUrl(v);
    default:
      return containsUnsafeChars(v) ? 'Contains characters that are not allowed.' : null;
  }
}
