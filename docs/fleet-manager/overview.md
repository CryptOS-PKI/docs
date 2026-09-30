---
title: "🚢 Fleet Manager overview"
---

# 🚢 Fleet Manager overview

:::tip[Works today]
The Fleet Manager and its web UI are part of the alpha. They have run a two-tier hierarchy (a Root and an Intermediate) on VMware, with both nodes reported as established and healthy. There is no published container image or chart, so you build it yourself; see [Deploy with Helm](./helm.md) for where each install path stands.
:::

A single CryptOS node is managed with `cryptosctl`, one node at a time. Once you have several nodes, a Root and the CAs under it, you want one place to see all of them. That place is the **Fleet Manager**.

The Fleet Manager is optional. A node never needs it to issue certificates, and a node that has never been linked to one is managed with `cryptosctl` only.

## What it is

The Fleet Manager is one Go program, [`manager`](https://github.com/CryptOS-PKI/manager). It does three things on one HTTPS port:

- **Serves the web UI.** The browser app from the [`web`](https://github.com/CryptOS-PKI/web) repo is built into the manager binary, so there is nothing else to install. See [The web UI](./web-ui.md).
- **Answers the Fleet API.** The web UI calls it. The API is defined as `FleetService` in the [`api`](https://github.com/CryptOS-PKI/api) repo.
- **Talks to your nodes.** For every node it manages, the manager dials the node's management API over mutual TLS, the same API `cryptosctl` uses. It checks the node's server certificate when you pin it; see [Pinning a node's certificate](./node-trust.md).

Two small routes answer without a login: `/healthz` for health checks (`200` when the manager can serve and reach its Postgres, `503` when it can't) and `/version` for the build details.

It can also serve an MCP endpoint at `/mcp` for AI agents. That is off by default; the manager's [MCP guide](https://github.com/CryptOS-PKI/manager/blob/main/docs/mcp.md) covers it.

## What it keeps, and what it never holds

The manager keeps its records in Postgres, named by `database_url` in its config file:

- the nodes it manages and how to reach them;
- enrollment requests and their outcome;
- its catalog of certificate profiles and protocol adapters;
- the operator certificates it has issued;
- an audit log of every change, hash-chained so an edit shows.

Each node's own state (its CA, its issued certificates, its config) stays on the node.

It also keeps one file pair per adopted node: the admin certificate and key it uses to manage that node. They live in `MANAGER_NODE_CREDS_DIR`, which defaults to `/var/lib/cryptos-manager/node-creds`. In the container image that folder is the only place the manager writes, and the rest of its filesystem is read-only, so give the folder a volume. The manager's Docker Compose example mounts one.

:::caution[Without database_url nothing is saved]
If `database_url` is not set, the manager uses an in-memory store filled with a demo catalog and logs `no database_url configured, using in-memory store (demo catalog seeded)`. Everything is lost on restart. That mode is for trying the UI offline. Set `database_url` for any real fleet.
:::

What it never holds is a CA's private key. Those keys are made and kept on the nodes. When you back up a CA key from the web UI, the node seals the key with your passphrase before it leaves, and the manager only passes the sealed copy through. The passphrase is never stored. A node whose CA key lives in the TPM refuses the export.

## How operators log in

There are no usernames or passwords. You log in with an **operator certificate** installed in your browser. The manager checks it against the operator CA named by `operatorCAPath`, and reads your access level from an extension in the certificate (OID `1.3.6.1.4.1.59999.1.1`).

The web page itself loads without a certificate, so someone who can't get in sees why. Every API call needs one.

There are three levels. Each includes the one before it.

| Level | What it adds |
|---|---|
| `viewer` | See nodes, certificates, profiles, protocols, enrollments and the audit log. |
| `operator` | Issue and revoke certificates, re-key a subordinate CA, read a node's config, open enrollments and approve subordinate ones, and list operator certificates. |
| `admin` | Adopt and decommission nodes, approve a node link, edit and apply configs and profiles, turn protocol adapters on or off, switch a node's enrolment protocols, back up and restore CA keys, and issue or revoke operator certificates. |

The manager's [Operator PKI guide](https://github.com/CryptOS-PKI/manager/blob/main/docs/operator-pki.md) shows how to mint the first operator certificate.

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
   The manager trusts whatever certificate it sees on first contact, so confirming is the only check that you reached your node and not something in between. Compare the fingerprint with one you got from the node itself. The node's console shows a `Mgmt SHA-256` line, in capitals and in groups of four characters.
   :::

2. **You confirm the fingerprint.** From here on, the manager only talks to a node that presents that exact certificate.
3. **You pick the install disk** from the list the node reports, and fill in the node's config.
4. **The manager makes an admin credential for the node** and writes its certificate into the config, so the installed node trusts only that credential. It keeps the key in `MANAGER_NODE_CREDS_DIR`.
5. **The node installs and reboots.** The manager applies the config, then waits up to 180 seconds for the node to come back on its installed system.
6. **A Root runs its first-boot ceremony.** The manager starts it and shows each step. An Intermediate or Issuing node skips this: it waits for a certificate from its parent, which you give it with a subordinate enrollment (below).
7. **The node is registered** in the inventory, and the audit log gets a `node-adopted` entry.

The web UI shows the progress as phases:

| Phase | Meaning |
|---|---|
| `applying-config` | Connecting to the node and checking whether it is already installed. |
| `installing` | The config is applied and the node is installing to disk. |
| `awaiting-reboot` | Waiting for the node to come back on its installed system. |
| `ceremony` | A Root is running its first-boot ceremony. |
| `established` | Done. The Root is adopted and working. |
| `awaiting-certificate` | Done. The subordinate node is adopted and waits for its parent to sign it. |
| `error` | The adoption stopped. The detail says why. |

{/* screenshot: fleet-manager/adopt-progress.png: the adopt wizard partway through, with the phase list showing applying-config and installing done and awaiting-reboot in progress */}

:::danger[Adoption erases the install disk]
The node installs itself to the disk you pick, and that disk is overwritten. Check the device against the node before you confirm.
:::

### Re-adopting a node

An adoption can stop partway: the network drops, or the node takes longer than 180 seconds to come back. Run the adoption again with the same node name. It is safe to retry.

- The manager reuses the admin credential it stored for that node name on the earlier attempt. It only makes a new one when none is stored.
- It asks the node for its status first. If the node already booted its installed system, the manager skips the install and goes straight to waiting for the node.
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

1. Someone with `operator` opens the request with the node's address, an admin certificate and key the node trusts, and the node's CA chain.
2. The manager sends the node a random challenge. The node signs it with its CA identity key, and the manager records that key's fingerprint. The request is now `PENDING`.
3. Someone with `admin` approves it and supplies the connection details again. The manager runs the challenge again and refuses the approval if the fingerprint has changed.
4. On approval the manager writes a management block into the node's config: the manager's name, the operator CA as a trusted client CA, and a flag that marks the node's own operator surface read-only.

### Signing a subordinate

A `SUBORDINATE` enrollment gives an adopted Intermediate or Issuing node its CA certificate. You name the child node, the parent CA by its common name, and the profile to sign under. On approval (`operator` or above), the manager asks the child for its certificate request, has the parent sign it, and hands the signed chain back to the child.

## Switching an enrolment protocol on a node

The manager can switch ACME or EST on or off on one node through the Fleet API call `SetNodeProtocol` (`admin` only). The web UI does not call it yet: its Protocols page still records intent only (see [The web UI](./web-ui.md#protocols)).

1. **The manager reads the node's config** and changes one thing: the `enabled` flag of that protocol's block (`pki.acme` or `pki.est`). The block's other settings go back as the node stored them. EAB keys and EST password digests are write-only, so the node returns them blank, the manager sends them back blank, and the node keeps the values it has. The other protocol's block is left out, so the node keeps it as it is.
2. **The node checks and stores it.** The node keeps a switched-off protocol's settings, so switching it off and back on needs nothing re-entered. Switching on still needs the block the node holds to be complete (for ACME a `base_url`, a `profile` and an External Account Binding key unless anonymous accounts are allowed; for EST `hostnames` and a `profile`), because the manager does not fill in settings: a protocol that was never set up on the node, or whose block was removed, is refused until you add its settings with `cryptosctl config apply`. A Root refuses to switch either protocol on. A refusal comes back with the node's reason, and nothing is audited.
3. **The switch waits for the next boot.** The node answers `requires_reboot`, and the protocol's listener starts or stops only when the node boots again.
4. **The manager shows the reboot as pending.** `ListNodes` and `GetNode` report, per node, each protocol's configured and running state and a `reboot_required` flag. The flag stays set until the node reports the protocol running in its new state and no stored change is waiting.
5. **The audit log gets one entry per switch,** `protocol-enabled` or `protocol-disabled`, naming who did it, the node and the protocol. A whole-config `ApplyNodeConfig` call that turns a protocol on or off gets the same entry.

A protocol that is already in the state you asked for is left alone: nothing is applied or audited.

:::warning[A switch needs a reboot in a maintenance window]
Turning a protocol on or off takes effect only at the node's next boot, and rebooting an Issuing CA stops issuance until it is back. The manager can't reboot a node yet, so plan the reboot for a maintenance window and restart it from its hypervisor or its power control.
:::

## What is not available today

- A node can't start its own enrollment. The manager starts every link, adoption and enrollment, and the challenge in a `LINK` is signed by the node's CA identity key, not the TPM endorsement key.

- Switching a protocol adapter on in the manager's protocol catalog only records the intent. ACME and EST are switched per node with `SetNodeProtocol` (above), which the web UI does not use yet; SCEP and Windows autoenrollment are not built.
- The manager can't reboot a node, so a protocol switch or any other reboot-required change waits for a reboot you start at the node.
- The manager records the read-only flag on a linked node, but the node does not enforce it.

## Where to go next

- [The web UI](./web-ui.md): the pages and what you can do on each.
- [Deploy with Helm](./helm.md): the supported chart, and what to use today.
- [Machine config](../reference/machine-config.md): the node config the adopt wizard fills in.
- [cryptosctl](../reference/cryptosctl.md): managing a node without the Fleet Manager.
