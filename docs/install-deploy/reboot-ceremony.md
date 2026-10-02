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

Until the node has its CA, it cannot present a certificate from that CA on this port. At every boot it makes a new **self-signed** management certificate that names only its IP address and `localhost`. So you pin that certificate itself, fetched from the node and checked against the node's own console. Once the node has its CA, it switches to a CA-signed certificate and you trust your root instead (see [Switch to your root after the ceremony](#switch-to-your-root-after-the-ceremony)).

### Read the fingerprint off the console

Once the node is up, its console (the physical screen or the hypervisor console) shows that it is waiting for its ceremony, what to do next, and the SHA-256 of this boot's management certificate:

```text
Awaiting ceremony
Fetch trust, then start the ceremony

Mgmt SHA-256   2D71 1642 B726 B044 0162 7CA9 FBAC 32F5
               C853 0FB1 903C C4DB 0225 8717 921A 4881
               check 2/2: compare with the web console
Mgmt cert      self-signed, compare the fingerprint
```

**check 2/2** is the second fingerprint check of a Fleet Manager adoption. Without a Fleet Manager, compare the fingerprint with `trust fetch --expect-sha256` as below.

The fingerprint is shown in the same form after the ceremony, on the serving dashboard. It changes on every boot, like the certificate.

The title and hint follow the node's state until it has its CA:

| Node | Title | Hint |
|---|---|---|
| Root waiting for its ceremony | `Awaiting ceremony` | `Fetch trust, then start the ceremony` |
| Root whose ceremony has started | `Ceremony in progress` | `Wait, or start it again if it failed` |
| Intermediate or issuing node waiting for its parent | `Awaiting parent certificate` | `Fetch trust, then get the CSR signed` |

The fingerprint is on all three screens, so you check the pin the same way on a subordinate.

### Fetch the certificate

:::danger[Verify the fingerprint before the first ceremony]
The ceremony runs over this pin, and the Root certificate it returns is the one you publish. If you skip the check, whatever answered the fetch could hand you a Root that isn't your node's. Always pass the console's value to `--expect-sha256`, and never run `ceremony start` over a pin you haven't checked. The [management trust guide](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/management-trust.md) in the `cryptos-node` repository goes through what the pin does and does not prove.
:::

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem \
  trust fetch --expect-sha256 "2D71 1642 B726 B044 0162 7CA9 FBAC 32F5 C853 0FB1 903C C4DB 0225 8717 921A 4881"
```

`trust fetch` saves the certificate to `node-trust.pem` only when its SHA-256 matches the value you read off the console. Spaces, colons and case don't matter. Any other certificate fails the fetch and nothing is saved.

Without `cryptosctl` at hand, openssl fetches the same certificate. Compare the SHA-256 it prints with the console before you use the file:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
openssl s_client -connect 192.0.2.10:443 -servername 192.0.2.10 </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > node-trust.pem
openssl x509 -in node-trust.pem -noout -subject -issuer -fingerprint -sha256 -ext subjectAltName
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
'' | openssl s_client -connect 192.0.2.10:443 -servername 192.0.2.10 2>$null |
  openssl x509 -outform PEM -out node-trust.pem
openssl x509 -in node-trust.pem -noout -subject -issuer -fingerprint -sha256 -ext subjectAltName
```

</TabItem>
</Tabs>

Check that the subject and issuer match (it is self-signed) and that the names are the node's IP and `localhost`. Then pass `--trust node-trust.pem`, or copy the file over `~/.cryptos/trust.crt` to make it the default.

Keep two things in mind:

- **Use the IP address** in `--endpoint`. The certificate has no DNS names. If you must connect through a DNS name, add `--server-name 192.0.2.10`.
- **The pin goes stale on every reboot** while the node has no CA. Fetch it again, checked against the console, after any restart, upgrade or power event. A stale pin fails closed with `x509: certificate signed by unknown authority`.

## Check the node

`cryptosctl` runs on Linux and macOS.

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

While it runs, the console shows `Ceremony in progress`. A run that fails before `COMPLETE` leaves that screen up; fix the cause and run `ceremony start` again.

