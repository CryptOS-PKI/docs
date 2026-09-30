---
title: "🛠️ Build the image"
---

# 🛠️ Build the image

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Turn the source into a bootable image with one task command.

A CryptOS node boots from one file, a **Unified Kernel Image** (UKI). It holds the hardened kernel, a tiny start-up program, and the read-only system image. For QEMU you build the **debug** flavour of it, which sends everything to a serial console so you can watch the node boot in your terminal.

:::info[Before you start]
You need a Linux machine with the build tools from [What you need](./requirements.md): Git, Go, go-task, Docker and the kernel and image packages.
:::

## 1. Get the source

Clone the `cryptos` repository with its full history, so the build can stamp its version:

```bash
git clone https://github.com/CryptOS-PKI/cryptos.git
cd cryptos
```

Run every command on this page, and the `task` and `go` commands on the next pages, from the root of this checkout.

## 2. Build the debug image

```bash
task image:debug
```

This one target runs the whole chain in order:

| Step | Task | What it makes in `build/out/` |
|---|---|---|
| 1 | `kernel:build` | the hardened kernel, built from the pinned stable release in `build/ci/versions.env` |
| 2 | `cryptsetup:build` | a static `cryptsetup`, built in a Docker container |
| 3 | `e2fsprogs:build` | a static `mke2fs`, built in a Docker container |
| 4 | `sgdisk:build` | a static `sgdisk`, built in a Docker container |
| 5 | `mkfsvfat:build` | a static `mkfs.vfat`, built in a Docker container |
| 6 | `rootfs:build` | the read-only SquashFS system image, with `init`, `cryptosctl`, the console and the tools above |
| 7 | `uki:assemble` (`PROFILE=qemu-dev`) | the UKI itself |

The kernel compile is by far the longest step. Its tree is kept under `build/.work/kernel`.

:::tip[Expected output]
The last line names the finished image. `profile=qemu-dev` confirms it is the debug flavour.

```text
uki: wrote /path/to/cryptos/build/out/cryptos-amd64.uki.unsigned (profile=qemu-dev, rootfs=squashfs)
```

If the build stops earlier, `task` names the step that failed. When it is one of the Docker steps, check that `docker run --rm hello-world` works without `sudo`.
:::

## What makes the debug image different

The debug image and the production image come from the same source. Only the kernel command line baked into the UKI differs:

| | Debug (`task image:debug`) | Production (`task image`) |
|---|---|---|
| Console | the serial port (`console=ttyS0`), with the detailed boot log | the screen (`console=tty0`), quiet |
| Signed | never | with your own Secure Boot key (`task image:unsigned` skips signing) |

Both keep `lockdown=confidentiality` and take their first address from DHCP. Both have no shell and no login.

:::caution[The debug image is for your own machine only]
The debug image is never signed and never published. Use it to learn CryptOS in QEMU. To install a real node, build a signed image as shown in [Build a bootable image](../install-deploy/build-bootable-image.md).
:::

## The disk key: TPM or nodeid

By default the image is TPM-backed: the key that unlocks the node's encrypted state disk is sealed to the TPM, and the Root CA key is made inside the TPM. That is what you want here, because QEMU gets a software TPM on the next page.

The build also has a TPM-less variant, `STATEKEY=nodeid`, for hosts that cannot give a guest a TPM. Leave it out for this walkthrough. [Build a bootable image](../install-deploy/build-bootable-image.md) explains when it applies and why it is for testing only.

## If you change the source

Run `task image:debug` again after any change to the source. The new UKI replaces the old one in `build/out/`.

:::warning[A rebuilt image cannot open an old node's disk]
The node seals its disk key to TPM measurements that include the UKI itself. A node set up with one build cannot unlock its state disk when you boot it with a different build, so the boot stops. After a rebuild, prepare a fresh disk and TPM state on the next page.
:::

## Next step

Boot the image: [Boot it in QEMU](./boot-qemu.md).
