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
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

type DocLink = {
  label: string;
  description: string;
  to: string;
};

// The four doors into the docs a new visitor is most likely to want: run it
// (Quickstart), run it for real (Install), see how it fits together
// (Architecture), and understand why it's built this way (Security model).
const docLinks: DocLink[] = [
  {
    label: 'Install',
    description: 'Build a signed boot image and install a node to disk.',
    to: '/docs/install-deploy/build-bootable-image',
  },
  {
    label: 'Quickstart',
    description: 'Boot a Root CA in a VM and run its first-boot ceremony.',
    to: '/docs/try-it-locally/requirements',
  },
  {
    label: 'Architecture',
    description: 'How the node, the appliance image and Fleet Manager fit together.',
    to: '/docs/about/repos',
  },
  {
    label: 'Security model',
    description: 'Why there is no login, no shell, and no key outside the TPM.',
    to: '/docs/introduction/why',
  },
];

// A plain landing page until the CryptOS hero (with its code panel) and the
// logo are designed; both will replace this layout rather than extend it.
export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();

  return (
    <Layout description={siteConfig.tagline}>
      <main className={styles.landing}>
        <section className={styles.hero}>
          <h1 className={styles.wordmark}>
            Crypt<span className={styles.accent}>OS</span>
          </h1>
          <p className={styles.tagline}>{siteConfig.tagline}</p>
          <p className={styles.lede}>
            CryptOS is an appliance: a locked-down OS image whose only job is running a certificate authority. Its
            signing key is created inside a TPM and never leaves it, the root filesystem is read-only, and the only
            way in is one encrypted mTLS gRPC API — no shell, no SSH, no login screen. One image boots as a Root,
            Intermediate or Issuing CA; the <Link to="/docs/fleet-manager/overview">Fleet Manager</Link> (FleetOS)
            brings several nodes under one view once you have more than one.
          </p>
          <div className={styles.actions}>
            <Link className="button button--primary" to="/docs/try-it-locally/requirements">
              Get started
            </Link>
            <Link className="button button--secondary" to="/docs">
              Docs
            </Link>
            <Link className="button button--outline button--secondary" href="https://github.com/CryptOS-PKI">
              GitHub
            </Link>
          </div>
          <div className="alert alert--warning" role="alert">
            <strong>Pre-1.0:</strong> every CryptOS release before <code>v1.0.0</code> may change fundamentally.
            Production use is at your own risk. See the{' '}
            <Link to="/docs/introduction/status-roadmap">project status and roadmap</Link>.
          </div>
        </section>

        <section className={styles.section}>
          <h2>Who it's for</h2>
          <p>
            Teams that need their own certificate authority — for internal TLS and mTLS between services, a
            Kubernetes cluster, a fleet of devices or IoT hardware, code signing, or an offline air-gapped root —
            without adding a general-purpose server, and its login screen, to the thing they're trying to keep
            trustworthy. See <Link to="/docs/use-cases/overview">what you can do with CryptOS</Link>.
          </p>
        </section>

        <HomepageFeatures />

        <section className={styles.section}>
          <h2>Where to start</h2>
          <div className={styles.docLinkGrid}>
            {docLinks.map((link) => (
              <Link key={link.to} to={link.to} className={styles.docLinkCard}>
                <strong>{link.label}</strong>
                <span>{link.description}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}
