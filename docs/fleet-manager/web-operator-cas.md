---
title: "🏛️ Managing operator CAs in the web UI"
---

# 🏛️ Managing operator CAs in the web UI

:::info[In flight]
This page is new in the web UI and needs a Fleet Manager that serves the operator CA admin calls. An older manager refuses them.
:::

This page covers one task: looking after the external operator CAs the Fleet Manager trusts, from the web UI's **Operator CAs** page. You can register a new CA, retire an old one, and change how the manager learns about each CA's revocations. What an operator CA is, and the config keys, are in [The operator CA and revocation](./operator-ca.md).

:::caution[Before you start]
You need an `admin` operator certificate and a working login (see [Logging in](./web-ui.md#logging-in)). When the manager takes its operator CA from the config file (`operatorCAPath`), the page is read-only: it says so, offers no actions, and the manager refuses changes with error 1607. Change the config instead.
:::

## What the page shows

Each row is a CA the manager trusts or has trusted:

| Column | What it shows |
|---|---|
| **CA** | The CA's subject, any warning the manager raised (for example that a CryptOS node's CA issued it), and `from the config file` for a config CA. |
| **State** | `active` (new credentials are recorded under it), `retiring` (still trusted during a rotation) or `retired` (no longer trusted). |
| **Fingerprint** | The start of the CA certificate's SHA-256 fingerprint. |
| **Not after** | When the CA certificate expires. |
| **CRL** | The source (`url`, `upload`, `file` or `none`), the URL, the CRL's next update (marked `(expired)` once it has passed) and the last fetch error. |
| **OCSP** | The mode (`aia`, `url` or `off`), the responder URL, and the last OCSP error this manager instance saw. |

Banners above the table name what needs your attention, for the active and retiring CAs. Admins see the same banners on **Operators**.

| Banner | What it means and what to do |
|---|---|
| `CA revocations not observed` | The CA has no CRL and no OCSP. Revocations made at the CA aren't seen, so deny credentials in the Fleet Manager as well, or set a CRL source. MCP is refused under it. |
| `CA revocations seen through OCSP only` | No CRL, but OCSP is on: revocations are seen only while the responder answers. MCP is refused under it. |
| `CRL expiring` | The CRL is in the last 20% of its validity. Publish a new one at the CA, or upload it for an upload-source CA, before the time shown. |
| `CRL expired` | The CRL is past its next update. MCP is refused under the CA until a new CRL is loaded; the web UI follows `operatorRevocationPolicy`. |
| `OCSP responder unreachable` | OCSP is on, but the responder isn't answering. The message gives the error. |

## Register a CA

Registering a new CA is how you rotate: the new CA becomes `active`, and the current active CA becomes `retiring`, still trusted until you retire it. The manager refuses a new registration while a retiring CA exists (`ROTATION_IN_PROGRESS`).

1. Select **Register operator CA…**.
2. Paste the **Operator CA certificate (PEM)**, or choose the file (PEM or DER). Use the CA that directly signs operator certificates, never a CryptOS node's CA.
3. Choose the **CRL source**:
   - **URL**: the manager fetches the CRL from an http or https URL, now and on a schedule.
   - **Upload**: choose an initial CRL file. Later CRLs go through **Upload CRL…**.
   - **No CRL**: tick the acknowledgement. Revocations made at the CA aren't seen, and MCP is refused under this CA.
4. Choose the **OCSP mode**: `aia` (the default) uses the responder named in each certificate, `url` uses a **Responder URL** you give, and `off` checks no OCSP. The manager probes a `url` responder before it accepts it.
5. Select **Check the CA**. The manager checks the certificate, fetches or verifies the CRL, and shows a preview: subject, issuer, expiry, CRL status, the OCSP probe result for `url`, any warnings and the full SHA-256 fingerprint.
6. On the CA machine, print the CA certificate's fingerprint:

   ```bash
   openssl x509 -in operator-ca.crt -noout -fingerprint -sha256
   ```

7. Paste the output into **Paste the fingerprint from the CA machine**.

   :::danger[Trusting a CA lets its key sign in as admin]
   Anyone who holds the key of a CA you trust can sign themselves an admin certificate. **Confirm and trust this CA** stays disabled until the pasted fingerprint matches the preview. If it doesn't match, stop: you have the wrong certificate, or someone swapped it.
   :::

8. Select **Confirm and trust this CA**.

:::tip[Expected output]
The dialog closes and the list shows the new CA as `active`, and the previous active CA as `retiring`.
:::

If the manager refuses, the dialog says why and quotes the code, for example `Operator CA refused: That is a CryptOS node's CA. ... (error 1605 IS_NODE_CA)`.

## Change the CRL source

1. Select **CRL source…** on the CA.
2. Choose **URL**, **Upload** (with an initial CRL file) or **No CRL** (with the acknowledgement), then **Save**.

The manager verifies a new URL or CRL against the CA before saving it.

:::warning[No CRL cuts off MCP]
Switching a CA to no CRL makes every MCP key bound to its certificates fail on its next call, and the manager stops seeing revocations made at the CA.
:::

## Upload a CRL

For a CA whose source is **Upload**, select **Upload CRL…**, choose the CRL file (PEM or DER) and select **Upload**. The CRL must be signed by the CA and newer than the one the manager holds (`CRL_ROLLBACK` otherwise). Upload a new one before the next update shown on the page.

## Set the OCSP mode

Select **OCSP…**, choose the mode and, for `url`, the **Responder URL**, then **Save**. For `url` the dialog shows who signed the probe response: the CA itself or a delegated responder, and how long that responder certificate is valid. OCSP only ever adds revocations; it never overrides the denylist or the CRL.

## Retire a CA

1. Select **Retire…** on the CA.
2. Read the warning. If your own certificate comes only from this CA, retiring it signs you out for good: the manager refuses unless you tick **Retire it even if this would lock myself out**.
3. Select **Retire this CA**.

:::danger[Retiring stops every certificate under the CA]
Every certificate the CA issued is refused from its next request, and MCP keys bound to them stop working. The manager refuses to retire the last active CA (error 1609): register its replacement first.
:::

## Where to go next

- [The operator CA and revocation](./operator-ca.md): the CA, the CRL, the denylist and the config keys.
- [Adding operators in the web UI](./web-operator-credentials.md): requesting and denying operator certificates.
