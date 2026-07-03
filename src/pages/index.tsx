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
import Landing from '@the-rabbit-hole-tech/docs-theme/landing';

export default function Home() {
  return (
    <Landing
      buttons={[
        {label: 'Get started', to: '/docs', variant: 'secondary'},
        {label: 'GitHub', href: 'https://github.com/CryptOS-PKI'},
      ]}
      features={[
        {
          title: '🔒 No login, ever',
          body: 'No SSH, no shell, no passwords. Every action goes through one mTLS gRPC API.',
        },
        {
          title: '🔑 Keys stay in the TPM',
          body: 'The certificate authority key is created and used inside the hardware chip. It never touches disk in the clear.',
        },
        {
          title: '📝 Declarative and immutable',
          body: 'One YAML file describes a node. The running system is read-only and cannot be changed.',
        },
      ]}
      quickstart={{
        title: '🚀 Quickstart',
        lede: 'Read the docs to build, boot, and run your first Root CA:',
        code: 'npm install\nnpm run start',
        language: 'bash',
        cta: {label: 'Read the docs', to: '/docs', variant: 'primary'},
      }}
    />
  );
}
