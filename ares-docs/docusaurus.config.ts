import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Two build modes, same source:
//   - Public (default): full multi-version site for docs.martecyber.com, built by
//     scripts/build-versions.sh from every release git tag (see that script + README.md).
//   - Local (DOCS_BUILD_MODE=local): every client's own deployment bundles just the CURRENT,
//     unversioned docs/ content — no internet dependency on the public site, and no version
//     picker (there's only ever one version running on a given instance). Baked into the
//     ares-ui image at ares-ui/dist/docs/ (see ares-ui/Dockerfile*), served same-origin at
//     /docs/ — that's why baseUrl differs between the two modes.
const LOCAL_BUILD = process.env.DOCS_BUILD_MODE === 'local';

const config: Config = {
  title: 'Ares ASM Documentation',
  tagline: 'User guide and API reference for the Ares Attack Surface Management platform',
  favicon: 'img/favicon.ico',

  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Placeholder — point at the real host once it exists (see README.md, "Publishing"). Only
  // meaningful for the public build anyway (the local build is always same-origin).
  url: LOCAL_BUILD ? 'http://localhost' : 'https://docs.martecyber.com',
  baseUrl: LOCAL_BUILD ? '/docs/' : '/',

  organizationName: 'martecyber',
  projectName: 'ares-asm',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  // No blog — this is a docs-only site. `editUrl` is omitted too: this content isn't meant to be
  // community-edited via GitHub PRs the way the default template assumes.
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Forces a single-version build even when versioned_docs/versions.json are present in
          // the checkout (they will be, once releases have been tagged a few times) — a client
          // deployment only ever ships the version it's actually running.
          ...(LOCAL_BUILD ? {onlyIncludeVersions: ['current'], lastVersion: 'current'} : {}),
          // Default routeBasePath ('docs') would otherwise double up with the local build's own
          // baseUrl ('/docs/'), producing /docs/docs/... — put docs content directly at the
          // local site's root instead, since nginx already nests the whole build under /docs/.
          routeBasePath: LOCAL_BUILD ? '/' : 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      // Matches ares-ui's own default-dark, follow-system-otherwise behavior (see
      // ares-ui/src/assets/main.css's :root vs [data-theme="light"] split).
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Ares ASM',
      logo: {
        alt: 'Ares ASM',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'User Guide',
        },
        // Only meaningful on the public multi-version build — a local deployment only ever has
        // the one version it's running, so a dropdown offering just that one option is noise.
        ...(LOCAL_BUILD ? [] : [{type: 'docsVersionDropdown' as const, position: 'right' as const}]),
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'User Guide', to: LOCAL_BUILD ? '/intro' : '/docs/intro'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Martecyber. Ares ASM documentation.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
