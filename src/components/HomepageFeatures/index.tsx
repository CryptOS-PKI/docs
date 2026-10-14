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
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
  to: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'No way to log in',
    description: (
      <>
        No SSH, no shell, no password screen, no user accounts. Every action goes through one encrypted API, checked
        and logged every time.
      </>
    ),
    to: '/docs/concepts/immutable-no-login',
  },
  {
    title: 'Keys sealed in the TPM',
    description: (
      <>
        The signing key is created inside the TPM and never written to disk where it could be copied, even by
        someone holding the drive.
      </>
    ),
    to: '/docs/concepts/tpm-sealed-keys',
  },
  {
    title: 'One image, three CA roles',
    description: (
      <>
        The same CryptOS image boots as a Root, Intermediate or Issuing CA, decided by the machine config it reads
        at boot.
      </>
    ),
    to: '/docs/concepts/ca-roles',
  },
  {
    title: 'cryptosctl, or a fleet view',
    description: (
      <>
        Run a single node from the command line with <code>cryptosctl</code>, or bring up the Fleet Manager for an
        inventory across many nodes.
      </>
    ),
    to: '/docs/fleet-manager/overview',
  },
];

function Feature({title, description, to}: FeatureItem) {
  return (
    <div className={clsx('col col--3')}>
      <Link to={to} className={styles.feature}>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </Link>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props) => (
            <Feature key={props.to} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
