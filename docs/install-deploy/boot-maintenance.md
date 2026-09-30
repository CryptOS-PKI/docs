---
title: "🔧 Boot and maintenance mode"
---

# 🔧 Boot and maintenance mode

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

The first time a machine boots the CryptOS ISO, nothing is installed yet. The node notices this and starts in **maintenance mode**: a small, temporary service that waits for you to send it a machine config. There is no installer menu and no login prompt. Everything happens over the network with `cryptosctl`.

## Prepare the machine

- **UEFI firmware.** The ISO boots only through UEFI; it has no legacy BIOS boot entry.
- **Secure Boot.** Turn it off for an unsigned image. For a signed image, enroll your certificate first ([Secure Boot enrollment](./secure-boot.md)).
- **A TPM**, for a TPM-backed image. On vSphere, add a vTPM to the VM (this needs a key provider). If you cannot, use the `STATEKEY=nodeid` image instead ([Build a bootable image](./build-bootable-image.md)).
- **A disk to install to.** The install erases it completely.
- **A network with DHCP.** In maintenance mode the node takes its address from DHCP.

:::danger[Decide on Secure Boot before the install]
On a TPM node, changing Secure Boot afterwards locks the node out of its own disk. Set it on or off now and leave it that way.
:::

:::danger[Use a trusted, isolated network]
Maintenance mode accepts connections **without any authentication**. Whoever reaches the node first can send it a config, erase its disk and take it over. Boot a maintenance node only on a provisioning network you control, and finish the install before you move it anywhere else.
:::

## What happens at boot

1. The node looks for a disk partition named `cryptos-state`. On a brand-new machine there is none, so it goes into maintenance mode. This check runs before the TPM is touched, so a machine without a TPM still reaches maintenance mode cleanly.
2. The kernel has already asked DHCP for an address (the image boots with `ip=dhcp`).
3. The node opens its management API on **port 443**. It uses a fresh, self-signed certificate that names only `localhost`, and it does **not** ask the client for a certificate.
4. The console shows **Awaiting configuration** and **MAINTENANCE MODE**.

There is no TPM, no encrypted disk, no database and no CA key yet. The only useful things the node can do in this state are report its status and accept a config.

## Find the node's address

The console does not print the node's IP address. Look it up where the address came from: your DHCP server's lease list, or the VM's network summary in your hypervisor.

## Talk to a maintenance node

Because the node has no identity to prove yet, you reach it with `--insecure`. That flag skips checking the node's certificate and sends no client certificate:

```bash
cryptosctl --insecure --endpoint 192.0.2.50:443 status
```

`--insecure` is only for maintenance mode. A node that is fully installed requires mutual TLS and rejects a client that sends no certificate.

`cryptosctl` runs on Linux and macOS.

## Next step

Write the node's machine config and send it: [Bootstrap and apply config](./bootstrap-apply.md).
