---
title: "🔐 Pinning a node's certificate"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🔐 Pinning a node's certificate

:::tip[Works today]
The Fleet Manager checks a node's server certificate when you pin it. A pin lasts until the node's next reboot, so you renew it after each one.
:::

This page covers one task: making the Fleet Manager check that it reached your node, and keeping that check working when the node reboots. What the Fleet Manager is, and how nodes join it, is in the [Fleet Manager overview](./overview.md).

## What each side checks

The manager talks to each node over mutual TLS, and the two sides check different things.

| Side | What it checks | When |
|---|---|---|
| The node | The manager's admin certificate, against the admin trust in the node's config. | Always. A manager without the right admin key is refused. |
| The manager | The node's management server certificate, against a pinned copy. | Only when you pin the node. |

A node you haven't pinned is still reached, but the manager doesn't check which server answered. It logs this once per node:

```text
nodeclient: node pki-root has no pinned server certificate (/var/lib/cryptos-manager/node-creds/pki-root/server.crt); its server certificate is not verified
```

## Why the pin changes on every boot

A node makes a new key and certificate for its management API every time it boots. Before the node has its CA, that certificate is self-signed. Once it has its CA, the node signs it with that CA, but the key and fingerprint still change on every boot. The manager compares the whole certificate with the pin, so either way a pin holds until the node's next reboot. After that the manager refuses the node until you pin its new certificate.

:::info[Checking the CA chain instead of a pin]
Because a node with a CA now presents a certificate its CA signs, it can be checked against the node's CA chain, which does not change on reboot. The manager does not do that yet; it comes with a later Fleet Manager release. Until then, pin and re-pin as described here.
:::

When you [adopt a node](./overview.md#adopting-a-new-node), the fingerprint you confirm pins the node's maintenance-mode certificate for the adoption steps up to the install. The installed node boots with a new certificate, and the manager doesn't check it unless you pin it.

## Before you start

:::caution[Before you start]
You need access to the node's console, to read its fingerprint, and to the manager's node credentials folder, to write the pin. `openssl` works the same on Linux, macOS and Windows.
:::

The pin is a file named `server.crt` in the same folder as the node's admin certificate:

- **An adopted node:** `<node credentials folder>/<node name>/server.crt`, next to the `admin.crt` the manager wrote when it adopted the node. The folder is `MANAGER_NODE_CREDS_DIR`, `/var/lib/cryptos-manager/node-creds` by default.
- **A node listed in the config file:** the folder of its `adminCertPath`.

The manager reads the file on every connection, so a new or replaced file takes effect without a restart.

## Pin a node

1. Read the fingerprint on the node's console. It is the `Mgmt SHA-256` line, in capitals and in groups of four characters.

2. Save the certificate the node presents, using the node's address and port:

   <Tabs groupId="os" queryString>
   <TabItem value="unix" label="Linux / macOS" default>

   ```bash
   openssl s_client -connect 192.0.2.20:443 </dev/null 2>/dev/null | openssl x509 -out server.crt
   ```

   </TabItem>
   <TabItem value="windows" label="Windows (PowerShell)">

   ```powershell
   $null | openssl s_client -connect 192.0.2.20:443 2>$null | openssl x509 -out server.crt
   ```

   </TabItem>
   </Tabs>

3. Show the saved certificate's fingerprint:

   ```bash
   openssl x509 -in server.crt -noout -fingerprint -sha256
   ```

   :::danger[Only pin a certificate that matches the console]
   The fingerprint must match the `Mgmt SHA-256` line on the node's console, ignoring colons, spaces and case. If it doesn't, something other than your node answered on that address. Don't install the file; find out what answered first.
   :::

4. Put `server.crt` in the node's folder (above), where the manager can read it.

## Re-pin after the node reboots

After a pinned node reboots, every call the manager makes to it fails with an error like this, and the manager logs the same line:

```text
nodeclient: node pki-root presented a server certificate (sha256 5a0e...c3) that does not match the pinned server certificate
```

Follow [Pin a node](#pin-a-node) again with the node's new certificate and replace `server.crt`.

:::danger[Check the new certificate against the console, not the error]
The fingerprint in the error is whatever answered on the node's address, which is exactly what you haven't checked yet. Compare the saved certificate with the node's console.
:::

:::warning[A pinned node is unreachable from the manager until you re-pin]
Until you re-pin, nothing can be read from the node and every operation on it fails. Plan a re-pin into every reboot of a pinned node.
:::

:::warning[Remove the old pin before you adopt a node again]
A re-installed node presents a new certificate. If its old `server.crt` is still there, the adoption fails while it waits for the node to come back. Delete the old `server.crt` before you adopt the node again under the same name.
:::

To stop checking a node, delete its `server.crt`.

## Linking a running node

A [`LINK` enrollment](./overview.md#linking-a-node-that-is-already-running) checks the node another way: at request and at approval, the node proves it holds its CA identity key, and the approval is refused if that key changed in between. This check doesn't use `server.crt`.

## Where to go next

- [Fleet Manager overview](./overview.md): what the manager holds and how nodes join it.
- [Deploy with Helm](./helm.md): where the node credentials folder lives in Kubernetes.
