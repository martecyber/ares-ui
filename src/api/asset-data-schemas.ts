import {
  HOST_SUBTYPES, HOST_SUBTYPE_LABELS, INTERFACE_TYPES, INTERFACE_TYPE_LABELS,
} from '@/api/assets';
import {
  validateHostname, validateMac, validatePort, validateChannel, validateStatusCode,
  validateSafeText, validateNonNegativeInt, validateIp, validateUrl,
  validateAssetIdentifier,
} from '@/utils/validators';
import { httpStatusSeverity } from '@/utils/http-status';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** Per-type Data table field descriptor. Plain-object/JSON-shaped except for `validate`/
 *  `chipColor`, which are callbacks (not serializable, but kept alongside the rest of the
 *  descriptor since splitting them into a separate lookup buys nothing here). */
export interface DataFieldDef {
  key: string;
  label: string;
  editor: 'text' | 'select' | 'readonly' | 'url-list' | 'chip-list' | 'hostname-list';
  options?: { label: string; value: string }[];
  validate?: (v: string) => string | null;
  chipColor?: (v: string) => Severity;
}

const HOST_SUBTYPE_OPTIONS = HOST_SUBTYPES.map((s) => ({ label: HOST_SUBTYPE_LABELS[s], value: s }));
const INTERFACE_TYPE_OPTIONS = INTERFACE_TYPES.map((t) => ({ label: INTERFACE_TYPE_LABELS[t], value: t }));
const PROTOCOL_OPTIONS = [
  { label: 'TCP', value: 'tcp' },
  { label: 'UDP', value: 'udp' },
];
const WIFI_PROTOCOL_OPTIONS = ['802.11a', '802.11b', '802.11g', '802.11n', '802.11ac', '802.11ax', 'Other']
  .map((v) => ({ label: v, value: v }));
const WIFI_ENCRYPTION_OPTIONS = ['Open', 'WEP', 'WPA', 'WPA2', 'WPA3', 'WPA2/WPA3', 'Other']
  .map((v) => ({ label: v, value: v }));
const WIFI_ROLE_OPTIONS = [
  { label: 'Access Point', value: 'ap' },
  { label: 'Client', value: 'client' },
];

function safeText(maxLen = 200) {
  return (v: string) => validateSafeText(v, maxLen);
}

/** The identifier row, mirroring asset.identifier. Only a host's Name is editable: for every
 *  other type the identifier is how imports recognize the asset (renaming would fork it on the
 *  next scan — use Display name), and a web application's follows its primary Base URL. */
export function nameField(type: string): DataFieldDef {
  if (type === 'host') {
    return { key: 'identifier', label: 'Name', editor: 'text', validate: (v: string) => validateAssetIdentifier(type, v) };
  }
  return { key: 'identifier', label: type === 'text_data' ? 'Value' : 'Identifier', editor: 'readonly' };
}

/** User label for every type except host (whose Name is already user-owned/pinnable).
 *  Top-level asset field, not metadata — imports never touch it. */
export function displayNameField(): DataFieldDef {
  return { key: 'displayName', label: 'Display name', editor: 'text', validate: (v) => (v.trim() ? validateSafeText(v, 200) : null) };
}

