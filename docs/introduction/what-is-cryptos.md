---
title: "🔐 What is CryptOS?"
slug: "/"
---

# 🔐 What is CryptOS?

:::tip[✅ Works today]
The core described here is built and tested. Booting it end-to-end on real hardware is still in progress — see [Project status and roadmap](./status-roadmap.md).
:::

CryptOS is a computer with **one job**: to be a certificate authority (CA).

A certificate authority is the thing that hands out digital ID cards — called **certificates** — and vouches that they are real. Websites, servers, and devices use these ID cards to prove who they are and to talk to each other safely. 🔐

Think of CryptOS like a passport office that **only** makes passports. It sits in a locked vault. There is no front desk you can walk up to and no back door. The only way to ask it for anything is through one small, locked mail slot: a secure, encrypted connection.

## What makes it different

- 🚫 **No way to log in.** No SSH, no password screen, no shell, no user accounts. There is nothing to break into, because there is no door. Every action goes through one encrypted API.
- 🔑 **The secret key never leaves the chip.** The key CryptOS signs certificates with is made *inside* a security chip called a TPM, and it is never written to disk where someone could copy it.
- 🧱 **It cannot be changed while it runs.** The system is read-only. You describe how a node should behave in **one file** ahead of time, and that is exactly what it does.

## What it can do today

You can build a CryptOS image, boot it in a virtual machine, and have it create its very first identity — a **Root CA** — right inside the TPM. It signs its own certificate, and you can check that the certificate is valid, all from one command-line tool called `cryptosctl`.

## Where to go next

- New to certificates? Start with [Certificates and CAs 101](../concepts/certificates-101.md).
- Want the honest picture of what is done and what is coming? Read [Project status and roadmap](./status-roadmap.md).
- Ready to try it yourself? Head to [Try It Locally](../try-it-locally/requirements.md).
