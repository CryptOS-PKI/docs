---
title: "🔐 Verifying a node's certificate"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🔐 Verifying a node's certificate

:::tip[Works today]
The Fleet Manager verifies every node's server certificate and refuses a node it can't verify. Before a node has its CA you pin its certificate; once the node signs its management certificate with its CA, the manager verifies it against the CA chain it recorded.
:::

This page covers one task: making sure the Fleet Manager can verify each node it manages, before an upgrade and as nodes reboot and get their CA. What the Fleet Manager is, and how nodes join it, is in the [Fleet Manager overview](./overview.md).

## What each side checks

The manager talks to each node over mutual TLS, and both sides check the other on every connection.

| Side | What it checks | When |
|---|---|---|
| The node | The manager's admin certificate, against the admin trust in the node's config. | Always. A manager without the right admin key is refused. |
| The manager | The node's management server certificate, against the node's recorded CA chain or its pin. | Always. A node it can't verify is refused. |

The manager accepts the node's certificate when either of these vouches for it:

- **The recorded CA chain.** The certificate chains to the node's CA chain and is valid for the host in the node's endpoint, the IP or DNS name the manager dials. A node listed in the config file gets its chain from `caCertPath`. An adopted node gets it from `ca.crt`, which the manager writes next to the node's admin certificate when the node gets its CA.
- **The pin.** The certificate is the one saved as `server.crt` next to the node's admin certificate. It's the same certificate `cryptosctl --trust` takes.

A node with neither is refused, and so is one whose certificate matches neither. The manager reads both files on every connection, so a new pin or chain takes effect without a restart.

## Before you upgrade

:::warning[Unpinned nodes are refused after the upgrade]
Before upgrading to this version, make sure every node is either pinned (`server.crt`, or the fingerprint recorded at adoption) or has a recorded CA chain. Unpinned nodes are refused after the upgrade: nothing can be read from them and every operation on them fails until you pin them.
:::

A recorded CA chain only verifies a node that signs its management certificate with its CA. A node on a CryptOS release that still makes a self-signed management certificate every boot needs a pin, even when its `caCertPath` is set.

### List the nodes that would be refused

The new manager's `-check-node-trust` prints one line per node and exits `1` if any node would be refused. It reads the config file and opens the database the way a start does, applying the schema, but it doesn't serve. On a standalone install, run it with the new binary on the manager host, with the same config file and `MANAGER_DATABASE_URL` the manager uses, before you switch over:

```bash
./manager -config /etc/cryptos/fleet/config.yaml -check-node-trust
```

```text
node trust: pki-root (192.0.2.10:443): pinned
node trust: pki-issuing (192.0.2.11:443): REFUSED: no CA chain is recorded and no server certificate is pinned; pin it at /var/lib/cryptos-manager/node-creds/pki-issuing/server.crt or with -pin-node
```

Without the new binary, check the files yourself. A node is pinned when a `server.crt` sits in the folder of its admin certificate:

- **An adopted node:** `<node credentials folder>/<node name>/`. The folder is `MANAGER_NODE_CREDS_DIR`, `/var/lib/cryptos-manager/node-creds` by default. Managers before this version never wrote a pin at adoption, so an adopted node is unpinned unless you pinned it yourself. On the manager host, this lists the unpinned ones:

  ```bash
  for d in /var/lib/cryptos-manager/node-creds/*/; do [ -f "$d/server.crt" ] || echo "unpinned: $(basename "$d")"; done
  ```

- **A node listed in the config file:** the folder of its `adminCertPath`. With the chart's `adminCredsSecret`, the pin is the Secret's `server.crt` key; an empty result means the node is unpinned. `kubectl` works the same on Linux, macOS and Windows:

  ```bash
  kubectl -n fleet get secret pki-root-admin -o jsonpath='{.data.server\.crt}'
  ```

On Kubernetes the manager's image has no shell, so you can't list the files on the node credentials claim from the pod. Once the new version runs, use the manager binary itself:

```bash
kubectl -n fleet exec deploy/fleet-manager -- /manager -config /etc/cryptos/fleet/config.yaml -check-node-trust
```

