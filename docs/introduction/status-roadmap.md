---
title: "🗺️ Project status and roadmap"
---

import Pre10Notice from '@site/docs/_partials/pre-1-0-notice.mdx';

# 🗺️ Project status and roadmap

CryptOS is **pre-alpha**. It stays on version `0.x` and is not ready for production yet. Here is an honest picture of what is finished and what is still coming.

<Pre10Notice />

## ✅ Works today

The whole "brain" of a certificate authority is built and unit-tested:

- Making the signing key **inside the TPM**, and never letting it out in the clear.
- Self-signing a **Root certificate** that follows the certificate standard (RFC 5280) to the letter.
- The **first-boot ceremony** that creates that Root, step by step.
- The **machine config** file that describes a node.
- The encrypted **API** (mTLS gRPC) and the tamper-evident **audit log**.
- The full **`cryptosctl`** command-line tool.
- Building the OS image and turning it into a bootable **ISO** for a platform such as VMware.
- Installing a node from start to finish: **maintenance mode** on the very first boot, **install to disk**, then the reboot into the ceremony. See [Install & Deploy](../install-deploy/build-bootable-image.md).

## 🧭 Roadmap

- **Phase 2** — the **issuing** role and the protocol adapters (ACME, SCEP, EST, and more) so CryptOS can hand certificates to other machines, plus the **Fleet Manager** web app for running many nodes at once.
- **Phase 3** — high-availability pairs, many independent Roots, signed add-on extensions, and disaster recovery.

:::info[Alpha: 0.x]
Every CryptOS release before `1.0.0` is a `0.x` alpha. `1.0.0` will be the first GA release, once the whole system lands. It isn't out yet.
:::

## One thing to know today

A node does more than sign its own Root: it can sign subordinate CAs and issue end-entity certificates from a CSR. The `ca` commands in the [cryptosctl command reference](../reference/cryptosctl.md#certificate-authority) list what it can sign today.
