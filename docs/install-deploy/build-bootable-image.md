---
title: "💿 Build a bootable image"
---

# 💿 Build a bootable image

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

A CryptOS node boots from one file: a **Unified Kernel Image** (UKI). The UKI holds the kernel, a tiny start-up program, and the read-only system image, all in one signed file. To install a node you usually wrap that UKI in an **ISO** and boot the machine or virtual machine from it.

This page shows how to build the ISO from the `cryptos` source code.

## Two choices to make first

Two settings shape the image. Both are chosen when you build, not later.

| Setting | Values | What it decides |
|---|---|---|
| `PLATFORM` | `vmware` | Which extra hardware drivers go into the kernel. `vmware` adds the NVMe, AHCI and PVSCSI disk drivers and the e1000e and vmxnet3 network drivers. |
| `STATEKEY` | `tpm` (default) or `nodeid` | How the node protects its encrypted disk and its CA key. |

### `STATEKEY=tpm` or `STATEKEY=nodeid`

- 🔐 **`tpm`** is the real thing. The key that unlocks the node's encrypted state disk is sealed to the TPM security chip, and the CA key is created inside the TPM and can never be exported. The machine needs a TPM 2.0 (a vTPM on a virtual machine) that supports ECDSA P-384, or the node refuses to boot.
- 🧪 **`nodeid`** is for hosts that cannot give the guest a vTPM, such as a standalone ESXi host. It uses no TPM at all. The disk key is derived from the machine's SMBIOS product UUID, and the CA key is made in software and stored on the encrypted disk. `cryptosctl status` shows `TPM: UNAVAILABLE` on these nodes so the weaker setup is never hidden.

:::danger[nodeid is for testing only]
A machine UUID is not a secret. Anyone who has both a copy of the disk and the UUID can recover the CA key. Use `nodeid` to try CryptOS where no vTPM is available, never for a CA that guards real trust.
:::

## What you need

The image build runs on a **Linux** build host. You need:

- The `cryptos` source: `git clone https://github.com/CryptOS-PKI/cryptos`.
- Go, at the version in `go.mod`, and [go-task](https://taskfile.dev) (the `task` command).
- Docker. The static disk tools (`cryptsetup`, `mkfs.ext4`, `sgdisk`, `mkfs.vfat`) are built from source inside containers.
- The kernel and image tools. On Debian or Ubuntu:

```bash
sudo apt-get install -y --no-install-recommends \
  build-essential bc flex bison libelf-dev libssl-dev xz-utils \
  squashfs-tools sbsigntool systemd-ukify systemd-boot-efi cpio \
  python3-pefile xorriso mtools dosfstools
```

`ukify` needs the Python `pefile` module. If a version manager such as pyenv hides the system Python, install `pefile` into the Python that `ukify` actually runs (`python3 -m pip install pefile`).

## Build a signed ISO (for real use)

A signed image is the only kind a node can later **upgrade in place**. You sign it with your own Secure Boot key; CryptOS ships no key of its own. Make the key first, as shown in [Secure Boot enrollment](./secure-boot.md), then build:

```bash
export SB_KEY="$HOME/cryptos-sb/sb.key"
export SB_CERT="$HOME/cryptos-sb/sb.crt"

task iso PLATFORM=vmware              # TPM-backed image
task iso PLATFORM=vmware STATEKEY=nodeid   # TPM-less test image
```

Keep both variables set for the whole run. `SB_CERT` is read twice: once to stamp the certificate into the image as its **upgrade anchor** (the key a later image must be signed with), and once to sign the finished UKI.

The files land in `build/out/`:

| File | What it is |
|---|---|
| `cryptos-amd64.uki` | the signed UKI |
| `cryptos-amd64.uki.sig` | the detached signature a node checks before it accepts an upgrade |
| `cryptos-amd64-vmware.iso` | the bootable installer ISO (`cryptos-amd64-vmware-nodeid.iso` for `STATEKEY=nodeid`) |

`task image` runs the same chain but stops at the signed UKI, without making an ISO.

## Build an unsigned ISO (for evaluation)

To try CryptOS with Secure Boot turned off, you can skip the key:

:::danger[An unsigned image can never be upgraded]
An unsigned image carries **no upgrade anchor**, even if `SB_KEY` and `SB_CERT` are set in your shell, so a node installed from it can never be upgraded in place. Replacing its image means installing again, which destroys its CA key. For a node you plan to keep, build a signed ISO instead.
:::

```bash
task iso:unsigned PLATFORM=vmware
task iso:unsigned PLATFORM=vmware STATEKEY=nodeid
```

This writes `build/out/cryptos-amd64-vmware-unsigned.iso` (or `...-vmware-nodeid-unsigned.iso`).

## Release downloads

Each tagged `cryptos` release attaches ready-made files to its GitHub Release: the unsigned UKIs and ISOs for both `STATEKEY` variants, `cryptosctl` for Linux and macOS on amd64 and arm64, and a `SHA256SUMS` file. They are built exactly like `task iso:unsigned` above, so they are for evaluation with Secure Boot off. For a node you plan to keep, build a signed image yourself.

## Next step

Boot the ISO on the target machine: [Boot and maintenance mode](./boot-maintenance.md).
