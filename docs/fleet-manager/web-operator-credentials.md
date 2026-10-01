---
title: "🪪 Adding operators in the web UI"
---

# 🪪 Adding operators in the web UI

:::info[In flight]
These screens are new in the web UI and need a Fleet Manager that serves operator credential requests. An older manager refuses them.
:::

This page covers one task: giving someone an operator certificate, and taking it away, from the web UI's **Operators** page. The Fleet Manager never signs operator certificates. Your external operator CA does (see [The operator CA and revocation](./operator-ca.md)). The web UI files a **credential request**, you get the request signed at the CA, and the web UI records the signed certificate.

If the person who needs the certificate can make their own key, have them use [Make a credential request](./make-a-credential-request.md) and send you the CSR. Their key then never leaves their machine.

:::caution[Before you start]
You need an `admin` operator certificate and a working login (see [Logging in](./web-ui.md#logging-in)). The manager needs an operator CA and `database_url`. You need someone who can sign at the operator CA, with the CA's OpenSSL config.
:::

## What the Operators page shows

The **Credentials** tab lists every operator certificate the manager knows:

| Column | What it shows |
|---|---|
| **Holder** | The certificate's common name (the holder's email) and, when recorded, their name. |
| **Level** | `viewer`, `operator` or `admin`. |
| **Kind** | How the manager learned of it: `first_admin`, `requested`, `recorded`, `observed` (seen logging in, never recorded) or `legacy_node` (from a CryptOS node before operator CAs became external; it can't log in). |
| **Issuer** | The start of the operator CA's SHA-256 fingerprint. |
| **Denylisted** | `denylisted` when it is on the manager's denylist. |
| **CRL** | `CRL-revoked` when the operator CA's CRL lists it. |
| **Last seen** | When it last logged in, for credentials the manager has seen in use. |

The **Pending requests** tab lists the requests waiting for a signed certificate, with who filed each one and when it expires. A request expires after 30 days.

## Request a credential

1. On **Operators**, select **Request credential…**.
2. Enter the holder's **Full name**, their **Email** and the **Access level**. The email becomes the certificate's common name.
3. Choose where the key is made, then select **Next**:
   - **Make the key here**: this browser makes a P-384 key and a CSR.
   - **Upload a CSR from the holder**: paste the holder's CSR or choose its file. Its subject must be exactly `CN=<the holder's email>`. The web UI refuses a CSR for anyone else.
4. With **Make the key here**, the next screen shows a generated passphrase and **Download key backup**. The key backup is the private key, encrypted with that passphrase, saved as `fleetos-<level>-<email>.key.pem`.

   :::danger[The passphrase is shown once]
   The passphrase appears only on this screen, and the manager never sees it or the key. Download the key backup and store the passphrase in a password manager before you go on. Without both the key is lost, and the request has to start again. **Continue** stays disabled until you have downloaded the backup and ticked **I have saved the passphrase**.
   :::

   Hand the key backup and the passphrase to the holder over separate channels, or keep them until you complete the request.

5. The request is filed. The screen shows the **CSR** (copy it, or download it as `fleetos-<level>-<email>.csr`, the name the signing command reads), the **OpenSSL extension section** for the level, and the **Signing command**.

:::tip[Expected output]
`Request filed for <email> (<level>). It expires <time>.` The request is listed on **Pending requests**.
:::

{/* screenshot: fleet-manager/operators-request-filed.png: the filed request with the CSR, extension section and signing command */}

## Sign the request at the CA

Give the CSR to whoever runs your operator CA. They sign it with the extension section and command from the previous step (see [The operator CA and revocation](./operator-ca.md) for the CA setup), and send back the certificate.

:::warning[The level extension must be non-critical]
The extension section the manager returns marks nothing critical except key usage and basic constraints. Sign with it as given, and never copy extensions from the CSR. A certificate with a critical level extension can't log in, and the manager refuses to record it (`LEVEL_EXT_CRITICAL`).
:::

## Complete the request

1. On **Pending requests**, select **Complete…** on the request.
2. Paste the **Signed certificate (PEM)**, or choose its file.
3. Choose where the private key is:
   - **Key backup held in this browser**: offered only in the browser tab that made the key, until you leave or reload the page.
   - **From the key backup file**: choose the `fleetos-<level>-<email>.key.pem` file.
   - **The holder has the key**: the manager records the certificate, and the holder builds their PKCS#12 themselves.
4. For the first two, enter the **Key backup passphrase**. Optionally paste the **Operator CA certificate** to include it in the PKCS#12 as the chain.
5. Select **Record and build PKCS#12** (or **Record**).

The web UI first checks that the passphrase opens the backup and that the certificate carries that key, and stops there if either is wrong. Then the manager checks the certificate and records it, and the browser builds the PKCS#12.

:::tip[Expected output]
`Recorded <email> (<level>), serial <serial>.` With a key, the browser downloads `<email>.p12`, protected with the key backup's passphrase. The credential appears on **Credentials** with kind `requested`.
:::

If the manager refuses the certificate, the dialog says why and quotes the code, for example `Certificate refused: The level extension is marked critical. It must be non-critical, or browsers can't sign in with it. (error 1610 LEVEL_EXT_CRITICAL)`. The certificate must chain to the active operator CA and must not be recorded already.

Give the holder the `.p12` file and its passphrase. They install it as in [Logging in](./web-ui.md#logging-in), then keep the key backup somewhere safe or delete it.

To record a certificate made entirely at the CA, with no request, select **Record certificate…** on **Operators**, enter the **Holder's full name** and paste the certificate.

**Cancel** on a pending request withdraws it. The manager then refuses to record a certificate against it.

## Deny a credential

1. On **Credentials**, select **Deny…** on the credential. Credentials already denylisted, and `legacy_node` ones, have no **Deny…**.
2. Choose the **Reason**: an RFC 5280 reason code from 0 to 10 (there is no 7).
3. Optionally add a **Note**. The manager keeps it with the denylist entry.
4. Select **Deny at the Fleet Manager**.

:::warning[Denying here doesn't revoke at your CA]
The manager refuses the certificate from its next request, on every manager instance within about 5 seconds. Anything else that trusts the operator CA still accepts it. Revoke it at your CA as well and publish a new CRL. The dialog repeats this, with any warning the manager returns.
:::

Denying needs `database_url`. Without it the dialog shows `Not available here` with error 1603 `DATABASE_REQUIRED`.

## Where to go next

- [Make a credential request](./make-a-credential-request.md): the page a future operator uses to make their own key and CSR.
- [The operator CA and revocation](./operator-ca.md): the CA, the CRL and the denylist.
- [The web UI](./web-ui.md): every other page.
