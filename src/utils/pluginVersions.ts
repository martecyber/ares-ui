/** Best-effort version comparison for plugin.json's `version` field — a JS mirror of the backend's
 *  PluginVersions.compare (ares-core/.../plugins/PluginVersions.java), used here only to pick the
 *  right label (Install/Upgrade/Downgrade) before the user clicks; the backend is still the real
 *  source of truth for same/upgrade/downgrade (see PluginService#install's own conflict check),
 *  this must just agree with it closely enough that the button never lies about which one it'll be.
 *
 *  Splits on the first "-" to separate the numeric core from a prerelease/build suffix (this
 *  repo's own MAJOR.MINOR.PATCH-betaN convention among others), compares the numeric core
 *  dot-segment by dot-segment (a missing/non-numeric segment counts as 0), and — only when the
 *  numeric cores are equal — falls back to "no suffix beats any suffix", then plain lexicographic
 *  suffix comparison. */
export function compareVersions(a: string, b: string): number {
  const [coreA, ...restA] = a.split('-');
  const [coreB, ...restB] = b.split('-');

  const coreCompare = compareCore(coreA, coreB);
  if (coreCompare !== 0) return coreCompare;

  const suffixA = restA.length ? restA.join('-') : null;
  const suffixB = restB.length ? restB.join('-') : null;
  if (suffixA === null && suffixB === null) return 0;
  if (suffixA === null) return 1;
  if (suffixB === null) return -1;
  return suffixA < suffixB ? -1 : suffixA > suffixB ? 1 : 0;
}

function compareCore(a: string, b: string): number {
  const segA = a.split('.');
  const segB = b.split('.');
  const len = Math.max(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    const na = parseIntSafe(segA[i]);
    const nb = parseIntSafe(segB[i]);
    if (na !== nb) return na - nb;
  }
  return 0;
}

function parseIntSafe(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}
