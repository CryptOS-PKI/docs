---
title: "🗺️ Project status and roadmap"
---

# 🗺️ Project status and roadmap

CryptOS is **pre-alpha**. It stays on version `0.x` and is not ready for production yet. Here is an honest picture of what is finished and what is still coming.

## ✅ Works today

The whole "brain" of a certificate authority is built and unit-tested:

- Making the signing key **inside the TPM**, and never letting it out in the clear.
- Self-signing a **Root certificate** that follows the certificate standard (RFC 5280) to the letter.
- The **first-boot ceremony** that creates that Root, step by step.
- The **machine config** file that describes a node.
- The encrypted **API** (mTLS gRPC) and the tamper-evident **audit log**.
- The full **`cryptosctl`** command-line tool.
- Building the OS image and turning it into a bootable **ISO** for a platform such as VMware.

## 🚧 In flight

Booting a real node from start to finish:

- **Maintenance mode** — the very first boot, before anything is installed, where you set the node up.
- **Install to disk**, then reboot into the ceremony.

This is where the active work is right now.

## 🧭 Roadmap

- **Phase 2** — the **issuing** role and the protocol adapters (ACME, SCEP, EST, and more) so CryptOS can hand certificates to other machines, plus the **Fleet Manager** web app for running many nodes at once.
- **Phase 3** — high-availability pairs, many independent Roots, signed add-on extensions, and disaster recovery.

The version stays at `0.x` until the whole system lands. There is no 1.0 yet.

## One thing to know today

Right now a node signs exactly one certificate: **its own Root**. Handing out certificates to *other* machines arrives with the issuing role in Phase 2.
