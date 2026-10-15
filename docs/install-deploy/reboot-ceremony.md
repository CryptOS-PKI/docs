---
title: "🔁 Reboot into the ceremony"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🔁 Reboot into the ceremony

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

After the install the node reboots from its own disk. This first real boot sets up the encrypted disk and brings the node onto its permanent address. From there, a Root is ready for its **first-boot ceremony**, where it creates its CA key inside the TPM and signs its own Root certificate. This page gets you to that point, with a trusted connection to the node; [Run the first-boot ceremony](./run-the-ceremony.md) covers the ceremony itself.

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

Until the node has its CA, it cannot present a certificate from that CA on this port. At every boot it makes a new **self-signed** management certificate that names only its IP address and `localhost`. So you pin that certificate itself, fetched from the node and checked against the node's own console. Once the node has its CA, it switches to a CA-signed certificate and you trust your root instead (see [Switch to your root after the ceremony](./run-the-ceremony.md#switch-to-your-root-after-the-ceremony)).

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

## Next step

Run the first-boot ceremony: [Run the first-boot ceremony](./run-the-ceremony.md).
