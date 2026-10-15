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
import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import {SplitHero} from '@site/src/components/SplitHero';

import styles from './index.module.css';

type EntryPoint = {
  label: string;
  description: string;
  to: string;
};

const entryPoints: EntryPoint[] = [
  {
    label: 'Get started',
    description: 'Build an image, boot it, and run the first-boot ceremony.',
    to: '/docs/try-it-locally/requirements',
  },
  {
    label: 'Install and deploy',
    description: 'Build a bootable image and install a node to disk.',
    to: '/docs/install-deploy/build-bootable-image',
  },
  {
    label: 'Using CryptOS',
    description: 'Set up a node and run it day to day with cryptosctl.',
    to: '/docs/using/setup',
  },
  {
    label: 'FleetOS Manager',
    description: 'Run and watch many nodes from one place.',
    to: '/docs/fleet-manager/overview',
  },
  {
    label: 'Reference',
    description: 'The cryptosctl commands, the gRPC API, and machine config.',
    to: '/docs/reference/machine-config',
  },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();

  return (
    <Layout description={siteConfig.tagline}>
      <SplitHero
        eyebrow="CryptOS documentation"
        headline="A certificate authority"
        headlineAccent="you can run yourself."
        lede={
          <>
            CryptOS turns a bare machine into an <mark>immutable</mark>, <mark>API-driven</mark>{' '}
            certificate authority: no shell, no login, no door in except the API. These docs cover
            building it, running it, and managing a fleet of nodes with FleetOS Manager.
          </>
        }
        primaryCta={{label: 'Get started', to: '/docs/try-it-locally/requirements'}}
        secondaryCta={{label: 'What is CryptOS?', to: '/docs/introduction/what-is-cryptos'}}
        terminalTitle="cryptosctl"
        terminalLines={[
          {prompt: 'cryptosctl ca status'},
          {text: 'role       Root CA'},
          {text: 'state      sealed (TPM)'},
          {text: 'issued     128 certificates'},
          {prompt: 'cryptosctl ca issue --csr device.csr'},
          {text: 'issued     device.pem (expires in 90d)'},
        ]}
      />

      <main>
        <section className={styles.entryPoints}>
          <div className={styles.entryGrid}>
            {entryPoints.map((entry) => (
              <Link key={entry.to} className={styles.entryCard} to={entry.to}>
                <span className={styles.entryLabel}>{entry.label}</span>
                <span className={styles.entryDescription}>{entry.description}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.notice}>
          <div className={styles.noticeCard}>
            <p className={styles.noticeTitle}>Pre-1.0: any release can change fundamentally</p>
            <p className={styles.noticeBody}>
              CryptOS is pre-1.0. Until v1.0.0, a release may change configuration, APIs, on-disk
              and state formats, trust setup, and upgrade paths, sometimes with no migration path.
              Running it in production today means accepting that risk.{' '}
              <Link to="/docs/introduction/status-roadmap">Read the project status and roadmap</Link>{' '}
              before you decide.
            </p>
          </div>
        </section>

        <section className={styles.productLink}>
          <p>
            Looking for the product overview rather than the documentation?{' '}
            <Link href="https://www.cryptos-pki.com">Visit cryptos-pki.com</Link>.
          </p>
        </section>
      </main>
    </Layout>
  );
}
