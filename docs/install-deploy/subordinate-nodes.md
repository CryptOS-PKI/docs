---
title: "🪢 Subordinate nodes"
---

# 🪢 Subordinate nodes

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

A Root is one node. An `intermediate` or `issuing` node chains under it, and gets there a different way: it never runs the first-boot ceremony ([Run the first-boot ceremony](./run-the-ceremony.md) covers that for a Root only). Instead it makes a certificate signing request (CSR) for its parent to sign.

## Chain a subordinate to its parent

An `intermediate` or `issuing` node skips the ceremony. On its first boot it creates its CA key and a certificate signing request (CSR) by itself, and `status` shows `Identity: AWAITING_CERT`. Its console shows `Awaiting parent certificate` and its management certificate SHA-256 until the chain is committed. You then carry the CSR to the parent and the signed chain back:

:::caution[Check the pin before you fetch the CSR]
Fetch the new node's pin with `trust fetch --expect-sha256` and the value on its console, as in [Fetch the certificate](./reboot-ceremony.md#fetch-the-certificate). An unchecked pin could hand you a CSR from a machine that isn't your node, and the parent would then sign a CA for it.
:::

1. `cryptosctl ca get-subordinate-csr` on the new node.
2. `cryptosctl ca sign-subordinate --csr <file> --profile <profile>` on the parent.
3. `cryptosctl ca submit-subordinate-cert --chain <file>` on the new node.

Once the chain is committed, the subordinate switches to a CA-signed management certificate too, [as a Root does](./run-the-ceremony.md#switch-to-your-root-after-the-ceremony), and its self-signed pin stops working. Its chain runs up to your root, so `--trust root.pem` works for it at any depth, with the root you already hold.

The flags are in the [cryptosctl command reference](../reference/cryptosctl.md).

## Restarting a node

When a node, Root or subordinate, needs a restart, use its orderly shutdown instead of a hypervisor hard reset:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem reboot --confirm "Example Root CA G1"
```

`--confirm` must be the node's CA common name. The node stops its listeners, closes its database and audit log, and locks the encrypted volume before it restarts. Add `--power-off` to turn it off instead.
