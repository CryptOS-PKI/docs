---
title: "🆔 Make your admin identity"
---

# 🆔 Make your admin identity

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Create the admin key and certificate you use to run the ceremony.

A CryptOS node has no user accounts and no passwords. It trusts exactly one client certificate: the **bootstrap admin** named in its machine config. You make that identity on your own workstation with `cryptosctl bootstrap`, put the certificate in the config, and keep the key. The same identity runs the ceremony and every command after it.

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::info[Before you start]
- `cryptosctl` on your workstation; see [Bootstrap and apply config](../install-deploy/bootstrap-apply.md) for where to get it.
- Nothing else. `bootstrap` does not contact a node.
:::

## 1. Make the identity

```bash
cryptosctl bootstrap --common-name "Example Org bootstrap admin"
```

:::caution[This overwrites an existing identity]
`bootstrap` writes `identity.crt` and `identity.key` into `~/.cryptos/` and replaces any files already there, without asking. If you already manage a node with the identity in that folder, the old key is gone and that node no longer accepts you. Use `--out-dir` to make a second identity somewhere else.
:::

:::tip[Expected output]
The key and certificate are written. The SHA-256 is the certificate's fingerprint, and the PEM block after it is the certificate itself.

```text
wrote /home/you/.cryptos/identity.crt
wrote /home/you/.cryptos/identity.key
SHA-256: 8748ee3c8a8a55e3c89fee5f71b70ddd99fcb6e8865d17271469d4221b7cecd0

Stamp into machine config under bootstrap.admin_cert_pem (or admin_cert_sha256):
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
```
:::

What you get:

- **An ECDSA P-256 private key**, `identity.key`. It never leaves your workstation.
- **A self-signed client certificate**, `identity.crt`, with the common name you chose and the client-authentication usage only.
- Both files are readable by you alone.

The options, with their defaults, are in the [cryptosctl command reference](../reference/cryptosctl.md):

- `--common-name` names the certificate. Pick a name that says whose identity it is; it is recorded in the node's audit log.
- `--out-dir` writes the files somewhere other than `~/.cryptos/`.
- `--validity` sets how long the certificate lasts, as a duration such as `8760h` (one year, the default) or `17520h`.

:::caution[The certificate expires]
The node checks your certificate like any other: once `--validity` runs out, it refuses the connection. The alpha has no documented, tested way to swap in a new admin certificate on a running node yet, so pick a lifetime that covers how long you will run the node.
:::

:::danger[identity.key is the key to the node]
Whoever holds `identity.key` administers every node that trusts this certificate: they can apply config, sign subordinate CAs, revoke certificates, export the CA key where that is allowed, and reset the node. Keep it on a machine you control, back it up somewhere safe, and never copy it to the node or share it.
:::

## 2. Put the certificate in the machine config

Paste the certificate into the `bootstrap` section of the node's machine config as `admin_cert_pem`:

```yaml
bootstrap:
  admin_cert_pem: |
    -----BEGIN CERTIFICATE-----
    MIIB...
    -----END CERTIFICATE-----
```

Indent every line of the PEM block the same amount under `admin_cert_pem: |`. The config must hold exactly one certificate there.

:::warning[Use admin_cert_pem on a node you will install]
The config schema also takes `admin_cert_sha256` (the fingerprint) instead of the certificate. `cryptosctl` and the maintenance installer accept it, but an installed node needs the whole certificate to bring up its management API. With only the fingerprint, the first boot from disk stops with `the mTLS listener needs the full bootstrap admin certificate (PEM), not just a fingerprint`, and the node restarts. Use `admin_cert_pem`.
:::

The rest of the config (role, network, CA name and install disk) is covered in [Bootstrap and apply config](../install-deploy/bootstrap-apply.md) and the [machine config reference](../reference/machine-config.md).

## 3. Check the certificate

Before you send the config, confirm the certificate in it is the one you just made. openssl prints the same fingerprint `bootstrap` did:

```bash
openssl x509 -in ~/.cryptos/identity.crt -noout -subject -enddate -fingerprint -sha256
```

:::tip[Expected output]
The subject is your common name, the end date is your validity, and the fingerprint is the SHA-256 from step 1, written in upper case with colons. The exact layout differs between openssl versions: the subject may read `CN=Example Org bootstrap admin` or `/CN=Example Org bootstrap admin`, and the fingerprint label `SHA256` or `sha256`.

```text
subject=<your common name>
notAfter=<one year from now>
sha256 Fingerprint=87:48:EE:3C:...
```

If the fingerprint differs from the one `bootstrap` printed, this is not the certificate you just made. Stop and find out which file you are looking at before you put anything in the config.
:::

## Next step

Send the config to a node in maintenance mode: [Bootstrap and apply config](../install-deploy/bootstrap-apply.md). Once the node is installed, [set up cryptosctl](./setup.md) to reach it.
