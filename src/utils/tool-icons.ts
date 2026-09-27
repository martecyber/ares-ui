import { ref } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { apiClient } from '@/api/client';

const S = '/img/sources';

/** Canonical map: tool/integration id → public icon URL */
export const TOOL_ICON_SRC: Record<string, string> = {
  // ── Integrations ──────────────────────────────────────────────────────────
  caido:        `${S}/caido.svg`,
  'caido-api':  `${S}/caido.svg`,
  shodan:       `${S}/shodan.svg`,
  tenable:       `${S}/tenable.svg`,
  'tenable-mssp': `${S}/tenable.svg`,
  qualys:       `${S}/qualys.svg`,
  burp:         `${S}/burp.svg`,
  zap:          `${S}/zap.svg`,
  greenbone:    `${S}/greenbone.svg`,
  crowdstrike:  `${S}/crowdstrike.svg`,
  fortirecon:   `${S}/fortinet.svg`,
  // Traced from a community-hosted PNG screenshot of Action1's "A1" mark (not fetched from an
  // action1.com-owned URL — no official standalone SVG icon mark was found publicly, only a wide
  // wordmark, see the wordmark note that used to be here). Vector-traced (skimage contour trace,
  // not a redraw) from a 412x241 raster into straight-segment path data, fill-rule evenodd so the
  // "A" counter renders as a hole — visually verified against the source PNG pixel-for-pixel.
  action1:      `${S}/action1.svg`,
  bugcrowd:     `${S}/bugcrowd.svg`,
  yeswehack:    `${S}/yeswehack.svg`,
  hackerone:    `${S}/hackerone.svg`,
  intigriti:    `${S}/intigriti.svg`,

  // ── ProjectDiscovery tools ────────────────────────────────────────────────
  subfinder:    `${S}/projectdiscovery.svg`,
  httpx:        `${S}/projectdiscovery.svg`,
  naabu:        `${S}/projectdiscovery.svg`,
  dnsx:         `${S}/projectdiscovery.svg`,
  nuclei:       `${S}/projectdiscovery.svg`,
  katana:       `${S}/projectdiscovery.svg`,
  mapcidr:      `${S}/projectdiscovery.svg`,
  chaos:        `${S}/projectdiscovery.svg`,
  alterx:       `${S}/projectdiscovery.svg`,
  uncover:      `${S}/projectdiscovery.svg`,
  tldfinder:    `${S}/projectdiscovery.svg`,

  // ── Other agent tools ─────────────────────────────────────────────────────
  nmap:         `${S}/nmap.svg`,
  masscan:      `${S}/masscan.svg`,
  ffuf:         `${S}/ffuf.svg`,
  wpscan:       `${S}/wpscan.svg`,
  testssl:      `${S}/testssl.png`,
  pingcastle:   `${S}/pingcastle.png`,
  purpleknight: `${S}/purpleknight.svg`,
  trivy:        `${S}/trivy.svg`,
};

/**
 * Light-theme variant for icons whose default file only reads correctly on the dark
 * theme (this app's default) — e.g. trivy.svg's cube outline is white with fixed-color
 * accents (red/blue/yellow/cyan) that must NOT invert, so a CSS filter can't flip just
 * the outline; a real second file (black outline, same accents) is swapped in instead.
 */
const LIGHT_ICON_SRC: Partial<Record<string, string>> = {
  trivy: `${S}/trivy-light.svg`,
};

/** Icons for plugin-provided tools (see com.martecyber.ares.plugins on the backend) — these can't
 *  be baked into TOOL_ICON_SRC above at build time, since a plugin is installed at runtime with
 *  no frontend rebuild. Populated once by {@link loadDynamicIcons}, called fire-and-forget from
 *  main.ts at app bootstrap; a reactive ref so a component reading it via toolIconSrc() during
 *  render (SourceBadge, the integration picker's typeMeta fallback, ...) re-renders once the
 *  fetch resolves, the same as any other Vue-tracked dependency, even though the read happens
 *  inside this plain function rather than directly in the component's own template. */
const dynamicIconSrc = ref<Record<string, string>>({});

/** Light-theme counterpart to {@link dynamicIconSrc} — a plugin's own {@code iconLight}
 *  (optional; most plugin icons don't need one, same as the static {@link LIGHT_ICON_SRC}). */
const dynamicIconSrcLight = ref<Record<string, string>>({});

/** Display labels for plugin-provided tools, keyed the same way as {@link dynamicIconSrc} — a
 *  plugin's own {@code integrationTypeLabel()}/{@code BugHuntingClient#label}, not a name baked
 *  into this file. Used by {@link toolLabel} — e.g. SourceBadge's tooltip. */
const dynamicLabelSrc = ref<Record<string, string>>({});

