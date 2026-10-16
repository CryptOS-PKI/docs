---
title: "🔀 Cutting a fleet over to cryptos.node.v1"
---

# 🔀 Cutting a fleet over to cryptos.node.v1

:::tip[Works today]
The manager and `cryptosctl` both speak `cryptos.node.v1` once you are on a release built after the rename below. This page is for a fleet still running from before it.
:::

`cryptos-node#342` renamed the node gRPC package from `cryptos.v1` to `cryptos.node.v1`, with no compatibility service: a node built from that change onward serves `cryptos.node.v1.NodeService` only. A Fleet Manager built before the rename still dials `cryptos.v1.NodeService`, which no longer exists, so it loses every node the moment that node is upgraded. There is no order that avoids a window where the manager and some nodes disagree; this page is about keeping that window short, watched, and recoverable.

The nodes themselves are never affected by this. A node's own API, issuance and the protocols it serves keep working throughout -- `cryptos.node.v1` only changes how the **manager** talks to it. If the manager is unreachable or not yet linked, [`cryptosctl`](../reference/cryptosctl.md) still manages a node directly over mTLS.

## Before you start

- A maintenance window for the manager, and a separate short one for each node's `image activate` reboot (see [Upgrade a node in place](../install-deploy/upgrade-in-place.md)).
- The new manager -- the image tag or binary built after `cryptos-manager` moved onto `cryptos-node`'s `cryptos.node.v1` stubs -- pulled or built and ready to deploy, alongside the signed node images for the upgrade.
- Both the old and the new `cryptosctl`, kept on hand: each node needs the `cryptosctl` built from the API it is *currently* running, not the one you're upgrading it to.
- Every node you plan to upgrade already has an upgrade anchor it can use. A node installed from the withdrawn `v0.1.0-rc.1` release assets has none and needs reinstalling first, outside this runbook -- see [A node with no upgrade anchor can't take this path](../install-deploy/upgrade-in-place.md).
- Console or direct `cryptosctl --endpoint` access to every node, independent of the manager, in case you need to check or roll one back without the web UI.

## The cutover order

1. Upgrade the Fleet Manager itself to the release that speaks `cryptos.node.v1` -- `helm upgrade` with the new chart version or image tag, or pull and restart the container for a standalone `docker compose` deployment (see [Deploy with Helm](./helm.md)).

   :::warning[Every node shows down right after this step]
   The new manager dials `cryptos.node.v1.NodeService`, which none of your not-yet-upgraded nodes serve yet, so the fleet view marks all of them down. This is expected and does not affect the nodes themselves; it clears node by node as you work through the rest of this list.
   :::

2. Confirm the manager itself came back: its `/healthz` answers `200` (see [What the chart deploys](./helm.md#what-the-chart-deploys)), and the fleet view loads with every node shown down for the reason above.

3. Upgrade the first Intermediate node: stage and activate its new image as in [Upgrade a node in place](../install-deploy/upgrade-in-place.md), using the `cryptosctl` built for the API it is currently running.

4. Confirm the manager sees it before touching the next node: the node's health in the fleet view (or `GetNode`/`ListNodes`) goes from down back to established, and its uptime reads as freshly rebooted. Don't move on while it still shows down -- check the node's own `image status` and the manager's logs for that node first.

5. Repeat steps 3 and 4 for every other Intermediate.

6. Upgrade the Root the same way, last: stage and activate, then confirm the manager sees it before calling the cutover finished.

   :::caution[The Root goes last]
   A Root signs every Intermediate below it but does no day-to-day issuance itself (see [CA roles](../concepts/ca-roles.md)). Upgrading it last keeps the node most of the fleet depends on for live issuance -- the Intermediates -- off the critical path the longest, and gives you a reboot of each Intermediate to confirm the cutover works before you touch the Root.
   :::

## What an old manager shows during the window

A manager still on `cryptos.v1` that tries to reach a node already upgraded to `cryptos.node.v1` gets a gRPC error for a service the node no longer registers. The fleet view shows that node down, with the RPC failure in its health detail, the same way it shows any other node it can't verify or reach (see [How the manager trusts its nodes](./node-trust.md)). Nothing on the node itself is affected; the manager just can't talk to it until the manager is also upgraded.

## Backing out

To back a node out, roll back its image and reactivate, with the `cryptosctl` matching the API it is running *before* you run the command:

```bash
cryptosctl --endpoint 192.0.2.12:443 --trust root.pem image rollback
cryptosctl --endpoint 192.0.2.12:443 --trust root.pem image activate \
  --confirm "Example Root CA G1"
```

`image rollback` puts the retained previous image back on the boot path without rebooting; `image activate` is what actually reboots into it (see the rollback steps in [Upgrade a node in place](../install-deploy/upgrade-in-place.md)). Once the node reboots, it is back on its old package, so check it afterward with the *old* `cryptosctl`, not the one you upgraded to.

To back the manager out, redeploy it at its previous chart version or image tag the same way you upgraded it. A manager rolled back this way loses every node already upgraded to `cryptos.node.v1`, the same as before the cutover started, until you upgrade it forward again.

## What proves the node side

The `cryptos-appliance` CI job **Upgrade from the bridge build (a77ae5b) in QEMU** builds the production bridge image (the last `cryptos-node` commit before the rename) and this checkout's candidate, signs and anchors both with one throwaway key, and proves the in-place upgrade from the bridge to the candidate, a rollback, and a second upgrade. It proves that a node moves across the rename cleanly on its own; it does not run a Fleet Manager, so it does not exercise the cutover order above.
