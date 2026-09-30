---
title: "🧰 Maintenance mode and the install lifecycle"
---

# 🧰 Maintenance mode and the install lifecycle

:::tip[Works today]
The whole path, from booting the ISO to a serving CA, runs on VMware in the alpha. The limits that still apply are listed under [Known limits](#known-limits).
:::

The Talos-style path: boot, configure, install to disk, then reboot into service. This page explains what happens at each stage and why. The [Install & Deploy](../install-deploy/build-bootable-image.md) pages are the step-by-step version.

## The lifecycle at a glance

```text
 boot the ISO          send machine.yaml        first installed boot        ceremony
 ─────────────►  MAINTENANCE  ─────────────►  INSTALL  ─────────────►  FIRST BOOT  ─────────►  SERVING
                 no disk state                 wipe disk, write         create state key,
                 unauthenticated API           UKI + staged config      encrypt disk, save config
```

A node decides which stage it is in from one question it can answer before reading any config: **is there a partition named `cryptos-state` on a disk?**

- No: nothing is installed, so it enters maintenance mode.
- Yes: it unlocks that partition and boots as an installed node.

## Before you boot: the admin credential

A CryptOS node trusts exactly one administrator on its first boot, named in the machine config's `bootstrap` section. You make that credential on your workstation first:

```bash
cryptosctl bootstrap
```

It writes an ECDSA P-256 key and a self-signed client certificate (`identity.crt`, `identity.key`) and prints the certificate's SHA-256. Put the certificate, or that SHA-256, into `bootstrap.admin_cert_pem` or `bootstrap.admin_cert_sha256`. `cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::danger[Keep the bootstrap key safe]
Whoever holds `identity.key` is the node's administrator: they can run the ceremony, sign subordinate CAs, reboot and reset the node. Keep it off shared machines and back it up. The node has no password reset.
:::

## Stage 1: maintenance mode

You boot the node from the CryptOS ISO (see [Platform profiles and the image factory](./image-factory.md)). With no `cryptos-state` partition, the node:

- takes a network address from DHCP;
- listens for the management API on port 443, TLS 1.3, with a throwaway self-signed certificate for the name `localhost`;
- asks for **no client certificate**;
- opens no TPM, no encrypted disk, no database and no ceremony, because none of them exist yet;
- shows **MAINTENANCE MODE** and **Awaiting configuration** on its console.

In this mode the API answers only three questions: the node's status, the disks it could install to, and "here is a config, install it". Because the node has no identity yet and trusts no one, you connect with `--insecure`, which skips server verification and sends no client identity:

```bash
cryptosctl --insecure --endpoint 192.0.2.50:443 --server-name localhost status
```

`--insecure` works only against a maintenance node. An installed node requires a client certificate and refuses the connection.

:::danger[Anyone who reaches a maintenance node can take it over]
The maintenance API accepts any client by design. Whoever sends the first config chooses the disk to wipe, the administrator and the CA the node becomes. Boot maintenance nodes only on a trusted, isolated provisioning network, and finish the install before moving the node onto a general network.
:::

## Stage 2: install

You send the machine config, with `install.disk` set to the target disk:

```bash
cryptosctl --insecure --endpoint 192.0.2.50:443 --server-name localhost config apply -f machine.yaml
```

The node validates the config first. A config that fails validation, or one with no `install.disk`, is refused and nothing is touched.

:::warning[install.disk is wiped]
The install erases the whole disk named in `install.disk` (for example `/dev/sda` or `/dev/nvme0n1`) without asking. Check the device name before you send the config. `cryptosctl` has no command to list the node's disks; the Fleet Manager's adopt flow does list them.
:::

Then the node:

1. writes a new GPT partition table to the disk: a 512 MiB EFI System Partition named `EFI`, and the rest as a partition named `cryptos-state`;
2. copies the image it booted from onto the EFI partition, so the installed disk boots the same image;
3. stages your config at `EFI/cryptos/machine.yaml` on that partition;
4. replies `requires_reboot=true` and reboots.

The `cryptos-state` partition is still empty at this point. Until the next boot moves it, the staged config sits unencrypted on the EFI partition.

## Stage 3: first installed boot

The node now finds its `cryptos-state` partition, sees that it is not encrypted yet, and treats this as its first boot:

1. It creates the key for the state partition and protects it the way `state_key` says: sealed to the TPM by default. See [The TPM and sealed keys](./tpm-sealed-keys.md).
2. It formats the partition as an encrypted LUKS2 volume and mounts it at `/var/lib/cryptos`.
3. It reads the staged config, saves it to the encrypted volume and deletes the staged copy from the EFI partition.
4. It configures the network from `network` in the config.
5. It starts the management API on port 443, now requiring a client certificate.

From here on every boot unlocks the same volume and reads the config from it. The staged copy is never read again.

## Stage 4: identity

The node now needs its CA identity. What happens depends on its [role](./ca-roles.md):

- **Root:** it waits for you to run the first-boot ceremony, `cryptosctl ceremony start`, which creates the Root key and self-signs the Root certificate. See [The first-boot ceremony](../using/ceremony-start.md).
- **Intermediate or Issuing:** it creates its CA key and a CSR on its own, then waits for you to carry the CSR to its parent and bring the signed chain back.

Once the identity is committed, the node is serving: it signs, publishes revocation data if configured, and answers the API.

## Using the Fleet Manager instead

A [Fleet Manager](../fleet-manager/overview.md) can do stages 2 to 4 for you. It adopts a node from its maintenance endpoint: it makes a bootstrap credential for the node, sends the install config, and runs the ceremony. Adoption is safe to retry if it stops partway.

## Re-provisioning after a reset

An installed node can be taken back to an empty state with a **reset**. Reset erases the state partition's key material, so the encrypted volume, and the CA key on it, can never be opened again. The node then reboots into **re-provision maintenance**: the same unauthenticated API as stage 1, except that the node has already made a fresh encrypted state partition, so applying a config saves it there and reboots the node straight into stage 4.

There are two ways to start a reset:

- on the node's console, press Ctrl-R and type the CA common name;
- remotely, with `cryptosctl reset --confirm "<CA common name>"`, which needs the bootstrap admin credential.

:::danger[Reset destroys the CA key]
After a reset the node's CA key is gone. Certificates it signed stay valid until they expire, but nothing can renew them, revoke them or publish a fresh CRL for them. If that still matters, export the key first with `cryptosctl ca export-key` (possible only when the key is software-backed, not in the TPM).
:::

After a reset the node takes its address from DHCP again. On a network segment with no DHCP, it is unreachable until you get to its console or hypervisor.

## Known limits

:::caution[Current limits of the install path]
- **DHCP is required for maintenance.** The maintenance and re-provision stages always take their address from DHCP. There is no static-IP install path. Use a DHCP reservation if the node needs a fixed address during install. After install, the node uses the address in `network.address`.
- **Booting the ISO does not re-provision an installed node.** Maintenance starts only when no `cryptos-state` partition exists, so booting the ISO on an installed node does not bring up maintenance. Use a reset, or give the VM a fresh disk.
:::

## Next

- [Declarative config (machine.yaml)](./declarative-config.md): what goes in the file you send.
- [Boot into maintenance mode](../install-deploy/boot-maintenance.md): the step-by-step install.
