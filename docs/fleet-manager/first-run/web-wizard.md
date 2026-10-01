---
title: "🧭 First run in the web UI"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🧭 First run in the web UI

This page covers one task: stages 2 to 4 of [first run](./index.md) in the browser instead of with `curl`. The web UI's first-run wizard makes the same `BootstrapService` calls, and adds a key made in the browser with an encrypted key backup, so you never handle a private key file by hand unless you want to.

:::caution[Before you start]
You need everything in the [prerequisites](./index.md#prerequisites) except `curl`, and an operator CA from [stage 1](./create-operator-ca.md) or your own. You also need to read the Fleet Manager's log.
:::

## What the start page does first

Before it shows the sign-in, the web UI asks the manager whether first run is open:

| Answer | What you see |
|---|---|
| Closed, or the operator CA comes from the config file | The normal sign-in. |
| Open | The web UI first checks whether your browser already presents an admin certificate from the registered CA. If it does, you're signed in and first run closes. Otherwise the first-run wizard opens. |
| Unavailable | A note saying why (no `database_url`, or `firstRun: disabled`), then the normal sign-in, which refuses everyone until you set `operatorCAPath`. |

The wizard's session lives only in the open tab: never in a cookie or browser storage. Reloading the page or closing the tab ends it, and you start again with the newest token from the log.

## Step 1: Token

:::danger[Compare the fingerprint before you type the token]
The wizard opens with this warning. Open the certificate details from the browser's address bar and compare its SHA-256 fingerprint with the `server certificate SHA-256` line in the log (see [stage 2](./start-first-run.md)). If they differ, stop: someone may be intercepting the connection, and the token you type would be theirs.
:::

Find the newest token:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
docker logs <container> 2>&1 | grep 'bootstrap token'
journalctl -u fleet-manager | grep 'bootstrap token'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
docker logs <container> 2>&1 | Select-String 'bootstrap token'
```

</TabItem>
</Tabs>

Paste it into **Bootstrap token** and select **Start first run**. A refused token shows `Bootstrap token not accepted` (error 1600): take the newest one. If the page says `First run was already started` and it wasn't you, carry on with the newest token: that ends the other session, and registering your own CA retires theirs.

The session ends after 15 minutes without a call. If it ends, select **Session ended? Start again with a new token**.

## Step 2: Operator CA

1. Paste the **Operator CA certificate (PEM)**, or choose the file.
2. Choose the **CRL source**: **URL**, **Upload** (with an initial CRL file), or **No CRL** with the acknowledgement. Stage 3 explains [what each choice means](./register-operator-ca.md).

   :::warning[No CRL means CA revocations aren't seen]
   With no CRL the manager doesn't see revocations made at the CA, and MCP is refused for certificates under it.
   :::

3. Choose the **OCSP mode**: `aia` (the default), `url` with a **Responder URL** (probed now), or `off`.
4. Select **Check the CA** and review the preview: subject, issuer, expiry, CRL status, warnings and the SHA-256 fingerprint.
5. On the CA machine, run the command below and paste its output into **Paste the fingerprint from the CA machine**:

   ```bash
   openssl x509 -in operator-ca.crt -noout -fingerprint -sha256
   ```

   :::danger[Confirm only your own CA]
   Whoever holds the key of the CA you confirm can sign themselves an admin certificate. **Confirm and trust this CA** stays disabled until the pasted fingerprint matches.
   :::

6. Select **Confirm and trust this CA**.

If a CA is already registered from an earlier session, the wizard shows it instead. Paste the fingerprint and select **Confirm this CA**, or **Register a different CA** if it isn't yours.

## Step 3: First admin certificate

**Path A (recommended)** makes the key here:

1. Enter your **Full name** and **Email** (the certificate's CN), then select **Make my admin key and CSR**.

   :::danger[The passphrase is shown once]
   Download the key backup (`fleetos-admin-<email>.key.pem`, your key encrypted with the passphrase) and store the passphrase in a password manager. The passphrase appears only on this screen and also protects the PKCS#12. **Continue** stays disabled, and the CSR isn't shown, until the backup is downloaded and you tick **I have saved the passphrase**.
   :::

2. Select **Continue**. Take the **CSR** (`fleetos-admin-<email>.csr`) to the CA and sign it with the **Admin extension section** and **Signing command** shown, as in [stage 4](./first-admin-certificate.md).

   :::warning[The level extension must be non-critical]
   Sign with the section as given and never copy extensions from the CSR. A critical level extension can't sign in, and the manager refuses it (`LEVEL_EXT_CRITICAL`).
   :::

3. Paste the **Signed admin certificate (PEM)**, enter the **Key backup passphrase**, and select **Record and build PKCS#12**. The browser checks the certificate carries your key, the manager records it, and the browser downloads `<email>.p12`, protected with the key backup's passphrase, with the operator CA as the chain.

:::caution[If the session ends while you are at the CA]
Start again with the newest token and confirm the CA again. On path A, enter your name and email, select **I already have a key backup**, choose the backup file and continue from step 3.
:::

**Path B** shows the **Admin extension section** and the **OpenSSL commands** for making the key, CSR, certificate and PKCS#12 yourself, as in [stage 4](./first-admin-certificate.md). The optional **pre-flight** sends only the signed certificate, so the manager checks it now. Then select **Continue to install** or **Skip to install**.

## Step 4: Install

The wizard shows how to import the `.p12` on Windows, macOS, Linux and Firefox, the same as [Logging in](../web-ui.md#logging-in). Import it, select **Reload and sign in**, and choose the certificate when the browser asks. If it doesn't ask, quit the browser fully and start it again: Chrome remembers a "no certificate" answer for a site.

:::tip[Expected output]
The Dashboard opens with your email at the top right. Your first sign-in as admin closes first run, and from then on the start page shows the normal sign-in.
:::

Keep the key backup somewhere safe, or delete it once the certificate is installed.

## Where to go next

- [Adding operators in the web UI](../web-operator-credentials.md): give the next people their certificates.
- [Managing operator CAs in the web UI](../web-operator-cas.md): CRLs, OCSP and rotating the CA.
