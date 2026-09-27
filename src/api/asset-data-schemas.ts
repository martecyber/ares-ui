import {
  HOST_SUBTYPES, HOST_SUBTYPE_LABELS, INTERFACE_TYPES, INTERFACE_TYPE_LABELS,
} from '@/api/assets';
import {
  validateHostname, validateMac, validatePort, validateChannel, validateStatusCode,
  validateSafeText, validateNonNegativeInt, validateIp,
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

/** "Name" is always the first Data row, mirroring asset.identifier. For web_application it's
 *  read-only because its value is governed by the Base URLs list (primary = first item). */
export function nameField(type: string): DataFieldDef {
  if (type === 'web_application') return { key: 'identifier', label: 'Name', editor: 'readonly' };
  return { key: 'identifier', label: 'Name', editor: 'text', validate: safeText(500) };
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
        { key: 'name', label: 'Display name', editor: 'text', validate: safeText() },
        { key: 'rootPath', label: 'Root path', editor: 'text', validate: safeText() },
      ];
    case 'url':
      return [
        { key: 'host', label: 'Host', editor: 'text', validate: safeText() },
        { key: 'path', label: 'Path', editor: 'text', validate: safeText() },
        { key: 'statusCode', label: 'Status code', editor: 'text', validate: validateStatusCode, chipColor: httpStatusSeverity },
        { key: 'contentType', label: 'Content-Type', editor: 'text', validate: safeText() },
        { key: 'title', label: 'Page title', editor: 'text', validate: safeText() },
      ];
    case 'app':
      return [
        { key: 'version', label: 'Version', editor: 'text', validate: safeText() },
        { key: 'platform', label: 'Platform', editor: 'text', validate: safeText() },
        { key: 'url', label: 'URL', editor: 'readonly' },
      ];
    case 'cloud_resource':
      return [
        { key: 'provider', label: 'Provider', editor: 'text', validate: safeText() },
        { key: 'region', label: 'Region', editor: 'text', validate: safeText() },
        { key: 'resourceType', label: 'Resource type', editor: 'text', validate: safeText() },
        { key: 'resourceId', label: 'Resource ID', editor: 'readonly' },
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
    default:
      return [];
  }
}

/** Full Data field list for the given asset type — "Name" first, then type-specific fields. */
export function dataFieldsFor(type: string, meta: Record<string, unknown>): DataFieldDef[] {
  return [nameField(type), ...typeFields(type, meta)];
}
