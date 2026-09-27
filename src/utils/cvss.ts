// CVSS score calculations use @turingpointde/cvss.js for 3.1 and 4.0 — it already
// implements the full Base+Temporal+Environmental (3.1) and Base+Threat+Environmental
// (4.0) formulas, so extending past Base metrics is "build a fuller vector string and
// let the library score it" rather than reimplementing CVSS math.
// CVSS 2.0 uses a manual implementation since the library doesn't support it at all
// (Base, Temporal, and Environmental formulas per the official CVSS v2.0 spec).

import { CVSS } from '@turingpointde/cvss.js';

/** Strips one layer of literal wrapping double-quote characters, e.g. `"abc"` -> `abc`.
 *  Legacy CVSS vectors saved through FindingTemplateService before it stored `metadata`
 *  as plain TEXT (see V137__finding_template_score_metadata_text.sql) could come back
 *  from the API with the whole vector string still wrapped in real `"` characters — not
 *  whitespace, so `.trim()` alone doesn't touch them. */
function stripWrappingQuotes(s: string): string {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

/** Parses "K1:V1/K2:V2/..." into a flat map. Trims each key/value and strips a stray
 *  wrapping quote — either would otherwise silently corrupt only the *last* segment
 *  while every other metric parses fine, since only the last one has no trailing "/" (or
 *  closing quote) to naturally delimit it from the corruption — exactly the "every
 *  metric loads except the very last one" symptom this guards against. */
function parseVectorSegments(vector: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const seg of stripWrappingQuotes(vector.trim()).split('/')) {
    const [k, v] = seg.split(':');
    if (k && v) map[k.trim()] = stripWrappingQuotes(v.trim());
  }
  return map;
}

/** True if any of `keys` on `m` holds a value other than `unsetValue` ("X" for 3.1/4.0,
 *  "ND" for 2.0) — i.e. whether that metric group (Temporal/Threat/Environmental) has
 *  actually been filled in, driving both the score and the CVSS-B/BT/BE/BTE-style
 *  classification. */
function anySet(m: Record<string, string>, keys: string[], unsetValue: string): boolean {
  return keys.some((k) => m[k] !== unsetValue);
}

// ── CVSS 3.1 ─────────────────────────────────────────────────────────────────

export type Cvss31Metrics = {
  // Base (mandatory)
  AV: 'N' | 'A' | 'L' | 'P';
  AC: 'L' | 'H';
  PR: 'N' | 'L' | 'H';
  UI: 'N' | 'R';
  S:  'U' | 'C';
  C:  'N' | 'L' | 'H';
  I:  'N' | 'L' | 'H';
  A:  'N' | 'L' | 'H';
  // Temporal (optional — 'X' = Not Defined)
  E:  'X' | 'H' | 'F' | 'P' | 'U';
  RL: 'X' | 'O' | 'T' | 'W' | 'U';
  RC: 'X' | 'C' | 'R' | 'U';
  // Environmental (optional — 'X' = Not Defined)
  CR:  'X' | 'H' | 'M' | 'L';
  IR:  'X' | 'H' | 'M' | 'L';
  AR:  'X' | 'H' | 'M' | 'L';
  MAV: 'X' | 'N' | 'A' | 'L' | 'P';
  MAC: 'X' | 'L' | 'H';
  MPR: 'X' | 'N' | 'L' | 'H';
  MUI: 'X' | 'N' | 'R';
  MS:  'X' | 'U' | 'C';
  MC:  'X' | 'N' | 'L' | 'H';
  MI:  'X' | 'N' | 'L' | 'H';
  MA:  'X' | 'N' | 'L' | 'H';
};

export const defaultCvss31: Cvss31Metrics = {
  AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'H', A: 'H',
  E: 'X', RL: 'X', RC: 'X',
  CR: 'X', IR: 'X', AR: 'X', MAV: 'X', MAC: 'X', MPR: 'X', MUI: 'X', MS: 'X', MC: 'X', MI: 'X', MA: 'X',
};

const CVSS31_TEMPORAL_KEYS = ['E', 'RL', 'RC'] as const;
const CVSS31_ENVIRONMENTAL_KEYS = ['CR', 'IR', 'AR', 'MAV', 'MAC', 'MPR', 'MUI', 'MS', 'MC', 'MI', 'MA'] as const;
const CVSS31_ALL_KEYS = [
  'AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A',
  ...CVSS31_TEMPORAL_KEYS, ...CVSS31_ENVIRONMENTAL_KEYS,
] as const;

