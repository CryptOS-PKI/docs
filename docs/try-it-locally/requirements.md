---
title: "🧾 What you need"
---

# 🧾 What you need

:::tip[Works today]
This describes CryptOS as it works right now.
:::

The tools to run CryptOS on your own machine: Linux, QEMU, swtpm, OVMF, and Go.

This section walks you from an empty machine to a running CryptOS Root CA inside a virtual machine. You build the image from source, boot it in QEMU with a software TPM, and run the first-boot ceremony with `cryptosctl`. Nothing here touches real hardware or your network, and you can throw the whole thing away when you are done.

## The stages

Work through the pages in order. Each one starts with what it needs from the pages before it.

| Stage | Page | What you end up with |
|---|---|---|
| 1 | What you need (this page) | a Linux machine with the build and VM tools |
| 2 | [Build the image](./build-image.md) | a debug UKI in `build/out/` |
| 3 | [Boot it in QEMU](./boot-qemu.md) | a node running in QEMU, waiting for its ceremony |
| 4 | [Install cryptosctl](./install-cryptosctl.md) | the CLI on your `PATH` |
| 5 | [Run the first-boot ceremony](./first-boot-ceremony.md) | a Root CA whose key was made inside the TPM |
| 6 | [Check identity and status](./check-status.md) | proof the Root certificate is valid and the node is healthy |

## A Linux machine

The image build and the virtual machine both run on **Linux on x86-64** (amd64). There is no macOS or Windows path for these steps today. If you are on macOS or Windows, use a Linux machine or a Linux virtual machine.

- 🐧 **Debian or Ubuntu is the easy path.** The package names below are the ones the CryptOS image build uses in CI, which runs on Ubuntu.
- ⚡ **KVM makes it fast.** QEMU uses KVM when `/dev/kvm` is there and your user can open it. Without it, QEMU falls back to full software emulation, which works but turns each boot into several minutes.
- 💾 **Room for a kernel build.** The build compiles a Linux kernel from source, so give it free disk space and time. The first build is the slow one.

Check KVM:

```bash
ls -l /dev/kvm
```

:::tip[Expected output]
A line for `/dev/kvm` means KVM is available. If the file is missing, you can still go on, but every boot is much slower. If it exists but belongs to a group you are not in (usually `kvm`), add yourself to that group and log in again.

```text
crw-rw---- 1 root kvm 10, 232 ... /dev/kvm
```
:::

## Hardware

Two machines are involved, even when they are the same box: the **node**, which is the virtual machine CryptOS runs in, and the **build host**, which compiles the image and runs QEMU.

### The node

These are the sizes CryptOS is tested with: the `cryptos` QEMU integration test, `task qemu:run` and the walkthrough on these pages all boot the node this way. Treat them as the minimum for a node.

| Resource | Minimum | Notes |
|---|---|---|
| vCPU | 1 | QEMU's default; the test boots pass no `-smp`. |
| RAM | 2 GiB | QEMU `-m 2048`. |
| Disk | 2 GiB | A 512 MiB EFI partition for the images, and the rest as the encrypted `cryptos-state` partition. The installer gives the state partition whatever is left, so a bigger disk leaves more room for issued certificates and the audit log. |
| TPM | TPM 2.0 with ECDSA P-384 | swtpm on these pages, a vTPM on VMware. The default image seals its disk key to the TPM and makes its CA key inside it, and it does not finish booting on a TPM without ECDSA P-384. |
| Firmware | UEFI | OVMF here. Legacy BIOS can't boot a UKI. The debug image built on these pages is unsigned, so Secure Boot stays off. |
| Network | 1 NIC | virtio-net in QEMU. The `vmware` image has the e1000e and vmxnet3 drivers built in. |
| Disk controller | any the image has a driver for | virtio-blk in QEMU. The `vmware` image has NVMe, SATA/AHCI and PVSCSI built in. |

### The build host

- **Linux on x86-64**, with KVM if you can (see below).
- **Tested size:** the `cryptos` CI builds the image on GitHub's standard hosted Linux runner, which has 4 vCPUs and 16 GB of RAM. A machine that size builds it; smaller ones have not been measured.
- **Room for the node on top**, if you run QEMU on the same machine: its 1 vCPU and 2 GiB of RAM, plus the 2 GiB disk image.
- **Free disk space** for the kernel source, the Docker images that build the static disk tools, and the build output. No exact figure has been measured.

The Fleet Manager isn't part of this walkthrough. No sizing has been measured for it, and its chart sets no resource requests or limits.

## Build tools

These turn the `cryptos` source into a bootable image.

- **Git**, to clone the source. Clone the whole history: the build stamps its version from `git describe`.
- **Go**, at the version in the `cryptos` `go.mod` (Go 1.26 today).
- **go-task**, the `task` command. Every build step is a `task` target.
- **Docker**, usable by your user without `sudo`. The static disk tools baked into the image (`cryptsetup`, `mkfs.ext4`, `sgdisk`, `mkfs.vfat`) are compiled from source inside containers.
- **The kernel and image tools**, from your package manager.

On Debian or Ubuntu:

```bash
sudo apt-get install -y --no-install-recommends \
  build-essential bc flex bison libelf-dev libssl-dev xz-utils \
  squashfs-tools sbsigntool systemd-ukify systemd-boot-efi cpio \
  python3-pefile xorriso mtools dosfstools git
```

Install go-task with Go, the same way the CI build does:

```bash
go install github.com/go-task/task/v3/cmd/task@latest
```

`go install` puts `task` in `$(go env GOPATH)/bin`. Make sure that folder is on your `PATH`.

:::caution[ukify needs the system Python]
`ukify` needs the Python `pefile` module. The build runs `ukify` with `/usr/bin/python3`, so `python3-pefile` from the package manager is the one that counts. If it is missing, the last build step stops with `cannot import pefile, which ukify needs (install python3-pefile)`.
:::

## Virtual machine tools

These run the image.

- **QEMU** (`qemu-system-x86_64`), the virtual machine.
- **swtpm**, a software TPM 2.0. The default image seals its disk key to a TPM and makes its CA key inside one, and swtpm stands in for the chip.
- **OVMF**, the UEFI firmware for QEMU. CryptOS boots as a UEFI application, so it needs UEFI firmware, not a legacy BIOS.
- **sgdisk** and **mtools**, to prepare the virtual disk the node boots with. mtools is already in the build list above.
- **openssl**, to look at the Root certificate at the end.

On Debian or Ubuntu:

```bash
sudo apt-get install -y qemu-system-x86 swtpm ovmf gdisk openssl
```

On Ubuntu the OVMF package installs the firmware as `/usr/share/OVMF/OVMF_CODE_4M.fd` and `/usr/share/OVMF/OVMF_VARS_4M.fd`. Other distributions use other paths. Look for the pair of files **without** `secboot` or `ms` in the name: the image you build here is not signed, so it needs firmware with Secure Boot off.

## Check everything is there

```bash
for t in git go task docker ukify mksquashfs cpio qemu-system-x86_64 swtpm sgdisk mcopy openssl; do
  command -v "$t" >/dev/null || echo "missing: $t"
done
go version
docker run --rm hello-world
```

:::tip[Expected output]
The loop prints nothing when every tool is on your `PATH`. Any `missing:` line names a tool to install before you go on. `go version` should report 1.25 or newer, and the Docker test container should print its greeting without `sudo`.
:::

## Next step

Build the image: [Build the image](./build-image.md).
