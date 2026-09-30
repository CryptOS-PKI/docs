/*
Copyright The CryptOS Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import {createRequire} from 'module';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)
const require = createRequire(import.meta.url);

// Versioning fix (docs-theme item): the unversioned "next" docs should be
// dev-only, not shipped in a release. During 0.x there are no versioned
// snapshots, so `current` is the whole site and must stay included. Once the
// first version is cut, the production build sets DOCS_INCLUDE_NEXT=false so
// "next" is served locally but excluded from the released site.
const includeNext = process.env.DOCS_INCLUDE_NEXT !== 'false';

// Code blocks sit on the web card colour. On those backgrounds every token of
// these two themes meets WCAG AA except vsLight's pure red attribute names
// (4.0:1), which take the web palette's destructive red (4.8:1) instead.
const prismLight = {
  ...prismThemes.vsLight,
  plain: {...prismThemes.vsLight.plain, backgroundColor: '#ffffff'},
  styles: prismThemes.vsLight.styles.map((entry) =>
    entry.style.color === 'rgb(255, 0, 0)' ? {...entry, style: {...entry.style, color: '#dc2626'}} : entry,
  ),
};
const prismDark = {
  ...prismThemes.oceanicNext,
  plain: {...prismThemes.oceanicNext.plain, backgroundColor: '#141925'},
};

const config: Config = {
  title: 'CryptOS',
  tagline: 'An immutable, API-driven certificate authority operating system',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://cryptos-pki.github.io',
  baseUrl: '/',

  organizationName: 'CryptOS-PKI',
  projectName: 'docs',

  // Skeleton phase: keep the build resilient while pages are stubs.
  // Restore 'throw' once the content workstream fills the cross-links in.
  onBrokenLinks: 'warn',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          includeCurrentVersion: includeNext,
        },
        blog: false,
        theme: {
          customCss: [
            require.resolve('@fontsource-variable/inter/index.css'),
            // Latin only: the other JetBrains Mono subsets are small enough to
            // be inlined into the stylesheet (about 180 KB), and code is ASCII.
            require.resolve('@fontsource/jetbrains-mono/latin-400.css'),
            require.resolve('@fontsource/jetbrains-mono/latin-500.css'),
            require.resolve('@fontsource/jetbrains-mono/latin-700.css'),
            './src/css/theme.css',
            './src/css/custom.css',
          ],
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Dark first, as in the Fleet Manager UI; the navbar toggle switches it.
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    navbar: {
      // theme.css appends the "OS" in the primary colour, as in the web wordmark.
      title: 'Crypt',
      items: [
        // Every page shares one sidebar, so doc-type items would all mark
        // themselves active; match each item on its own section path instead.
        {
          to: '/docs',
          label: 'Get Started',
          position: 'left',
          activeBaseRegex: '^/docs/?$|^/docs/introduction/',
        },
        {to: '/docs/concepts/certificates-101', label: 'Concepts', position: 'left', activeBasePath: '/docs/concepts'},
        {to: '/docs/use-cases/overview', label: 'Use Cases', position: 'left', activeBasePath: '/docs/use-cases'},
        {
          to: '/docs/install-deploy/build-bootable-image',
          label: 'Install',
          position: 'left',
          activeBasePath: '/docs/install-deploy',
        },
        {to: '/docs/using/setup', label: 'Using', position: 'left', activeBasePath: '/docs/using'},
        {
          to: '/docs/reference/machine-config',
          label: 'Reference',
          position: 'left',
          activeBasePath: '/docs/reference',
        },
        {
          href: 'https://github.com/CryptOS-PKI',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'What is CryptOS?', to: '/docs'},
            {label: 'Try it locally', to: '/docs/try-it-locally/requirements'},
            {label: 'Reference', to: '/docs/reference/machine-config'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'cryptos (OS/engine)', href: 'https://github.com/CryptOS-PKI/cryptos'},
            {label: 'api (protos)', href: 'https://github.com/CryptOS-PKI/api'},
            {label: 'helm (chart)', href: 'https://github.com/CryptOS-PKI/helm'},
          ],
        },
      ],
      // CNCF convention: copyright to the project authors, never a company
      // (cncf/foundation copyright-notices.md). The LF Projects trademark lines
      // from the CNCF website guidelines apply only once the project is accepted.
      copyright:
        'Copyright © The CryptOS Authors<br />' +
        'Documentation licensed under the <a href="https://github.com/CryptOS-PKI/docs/blob/main/LICENSE">Apache License 2.0</a>',
    },
    prism: {
      theme: prismLight,
      darkTheme: prismDark,
      additionalLanguages: ['bash', 'go', 'yaml', 'json', 'protobuf', 'ini'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
