import { assetsApi, ASSET_LINK_LABELS, ASSET_TYPE_LABELS, type AssetLinkTypeDef } from '@/api/assets';

let cache: Promise<AssetLinkTypeDef[]> | null = null;

/** The link matrix is static per deployment — fetched once and shared. */
export function loadLinkTypes(): Promise<AssetLinkTypeDef[]> {
  cache ??= assetsApi.linkTypes().catch((e) => { cache = null; throw e; });
  return cache;
}

/**
 * A manually-creatable link as seen from one asset: `out` means this asset is the `from` side,
 * `in` means it's the `to` side (the request is then sent from the other asset).
 */
export interface LinkOption {
  key: string;
  linkType: string;
  direction: 'out' | 'in';
  otherTypes: string[];
  label: string;
}

function linkLabel(linkType: string): string {
  return ASSET_LINK_LABELS[linkType] ?? linkType.replace(/_/g, ' ');
}

function typesLabel(types: string[]): string {
  return types.map((t) => ASSET_TYPE_LABELS[t] ?? t).join(' / ');
}

/** Every manual link the given asset type can take part in, in either direction. */
export function linkOptionsFor(defs: AssetLinkTypeDef[], type: string): LinkOption[] {
  const out: LinkOption[] = [];
  for (const d of defs) {
    if (!d.manual) continue;
    if (d.fromType === type) {
      out.push({
        key: `out:${d.linkType}`, linkType: d.linkType, direction: 'out', otherTypes: d.toTypes,
        label: `${linkLabel(d.linkType)} ${typesLabel(d.toTypes)}`,
      });
    }
    if (d.toTypes.includes(type)) {
      out.push({
        key: `in:${d.fromType}:${d.linkType}`, linkType: d.linkType, direction: 'in', otherTypes: [d.fromType],
        label: `${typesLabel([d.fromType])} · ${linkLabel(d.linkType)} this`,
      });
    }
  }
  return out;
}

/** Manual links valid between two specific types (both directions). */
export function linkOptionsBetween(defs: AssetLinkTypeDef[], sourceType: string, targetType: string): LinkOption[] {
  return linkOptionsFor(defs, sourceType).filter((o) => o.otherTypes.includes(targetType));
}

/** Types a given type can be manually linked with (either direction). */
export function linkableTypes(defs: AssetLinkTypeDef[], type: string): Set<string> {
  return new Set(linkOptionsFor(defs, type).flatMap((o) => o.otherTypes));
}