export function cvss31HasTemporal(m: Cvss31Metrics): boolean {
  return anySet(m, [...CVSS31_TEMPORAL_KEYS], 'X');
}
export function cvss31HasEnvironmental(m: Cvss31Metrics): boolean {
  return anySet(m, [...CVSS31_ENVIRONMENTAL_KEYS], 'X');
}

/** Only emits segments that are actually set — Base metrics always, Temporal/
 *  Environmental only when not 'X' (Not Defined), matching real-world CVSS vector
 *  strings (e.g. NVD's), which omit unset optional metrics entirely. */
export function buildCvss31Vector(m: Cvss31Metrics): string {
  const base = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'] as const;
  const segs = [
    ...base.map((k) => `${k}:${m[k]}`),
    ...CVSS31_ALL_KEYS.filter((k) => !(base as readonly string[]).includes(k) && m[k] !== 'X').map((k) => `${k}:${m[k]}`),
  ];
  return `CVSS:3.1/${segs.join('/')}`;
}

export function parseCvss31Vector(vector: string): Cvss31Metrics {
  const m = parseVectorSegments(vector);
  const out = { ...defaultCvss31 };
  for (const k of CVSS31_ALL_KEYS) {
    if (m[k] !== undefined) (out as Record<string, string>)[k] = m[k];
  }
  return out;
}

/** Base score always; Temporal/Environmental only meaningful (and only shown) once
 *  their respective metrics are set — mirrors the 3-separate-scores convention CVSS
 *  3.x calculators (e.g. NVD's) use, as opposed to 4.0's single blended score. */
export function cvss31Scores(m: Cvss31Metrics): { base: number; temporal: number | null; environmental: number | null } {
  const vector = buildCvss31Vector(m);
  try {
    const c = CVSS(vector);
    return {
      base: c.getScore() as number,
      temporal: cvss31HasTemporal(m) ? (c.getTemporalScore() as number) : null,
      environmental: cvss31HasEnvironmental(m) ? (c.getEnvironmentalScore() as number) : null,
    };
  } catch {
    return { base: 0, temporal: null, environmental: null };
  }
}

/** The "most refined" available score — Environmental > Temporal > Base — used as the
 *  single numeric `score` value stored on the row (severity, sorting, etc). */
export function cvss31OverallScore(m: Cvss31Metrics): number {
  const s = cvss31Scores(m);
  return s.environmental ?? s.temporal ?? s.base;
}

/** Convenience for score-list displays, which only have the persisted vector string on
 *  hand (not a live Cvss31Metrics object) — shows up to 3 separate Base/Temporal/
 *  Environmental numbers instead of just the one "most refined" score that got saved. */
export function cvss31ScoresFromVector(vector: string): { base: number; temporal: number | null; environmental: number | null } {
  return cvss31Scores(parseCvss31Vector(vector));
}

// ── CVSS 2.0 ─────────────────────────────────────────────────────────────────
// Manual implementation (the library doesn't support 2.0 at all) — formulas per the
// official CVSS v2.0 guide (first.org).

export type Cvss20Metrics = {
  // Base (mandatory)
  AV: 'L' | 'A' | 'N';
  AC: 'H' | 'M' | 'L';
  Au: 'M' | 'S' | 'N';
  C:  'N' | 'P' | 'C';
  I:  'N' | 'P' | 'C';
  A:  'N' | 'P' | 'C';
  // Temporal (optional — 'ND' = Not Defined, per the v2.0 spec's own convention)
  E:  'ND' | 'U' | 'POC' | 'F' | 'H';
  RL: 'ND' | 'OF' | 'TF' | 'W' | 'U';
  RC: 'ND' | 'UC' | 'UR' | 'C';
  // Environmental (optional — 'ND' = Not Defined)
  CDP: 'ND' | 'N' | 'L' | 'LM' | 'MH' | 'H';
  TD:  'ND' | 'N' | 'L' | 'M' | 'H';
  CR:  'ND' | 'L' | 'M' | 'H';
  IR:  'ND' | 'L' | 'M' | 'H';
  AR:  'ND' | 'L' | 'M' | 'H';
};

export const defaultCvss20: Cvss20Metrics = {
  AV: 'N', AC: 'L', Au: 'N', C: 'C', I: 'C', A: 'C',
  E: 'ND', RL: 'ND', RC: 'ND',
  CDP: 'ND', TD: 'ND', CR: 'ND', IR: 'ND', AR: 'ND',
};

const CVSS20_TEMPORAL_KEYS = ['E', 'RL', 'RC'] as const;
const CVSS20_ENVIRONMENTAL_KEYS = ['CDP', 'TD', 'CR', 'IR', 'AR'] as const;
const CVSS20_ALL_KEYS = ['AV', 'AC', 'Au', 'C', 'I', 'A', ...CVSS20_TEMPORAL_KEYS, ...CVSS20_ENVIRONMENTAL_KEYS] as const;

