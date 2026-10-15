---
title: "🖥️ The web UI"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🖥️ The web UI

:::tip[Works today]
The web UI is part of the alpha. It is built into the Fleet Manager and served on the same HTTPS port, so there is nothing separate to install. A few screens still read demo data in places; they are listed under [Known gaps in the alpha](#known-gaps-in-the-alpha).
:::

This page walks through logging in and finding your way around the Fleet Manager's web UI. What the Fleet Manager is, and how nodes join it, is in the [Fleet Manager overview](./overview.md). Each area of the UI then has its own page, linked under [Where to go next](#where-to-go-next).

## Logging in

You log in with an operator certificate, not a password. Your fleet admin gives it to you as a `.p12` file with a passphrase. If you don't have one yet, [make a credential request](./make-a-credential-request.md).

1. Install the `.p12` file in your browser's certificate store. The page shows the same commands when it can't find a certificate.

   <Tabs groupId="os" queryString>
   <TabItem value="unix" label="Linux / macOS" default>

   On macOS:

   ```bash
   security import operator-admin.p12 -k ~/Library/Keychains/login.keychain-db
   ```

   On Linux (needs `libnss3-tools` or `nss-tools`):

   ```bash
   pk12util -d sql:$HOME/.pki/nssdb -i operator-admin.p12
   ```

   </TabItem>
   <TabItem value="windows" label="Windows (PowerShell)">

   This puts the certificate in Current User, Personal:

   ```powershell
   certutil -user -importPFX -p <passphrase> operator-admin.p12
   ```

   </TabItem>
   </Tabs>

   Firefox keeps its own store: Settings, Privacy & Security, View Certificates, Your Certificates, Import.

2. Open the Fleet Manager's address. The start page loads without a certificate and says `Fleet Manager for CryptOS-PKI.`
3. Select **Log in**, and pick your certificate when the browser asks.

:::tip[Expected output]
The page says `Checking your operator certificate…`, then opens the Dashboard. Your certificate's common name shows at the top right.
:::

{/* screenshot: fleet-manager/login-landing.png: the start page before login, with the Log in button and Copy diagnostics */}

If the manager turns you away, the page says why and offers **Try again**:

| Title | What it means |
|---|---|
| `Certificate not sent` | The browser connected without a certificate. If one is installed, the browser has remembered not to send it: quit the browser fully, start it again and log in. |
| `No operator certificate` | The service is running, but the browser presented no certificate. Install one. |
| `Certificate not authorized` | The certificate is not valid for this fleet. It may lack an access level, or it may have been revoked. |
| `Fleet Manager unavailable` | The API could not be reached. The service may be starting. |

{/* screenshot: fleet-manager/login-denied.png: the Certificate not sent denial with the certificate install help below it */}

**Copy diagnostics**, in the header and on the login screens, copies a short plain-text report: the page, your login state, your certificate's name, level and serial, and the manager and web builds (read from `/version`). Paste it into a bug report.

## Finding your way around

The header holds the CryptOS mark (back to the Dashboard), your certificate's name, **Copy diagnostics** and a light and dark theme switch. The bar under it has every section: Dashboard, Fleet, Root, Nodes, Adopt, Certificates, Enrollment, Profiles, Protocols, Operator CAs, Operators, Agent keys, Approvals and Audit. **Operator CAs** is its own task: see [Managing operator CAs in the web UI](./web-operator-cas.md).

Lists refresh every 10 seconds. Every table has filters and a search box.

What you can do depends on the access level in your certificate: `viewer`, `operator` or `admin` (see [How operators log in](./overview.md#how-operators-log-in)). Where a page needs a higher level, it greys out the controls and says so, for example `Read-only — applying config requires admin level.` The manager checks the level again on every call.

## Known gaps in the alpha

Some screens still read the web app's built-in demo data instead of the manager:

- The **Certs** column on Root and Nodes counts demo certificates.
- A certificate's own page looks the serial up in demo data, so a real certificate shows `Certificate not found`. **View certificate** after issuing goes there too.
- **Days left** and the expiring and expired counts are measured from 1 July 2026, not from today.
- **Renew** on Certificates and **Simulate incoming request** on Enrollment only change demo data.
- The parent check on an enrollment, and the trust chain on a node's page, look the parent up in demo data. A real parent can show as `Parent CA "…" not found.`
- Issuing live sends only the request, the node and the profile. Kind, path length, validity and extended key usage come from the profile. **Subordinate CA** with **Generate a key here** fails with `issueCert: a CSR is required to issue live`.

## Where to go next

- [Fleet Manager overview](./overview.md): what the manager holds and how nodes join.
- [The fleet, and adopting a node](./web-fleet-and-nodes.md): Dashboard, Fleet, Root, Nodes and the Adopt wizard.
- [A node's page](./web-node-detail.md): issuing, config, re-keying, backup, decommissioning, rebooting and the node's own audit log.
- [Certificates, enrollment and protocols](./web-catalogs.md): the fleet-wide catalogs.
- [Operators, agent keys and audit](./web-operators-audit.md): who can reach the manager, AI agent sign-in and the audit log.
- [Deploy with Helm](./helm.md): where each install path stands.
- [Approving agent requests](./approvals.md): deciding an agent's step-up request.
- [Adding operators](./web-operator-credentials.md): requesting, completing and denying operator certificates.
