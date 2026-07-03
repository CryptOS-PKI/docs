/*
Apache License 2.0

Copyright 2026 Shane

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
import {recommendedThemeConfig} from '@the-rabbit-hole-tech/docs-theme/config';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)
const require = createRequire(import.meta.url);

// Versioning fix (docs-theme item): the unversioned "next" docs should be
// dev-only, not shipped in a release. During 0.x there are no versioned
// snapshots, so `current` is the whole site and must stay included. Once the
// first version is cut, the production build sets DOCS_INCLUDE_NEXT=false so
// "next" is served locally but excluded from the released site.
const includeNext = process.env.DOCS_INCLUDE_NEXT !== 'false';

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

  // Brand theme plugin (collapsible right-side TOC + swizzled components).
  plugins: ['@the-rabbit-hole-tech/docs-theme'],

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
            require.resolve('@the-rabbit-hole-tech/docs-theme/styles/custom.css'),
            './src/css/custom.css',
          ],
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    ...recommendedThemeConfig,
    navbar: {
      title: 'CryptOS',
      items: [
        {type: 'doc', docId: 'introduction/what-is-cryptos', label: 'Get Started', position: 'left'},
        {type: 'doc', docId: 'concepts/certificates-101', label: 'Concepts', position: 'left'},
        {type: 'doc', docId: 'use-cases/overview', label: 'Use Cases', position: 'left'},
        {type: 'doc', docId: 'install-deploy/build-bootable-image', label: 'Install', position: 'left'},
        {type: 'doc', docId: 'using/setup', label: 'Using', position: 'left'},
        {type: 'doc', docId: 'reference/machine-config', label: 'Reference', position: 'left'},
        {
          href: 'https://github.com/CryptOS-PKI',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
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
      copyright: `Copyright © ${new Date().getFullYear()} Shane · <a href="https://therabbithole.com">the rabbit hole</a>`,
    },
    prism: {
      ...(recommendedThemeConfig as {prism?: object}).prism,
      additionalLanguages: ['bash', 'go', 'yaml', 'json', 'protobuf', 'ini'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
