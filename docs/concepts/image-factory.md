---
title: "🏭 Platform profiles and the image factory"
---

import Pre10Notice from '@site/docs/_partials/pre-1-0-notice.mdx';

# 🏭 Platform profiles and the image factory

:::tip[Works today]
This describes CryptOS as it works right now.
:::

How a bootable image is built for a target such as VMware. The step-by-step build is in [Build a bootable image](../install-deploy/build-bootable-image.md).

## One image, built from source

A CryptOS node runs a single file, the **Unified Kernel Image (UKI)**. Every CryptOS node on a platform runs the same UKI, whatever its role. What makes one node a Root and another an Issuing CA is its [machine config](./declarative-config.md), which is never part of the image.

The "image factory" is the build pipeline in the `cryptos-node` repository that turns source into that UKI and wraps it in a bootable ISO. It runs on a Linux build host, driven by [go-task](https://taskfile.dev):

```text
kernel      pinned kernel, hardened config + platform fragment
static tools  cryptsetup, mkfs.ext4, sgdisk, mkfs.vfat, built from source
rootfs      init + cryptosctl + console + tools, packed read-only as SquashFS
UKI         kernel + starter program + SquashFS + kernel command line, in one file
sign        Secure Boot signature with your own key (skipped for unsigned builds)
ISO         the UKI on a UEFI-only bootable ISO
```

Each stage is pinned: the kernel version and tool versions live in the repository, and the build date stamped into every binary is the commit time, so rebuilding the same commit gives the same identity.

## Platform profiles

Hardware differs. A VMware VM needs VMware's disk and network drivers; a KVM VM needs virtio. CryptOS builds its kernel with **no loadable modules**, so every driver a platform needs has to be compiled in.

A **platform profile** is how that is chosen. It is a small kernel-config fragment in `build/kernel/profiles/<platform>.config`, merged on top of the base kernel config. The base config alone covers the core system and virtio, which is enough for QEMU. A profile only adds.

The one profile today is `vmware`. It adds:

- disk controllers: NVMe, SATA AHCI, PVSCSI, and the CD-ROM and ISO 9660 support to boot from the ISO;
- network cards: Intel e1000e and VMware vmxnet3;
- the PS/2 keyboard driver, so the vSphere console's "Send Ctrl+Alt+Delete" reaches the node.

You pick the platform with `PLATFORM` when you build:

```bash
task iso PLATFORM=vmware
```

`task` targets run on a Linux build host only. `PLATFORM` defaults to `vmware` for `task iso`. Adding a platform means adding one fragment file; the base config and the rest of the pipeline stay the same.

## The state-key variant

The second choice at build time is `STATEKEY`, which decides how the node protects its state partition and CA key. It is separate from `PLATFORM`:

- `STATEKEY=tpm` (the default): TPM-sealed state key, CA key inside the TPM.
- `STATEKEY=nodeid`: no TPM needed. Development only.

[The TPM and sealed keys](./tpm-sealed-keys.md) explains both. The variant shows in the file name:

```text
build/out/cryptos-amd64-vmware.iso           TPM variant
build/out/cryptos-amd64-vmware-nodeid.iso    nodeid variant
```

## Signing: bring your own key

CryptOS ships no Secure Boot signing key and trusts none that the project made. For a real deployment you generate your own key and certificate and build with them:

```bash
export SB_KEY=/path/to/sb.key SB_CERT=/path/to/sb.crt
task iso PLATFORM=vmware
```

The build uses your key twice:

- **It signs the UKI** for Secure Boot. Enroll your certificate in the firmware's `db` to boot with Secure Boot on.
- **It stamps your certificate into the image as the upgrade anchor.** A node later accepts a new image only if that image's detached signature (`.uki.sig`, written next to the UKI) verifies against the anchor in the image it is running.

:::danger[Losing the signing key means reinstalling to upgrade]
A node accepts upgrades only from the key its image was built with. If you lose `SB_KEY`, no new image can be signed for your nodes, and moving them to a new key means reinstalling them. On a TPM-mode node a reinstall means a new CA key and a new CA identity. Store the key like the CA credential it is.
:::

[Secure Boot](../install-deploy/secure-boot.md) covers making the key, enrolling it and verifying a signed build.

## Unsigned images

`task iso:unsigned` builds the same ISO with no signature and no upgrade anchor, named with `-unsigned`, for example `cryptos-amd64-vmware-unsigned.iso`. The project's public release assets are built this way:

| Asset | What it is |
|---|---|
| `cryptos-amd64-vmware.uki.unsigned`, `cryptos-amd64-vmware-nodeid.uki.unsigned` | the UKI, TPM and nodeid variants |
| `cryptos-amd64-vmware-unsigned.iso`, `cryptos-amd64-vmware-nodeid-unsigned.iso` | the same UKIs on bootable ISOs |
| `cryptosctl-{linux,darwin}-{amd64,arm64}` | the CLI |
| `SHA256SUMS` | SHA-256 of every asset |

:::caution[Unsigned images are for evaluation]
An unsigned image boots only with Secure Boot off, and a node installed from one can never be upgraded in place, because it has no anchor to check a new image against. For a CA you intend to keep, build with your own key.
:::

## Upgrading in place

<Pre10Notice />

Because the image and the state partition are separate, a node can change images without losing its CA:

1. `cryptosctl image stage --image cryptos-amd64.uki` uploads the new signed image. The node checks the detached signature against its anchor before writing anything, keeps the current image for rollback, and does not reboot.
2. `cryptosctl image activate --confirm "<CA common name>"` reboots into the staged image.
3. `cryptosctl image rollback` puts the retained previous image back on the boot path if you need it.

`cryptosctl image status` shows the running and staged images. The state partition (CA key, issued history, identity) is never opened by an upgrade. In the reference deployment an upgrade cost about 8 to 11 seconds of downtime per node. `cryptosctl` runs on Linux and macOS.

## What is not available today

- There is no hosted image factory or download. You build the image yourself.
- `vmware` is the only platform profile.
- Only amd64 images have been booted. The pipeline takes an architecture, but there is no arm64 image.
