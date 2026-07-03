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
import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// Explicit information architecture for the CryptOS docs.
// Order here is the sidebar order; ids are file paths under docs/ minus ".md".
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Introduction',
      collapsed: false,
      items: [
        'introduction/what-is-cryptos',
        'introduction/why',
        'introduction/status-roadmap',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'concepts/certificates-101',
        'concepts/chain-of-trust',
        'concepts/immutable-no-login',
        'concepts/tpm-sealed-keys',
        'concepts/ca-roles',
        'concepts/declarative-config',
        'concepts/maintenance-mode',
        'concepts/image-factory',
      ],
    },
    {
      type: 'category',
      label: 'Use Cases',
      items: [
        'use-cases/overview',
        'use-cases/internal-tls',
        'use-cases/kubernetes',
        'use-cases/devices-iot',
        'use-cases/code-signing',
        'use-cases/air-gapped-root',
      ],
    },
    {
      type: 'category',
      label: 'Try It Locally',
      items: [
        'try-it-locally/requirements',
        'try-it-locally/build-image',
        'try-it-locally/boot-qemu',
        'try-it-locally/install-cryptosctl',
        'try-it-locally/first-boot-ceremony',
        'try-it-locally/check-status',
      ],
    },
    {
      type: 'category',
      label: 'Install & Deploy',
      items: [
        'install-deploy/build-bootable-image',
        'install-deploy/boot-maintenance',
        'install-deploy/bootstrap-apply',
        'install-deploy/install-to-disk',
        'install-deploy/reboot-ceremony',
        'install-deploy/secure-boot',
      ],
    },
    {
      type: 'category',
      label: 'Using CryptOS',
      items: [
        'using/setup',
        'using/bootstrap',
        'using/ceremony-start',
        'using/status',
        'using/identity',
        'using/config-apply',
      ],
    },
    {
      type: 'category',
      label: 'Fleet Manager',
      items: [
        'fleet-manager/overview',
        'fleet-manager/helm',
        'fleet-manager/web-ui',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/machine-config',
        'reference/cryptosctl',
        'reference/grpc-api',
        'reference/root-cert-profile',
        'reference/audit-log',
        'reference/glossary',
      ],
    },
    {
      type: 'category',
      label: 'Deep Dives',
      items: [
        'deep-dives/trust-from-zero',
        'deep-dives/keys-never-leave-tpm',
        'deep-dives/ceremony-walkthrough',
        'deep-dives/audit-integrity',
      ],
    },
    {
      type: 'category',
      label: 'About',
      items: ['about/repos', 'about/license'],
    },
  ],
};

export default sidebars;