export function cvss20HasTemporal(m: Cvss20Metrics): boolean {
  return anySet(m, [...CVSS20_TEMPORAL_KEYS], 'ND');
}
export function cvss20HasEnvironmental(m: Cvss20Metrics): boolean {
  return anySet(m, [...CVSS20_ENVIRONMENTAL_KEYS], 'ND');
}

const CVSS20_AV = { L: 0.395, A: 0.646, N: 1.0 };
const CVSS20_AC = { H: 0.35, M: 0.61, L: 0.71 };
const CVSS20_AU = { M: 0.45, S: 0.56, N: 0.704 };
const CVSS20_CIA = { N: 0.0, P: 0.275, C: 0.660 };
const CVSS20_E = { ND: 1.0, U: 0.85, POC: 0.9, F: 0.95, H: 1.0 };
const CVSS20_RL = { ND: 1.0, OF: 0.87, TF: 0.9, W: 0.95, U: 1.0 };
const CVSS20_RC = { ND: 1.0, UC: 0.9, UR: 0.95, C: 1.0 };
const CVSS20_CDP = { ND: 0, N: 0, L: 0.1, LM: 0.3, MH: 0.4, H: 0.5 };
const CVSS20_TD = { ND: 1.0, N: 0, L: 0.25, M: 0.75, H: 1.0 };
const CVSS20_REQ = { ND: 1.0, L: 0.5, M: 1.0, H: 1.51 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function calcCvss20(m: Cvss20Metrics): number {
  const c = CVSS20_CIA[m.C];
  const i = CVSS20_CIA[m.I];
  const a = CVSS20_CIA[m.A];
  const impact = 10.41 * (1 - (1 - c) * (1 - i) * (1 - a));
  const exploitability = 20 * CVSS20_AV[m.AV] * CVSS20_AC[m.AC] * CVSS20_AU[m.Au];
  const f = impact === 0 ? 0 : 1.176;
  return round1((0.6 * impact + 0.4 * exploitability - 1.5) * f);
}

/** Base score always; Temporal/Environmental only meaningful (and only shown) once
 *  their respective metrics are set — same 3-separate-scores convention as 3.x. */
export function cvss20Scores(m: Cvss20Metrics): { base: number; temporal: number | null; environmental: number | null } {
  const base = calcCvss20(m);
  const c = CVSS20_CIA[m.C];
  const i = CVSS20_CIA[m.I];
  const a = CVSS20_CIA[m.A];
  const exploitability = 20 * CVSS20_AV[m.AV] * CVSS20_AC[m.AC] * CVSS20_AU[m.Au];

  const temporalFactor = CVSS20_E[m.E] * CVSS20_RL[m.RL] * CVSS20_RC[m.RC];
  const temporal = cvss20HasTemporal(m) ? round1(base * temporalFactor) : null;

  let environmental: number | null = null;
  if (cvss20HasEnvironmental(m)) {
    const cr = CVSS20_REQ[m.CR], ir = CVSS20_REQ[m.IR], ar = CVSS20_REQ[m.AR];
    const adjustedImpact = Math.min(10, 10.41 * (1 - (1 - c * cr) * (1 - i * ir) * (1 - a * ar)));
    const adjustedF = adjustedImpact === 0 ? 0 : 1.176;
    const adjustedBase = round1((0.6 * adjustedImpact + 0.4 * exploitability - 1.5) * adjustedF);
    const adjustedTemporal = round1(adjustedBase * temporalFactor);
    environmental = round1((adjustedTemporal + (10 - adjustedTemporal) * CVSS20_CDP[m.CDP]) * CVSS20_TD[m.TD]);
  }

  return { base, temporal, environmental };
}

/** Convenience for score-list displays, which only have the persisted vector string on
 *  hand (not a live Cvss20Metrics object) — shows up to 3 separate Base/Temporal/
 *  Environmental numbers instead of just the one "most refined" score that got saved. */
export function cvss20ScoresFromVector(vector: string): { base: number; temporal: number | null; environmental: number | null } {
  return cvss20Scores(parseCvss20Vector(vector));
}

export function cvss20OverallScore(m: Cvss20Metrics): number {
  const s = cvss20Scores(m);
  return s.environmental ?? s.temporal ?? s.base;
}

export function buildCvss20Vector(m: Cvss20Metrics): string {
  const base = ['AV', 'AC', 'Au', 'C', 'I', 'A'] as const;
  const segs = [
    ...base.map((k) => `${k}:${m[k]}`),
    ...CVSS20_ALL_KEYS.filter((k) => !(base as readonly string[]).includes(k) && m[k] !== 'ND').map((k) => `${k}:${m[k]}`),
  ];
  return segs.join('/');
}

export function parseCvss20Vector(vector: string): Cvss20Metrics {
  const m = parseVectorSegments(vector);
  const out = { ...defaultCvss20 };
  for (const k of CVSS20_ALL_KEYS) {
    if (m[k] !== undefined) (out as Record<string, string>)[k] = m[k];
  }
  return out;
}

// ── CVSS 4.0 ─────────────────────────────────────────────────────────────────

export type Cvss40Metrics = {
  // Base (mandatory)
  AV: 'N' | 'A' | 'L' | 'P';
  AC: 'L' | 'H';
  AT: 'N' | 'P';
  PR: 'N' | 'L' | 'H';
  UI: 'N' | 'P' | 'A';
  VC: 'H' | 'L' | 'N';
  VI: 'H' | 'L' | 'N';
  VA: 'H' | 'L' | 'N';
  SC: 'H' | 'L' | 'N';
  SI: 'H' | 'L' | 'N';
  SA: 'H' | 'L' | 'N';
  // Threat (optional — 'X' = Not Defined)
  E: 'X' | 'A' | 'P' | 'U';
  // Environmental (optional — 'X' = Not Defined)
  CR:  'X' | 'H' | 'M' | 'L';
  IR:  'X' | 'H' | 'M' | 'L';
  AR:  'X' | 'H' | 'M' | 'L';
  MAV: 'X' | 'N' | 'A' | 'L' | 'P';
  MAC: 'X' | 'L' | 'H';
  MAT: 'X' | 'N' | 'P';
  MPR: 'X' | 'N' | 'L' | 'H';
  MUI: 'X' | 'N' | 'P' | 'A';
  MVC: 'X' | 'H' | 'L' | 'N';
  MVI: 'X' | 'H' | 'L' | 'N';
  MVA: 'X' | 'H' | 'L' | 'N';
  MSC: 'X' | 'H' | 'L' | 'N';
  MSI: 'X' | 'S' | 'H' | 'L' | 'N';
  MSA: 'X' | 'S' | 'H' | 'L' | 'N';
  // Supplemental (optional — 'X' = Not Defined). Purely informational: unlike
  // Threat/Environmental, these never feed the score or the CVSS-B/BT/BE/BTE
  // classification (see cvss40Classification) — the spec defines them as
  // context for the consumer, not scoring inputs.
  S:  'X' | 'N' | 'P';
  AU: 'X' | 'N' | 'Y';
  R:  'X' | 'A' | 'U' | 'I';
  V:  'X' | 'D' | 'C';
  RE: 'X' | 'L' | 'M' | 'H';
  U:  'X' | 'Clear' | 'Green' | 'Amber' | 'Red';
};

export const defaultCvss40: Cvss40Metrics = {
  AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N',
  VC: 'H', VI: 'H', VA: 'H', SC: 'N', SI: 'N', SA: 'N',
  E: 'X',
  CR: 'X', IR: 'X', AR: 'X',
  MAV: 'X', MAC: 'X', MAT: 'X', MPR: 'X', MUI: 'X',
  MVC: 'X', MVI: 'X', MVA: 'X', MSC: 'X', MSI: 'X', MSA: 'X',
  S: 'X', AU: 'X', R: 'X', V: 'X', RE: 'X', U: 'X',
};

const CVSS40_BASE_KEYS = ['AV', 'AC', 'AT', 'PR', 'UI', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA'] as const;
const CVSS40_THREAT_KEYS = ['E'] as const;
const CVSS40_ENVIRONMENTAL_KEYS = [
  'CR', 'IR', 'AR', 'MAV', 'MAC', 'MAT', 'MPR', 'MUI', 'MVC', 'MVI', 'MVA', 'MSC', 'MSI', 'MSA',
] as const;
const CVSS40_SUPPLEMENTAL_KEYS = ['S', 'AU', 'R', 'V', 'RE', 'U'] as const;
const CVSS40_ALL_KEYS = [
  ...CVSS40_BASE_KEYS, ...CVSS40_THREAT_KEYS, ...CVSS40_ENVIRONMENTAL_KEYS, ...CVSS40_SUPPLEMENTAL_KEYS,
] as const;

export function cvss40HasThreat(m: Cvss40Metrics): boolean {
  return anySet(m, [...CVSS40_THREAT_KEYS], 'X');
}
export function cvss40HasEnvironmental(m: Cvss40Metrics): boolean {
  return anySet(m, [...CVSS40_ENVIRONMENTAL_KEYS], 'X');
}
export function cvss40HasSupplemental(m: Cvss40Metrics): boolean {
  return anySet(m, [...CVSS40_SUPPLEMENTAL_KEYS], 'X');
}

/** CVSS 4.0's own naming convention for "which metric groups were actually filled in" —
 *  unlike 3.x/2.0's three separate scores, 4.0 always blends everything into one score;
 *  this label is purely about which inputs fed it. */
export function cvss40Classification(m: Cvss40Metrics): 'CVSS-B' | 'CVSS-BT' | 'CVSS-BE' | 'CVSS-BTE' {
  const t = cvss40HasThreat(m);
  const e = cvss40HasEnvironmental(m);
  if (t && e) return 'CVSS-BTE';
  if (t) return 'CVSS-BT';
  if (e) return 'CVSS-BE';
  return 'CVSS-B';
}

export function buildCvss40Vector(m: Cvss40Metrics): string {
  const segs = [
    ...CVSS40_BASE_KEYS.map((k) => `${k}:${m[k]}`),
    ...[...CVSS40_THREAT_KEYS, ...CVSS40_ENVIRONMENTAL_KEYS, ...CVSS40_SUPPLEMENTAL_KEYS]
      .filter((k) => m[k] !== 'X').map((k) => `${k}:${m[k]}`),
  ];
  return `CVSS:4.0/${segs.join('/')}`;
}

/** Convenience for score-list displays, which only have the persisted vector string on
 *  hand (not a live Cvss40Metrics object) — e.g. "CVSS 4.0 - CVSS-BTE". */
export function cvss40ClassificationFromVector(vector: string): 'CVSS-B' | 'CVSS-BT' | 'CVSS-BE' | 'CVSS-BTE' {
  return cvss40Classification(parseCvss40Vector(vector));
}

export function parseCvss40Vector(vector: string): Cvss40Metrics {
  const m = parseVectorSegments(vector);
  const out = { ...defaultCvss40 };
  for (const k of CVSS40_ALL_KEYS) {
    if (m[k] !== undefined) (out as Record<string, string>)[k] = m[k];
  }
  return out;
}

export function cvss40Score(m: Cvss40Metrics): number {
  try { return CVSS(buildCvss40Vector(m)).getScore() as number; } catch { return 0; }
}

// ── Severity from score ───────────────────────────────────────────────────────

export type ScoreSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export function scoreToSeverity(score: number): ScoreSeverity {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >  0.0) return 'low';
  return 'info';
}

// ── Ares's internal P0-P4 priority scale ────────────────────────────────────────
// Same critical/high/medium/low/info levels, unified label — used for Finding and
// Detection severity display. See also SeverityTag.vue's `scale="priority"` prop,
// which is the preferred way to render this in a component context; this plain
// function is for the handful of spots that render severity as raw text instead.

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'P0', high: 'P1', medium: 'P2', low: 'P3', info: 'P4',
};

