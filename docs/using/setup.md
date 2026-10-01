---
title: "⚙️ Setup"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# ⚙️ Setup

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Point cryptosctl at a node: endpoint, identity, trust, and the local socket.

Every `cryptosctl` command that talks to a node needs to know three things: **where** the node is, **who you are**, and **which certificate the node must show**. This page sets up all three once, so later commands stay short.

`cryptosctl` runs on Linux and macOS.

:::info[Before you start]
- `cryptosctl` on your workstation. Download it from a `cryptos` GitHub Release or build it; see [Bootstrap and apply config](../install-deploy/bootstrap-apply.md).
- An installed node and its management IP address (the `network.address` in its machine config).
- Your bootstrap admin identity. If you don't have one yet, [make it first](./bootstrap.md).
- Access to the node's console (the screen or the hypervisor console), to read its fingerprint.
:::

## The three things cryptosctl needs

| What | Flag | Default |
|---|---|---|
| The node's address | `--endpoint` | `localhost:443` |
| Your identity (certificate and key) | `--identity`, `--identity-key` | `~/.cryptos/identity.crt`, `~/.cryptos/identity.key` |
| The node's pinned certificate | `--trust` | `~/.cryptos/trust.crt` |

Everything is mutual TLS 1.3. `cryptosctl` shows your certificate to the node, and it only talks to a node that presents exactly the certificate in `--trust`. The full list of global flags is in the [cryptosctl command reference](../reference/cryptosctl.md).

## 1. Check your identity files

`cryptosctl bootstrap` writes your identity into `~/.cryptos/`: `identity.crt` (your certificate) and `identity.key` (your private key). Every other command looks there by default. If you keep them somewhere else, pass `--identity` and `--identity-key` on every call.

## 2. Check you can reach the node

The management API listens on port 443 of the node's `network.address`. Check the port answers from your workstation:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
nc -vz 192.0.2.10 443
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
Test-NetConnection -ComputerName 192.0.2.10 -Port 443
```

</TabItem>
</Tabs>

:::tip[Expected output]
`nc` reports a successful connection, or `Test-NetConnection` shows `TcpTestSucceeded : True`. If it fails, the node is not up yet or something between you and the node blocks the port. Fix that before going on.
:::

## 3. Pin the node's management certificate

Until the node has its CA, it cannot present a certificate from that CA on port 443. At every boot it makes a new **self-signed** certificate that names only its IP address and `localhost`. You pin that certificate itself. Once the node has its CA, see [Trust the root once the node has its CA](#trust-the-root-once-the-node-has-its-ca).

First read the **Mgmt SHA-256** line on the node's console. It is the fingerprint of this boot's management certificate, in groups of four hex digits. Then fetch the certificate and check it against that value in one step:

:::caution[Take the fingerprint from the console, not from the network]
Without `--expect-sha256`, `trust fetch` saves whatever answered on that address, and the pin only proves later calls reach the same endpoint, not that it is your node. Anything you send afterwards, such as a machine config, goes to whoever answered. Always pass the console value.
:::

```bash
cryptosctl --endpoint 192.0.2.10:443 trust fetch \
  --expect-sha256 "2D71 1642 B726 B044 0162 7CA9 FBAC 32F5 C853 0FB1 903C C4DB 0225 8717 921A 4881"
```

:::tip[Expected output]
The certificate matched the console and was saved as your default pin.

```text
Subject:    <the node's self-signed subject>
Issuer:     <the same as the subject>
SANs:       192.0.2.10, localhost
Not after:  <expiry>
SHA-256:    2D71 1642 B726 B044 ...
Saved to:   /home/you/.cryptos/trust.crt
Pin verified: the SHA-256 matches --expect-sha256.
```

If the fingerprint does not match, the command fails with `does not match --expect-sha256` and saves nothing. Stop and find out what is answering on that address.
:::

Spaces, colons and case in `--expect-sha256` are ignored, so the `AB:CD:...` form openssl prints works too. No client certificate is needed for the fetch. The [management trust guide](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/management-trust.md) in the `cryptos-node` repository explains what the pin does and does not prove, and how to get the same certificate with openssl.

### Several nodes

`trust fetch` writes to the `--trust` path, so give each node its own file and pass it on every call:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust ~/.cryptos/root-1.crt trust fetch --expect-sha256 "<Mgmt SHA-256>"
cryptosctl --endpoint 192.0.2.10:443 --trust ~/.cryptos/root-1.crt status
```

:::caution[The pin goes stale on every reboot]
The node makes a new management certificate at every boot: a restart, `image activate`, a power event or a hypervisor restart. After any of them, calls fail with `x509: certificate signed by unknown authority`. Run `trust fetch` again with the new console value. A stale pin fails closed; it never lets a wrong connection through.
:::

### Trust the root once the node has its CA

After the Root's ceremony, or once a subordinate's certificate is accepted, the node switches with no restart to a management certificate signed by its own CA, followed by its CA chain up to the root. The key still changes on every boot, but the chain does not, so trust the root instead of a pin. The self-signed pin stops working at the switch, and the console's serving dashboard shows `Mgmt cert  CA-signed, trust the CA` under the fingerprint.

Use the root certificate you already hold with `--trust`:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust ~/.cryptos/root.pem status
```

For a new Root, [Switch to your root after the ceremony](../install-deploy/reboot-ceremony.md#switch-to-your-root-after-the-ceremony) shows how to read the root off the node and check it against the ceremony output.

:::caution[Don't keep a CA-signed certificate as a pin]
`trust fetch` still saves whatever certificate the node presents, including a CA-signed one, and that pin goes stale at the next reboot like any other. Use the root.
:::

## 4. Use the IP address

Before the node has its CA, the management certificate has no DNS names. After that, it carries the IP and any names in `pki.est.hostnames`. Connecting by IP works in both cases:

```bash
cryptosctl --endpoint 192.0.2.10:443 status
```

If you have to go through a DNS name the certificate does not carry, add `--server-name` with the node's IP, so the name checked is the one the certificate carries:

```bash
cryptosctl --endpoint pki-root.example.org:443 --server-name 192.0.2.10 status
```

## 5. Check the connection

`version` prints your `cryptosctl` build, and with `--endpoint` it also asks the node for its version. It is a quick way to see that the connection works and that your CLI and the node's image match:

```bash
cryptosctl --endpoint 192.0.2.10:443 version
```

:::tip[Expected output]
The client lines describe your binary, and the node line proves the mutual TLS call worked.

```text
Client version:  <version>
Client commit:   <commit>
Client built:    <build date>
Go version:      <go version>
Node version:    <the node's image version>
```

If the call fails with `load client identity`, the identity files are missing or unreadable (step 1). `x509: certificate signed by unknown authority` means the pin is stale or wrong (step 3). An error that the certificate is not valid for the name you used means you connected by DNS name without `--server-name` (step 4).
:::

## Two other ways to connect

- **`--insecure`** is for a node in **maintenance mode** only. It has no identity yet, so `cryptosctl` sends no client certificate and does not check the node's. Use it to install a node, as in [Bootstrap and apply config](../install-deploy/bootstrap-apply.md); never for an installed node.
- **`--socket /run/cryptos.sock`** talks to the node's local socket with no TLS and no client certificate. It only exists on the node itself, which has no shell, so it is used by software running on the node, such as its console. From a workstation you always use `--endpoint`.

## Output formats

Add `-o json` or `-o yaml` for output a script can read. `identity show` also takes `-o pem`. The default is `human`.

## Next step

[Check the node's status](./status.md), or if the node has no identity yet, [start the ceremony](./ceremony-start.md).
