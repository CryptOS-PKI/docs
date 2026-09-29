---
title: "💾 Install to disk"
---

# 💾 Install to disk

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

When a maintenance node accepts your machine config, it installs itself onto the disk named in `install.disk` and reboots. You do not run anything else. This page explains what it writes, so you know what to expect and what the disk looks like afterwards.

## What the node does

1. **Checks the config.** It parses and validates it again on the node, and refuses it if `install.disk` is missing.
2. **Finds its own image.** It locates the UKI it booted from, on the ISO or on the boot partition.
3. **Erases and partitions the disk.** It wipes the disk and writes a new GPT partition table with two partitions.
4. **Writes the boot partition.** It formats the first partition as FAT32 and copies the UKI to `EFI/BOOT/BOOTX64.EFI`, the path UEFI firmware boots by default. No firmware boot entry is needed.
5. **Stages your config.** It writes the machine config to `EFI/cryptos/machine.yaml` on that boot partition, where the node picks it up on its next boot.
6. **Reboots.** It answers `cryptosctl` first, then restarts.

## The disk layout

| # | GPT name | Size | Contents |
|---|---|---|---|
| 1 | `EFI` | 512 MiB | FAT32 EFI System Partition: the UKI and the staged config |
| 2 | `cryptos-state` | the rest of the disk | left empty; encrypted on the first boot |

The node finds its state partition by the GPT name `cryptos-state`, so that name matters. It is also how the node tells an installed machine from a new one: with the partition present it boots normally, without it it goes into maintenance mode.

The state partition is **not** formatted during the install. On the first boot from disk the node turns it into an encrypted LUKS2 volume, seals the volume key (to the TPM, or from the machine UUID on a `nodeid` image), and only then creates a filesystem inside it. Private keys are never written to the disk in the clear.

## Detach the ISO

After the reboot the machine should start from the disk. Remove the ISO from the virtual CD drive, or put the disk first in the boot order, so the firmware boots the copy on disk.

## Installing without maintenance mode

For bare metal there is also `cryptos-install` (built by `task build`), a small tool you run as root from a Linux live USB on the target machine. It writes the same two-partition layout and the UKI, but no machine config:

```bash
sudo cryptos-install --disk /dev/nvme0n1 --uki cryptos-amd64.uki --yes
```

Without `--yes` it refuses to run, because the disk is erased. `--esp-size-mib`, `--esp-label` and `--state-label` change the defaults (512, `EFI` and `cryptos-state`); keep the default labels, because the node looks for its partitions by exactly those names.

Because no config is staged, the first boot from that disk encrypts the state partition and then waits in maintenance mode on its DHCP address. Send the config the same way as before, with `--insecure`; `install.disk` is not needed this time. The node saves it to the encrypted partition and reboots into the ceremony, the same place a normal install ends up.

## Next step

[Reboot into the ceremony](./reboot-ceremony.md).