/** Fetches every currently-registered integration type's icon(s)/label (built-in types have no
 *  icon override — see IntegrationController#types's own doc comment) plus every Bug Hunting
 *  platform's icon/label (a second, independent source — see BugHuntingPlatformController — since
 *  those platforms aren't IntegrationActionHandlers and so never appear in the first list), and
 *  caches both for {@link toolIconSrc}/{@link toolLabel}. Safe to call more than once (e.g. after
 *  installing a new plugin) — just refreshes the cache. Each fetch's errors are swallowed
 *  independently: a tool/platform this can't resolve just falls back to its static/raw form, and
 *  one endpoint 404ing (e.g. no Bug Hunting plugin installed) never blocks the other. */
export async function loadDynamicIcons(): Promise<void> {
  const dark: Record<string, string> = {};
  const light: Record<string, string> = {};
  const labels: Record<string, string> = {};

  await Promise.allSettled([
    apiClient.get<{ type: string; label: string; icon: string | null; iconLight: string | null }[]>('/integrations/types')
      .then(({ data }) => {
        for (const t of data) {
          if (t.icon) dark[t.type.toLowerCase()] = t.icon;
          if (t.iconLight) light[t.type.toLowerCase()] = t.iconLight;
          if (t.label) labels[t.type.toLowerCase()] = t.label;
        }
      }),
    apiClient.get<{ id: string; label: string }[]>('/bug-hunting/platforms')
      .then(({ data }) => {
        for (const p of data) {
          if (p.label) labels[p.id.toLowerCase()] = p.label;
        }
      }),
  ]);

  dynamicIconSrc.value = dark;
  dynamicIconSrcLight.value = light;
  dynamicLabelSrc.value = labels;
}

/** Returns the public URL for a tool icon, or undefined if none registered. Checks the curated
 *  static map first, then plugin-provided icons (see {@link loadDynamicIcons}) — a plugin could
 *  in principle reuse a built-in tool's id, and the static, build-verified icon should win. */
export function toolIconSrc(tool: string): string | undefined {
  const key = tool.toLowerCase();
  if (useThemeStore().theme === 'light') {
    if (LIGHT_ICON_SRC[key]) return LIGHT_ICON_SRC[key];
    if (!TOOL_ICON_SRC[key] && dynamicIconSrcLight.value[key]) return dynamicIconSrcLight.value[key];
  }
  return TOOL_ICON_SRC[key] ?? dynamicIconSrc.value[key];
}

/** Returns a tool/integration/platform's display label from whichever live registry knows it
 *  (see {@link loadDynamicIcons}), or undefined if none does — callers fall back to their own
 *  curated name or the raw id, same pattern as {@link toolIconSrc}'s icon fallback. */
export function toolLabel(tool: string): string | undefined {
  return dynamicLabelSrc.value[tool.toLowerCase()];
}

/** White-glyph variant used specifically inside a small colored/semi-transparent chip (see
 *  DetectionDetailView's .plugin-badge) where the brand-color icon barely reads against a
 *  background tinted with that same brand color — e.g. Qualys's red Q on a red-tinted chip.
 *  Falls back to {@link toolIconSrc} for every tool without this contrast problem. */
const BADGE_ICON_SRC: Partial<Record<string, string>> = {
  qualys: `${S}/qualys-white.svg`,
};

export function badgeIconSrc(tool: string): string | undefined {
  return BADGE_ICON_SRC[tool.toLowerCase()] ?? toolIconSrc(tool);
}

/**
 * Backing layer stacked BEHIND the full-color icon, for callers rendering icons on a plain
 * button/card background rather than swapping the icon out entirely (that's {@link
 * badgeIconSrc}). Needed because qualys.svg's red Q is a single compound path where the inner
 * glyph is carved out as a genuine transparent hole (not a separately-colored shape) — on a
 * dark button background that hole reads as a gap in the icon instead of the intended solid
 * white underneath it.
 *
 * This is deliberately a DIFFERENT asset from {@link BADGE_ICON_SRC}'s qualys-white.svg, not a
 * reuse of it: that file recolors the exact same compound path (outer shield + inner-hole
 * subpath) to white, so it carries the identical hole and stacking it behind the red icon fills
 * nothing — confirmed by rendering both and diffing pixels, every "hole" pixel stayed the
 * background color through the stack. qualys-backing.svg instead keeps only the outer-shield
 * subpath, filled solid with no cutout, so the swirl-hole area in the red layer on top now
 * shows this solid white layer through it instead of whatever is further behind.
 */
const BACKING_ICON_SRC: Partial<Record<string, string>> = {
  qualys: `${S}/qualys-backing.svg`,
};

export function whiteBackingSrc(tool: string): string | undefined {
  return BACKING_ICON_SRC[tool.toLowerCase()];
}
