---
title: "🗺️ Project status and roadmap"
---

import Pre10Notice from '@site/docs/_partials/pre-1-0-notice.mdx';

# 🗺️ Project status and roadmap

CryptOS is pre-1.0, and its first release candidates are just starting to come out. Here is an honest picture of what is finished and what is still coming.

<Pre10Notice />

## ✅ Works today

The core of a certificate authority is built, tested, and running on real hardware:

- Making the signing key **inside the TPM**, and never letting it out in the clear.
- Self-signing a **Root certificate** that follows the certificate standard (RFC 5280) to the letter.
- The **first-boot ceremony** that creates that Root, step by step.
- The **machine config** file that describes a node.
- The encrypted **API** (mTLS gRPC) and the tamper-evident **audit log**.
- The full **`cryptosctl`** command-line tool.
- Signing subordinate CAs and issuing end-entity certificates from a CSR, and enrolling devices over **SCEP** (RFC 8894). See [Enrol devices with SCEP](../using/enrol-devices-scep.md).
- Building the OS image and turning it into a bootable **ISO** for a platform such as VMware.
- Installing a node from start to finish: **maintenance mode** on the very first boot, **install to disk**, then the reboot into the ceremony. See [Install & Deploy](../install-deploy/build-bootable-image.md).
- The **Fleet Manager** web app, for watching and managing several nodes from one place. See [Fleet Manager overview](../fleet-manager/overview.md).

## 🧭 Roadmap

- **Still landing** — the Fleet Manager's web UI for adding operators and making credential requests is in flight; a few of its pages are still being finished.
- **More enrolment protocols** — ACME and EST, alongside the SCEP support that already works.
- **Phase 3** — high-availability pairs, many independent Roots, signed add-on extensions, and disaster recovery.

:::info[Release candidates: 0.x]
Every CryptOS release before `1.0.0` is a `0.x` release: `v0.1.0` is the first, and each one is preceded by release candidates (`v0.1.0-rc.1`, `rc.2` and so on) that are tested the same way. `1.0.0` will be the first GA release, once the whole system lands. It isn't out yet.
:::

## One thing to know today

A node does more than sign its own Root: it can sign subordinate CAs and issue end-entity certificates from a CSR. The `ca` commands in the [cryptosctl command reference](../reference/cryptosctl.md#certificate-authority) list what it can sign today.
