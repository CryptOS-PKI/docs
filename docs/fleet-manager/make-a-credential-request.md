---
title: "🙋 Make a credential request"
---

# 🙋 Make a credential request

:::info[In flight]
This page is new in the web UI. Your admin needs a Fleet Manager that serves operator credential requests to file the CSR you make here.
:::

This page covers one task: making your own Fleet Manager operator key and certificate signing request (CSR), then building your `.p12` file once your admin sends back the signed certificate. It is for someone who doesn't have an operator certificate yet.

The **Make a credential request** page runs entirely in your browser. It needs no login and sends nothing anywhere: the key, its backup and the passphrase stay on your machine. Only the CSR goes to your admin, who files it as described in [Adding operators in the web UI](./web-operator-credentials.md).

:::caution[Before you start]
You need the Fleet Manager's address, and the access level your admin agreed to give you: `viewer`, `operator` or `admin`.
:::

## Make your key and CSR

1. Open the Fleet Manager's address. Under **Log in**, select **No operator certificate yet? Make a credential request**. The page is at `/request-credential`.
2. Enter your **Full name**, your **Email** and the **Access level**. Your email becomes your certificate's common name.
3. Select **Make my key and CSR**. The browser makes a P-384 key and a CSR, then shows a generated passphrase and **Download key backup**.

   :::danger[The passphrase is shown once]
   The passphrase appears only on this screen. Download the key backup (`fleetos-<level>-<email>.key.pem`, your private key encrypted with that passphrase) and store the passphrase in a password manager before you go on. Without both, your key is lost and you have to start again. **Continue** stays disabled until you have downloaded the backup and ticked **I have saved the passphrase**.
   :::

4. Select **Continue**. The page shows your **CSR**. Copy it, or download it as `fleetos-<level>-<email>.csr`.
5. Send the CSR to your admin with your name and the level you need. Never send the key backup or the passphrase.

:::tip[Expected output]
The CSR is a PEM block that begins `-----BEGIN CERTIFICATE REQUEST-----`. Its subject is `CN=<your email>`, and it asks for your level's profile.
:::

## Build your PKCS#12

Your admin gets the CSR signed at the operator CA, records it, and sends you the signed certificate. You can build the `.p12` file on the same page, in any browser:

1. Open `/request-credential` again and go to **2. Build your PKCS#12**.
2. Choose **Your key backup file**.
3. Paste **Your signed certificate (PEM)**. Optionally paste the **Operator CA certificate** your admin sent, to include it as the chain.
4. Enter the **Key backup passphrase** and select **Build my PKCS#12**.

:::tip[Expected output]
The browser downloads `<email>.p12`. It opens with the same passphrase as the key backup.
:::

If the page says `The certificate does not match the key in this backup`, the certificate was signed from a different CSR. Check with your admin. If it says `The passphrase is wrong or the key file is damaged`, check the passphrase.

You can build the same file with OpenSSL instead. It asks for the key backup passphrase, then for a passphrase for the `.p12` file:

```bash
openssl pkcs12 -export -inkey fleetos-<level>-<email>.key.pem -in <certificate>.crt -certfile operator-ca.crt -name "FleetOS <level> (<email>)" -out <email>.p12
```

## Install it

Install the `.p12` file in your browser's certificate store and log in, as in [Logging in](./web-ui.md#logging-in). Then keep the key backup somewhere safe, or delete it once the certificate is installed.

## Where to go next

- [The web UI](./web-ui.md): logging in and every page.
- [Adding operators in the web UI](./web-operator-credentials.md): what your admin does with your CSR.
