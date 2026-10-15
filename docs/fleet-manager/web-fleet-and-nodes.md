---
title: "🌳 The fleet, and adopting a node"
---

# 🌳 The fleet, and adopting a node

:::tip[Works today]
The web UI is part of the alpha. A few screens still read demo data in places; see [Known gaps in the alpha](./web-ui.md#known-gaps-in-the-alpha).
:::

Once you are [logged in](./web-ui.md#logging-in), this is where you see the fleet as a whole and bring a new node into it. A single node's own page is its own task: see [A node's page](./web-node-detail.md).

## Dashboard, Fleet, Root and Nodes

- **Dashboard** shows five cards: Fleet health, Certificates, Enrollment (pending requests), Protocols and Profiles. Each links to its page.
- **Fleet** draws the CA hierarchy as a tree. The ring colour shows each CA's state: Established, Pending or Revoked. Click a CA to focus it and see its details; **Fit** and **Overview** reset the view.
- **Root** lists the Root CAs. A Root's page shows its connection, its config and a re-key panel.
- **Nodes** lists every other node, with its role and identity state.

{/* screenshot: fleet-manager/fleet-topology.png: the Fleet page with a Root and an Issuing CA, one node focused and its detail panel open */}

## Adopt

The Adopt page (`admin` only) turns a node in maintenance mode into a working CA. The [node lifecycle](./node-lifecycle.md#adopting-a-new-node) page explains what happens; this is what you fill in.

1. **Step 1 — maintenance endpoint.** Enter the node's `host:port` and select **Preview**. Check the `sha256` against the `Mgmt SHA-256` line on the node's maintenance console (the `subject` is `localhost`), then select **Confirm fingerprint**.
2. **Step 2 — initial config.** Enter the node name and choose the role (root, intermediate or issuing). A subordinate needs a parent: pick an established CA under **Parent CA (signs this node)**. Then fill in the CA's common name, the network (interface, address, gateway, DNS), the **Install disk** from the list the node reports, and the key protection tier.
3. Select **Adopt node** and watch the phases.
4. **Confirm the installed node.** After the node reboots, the wizard stops on `awaiting-fingerprint-confirmation` and shows the `sha256` the installed node presents, in pairs. Compare it with the `Mgmt SHA-256` line on the node's console, then select **Fingerprint matches the console**. If it doesn't match, select **Does not match: cancel adoption**.

{/* screenshot: fleet-manager/adopt-fingerprint.png: Step 1 after Preview, with the First contact warning, subject and sha256, and the Confirm fingerprint button */}
{/* screenshot: fleet-manager/adopt-config.png: Step 2 filled in for an issuing node, with a parent chosen and a disk picked from the list */}
{/* screenshot: fleet-manager/adopt-confirm-installed.png: the wizard paused on awaiting-fingerprint-confirmation, with the installed node's sha256 and the two buttons */}

:::tip[Expected output]
A Root ends with `{name} is established and linked to the fleet.` A subordinate ends with `{name} is provisioned and awaiting a parent-signed certificate.`, and you finish it with a subordinate enrollment on the Enrollment page.
:::

If the adoption stops, the manager's message shows in red and **Adopt node** comes back. Run it again: see [Re-adopting a node](./node-lifecycle.md#re-adopting-a-node).

## Where to go next

- [A node's page](./web-node-detail.md): issuing, config, re-keying, backup and the rest of what a single node's page can do.
- [Certificates, enrollment and protocols](./web-catalogs.md): the fleet-wide catalogs.