/** Classifies a DNS TXT record value by its well-known prefix (derived, never stored). */
export function classifyTxtRecord(value: string): string {
  const v = value.trim().replace(/^"+/, '');
  if (/^v=spf1\b/i.test(v)) return 'SPF';
  if (/^v=DMARC1\b/i.test(v)) return 'DMARC';
  if (/^v=DKIM1\b/i.test(v) || /\bk=rsa;\s*p=/i.test(v)) return 'DKIM';
  if (/^v=STSv1\b/i.test(v)) return 'MTA-STS';
  if (/^v=TLSRPTv1\b/i.test(v)) return 'TLS-RPT';
  if (/verification|verify/i.test(v)) return 'Domain verification';
  return 'Other';
}

function appFields(urlLabel: string): DataFieldDef[] {
  return [
    { key: 'version', label: 'Version', editor: 'text', validate: safeText(50) },
    { key: 'publisher', label: 'Publisher', editor: 'text', validate: safeText() },
    { key: 'storeUrl', label: urlLabel, editor: 'text', validate: (v) => (v.trim() ? validateUrl(v) : null) },
  ];
}

/** Services are identified as "<host>:<port>/<proto>" (Nmap/manual) or just "<port>/<proto>"
 *  (Shodan) — parsed defensively so the Data table can fall back to it when metadata lacks
 *  an explicit host/port/protocol (older imports never wrote a separate "host" key at all). */
export function parseServiceIdentifier(identifier: string): { host: string | null; port: string; proto: string } | null {
  const withHost = identifier.match(/^(.+):(\d+)\/([a-zA-Z0-9]+)$/);
  if (withHost) return { host: withHost[1], port: withHost[2], proto: withHost[3] };
  const noHost = identifier.match(/^(\d+)\/([a-zA-Z0-9]+)$/);
  if (noHost) return { host: null, port: noHost[1], proto: noHost[2] };
  return null;
}

/** Type-specific Data fields, given the asset type and its current parsed metadata (some
 *  branches — e.g. interface — reveal extra fields conditionally based on already-set values). */
function typeFields(type: string, meta: Record<string, unknown>): DataFieldDef[] {
  switch (type) {
    case 'host':
      return [
        { key: 'hostnames', label: 'Hostnames', editor: 'hostname-list' },
        { key: 'hostSubtype', label: 'Subtype', editor: 'select', options: HOST_SUBTYPE_OPTIONS },
      ];
    case 'interface': {
      const fields: DataFieldDef[] = [
        { key: 'ifaceName', label: 'Interface name', editor: 'text', validate: safeText(100) },
        { key: 'interfaceType', label: 'Type', editor: 'select', options: INTERFACE_TYPE_OPTIONS },
        { key: 'mac', label: 'MAC', editor: 'text', validate: validateMac },
      ];
      if (meta.interfaceType === 'wireless') {
        fields.push({ key: 'wifiRole', label: 'Wi-Fi role', editor: 'select', options: WIFI_ROLE_OPTIONS });
        fields.push({ key: 'channel', label: 'Channel', editor: 'text', validate: validateChannel });
        if (meta.wifiRole === 'ap') {
          fields.push({ key: 'ssid', label: 'SSID/ESSID', editor: 'text', validate: safeText(64) });
          fields.push({ key: 'wifiProtocol', label: 'Protocol', editor: 'select', options: WIFI_PROTOCOL_OPTIONS });
          fields.push({ key: 'encryption', label: 'Encryption', editor: 'select', options: WIFI_ENCRYPTION_OPTIONS });
        } else if (meta.wifiRole === 'client') {
          fields.push({ key: 'connectedSsid', label: 'Connected SSID/ESSID', editor: 'text', validate: safeText(64) });
        }
      }
      return fields;
    }
    case 'ip':
      return [
        { key: 'ipVersion', label: 'Subtype', editor: 'readonly' },
        { key: 'org', label: 'Organization', editor: 'text', validate: safeText() },
        { key: 'isp', label: 'ISP', editor: 'text', validate: safeText() },
        { key: 'asn', label: 'ASN', editor: 'text', validate: safeText(20) },
        { key: 'country', label: 'Country', editor: 'text', validate: safeText(100) },
        { key: 'city', label: 'City', editor: 'text', validate: safeText(100) },
        { key: 'tags', label: 'Tags', editor: 'chip-list', validate: safeText(50) },
        { key: 'shodanLastSeen', label: 'Shodan last seen', editor: 'readonly' },
      ];
    case 'domain':
      return [
        { key: 'resolvedIps', label: 'Resolved IPs', editor: 'readonly' },
        { key: 'cname', label: 'CNAME', editor: 'text', validate: validateHostname },
        { key: 'mx', label: 'MX', editor: 'text', validate: safeText() },
        { key: 'registrar', label: 'Registrar', editor: 'text', validate: safeText() },
        { key: 'shodanLastSeen', label: 'Shodan last seen', editor: 'readonly' },
      ];
    case 'service':
      return [
        { key: 'host', label: 'Host', editor: 'text', validate: safeText() },
        { key: 'ip', label: 'IP', editor: 'text', validate: validateIp },
        { key: 'port', label: 'Port', editor: 'text', validate: validatePort },
        { key: 'protocol', label: 'Protocol', editor: 'select', options: PROTOCOL_OPTIONS },
        { key: 'service', label: 'Service', editor: 'text', validate: safeText() },
        { key: 'product', label: 'Product', editor: 'text', validate: safeText() },
        { key: 'version', label: 'Version', editor: 'text', validate: safeText() },
        { key: 'banner', label: 'Banner', editor: 'text', validate: safeText(500) },
        { key: 'cpe', label: 'CPE', editor: 'text', validate: safeText() },
        { key: 'vulns', label: 'Vulnerabilities', editor: 'chip-list', validate: safeText(50) },
        { key: 'shodanLastSeen', label: 'Shodan last seen', editor: 'readonly' },
      ];
    case 'web_application':
      return [
        { key: 'baseUrls', label: 'Base URLs', editor: 'url-list' },
        { key: 'rootPath', label: 'Root path', editor: 'text', validate: safeText() },
      ];
    case 'web_endpoint':
      return [
        { key: 'path', label: 'Path', editor: 'text', validate: safeText(500) },
        { key: 'statusCodes', label: 'Status codes', editor: 'chip-list', validate: validateStatusCode, chipColor: httpStatusSeverity },
        { key: 'contentTypes', label: 'Content types', editor: 'chip-list', validate: safeText() },
        { key: 'lengths', label: 'Lengths', editor: 'chip-list', validate: validateNonNegativeInt },
        { key: 'wordCounts', label: 'Word counts', editor: 'chip-list', validate: validateNonNegativeInt },
        { key: 'redirectLocations', label: 'Redirect locations', editor: 'chip-list', validate: safeText(500) },
        { key: 'sources', label: 'Discovered from', editor: 'chip-list', validate: safeText(500) },
      ];
    case 'email':
      return [
        { key: 'domainPart', label: 'Domain', editor: 'readonly' },
        { key: 'sources', label: 'Sources', editor: 'chip-list', validate: safeText(100) },
        { key: 'breached', label: 'Breached', editor: 'readonly' },
      ];
    case 'credential':
      return [
        { key: 'credentialType', label: 'Type', editor: 'select', options: [
          { label: 'Password', value: 'password' },
          { label: 'Hash', value: 'hash' },
          { label: 'API Key', value: 'api_key' },
          { label: 'Token', value: 'token' },
          { label: 'Certificate', value: 'certificate' },
          { label: 'Other', value: 'other' },
        ]},
        { key: 'username', label: 'Username', editor: 'text', validate: safeText() },
        { key: 'strength', label: 'Strength', editor: 'select', options: [
          { label: 'Weak', value: 'weak' },
          { label: 'Medium', value: 'medium' },
          { label: 'Strong', value: 'strong' },
          { label: 'Unknown', value: 'unknown' },
        ]},
        { key: 'source', label: 'Source', editor: 'text', validate: safeText() },
      ];
    case 'person':
      return [
        { key: 'role', label: 'Role / Title', editor: 'text', validate: safeText() },
        { key: 'department', label: 'Department', editor: 'text', validate: safeText() },
        { key: 'linkedin', label: 'LinkedIn', editor: 'text', validate: safeText(500) },
        { key: 'sources', label: 'Sources', editor: 'chip-list', validate: safeText(100) },
      ];
    case 'system':
      return [
        { key: 'systemType', label: 'Type', editor: 'select', options: [
          { label: 'ERP', value: 'erp' },
          { label: 'CRM', value: 'crm' },
          { label: 'Active Directory', value: 'ad' },
          { label: 'Kubernetes', value: 'k8s' },
          { label: 'Database', value: 'database' },
          { label: 'Mail Server', value: 'mail' },
          { label: 'Other', value: 'other' },
        ]},
        { key: 'vendor', label: 'Vendor', editor: 'text', validate: safeText() },
        { key: 'version', label: 'Version', editor: 'text', validate: safeText() },
      ];
    case 'directory':
      return [
        { key: 'directoryType', label: 'Type', editor: 'select', options: [
          { label: 'Active Directory', value: 'ad' },
          { label: 'Azure AD / Entra ID', value: 'aad' },
          { label: 'LDAP', value: 'ldap' },
          { label: 'Okta', value: 'okta' },
          { label: 'Other', value: 'other' },
        ]},
        { key: 'forestName', label: 'Forest / Domain', editor: 'text', validate: safeText() },
        { key: 'functionalLevel', label: 'Functional level', editor: 'text', validate: safeText() },
      ];
    case 'network':
      return [
        { key: 'description', label: 'Description', editor: 'text', validate: safeText(500) },
      ];
    // httpx/katana only set the identifier (the tech name); Trivy also writes name/version/relationship.
    case 'technology':
      return [
        { key: 'name', label: 'Product', editor: 'text', validate: safeText() },
        { key: 'version', label: 'Version', editor: 'text', validate: safeText(50) },
        { key: 'category', label: 'Category', editor: 'text', validate: safeText(100) },
        { key: 'cpe', label: 'CPE', editor: 'text', validate: safeText() },
        { key: 'relationship', label: 'Dependency', editor: 'readonly' },
      ];
    // Trivy: version/purl/target/packageType.
    case 'software':
      return [
        { key: 'version', label: 'Version', editor: 'text', validate: safeText(50) },
        { key: 'packageType', label: 'Ecosystem', editor: 'readonly' },
        { key: 'purl', label: 'Package URL', editor: 'readonly' },
        { key: 'target', label: 'Scan target', editor: 'readonly' },
      ];
    case 'android_app':
      return appFields('Play Store URL');
    case 'ios_app':
      return appFields('App Store URL');
    case 'windows_app':
      return appFields('Download URL');
    case 'hardware':
      return [
        { key: 'vendor', label: 'Vendor', editor: 'text', validate: safeText() },
        { key: 'model', label: 'Model', editor: 'text', validate: safeText() },
        { key: 'firmware', label: 'Firmware version', editor: 'text', validate: safeText(100) },
        { key: 'serial', label: 'Serial number', editor: 'text', validate: safeText(100) },
      ];
    case 'text_data':
      return [
        { key: 'txtKind', label: 'Kind', editor: 'readonly' },
      ];
    default:
      return [];
  }
}

/** Full Data field list for the given asset type — "Name" first, then type-specific fields. */
export function dataFieldsFor(type: string, meta: Record<string, unknown>): DataFieldDef[] {
  if (type === 'host') return [nameField(type), ...typeFields(type, meta)];
  return [displayNameField(), nameField(type), ...typeFields(type, meta)];
}
