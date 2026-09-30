---
title: "🔁 Reboot into the ceremony"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🔁 Reboot into the ceremony

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

After the install the node reboots from its own disk. This first real boot sets up the encrypted disk and brings the node onto its permanent address. Then, for a Root, you run the **first-boot ceremony**: the node creates its CA key inside the TPM and signs its own Root certificate.

## The first boot from disk

The console shows each stage as it finishes, and marks the stage that failed if something goes wrong:

1. **state volume.** The `cryptos-state` partition is still empty, so the node formats it as an encrypted LUKS2 volume, seals the volume key, and creates a filesystem inside it. On every later boot it just unseals and opens it.
2. **configuration.** The node reads the config staged on the boot partition, saves it into the encrypted volume, and deletes the staged copy. From now on the copy inside the encrypted volume is the only one.
3. **network.** It sets its hostname from `metadata.name` and configures `network.interface` with the static `network.address` and `network.gateway`.
4. **embedded etcd.** It starts the node's internal database.
5. **management API.** It opens the mutual-TLS API on `network.address`, port 443.

A boot step that fails stops the boot and the node restarts. There is no shell to fall back to.

## Trust the node's management certificate

Every call to an installed node is mutual TLS. `cryptosctl` proves who you are with the bootstrap identity in `~/.cryptos/`, and it checks the node against a pinned certificate given with `--trust`.

:::danger[The first pin is trust on first use]
The first fetch of the node's certificate is trust on first use. Take it from a machine on the node's management network, over a path you control. The [management trust guide](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/management-trust.md) in the `cryptos` repository goes through what the pin does and does not prove.
:::

The node does not present a certificate from its CA on this port. At every boot it makes a new **self-signed** management certificate that names only its IP address and `localhost`. So you pin that certificate itself, fetched from the node:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
openssl s_client -connect 192.0.2.10:443 -servername 192.0.2.10 </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > node-trust.pem
openssl x509 -in node-trust.pem -noout -subject -issuer -ext subjectAltName
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
'' | openssl s_client -connect 192.0.2.10:443 -servername 192.0.2.10 2>$null |
  openssl x509 -outform PEM -out node-trust.pem
openssl x509 -in node-trust.pem -noout -subject -issuer -ext subjectAltName
```

</TabItem>
</Tabs>

Check that the subject and issuer match (it is self-signed) and that the names are the node's IP and `localhost`. Then pass `--trust node-trust.pem`, or copy the file over `~/.cryptos/trust.crt` to make it the default.

Keep two things in mind:

- **Use the IP address** in `--endpoint`. The certificate has no DNS names. If you must connect through a DNS name, add `--server-name 192.0.2.10`.
- **The pin goes stale on every reboot.** Fetch it again after any restart, upgrade or power event. A stale pin fails closed with `x509: certificate signed by unknown authority`.

## Check the node

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem status
```

:::tip[Expected output]
The node is installed and ready for its ceremony.

```text
Role:            ROOT
Identity:        NONE
TPM:             OK
etcd:            OK
Boot count:      1
Version:         <the image version>
Revocation:      NOT_CONFIGURED
DNS:             MACHINE_CONFIG 192.0.2.53
```
:::

`Identity: NONE` means the node is ready for its ceremony. On a `nodeid` image the TPM line reads `UNAVAILABLE`. `Revocation` stays `NOT_CONFIGURED` until you set `pki.revocation_base_url`, and `DNS` shows where the node's name servers came from (`MACHINE_CONFIG` or `DHCP_LEASE`).

## Run the first-boot ceremony

Send the same machine config again. The ceremony uses it for the Root's name, key type and lifetime:

:::danger[The ceremony runs once]
The Root's name, key type and lifetime are fixed by this run. Check `root.yaml` first: the only way to redo it is `cryptosctl reset`, which erases the CA key.
:::

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem ceremony start --config root.yaml
```

:::tip[Expected output]
Each line is a step of the ceremony as it finishes. `COMPLETE` means the Root exists.

```text
KEY_CREATED      tpm_public=<size> bytes
CERT_SIGNED      cert_sha256=<SHA-256 of the new Root certificate>
MANIFEST_WRITTEN manifest_id=<ceremony ID>
ADMIN_ROTATED    admin_cert_sha256=<SHA-256 of your bootstrap certificate>
COMPLETE
```
:::

Step by step, the node:

1. checks that your client certificate is the bootstrap admin named in the config;
2. saves the config and creates the CA key inside the TPM (or in software on a `nodeid` image);
3. self-signs the Root certificate with that key;
4. writes a signed **ceremony manifest** that records what happened, for audit;
5. makes your bootstrap identity the node's standing administrator.

The ceremony runs once. After it succeeds, running it again fails with `IDENTITY_EXISTS`, and only one ceremony can run at a time. It is only for the `root` role: an `intermediate` or `issuing` node refuses it, because a subordinate CA must be signed by its parent instead.

## Check the Root

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem identity show
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem identity validate
```

`identity show` prints the subject, issuer, serial, validity and SHA-256 of the Root certificate; add `-o pem` to get the certificate itself, ready to hand to the systems that should trust it. `identity validate` checks the chain and prints `OK: certificate chain validates`.

## Subordinate nodes

An `intermediate` or `issuing` node skips the ceremony. On its first boot it creates its CA key and a certificate signing request (CSR) by itself, and `status` shows `Identity: AWAITING_CERT`. You then carry the CSR to the parent and the signed chain back:

1. `cryptosctl ca get-subordinate-csr` on the new node.
2. `cryptosctl ca sign-subordinate --csr <file> --profile <profile>` on the parent.
3. `cryptosctl ca submit-subordinate-cert --chain <file>` on the new node.

The flags are in the [cryptosctl command reference](../reference/cryptosctl.md).

## Restarting a node

When a node needs a restart, use its orderly shutdown instead of a hypervisor hard reset:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem reboot --confirm "Example Root CA G1"
```

`--confirm` must be the node's CA common name. The node stops its listeners, closes its database and audit log, and locks the encrypted volume before it restarts. Add `--power-off` to turn it off instead.
