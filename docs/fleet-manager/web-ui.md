---
title: "🖥️ The web UI"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🖥️ The web UI

:::tip[Works today]
The web UI is part of the alpha. It is built into the Fleet Manager and served on the same HTTPS port, so there is nothing separate to install. A few screens still read demo data in places; they are listed under [Known gaps in the alpha](#known-gaps-in-the-alpha).
:::

This page walks through the Fleet Manager's web UI: how you log in, what each page shows, and what you can do there. What the Fleet Manager is, and how nodes join it, is in the [Fleet Manager overview](./overview.md).

## Logging in

You log in with an operator certificate, not a password. Your fleet admin gives it to you as a `.p12` file with a passphrase.

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

The header holds the CryptOS mark (back to the Dashboard), your certificate's name, **Copy diagnostics** and a light and dark theme switch. The bar under it has every section: Dashboard, Fleet, Root, Nodes, Adopt, Certificates, Enrollment, Profiles, Protocols, Operators, Agent keys, Approvals and Audit.

Lists refresh every 10 seconds. Every table has filters and a search box.

What you can do depends on the access level in your certificate: `viewer`, `operator` or `admin` (see [How operators log in](./overview.md#how-operators-log-in)). Where a page needs a higher level, it greys out the controls and says so, for example `Read-only — applying config requires admin level.` The manager checks the level again on every call.

## Dashboard, Fleet, Root and Nodes

- **Dashboard** shows five cards: Fleet health, Certificates, Enrollment (pending requests), Protocols and Profiles. Each links to its page.
- **Fleet** draws the CA hierarchy as a tree. The ring colour shows each CA's state: Established, Pending or Revoked. Click a CA to focus it and see its details; **Fit** and **Overview** reset the view.
- **Root** lists the Root CAs. A Root's page shows its connection, its config and a re-key panel.
- **Nodes** lists every other node, with its role and identity state.

{/* screenshot: fleet-manager/fleet-topology.png: the Fleet page with a Root and an Issuing CA, one node focused and its detail panel open */}

## A node's page

A node's page shows its identity, issuer, TPM, Fleet Manager link, boot count, uptime and its CRL and OCSP addresses, the trust chain up to its Root, and the certificates it has issued. The buttons:

| Button | Level | What it does |
|---|---|---|
| **Issue…** | `operator` | Opens the issue form. Shown only on an established node that can issue. |
| **Config** | view `operator`, apply `admin` | Edits part of the node's config. |
| **Profiles** | `admin` to apply | Compares the node's profiles with the catalog. |
| **Re-key…** | `operator` | Gives a subordinate CA a new key. |
| **Export key…**, **Import key…** | `admin` | Backs up or restores the CA key. |
| **Decommission…** | `admin` | Wipes the node. |

{/* screenshot: fleet-manager/node-detail.png: a node's page with its fields, trust chain, certificate list and buttons */}

### Issuing and revoking certificates

The issue form takes either **Generate a key here** or **Paste a CSR**. With **Generate a key here** the browser makes the key and the request, so only the request goes to the node. You pick a profile, then select **Issue**. Live issuing takes the validity and usages from the profile (see [Known gaps in the alpha](#known-gaps-in-the-alpha)).

If the browser made the key, you can then download it with **Export private key**. The download is always encrypted and needs a passphrase of at least 18 characters.

:::caution[Save the key before you leave the page]
A key made in the browser exists only in that page. If you leave without **Export private key**, it is gone, and the certificate is useless without it. Tick `I have saved the passphrase somewhere safe` only once you have.
:::

To revoke a certificate, select **Revoke** on its row in the node's list and pick a reason.

:::warning[Revoking has no undo]
The **Revoke** dialog asks only for a reason; there is no typed confirmation. Anything using the certificate stops being trusted once clients see the revocation.
:::

### Config and profile drift

**Config** loads the node's full config and lets you change the revocation base URL (CRL and OCSP), the key protection tier and the DNS servers and search domains. **Apply** sends the whole config back with only those fields changed. The result says which generation was applied and whether the node needs a reboot.

**Profiles** marks each profile `In sync`, `Drifted`, `Node only` or `Not applied`. **Apply catalog version** pushes the catalog's copy to the node.

### Re-keying a subordinate CA

The **Re-key** button, labelled with the node's name, has the node make a new key and request, gets its parent to sign the request, and installs the new chain, all in one step. A Root can't be re-keyed here, because it has no parent to sign its new key.

### Backing up and restoring the CA key

:::danger[The backup file is the CA]
**Export key** takes the CA's private key off the node in an encrypted file, `{node}-ca-backup.enc`. Anyone with the file and the passphrase can run this CA somewhere else. Without the passphrase the backup can't be opened. Store the two apart, and type the node name or `EXPORT` to confirm only when you are ready.
:::

The passphrase must be at least 18 characters; **Generate strong passphrase** makes one. A node whose key lives in the TPM refuses the export.

**Import key** restores a backup onto a fresh node. A node that already has a CA identity refuses it.

### Decommissioning a node

:::danger[Decommission can't be undone]
**Decommission** permanently destroys the node's identity and data. The node wipes its key material and state, then reboots into maintenance. Back up the CA key first if you will ever need this CA again.
:::

To confirm, type the node's Root CA common name exactly and tick `I understand this permanently destroys the node's identity and data.` The page then says `{node} is wiping and entering maintenance.`

## Adopt

The Adopt page (`admin` only) turns a node in maintenance mode into a working CA. The [overview](./overview.md#adopting-a-new-node) explains what happens; this is what you fill in.

1. **Step 1 — maintenance endpoint.** Enter the node's `host:port` and select **Preview**. Check the `subject` and `sha256` against the node, then select **Confirm fingerprint**.
2. **Step 2 — initial config.** Enter the node name and choose the role (root, intermediate or issuing). A subordinate needs a parent: pick an established CA under **Parent CA (signs this node)**. Then fill in the CA's common name, the network (interface, address, gateway, DNS), the **Install disk** from the list the node reports, and the key protection tier.
3. Select **Adopt node** and watch the phases.

{/* screenshot: fleet-manager/adopt-fingerprint.png: Step 1 after Preview, with the First contact warning, subject and sha256, and the Confirm fingerprint button */}
{/* screenshot: fleet-manager/adopt-config.png: Step 2 filled in for an issuing node, with a parent chosen and a disk picked from the list */}

:::tip[Expected output]
A Root ends with `{name} is established and linked to the fleet.` A subordinate ends with `{name} is provisioned and awaiting a parent-signed certificate.`, and you finish it with a subordinate enrollment on the Enrollment page.
:::

If the adoption stops, the manager's message shows in red and **Adopt node** comes back. Run it again: see [Re-adopting a node](./overview.md#re-adopting-a-node).

## Certificates

Every certificate across the fleet, with its issuer, kind, profile, expiry and status. Pick a node under **Select an issuing node** and select **Issue certificate** to open that node's issue form.

## Enrollment

Join requests and their status (`PENDING`, `APPROVED` or `REJECTED`). **New enrollment** (`operator`) opens either kind:

- **Subordinate (CSR):** the child node, the parent CA's common name and the profile.
- **Link (agentless):** the node's endpoint and an admin certificate, key and CA chain it trusts.

On a request's page, **Approve** runs it. A subordinate needs `operator`; a link needs `admin` and asks for the connection details again. **Reject** needs a reason.

{/* screenshot: fleet-manager/enrollment-detail.png: a pending subordinate request with its attestation panel and the Approve and Reject buttons */}

## Profiles

The catalog of certificate templates: key algorithm, validity, subject, CA or not, key usages, extended key usages, SANs and extra extensions. **New profile** and **Save** need `admin`. Deleting a catalog profile leaves the copies on nodes alone.

## Protocols

The enrollment protocols the fleet means to offer, with an **Enable** or **Disable** switch (`admin`).

:::info[Records intent only]
This page records intent only. ACME (RFC 8555) and EST (RFC 7030) are served by the nodes themselves, set per node under `pki.acme` and `pki.est`, and the manager can switch them per node through its API (see [Switching an enrolment protocol on a node](./overview.md#switching-an-enrolment-protocol-on-a-node)); this page does not do that yet. SCEP and Windows autoenrollment are not built, and enabling them here does nothing.
:::

## Operators

The operator certificates the manager knows about, with level, serial, expiry and status. It needs an operator CA (see [The operator CA and revocation](./operator-ca.md)). Without one the page says no operator CA is configured.

**Revoke…** (`admin`) puts a certificate on the manager's denylist: the manager refuses it from its next request. It needs `database_url`.

:::warning[Revoking here doesn't revoke at your CA]
The denylist stops the certificate at the Fleet Manager only. Revoke it at your operator CA as well and publish a new CRL.
:::

The manager doesn't issue operator certificates: your operator CA signs them. To add an operator, see [Operator credentials after day zero](./operator-credentials.md). Certificates the manager recorded before operator CAs became external are listed as `legacy_node` and can't log in.

{/* screenshot: fleet-manager/operators-not-configured.png: the Operators page with no operator CA configured */}

## Agent keys and MCP sign-in

When the manager's MCP endpoint is on, AI agents use **agent keys**. Each key is bound to the operator certificate that made it, and does no more than that certificate's level or its own ceiling, whichever is lower. It stops working when the certificate is revoked or renewed.

- **Create key…** makes a key for a client that can't open the browser sign-in. It is shown once; the manager keeps only a hash.
- **Revoke…** ends a key on the agent's next request.
- An MCP client's sign-in opens **Authorize an MCP client** in your browser, where you choose a level ceiling and **Approve** or **Deny**.
- **Approvals** lists the requests agents raise before a tool that changes the fleet runs, with a count of pending ones in the bar. Deciding them is its own task: see [Approving agent requests](./approvals.md).

The manager's [MCP guide](https://github.com/CryptOS-PKI/manager/blob/main/docs/mcp.md) covers setup.

## Audit

Every recorded event: time, kind, target, actor (a certificate or an agent key), how it came in, outcome and summary. It is read-only.

{/* screenshot: fleet-manager/audit.png: the Audit page with a few events, including node-adopted and issued */}

## Known gaps in the alpha

Some screens still read the web app's built-in demo data instead of the manager:

- The **Certs** column on Root and Nodes counts demo certificates.
- A certificate's own page looks the serial up in demo data, so a real certificate shows `Certificate not found`. **View certificate** after issuing goes there too.
- **Days left** and the expiring and expired counts are measured from 1 July 2026, not from today.
- **Renew** on Certificates and **Simulate incoming request** on Enrollment only change demo data.
- The parent check on an enrollment, and the trust chain on a node's page, look the parent up in demo data. A real parent can show as `Parent CA "…" not found.`
- On a protocol's page only **Enabled** is saved. The bound profile, endpoint and challenge settings are not.
- Issuing live sends only the request, the node and the profile. Kind, path length, validity and extended key usage come from the profile. **Subordinate CA** with **Generate a key here** fails with `issueCert: a CSR is required to issue live`.

## Where to go next

- [Fleet Manager overview](./overview.md): what the manager holds and how nodes join.
- [Deploy with Helm](./helm.md): where each install path stands.
- [Approving agent requests](./approvals.md): deciding an agent's step-up request.