/** Maps a raw severity ('critical'|'high'|'medium'|'low'|'info') to its P0-P4 label.
 *  Unrecognized or missing input -> 'P?' (unknown-priority placeholder). */
export function severityToPriorityLabel(level: string | null | undefined): string {
  if (!level) return 'P?';
  return PRIORITY_LABELS[level.toLowerCase()] ?? 'P?';
}

/** The 5 selectable options for a "Manual" score — a direct P0-P4 pick rather than a
 *  0-10 slider. `score` is the synthetic value stored/sent to the backend so it flows
 *  through the same scoreToSeverity() thresholds every other score type uses; `color`
 *  matches SeverityTag.vue's palette for the equivalent level. */
export const PRIORITY_SCALE: { level: string; label: string; score: number; color: string }[] = [
  { level: 'critical', label: 'P0', score: 10.0, color: '#ef4444' },
  { level: 'high',     label: 'P1', score: 8.0,  color: '#f97316' },
  { level: 'medium',   label: 'P2', score: 5.5,  color: '#ca8a04' },
  { level: 'low',      label: 'P3', score: 2.0,  color: '#16a34a' },
  { level: 'info',     label: 'P4', score: 0.0,  color: '#3b82f6' },
];

/** Synthetic score for a P0-P4 label (e.g. an SSVC methodology role's leaf
 *  priorityLevel) — reuses PRIORITY_SCALE so it stays in lockstep with the Manual
 *  score type's own P0-P4 -> score mapping. */
export function priorityLevelScore(label: string | null | undefined): number {
  return PRIORITY_SCALE.find((p) => p.label === label)?.score ?? 0;
}