The ceremony runs once. After it succeeds, running it again fails with `IDENTITY_EXISTS`, and only one ceremony can run at a time. It is only for the `root` role: an `intermediate` or `issuing` node refuses it, because a subordinate CA must be signed by its parent instead.

## Switch to your root after the ceremony

As soon as the node has its CA, the management listener stops presenting the self-signed certificate. From the next connection on, with no restart, it presents a certificate signed by the node's own CA, followed by the node's CA chain up to the root. The console follows within about 30 seconds.

That certificate:

- gets a new key on every boot, like before, but always chains to your root;
- names the node's `network.address` IP and every name in `pki.est.hostnames`, and no longer `localhost`;
- is valid for 90 days (never past the CA's own expiry) and is renewed at the halfway point;
- is a server certificate only (`serverAuth`), never a CA.

:::caution[The pin you used for the ceremony stops working]
The self-signed pin in `node-trust.pem` no longer matches once the ceremony commits. Any call with it fails with `x509: certificate signed by unknown authority`. Follow the steps below instead of fetching the old certificate again.
:::

The serving dashboard shows the change under the fingerprint: the **Mgmt cert** line changes from `self-signed, compare the fingerprint` to:

```text
Mgmt SHA-256   ....
Mgmt cert      CA-signed, trust the CA
```

From now on, trust the root instead of a pin. To get it, fetch this boot's CA-signed certificate once, checked against the console as before, read the Root certificate over it, and check the Root against the `cert_sha256` the ceremony printed:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem \
  trust fetch --expect-sha256 "<Mgmt SHA-256 on the console now>"
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem identity show -o pem > root.pem
openssl x509 -in root.pem -noout -fingerprint -sha256
```

:::danger[Check the Root fingerprint before you rely on root.pem]
The SHA-256 openssl prints must equal the `cert_sha256` from the ceremony's `CERT_SIGNED` line (openssl adds colons; ignore them and case). If it doesn't, don't use the file: something other than your node answered.
:::

Then use `root.pem` for every call. It keeps working across reboots and image upgrades. Address the node by its IP or by a name in `pki.est.hostnames`; for any other name, add `--server-name 192.0.2.10`.

:::caution[Don't keep a CA-signed certificate as a pin]
`trust fetch` saves the CA-signed management certificate itself, and that stops matching at the next reboot because the key changes. Use it only to read the root, as above.
:::

## Check the Root

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem identity show
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem identity validate
```

`identity show` prints the subject, issuer, serial, validity and SHA-256 of the Root certificate; add `-o pem` to get the certificate itself, ready to hand to the systems that should trust it. `identity validate` checks the chain and prints `OK: certificate chain validates`.

## Subordinate nodes

An `intermediate` or `issuing` node skips the ceremony. On its first boot it creates its CA key and a certificate signing request (CSR) by itself, and `status` shows `Identity: AWAITING_CERT`. Its console shows `Awaiting parent certificate` and its management certificate SHA-256 until the chain is committed. You then carry the CSR to the parent and the signed chain back:

:::caution[Check the pin before you fetch the CSR]
Fetch the new node's pin with `trust fetch --expect-sha256` and the value on its console, as [above](#fetch-the-certificate). An unchecked pin could hand you a CSR from a machine that isn't your node, and the parent would then sign a CA for it.
:::

1. `cryptosctl ca get-subordinate-csr` on the new node.
2. `cryptosctl ca sign-subordinate --csr <file> --profile <profile>` on the parent.
3. `cryptosctl ca submit-subordinate-cert --chain <file>` on the new node.

Once the chain is committed, the subordinate switches to a CA-signed management certificate too, [as a Root does](#switch-to-your-root-after-the-ceremony), and its self-signed pin stops working. Its chain runs up to your root, so `--trust root.pem` works for it at any depth, with the root you already hold.

The flags are in the [cryptosctl command reference](../reference/cryptosctl.md).

## Restarting a node

When a node needs a restart, use its orderly shutdown instead of a hypervisor hard reset:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem reboot --confirm "Example Root CA G1"
```

`--confirm` must be the node's CA common name. The node stops its listeners, closes its database and audit log, and locks the encrypted volume before it restarts. Add `--power-off` to turn it off instead.
