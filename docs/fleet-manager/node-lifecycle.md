---
title: "🔗 A node's lifecycle in the fleet"
---

# 🔗 A node's lifecycle in the fleet

:::tip[✅ Works today]
The Fleet Manager and its web UI are part of the alpha.
:::

How a node gets into the fleet, how it is kept trusted and configured once it is in, and how it comes back out. See [Fleet Manager overview](./overview.md) for what the manager is and holds.

## How a node joins the fleet

A node can join in three ways.

### Listed in the config file

The manager's config file can list nodes under `nodes:`, each with a `name`, `endpoint`, `role` and the paths to an admin certificate, its key and the node's CA chain (`adminCertPath`, `adminKeyPath`, `caCertPath`). This is how a fleet built with `cryptosctl` is brought under the manager.

:::caution[The list is read into an empty database only]
With Postgres, the manager copies the `nodes:` list into the database on its first start, while every table is still empty. After that it ignores the list, so a node you add to the file later does not appear. Add later nodes by adoption or a `LINK` enrollment instead.
:::

### Adopting a new node

Adoption takes a node that has just booted into [maintenance mode](../concepts/maintenance-mode.md) and turns it into a working CA, from the web UI. It needs `admin`.

1. **You give the node's address.** The manager connects without trusting anything yet, reads the certificate the node presents, and shows you its SHA-256 fingerprint and subject.

   :::caution[Check the fingerprint before you confirm it]
   The manager trusts whatever certificate it sees on first contact, so confirming is the only check that you reached your node and not something in between. Compare the fingerprint with one you got from the node itself. The node's maintenance console shows a `Mgmt SHA-256` line, in capitals and in groups of four characters, under the node's `Address`.
   :::

2. **You confirm the fingerprint.** From here on, the manager only talks to a node that presents that exact certificate.
3. **You pick the install disk** from the list the node reports, and fill in the node's config.
4. **The manager makes an admin credential for the node** and writes its certificate into the config, so the installed node trusts only that credential. It keeps the key in `MANAGER_NODE_CREDS_DIR`.
5. **The node installs and reboots.** The manager applies the config, then waits up to 180 seconds for the node to come back on its installed system.
6. **You confirm the installed node's fingerprint.** The installed node presents a new management certificate, and nothing links it to the maintenance certificate you confirmed in step 2. The adoption pauses and shows that certificate's SHA-256. Compare it with the `Mgmt SHA-256` line on the node's console and confirm it. Only then does the manager pin the certificate and connect to the node.

   :::caution[Confirm only a fingerprint that matches the console]
   If the fingerprint differs from the console, something other than your node answered on its address. Choose **Does not match: cancel adoption** and find out what answered before you adopt again. Nothing is pinned or recorded for the node.
   :::

7. **A Root runs its first-boot ceremony.** The manager starts it and shows each step. An Intermediate or Issuing node skips this: it waits for a certificate from its parent, which you give it with a subordinate enrollment (below).
8. **The node is registered** in the inventory, and the audit log gets a `node-adopted` entry.

The web UI shows the progress as phases:

| Phase | Meaning |
|---|---|
| `applying-config` | Connecting to the node and checking whether it is already installed. |
| `installing` | The config is applied and the node is installing to disk. |
| `awaiting-reboot` | Waiting for the node to come back on its installed system. |
| `awaiting-fingerprint-confirmation` | The node is back. The adoption waits up to 15 minutes for you to confirm the fingerprint it presents. |
| `ceremony` | A Root is running its first-boot ceremony. |
| `established` | Done. The Root is adopted and working. |
| `awaiting-certificate` | Done. The subordinate node is adopted and waits for its parent to sign it. |
| `error` | The adoption stopped. The detail says why. |

{/* screenshot: fleet-manager/adopt-progress.png: the adopt wizard partway through, with the phase list showing applying-config and installing done and awaiting-reboot in progress */}

:::danger[Adoption erases the install disk]
The node installs itself to the disk you pick, and that disk is overwritten. Check the device against the node before you confirm.
:::

### Re-adopting a node

An adoption can stop partway: the network drops, the node takes longer than 180 seconds to come back, or nobody confirms its fingerprint within 15 minutes. Run the adoption again with the same node name. It is safe to retry.

- The manager reuses the admin credential it stored for that node name on the earlier attempt. It only makes a new one when none is stored.
- It asks the node for its status first. If the node already booted its installed system, the manager skips the install and goes straight to waiting for the node.
- You confirm the fingerprint the node presents again. A Root that already finished its ceremony presents a certificate signed by its CA by then; compare it with the console the same way.
- A Root that already finished its ceremony skips it. Otherwise the ceremony runs.
- The node is registered as before, and the `node-adopted` audit entry says `(resumed an earlier partial adoption)`.

Re-adopting a node that is already adopted keeps its stored credential, so it does not lock the manager out.

:::caution[The stored credential is the only way in]
An installed node accepts only the admin credential made by the adoption that installed it. If the manager has lost it (the credentials folder was wiped, or you deployed a new manager without it), the node refuses the connection. The adoption then fails with a message that ends: `if this manager no longer holds it, reset the node from its console and adopt again`. Keep `MANAGER_NODE_CREDS_DIR` on storage that is backed up and survives restarts.
:::

