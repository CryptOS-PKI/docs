---
title: "🖥️ A node's page"
---

# 🖥️ A node's page

:::tip[Works today]
The web UI is part of the alpha. A few screens still read demo data in places; see [Known gaps in the alpha](./web-ui.md#known-gaps-in-the-alpha).
:::

Everything you can do to one node once it is in the fleet: issue and revoke, edit its config, re-key it, back up and restore its CA key, decommission it, reboot it, and read its audit log. Find a node from [the fleet view](./web-fleet-and-nodes.md); adopting a new one is its own task there too.

A node's page shows its identity, issuer, TPM, Fleet Manager link, boot count, uptime and its CRL and OCSP addresses, the trust chain up to its Root, the certificates it has issued, its own audit log, its TSA certificates (once its time-stamp authority is on) and a form to validate a certificate chain against its CA. The buttons:

| Button | Level | What it does |
|---|---|---|
| **Issue…** | `operator` | Opens the issue form. Shown only on an established node that can issue. |
| **Config** | view `operator`, apply `admin` | Edits part of the node's config. |
| **Profiles** | `admin` to apply | Compares the node's profiles with the catalog. |
| **Re-key…** | `operator` | Gives a subordinate CA a new key. |
| **Rename…** | `admin` | Changes the node's display name. |
| **Export key…**, **Import key…** | `admin` | Backs up or restores the CA key. |
| **Decommission…** | `admin` | Wipes the node. |
| **Reboot…** | `admin` | Reboots or powers off the node. Labelled **Reboot needed…** while a staged change is waiting for one. |

{/* screenshot: fleet-manager/node-detail.png: a node's page with its fields, trust chain, certificate list and buttons */}

## Issuing and revoking certificates

The issue form takes either **Generate a key here** or **Paste a CSR**. With **Generate a key here** the browser makes the key and the request, so only the request goes to the node. You pick a profile, then select **Issue**. Live issuing takes the validity and usages from the profile (see [Known gaps in the alpha](./web-ui.md#known-gaps-in-the-alpha)).

If the browser made the key, you can then download it with **Export private key**. The download is always encrypted and needs a passphrase of at least 18 characters.

:::caution[Save the key before you leave the page]
A key made in the browser exists only in that page. If you leave without **Export private key**, it is gone, and the certificate is useless without it. Tick `I have saved the passphrase somewhere safe` only once you have.
:::

To revoke a certificate, select **Revoke** on its row in the node's list and pick a reason.

:::warning[Revoking has no undo]
The **Revoke** dialog asks only for a reason; there is no typed confirmation. Anything using the certificate stops being trusted once clients see the revocation.
:::

## Config and profile drift

**Config** loads the node's full config and lets you change the revocation base URL (CRL and OCSP), the key protection tier and the DNS servers and search domains. **Apply** sends the whole config back with only those fields changed. The result says which generation was applied and whether the node needs a reboot.

**Profiles** marks each profile `In sync`, `Drifted`, `Node only` or `Not applied`. **Apply catalog version** pushes the catalog's copy to the node.

## Re-keying a subordinate CA

The **Re-key** button, labelled with the node's name, has the node make a new key and request, gets its parent to sign the request, and installs the new chain, all in one step. A Root can't be re-keyed here, because it has no parent to sign its new key.

## Renaming a node

**Rename…** changes a node's display name: the key `ListNodes` and every `/nodes/<name>` URL use, not the subject common name on its certificate. It takes an RFC 1123 label (1 to 63 lowercase letters, digits and hyphens, starting and ending with a letter or digit), rejects a name already taken by another node, and the page follows the node to its new URL once it lands. Audit entries recorded before the rename still point at the node; they show its old name alongside the new one.

- **When it is refused:** a name that isn't an RFC 1123 label, or that has the shape of a node ID, returns error 1103. A name another node already holds returns 1102.

:::info[Renaming is not re-issuing]
A certificate's subject common name is signed material: the web UI has no field anywhere that edits it. Wanting a different subject means issuing a new certificate and retiring the old one, not a rename. See [Re-keying a subordinate CA](#re-keying-a-subordinate-ca) and [Issuing and revoking certificates](#issuing-and-revoking-certificates).
:::

## Backing up and restoring the CA key

:::danger[The backup file is the CA]
**Export key** takes the CA's private key off the node in an encrypted file, `{node}-ca-backup.enc`. Anyone with the file and the passphrase can run this CA somewhere else. Without the passphrase the backup can't be opened. Store the two apart, and type the node name or `EXPORT` to confirm only when you are ready.
:::

The passphrase must be at least 18 characters; **Generate strong passphrase** makes one. A node whose key lives in the TPM refuses the export.

**Import key** restores a backup onto a fresh node. A node that already has a CA identity refuses it.

## Decommissioning a node

:::danger[Decommission can't be undone]
**Decommission** permanently destroys the node's identity and data. The node wipes its key material and state, then reboots into maintenance. Back up the CA key first if you will ever need this CA again.
:::

To confirm, type the node's Root CA common name exactly and tick `I understand this permanently destroys the node's identity and data.` The page then says `{node} is wiping and entering maintenance.`

## Rebooting a node

A config change **Config** reports as needing a reboot, or any other change the node's page shows as reboot-needed, only takes effect once the node restarts. **Reboot…** triggers that from the Fleet Manager instead of a hypervisor hard reset.

:::warning[Every certificate operation stops until the node is back]
Rebooting an Issuing CA interrupts everything that depends on it until it restarts, or, with **Power off instead of restarting**, until the hypervisor or a person powers it back on.
:::

To confirm, type the node's CA common name exactly. A refusal, such as the node being in maintenance mode, shows with the node's own reason.

## The node's own audit log

:::info[Not the Fleet Manager's audit log]
This is the node's own record of calls to its API, distinct from the Fleet Manager's own actions (approving an enrolment, issuing, revoking and so on), which are on the [Audit](./web-operators-audit.md#audit) page instead.
:::

Every managed node keeps a signed, hash-chained audit log of every call to its API. The panel lists it oldest entry first, with the same sequence, time, actor and summary as [`cryptosctl audit list`](../using/audit-log.md#1-list-the-entries), plus the call itself under **Action** and whether it was allowed under **Outcome**. **Load more** fetches the next page.

{/* screenshot: fleet-manager/node-audit-log.png: a node's audit log panel with a few entries and the Verify chain button */}

**Verify chain** asks the node to walk its whole log the same way [`cryptosctl audit verify`](../using/audit-log.md#2-verify-the-chain) does — every entry's signature and its link to the one before it — and reports the result:

| Result | What it means |
|---|---|
| `Chain intact across N entries.` | Nothing between the first entry and entry N was changed, removed or reordered. |
| `Chain broken at sequence N: <reason>` | An entry was altered after it was written. The node keeps adding new entries after the break; nothing is repaired automatically. |

:::caution[A broken chain means the log was changed]
Leave the node as it is and read [Verify the chain](../using/audit-log.md#2-verify-the-chain) before you change anything. Don't reset the node: a reset destroys the log.
:::

See [Audit log format](../reference/audit-log.md) for what each entry holds and what a node does and doesn't record.

## TSA certificates

Shown only once [the node's time-stamp authority](../using/serve-timestamps-tsa.md) is switched on; while it isn't, the panel says so instead of listing nothing. Lists every certificate the node has issued to sign timestamp tokens, each with its serial, SHA-256 fingerprint and validity window: **Current** for the one actually signing tokens now, **Past** for a retired one the node keeps so it can still verify tokens it signed earlier.

{/* screenshot: fleet-manager/node-tsa-certificates.png: a node's TSA certificates list with one current and one past certificate */}

## Validate a certificate chain

Paste a certificate's PEM and check whether it chains to this node's CA, without leaving the console or running `openssl verify` by hand. Needs `operator` level or above — a `viewer` sees the field disabled and why.

{/* screenshot: fleet-manager/node-chain-validate.png: the chain validation form with a result showing Chains to the node's CA */}

**Validate** reports whether the certificate chains to the node's CA and, when it doesn't, why — for example, that the certificate's issuer does not match the node's CA — alongside the submitted certificate's subject and issuer and the node's own CA subject, so you can compare them directly.

## OS image lifecycle

The web equivalent of [`cryptosctl image status/stage/rollback/activate`](../reference/cryptosctl.md#image-upgrades). The **OS image** panel shows the node's running, active (next boot) and previous image digests, with a **Reboot pending** badge when the active image differs from the one currently running. Reading it needs no particular level and isn't audited.

- **Stage image…** (`admin`) takes an image URL and the detached release signature file; the manager fetches the image itself and streams it into the node, so a gigabyte-sized image never has to pass through your browser. An optional SHA-256 is checked against what the node received.
- **Activate image…** (`admin`, only once a staged image makes it **Reboot pending**) reboots the node into the staged image, with the same type-the-CA-common-name confirmation as **Reboot…**, because activating is itself a reboot.
- **Roll back…** (`admin`, only once there is a previous image) puts the retained previous image back on the boot path. The node keeps running its current image until you activate or reboot.

Staging, activating and rolling back are all audited; a refusal the node makes itself, such as a bad signature or another upgrade already running, shows inline.

{/* screenshot: fleet-manager/node-os-image.png: the OS image panel with running, active and previous digests and the three buttons */}

## SCEP challenge passwords

The web equivalent of [`cryptosctl scep challenge mint/list/revoke`](../using/enrol-devices-scep.md#2-mint-a-challenge-for-the-device). The **SCEP challenges** panel lists the node's usable challenges, each with its profile, bound names, expiry and who minted it. A `viewer` sees the list only; minting and revoking need `operator` level or above.

- **Mint challenge…** takes a profile, a TTL and optional bound names, and mints a one-time challenge password for a device to enrol with. The password is shown once, the same way an agent key is: the manager keeps only the challenge's metadata, never the password, so if you close the dialog without copying it there is no way to get it back.
- **Revoke** on a challenge's row withdraws it before it is used.

Both actions are audited by the challenge's id and profile, never the password itself.

{/* screenshot: fleet-manager/node-scep-challenges.png: the SCEP challenges list with the Mint challenge button and one row */}

## SCEP enrolment queue

The web equivalent of [`cryptosctl scep enrollments list/approve/reject`](../using/enrol-devices-scep.md#holding-enrolments-for-approval). The **SCEP enrolment queue** panel proxies the node's own queue of pending device enrolments, each with its subject, profile, SANs, key algorithm and when it arrived. A `viewer` sees the queue only; approving and rejecting need `operator` level or above.

- **Approve** issues the device a certificate under the request's profile and shows the issued serial, so you can find it again under Certificates.
- **Reject** takes a reason, recorded in the node's own audit log. The device itself is only ever told a SCEP failure code, never the reason text.

{/* screenshot: fleet-manager/node-scep-enrollments.png: the SCEP enrolment queue with one pending request and the Approve and Reject buttons */}

:::info[Not available to AI agents yet]
The OS image, SCEP challenge and SCEP enrolment RPCs behind these three panels are not exposed as MCP tools yet, so an agent can't stage an image, mint a challenge or decide an enrolment on your behalf.
:::
