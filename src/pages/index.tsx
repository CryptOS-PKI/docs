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
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';

// A plain landing page until the CryptOS hero (with its code panel) and the
// logo are designed; both will replace this layout rather than extend it.
export default function Home() {
  const {siteConfig} = useDocusaurusContext();

  return (
    <Layout description={siteConfig.tagline}>
      <main className={styles.landing}>
        <h1 className={styles.wordmark}>
          Crypt<span className={styles.accent}>OS</span>
        </h1>
        <p className={styles.tagline}>{siteConfig.tagline}</p>
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
      </main>
    </Layout>
  );
}