:::danger[A console reset destroys the node's CA]
Resetting a node from its console erases its key material and reboots it into setup. The console asks you to type the Root CA's common name first and warns `WARNING: reset DESTROYS this CA`. If the node already holds a CA you still need, back up its key first, or don't reset it.
:::

### Linking a node that is already running

A `LINK` enrollment brings in a node that is already installed and running, which you manage today with `cryptosctl`.

1. Someone with `operator` opens the request with the node's address, an admin certificate and key the node trusts, and the CA certificate that signed the node's management certificate (`ca_pem`).
2. The manager connects to the node and verifies its management certificate against `ca_pem` before it sends anything, the same way it verifies every node (see [How the manager trusts its nodes](./node-trust.md#linking-a-running-node)). A node that doesn't verify is refused.
3. The manager sends the node a random challenge. The node signs it with its CA identity key, and the manager records that key's fingerprint. The request is now `PENDING`.
4. Someone with `admin` approves it and supplies the connection details again. The manager verifies the node and runs the challenge again, and refuses the approval if the fingerprint has changed.
5. On approval the manager writes a management block into the node's config: the manager's name and a flag that marks the node's own operator surface read-only. It doesn't send the operator CA, so operator certificates never log in to a node directly.
6. The node joins the inventory, as an adopted node does, and appears in the fleet view. The manager saves the admin certificate and key and `ca_pem` in the node's credentials folder and verifies the node with them from then on.

### Signing a subordinate

A `SUBORDINATE` enrollment gives an adopted Intermediate or Issuing node its CA certificate. You name the child node, the parent CA by its common name, and the profile to sign under. On approval (`operator` or above), the manager asks the child for its certificate request, has the parent sign it, and hands the signed chain back to the child.

## Switching an enrolment protocol on a node

ACME and EST are off by default; the manager can switch either on or off on one node through the Fleet API call `SetNodeProtocol` (`admin` only). The web UI's Protocols page calls it per node (see [Certificates, enrollment and protocols](./web-catalogs.md#protocols)).

1. **The manager reads the node's config** and changes one thing: the `enabled` flag of that protocol's block (`pki.acme` or `pki.est`). The block's other settings go back as the node stored them. EAB keys and EST password digests are write-only, so the node returns them blank, the manager sends them back blank, and the node keeps the values it has. The other protocol's block is left out, so the node keeps it as it is.
2. **The node checks and stores it.** The node keeps a switched-off protocol's settings, so switching it off and back on needs nothing re-entered. Switching on still needs the block the node holds to be complete (for ACME a `base_url`, a `profile` and an External Account Binding key unless anonymous accounts are allowed; for EST `hostnames` and a `profile`), because the manager does not fill in settings: a protocol that was never set up on the node, or whose block was removed, is refused until you add its settings with `cryptosctl config apply`. A Root refuses to switch either protocol on. A refusal comes back with the node's reason, and nothing is audited: an invalid config is error 1500 and any other refusal 1108, with the node's own message on the `x-cryptos-node-reason` error metadata. The same applies to `GetNodeConfig` and `ApplyNodeConfig`. A node whose management certificate the manager refuses is error 1106, and one it can't reach 1100.
3. **The switch waits for the next boot.** The node answers `requires_reboot`, and the protocol's listener starts or stops only when the node boots again.
4. **The manager shows the reboot as pending.** `ListNodes` and `GetNode` report, per node, each protocol's configured and running state and a `reboot_required` flag. The flag stays set until the node reports the protocol running in its new state and no stored change is waiting.
5. **The audit log gets one entry per switch,** `protocol-enabled` or `protocol-disabled`, naming who did it, the node and the protocol. A whole-config `ApplyNodeConfig` call that turns a protocol on or off gets the same entry.

A protocol that is already in the state you asked for is left alone: nothing is applied or audited.

:::warning[A switch needs a reboot in a maintenance window]
Turning a protocol on or off takes effect only at the node's next boot, and rebooting an Issuing CA stops issuance until it is back. Plan the reboot for a maintenance window, then trigger it from the node's page in the web UI (see [Rebooting a node](./web-node-detail.md#rebooting-a-node)) instead of a hypervisor hard reset.
:::

## Removing a node that is gone

`RemoveNode` (`admin` only) takes a node out of the inventory without contacting it, for a node that was destroyed, or wiped and isn't coming back. It doesn't reset or unlink the node: that's `DecommissionNode`. You name the node by its ID and confirm with its current name.

:::caution[Remove only a node that is gone]
A removed node that is still running keeps its management block and still trusts the admin key the manager held for it. The manager stops managing it, and adding it back needs a new adoption or `LINK`. If the node is still running, decommission it first.
:::

- **What it keeps:** the node's audit entries and name history stay. The node's credentials folder, when the manager created it, is moved to `.removed/<name>-<id>` inside the node credentials folder rather than deleted. Credentials you placed yourself, such as a Secret named in `nodes:`, are left where they are.
- **When it is refused:** a `confirm_name` that isn't the node's name returns error 1109, and a pending enrollment that names the node returns 1110 until you approve or reject it. An unknown ID returns 1101.
- **The audit log** gets a `node-removed` entry naming the node, its ID and its address.
- **Without Postgres** the inventory is rebuilt from `nodes:` at every start, so a removed node listed there comes back. Remove it from the config file too.