After the upgrade the manager also logs one `node trust:` line per node at startup, with `REFUSED` on each node it will refuse.

### Pin each node

Pin every node the check lists, with [Pin a node](#pin-a-node). A node listed in the config file can be pinned before the upgrade: older managers ignore `server.crt`, so the file waits until the new version reads it.

:::caution[Adopted nodes on Kubernetes are refused until you pin them]
An adopted node's pin lives on the node credentials claim, which you can only reach through the new manager's `-pin-node`. From the upgrade until you run it, the manager refuses the node. Plan that window, and have each node's console fingerprint ready.
:::

## What adoption records

When you [adopt a node](./overview.md#adopting-a-new-node), the manager records what it needs to verify the node afterwards:

1. The fingerprint you confirm in the wizard pins the node's maintenance-mode certificate for the install steps.
2. The installed node boots with a new management certificate. Nothing links it to the maintenance certificate you confirmed, so the adoption pauses on `awaiting-fingerprint-confirmation` and shows the fingerprint the node presents:

   ```text
   the node is back in running mode and presents certificate sha256 5a0e...c3. Compare it with the Mgmt SHA-256 line on the node's console and confirm it to continue
   ```

   :::caution[Check the installed node's fingerprint on its console]
   Compare the fingerprint with the `Mgmt SHA-256` line on the node's console before you confirm it. If they differ, something other than your node answered on its address: cancel the adoption and find out what answered before you adopt again.
   :::

   When you confirm it, the manager saves that certificate as the node's `server.crt` and connects to the node, verified against it. The comparison ignores case, colons and spaces. The adoption stops with nothing pinned, recorded or registered when the fingerprint you confirm differs (`InvalidArgument`), when nobody confirms within 15 minutes (`DeadlineExceeded`), or when you cancel. The admin credential made for the adoption stays, so adopting again resumes. The audit log records each confirmation as `node-adoption-fingerprint-confirmed` and each refused fingerprint as `node-adoption-fingerprint-rejected`, with who sent it.

   :::warning[Confirm on the replica that runs the adoption]
   The waiting adoption lives in the manager replica that runs it. With more than one replica, a confirmation that reaches another replica fails with `NotFound`. Send it again, or adopt with a single replica.
   :::

3. A Root gets its CA in the first-boot ceremony, and the manager saves the node's CA chain as `ca.crt` next to its admin certificate. An Intermediate or Issuing node gets its CA when its subordinate enrollment is approved, and the manager saves the signed chain the same way.

A retried adoption asks you to confirm the certificate the node presents again, then replaces the node's old `server.crt` with it.

## When the node gets its CA

A node makes a new key and management certificate every time it boots. Before its CA exists, that certificate is self-signed. Once the node has its CA, the node signs it with that CA and sends the CA chain up to the root with it, but the key and fingerprint still change on every boot. A pin compares the whole certificate, so either way it holds only until the node's next reboot.

The recorded CA chain doesn't change on reboot, so once the node signs its management certificate with its CA, the chain verifies it across reboots and the pin is no longer needed. The switch needs nothing from you: while the node still presents the pinned self-signed certificate the pin accepts it, and once it presents the CA-signed one the chain accepts it.

:::caution[The certificate must name the address the manager dials]
The chain check includes the host in the node's endpoint. If the manager dials a name or address the node's certificate doesn't list, the node is refused.
:::

## Before you start

:::caution[Before you start]
You need the node's console, to read its fingerprint, and either the manager binary on the manager host (or `kubectl exec` into its pod) or write access to the node's credentials folder.
:::

The pin is a file named `server.crt` in the same folder as the node's admin certificate:

- **An adopted node:** `<node credentials folder>/<node name>/server.crt`, next to the `admin.crt` the manager wrote when it adopted the node.
- **A node listed in the config file:** the folder of its `adminCertPath`, or the `server.crt` key of its chart `adminCredsSecret`.

## Pin a node

1. Read the fingerprint on the node's console. It's the `Mgmt SHA-256` line, in capitals and in groups of four characters.

2. Pin it with the manager binary. `-pin-node` fetches the certificate the node presents and saves it only if its SHA-256 matches the one you give (case, spaces and colons are ignored). Run it on the manager host, or through `kubectl` for the chart; both work the same on every OS:

   ```bash
   ./manager -config /etc/cryptos/fleet/config.yaml -pin-node pki-root -expect-sha256 "5A0E 91C4 ..."
   ```

   ```bash
   kubectl -n fleet exec deploy/fleet-manager -- /manager -config /etc/cryptos/fleet/config.yaml -pin-node pki-root -expect-sha256 "5A0E 91C4 ..."
   ```

   A node whose admin certificate is in a read-only Secret can't be pinned this way. Pin it by hand and add the file to the Secret.

### Pin a node by hand

1. Read the fingerprint on the node's console, as above.

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

4. Put `server.crt` in the node's folder, where the manager can read it, or add it to the node's Secret by recreating the Secret with the new key next to the files it already holds:

   ```bash
   kubectl -n fleet create secret generic pki-root-admin --from-file=admin.crt --from-file=admin.key --from-file=ca.pem --from-file=server.crt --dry-run=client -o yaml | kubectl apply -f -
   ```

## When the manager refuses a node

Every call to a refused node fails, the manager logs why, and the fleet view shows the node down with the same text in its health detail. A node with nothing to verify against:

```text
nodeclient: node pki-root refused: its server certificate (sha256 5a0e...c3) cannot be verified: no CA chain is recorded and no server certificate is pinned. Check the fingerprint against the Mgmt SHA-256 line on the node's console, then pin it by saving the certificate as /var/lib/cryptos-manager/node-creds/pki-root/server.crt or with manager -pin-node "pki-root" -expect-sha256 <fingerprint>
```

A node whose certificate matches neither its chain nor its pin, typically one that rebooted before its CA ceremony:

```text
nodeclient: node pki-root refused: its server certificate (sha256 5a0e...c3) does not match the pinned server certificate /var/lib/cryptos-manager/node-creds/pki-root/server.crt: x509: certificate signed by unknown authority (...). If the node rebooted before its CA ceremony it has a new certificate: check it against the node's console and re-pin it
```

Pin the node's current certificate with [Pin a node](#pin-a-node).

:::danger[Check the new certificate against the console, not the error]
The fingerprint in the error is whatever answered on the node's address, which is exactly what you haven't checked yet. Compare it with the node's console.
:::

:::warning[A node without its CA is refused after every reboot]
Until the node signs its management certificate with its CA, each reboot gives it a new certificate, and the manager refuses it until you re-pin. Plan a re-pin into every reboot of such a node.
:::

## Skipping verification in a lab

A node listed in the config file can set `insecureSkipNodeVerify: true`, and the Helm chart takes the same key in `nodes[]`:

```yaml
nodes:
  - name: lab-root
    endpoint: "192.0.2.30:443"
    role: root
    adminCertPath: /etc/cryptos/fleet/lab-root/admin.crt
    adminKeyPath: /etc/cryptos/fleet/lab-root/admin.key
    insecureSkipNodeVerify: true
```

:::danger[Lab testing only, never in production]
`insecureSkipNodeVerify` is for lab testing only and must never be used in production. The manager doesn't check which server it reached, so anything that answers on the node's address is treated as your node, and gets every operation you send it. Pin the node or record its CA chain instead. There is no switch that turns verification off for every node.
:::

With it set, the manager logs a warning for the node at startup and on every connection, `helm install` and `helm upgrade` print a warning naming the node, and the fleet view shows the node's health detail as `server certificate not verified: insecureSkipNodeVerify is set (lab testing only)`. The key is read from the config file at every start and matched by node name, so a node you rename in the manager is verified again.

## Linking a running node

A [`LINK` enrollment](./overview.md#linking-a-node-that-is-already-running) checks the node another way: at request and at approval, the node proves it holds its CA identity key, and the approval is refused if that key changed in between. This check doesn't use `server.crt`.

## Where to go next

- [Fleet Manager overview](./overview.md): what the manager holds and how nodes join it.
- [Deploy with Helm](./helm.md): where the node credentials folder lives in Kubernetes.
