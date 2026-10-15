---
title: "Fleet Manager overview"
---

import ThemedImage from '@theme/ThemedImage';

# <ThemedImage sources={{light: '/img/brand/fleetos-mark-light.svg', dark: '/img/brand/fleetos-mark-dark.svg'}} alt="FleetOS" className="integration-logo" /> Fleet Manager overview

:::tip[Works today]
The Fleet Manager and its web UI are part of the alpha. They have run a two-tier hierarchy (a Root and an Intermediate) on VMware, with both nodes reported as established and healthy. A release tag publishes the container image and chart; see [Deploy with Helm](./helm.md) for where each install path stands.
:::

A single CryptOS node is managed with `cryptosctl`, one node at a time. Once you have several nodes, a Root and the CAs under it, you want one place to see all of them. That place is the **Fleet Manager**, also called FleetOS Manager.

The Fleet Manager is optional. A node never needs it to issue certificates, and a node that has never been linked to one is managed with `cryptosctl` only. It deploys three ways: Kubernetes, a container (Docker or a Docker-compatible runtime) with PostgreSQL alongside it on the same host, or standalone on a VM with systemd -- never the CA itself, which runs only on the CryptOS appliance. See [Deploy with Helm](./helm.md) for all three.

## What it is

The Fleet Manager is one Go program, [`cryptos-manager`](https://github.com/CryptOS-PKI/cryptos-manager). It does three things on one HTTPS port:

- **Serves the web UI.** The browser app from the [`cryptos-web`](https://github.com/CryptOS-PKI/cryptos-web) repo is built into the manager binary, so there is nothing else to install. See [The web UI](./web-ui.md).
- **Answers the Fleet API.** The web UI calls it. The API is defined as `FleetService` in the [`cryptos-manager`](https://github.com/CryptOS-PKI/cryptos-manager/tree/main/proto/cryptos/fleet/v1) repo.
- **Talks to your nodes.** For every node it manages, the manager dials the node's management API over mutual TLS, the same API `cryptosctl` uses. It verifies the node's server certificate on every connection, against the node's CA chain or a pinned copy, and refuses a node it can't verify; see [Verifying a node's certificate](./node-trust.md).

Two small routes answer without a login: `/healthz` for health checks (`200` when the manager can serve and reach its Postgres, `503` when it can't) and `/version` for the build details.

It can also serve an MCP endpoint at `/mcp` for AI agents. That is off by default; the manager's [MCP guide](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/mcp.md) covers it.

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

There are no usernames or passwords. You log in with an **operator certificate** installed in your browser. The manager checks it on every request against the operator CA, an external CA that is never a CryptOS node (see [The operator CA and revocation](./operator-ca.md)), and reads your access level from an extension in the certificate (OID `1.3.6.1.4.1.59999.1.1`).

The web page itself loads without a certificate, so someone who can't get in sees why. Every API call needs one.

There are three levels. Each includes the one before it.

| Level | What it adds |
|---|---|
| `viewer` | See nodes, certificates, profiles, protocols, enrollments and the audit log. |
| `operator` | Issue and revoke certificates, re-key a subordinate CA, read a node's config, open enrollments and approve subordinate ones, and list operator certificates. |
| `admin` | Adopt and decommission nodes, approve a node link, edit and apply configs and profiles, turn protocol adapters on or off, switch a node's enrolment protocols, back up and restore CA keys, and revoke operator certificates on the manager's denylist. |

The manager's [Operator PKI guide](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/operator-pki.md) shows how to mint the first operator certificate.

## What is not available today

- A node can't start its own enrollment. The manager starts every link, adoption and enrollment, and the challenge in a `LINK` is signed by the node's CA identity key, not the TPM endorsement key.

- Switching a protocol adapter on in the manager's protocol catalog only records the intent; the web UI no longer offers that switch. ACME and EST are switched per node with `SetNodeProtocol` (see [A node's lifecycle in the fleet](./node-lifecycle.md#switching-an-enrolment-protocol-on-a-node)), which the web UI's Protocols page now uses; SCEP and Windows autoenrollment are not built, and have no per-node switch anywhere.
- The manager records the read-only flag on a linked node, but the node does not enforce it.

## Where to go next

- [A node's lifecycle in the fleet](./node-lifecycle.md): how a node joins, switches protocols and leaves.
- [The web UI](./web-ui.md): logging in, finding your way around, and where each page lives.
- [Deploy with Helm](./helm.md): the supported chart, and what to use today.
- [Machine config](../reference/machine-config.md): the node config the adopt wizard fills in.
- [cryptosctl](../reference/cryptosctl.md): managing a node without the Fleet Manager.
