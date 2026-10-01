---
title: "💻 Boot it in QEMU"
---

# 💻 Boot it in QEMU

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Start the image in a local virtual machine with a software TPM.

A real node gets its machine config from the installer: you boot the ISO, send the config, and the installer lays out the disk and stages the config on it. On your laptop you skip the installer and build that installed disk by hand, the same way the `cryptos` QEMU integration test does. Then you boot it.

:::info[Before you start]
You need:

- the debug UKI from [Build the image](./build-image.md), at `build/out/cryptos-amd64.uki.unsigned` in your `cryptos-node` checkout;
- QEMU, swtpm, OVMF, `sgdisk` and mtools from [What you need](./requirements.md).

Run the commands from the root of the `cryptos-node` checkout.
:::

:::info[Why not `task qemu:run`]
The Taskfile has a `task qemu:run` target, but it does not get you through this walkthrough. It boots the image with an empty state disk and no machine config, so the node waits in re-provision maintenance mode on the address DHCP gave it, and its port forward points at `10.0.0.10`, an address the node only takes once it has a config. The steps below stage the config first, the way the integration test does.
:::

## 1. Make a lab folder

Everything for this node lives in one folder. Set `LAB` in every terminal you use on these pages:

```bash
export LAB="$HOME/cryptos-lab"
mkdir -p "$LAB/esp/EFI/BOOT" "$LAB/swtpm"
cp build/out/cryptos-amd64.uki.unsigned "$LAB/esp/EFI/BOOT/BOOTX64.EFI"
cp /usr/share/OVMF/OVMF_VARS_4M.fd "$LAB/OVMF_VARS.fd"
```

`esp/` is a small boot partition that QEMU serves to the firmware. The firmware starts whatever sits at `EFI/BOOT/BOOTX64.EFI`, so that is where the UKI goes. `OVMF_VARS.fd` is your own writable copy of the firmware settings. Use the OVMF paths for your distribution if they differ.

## 2. Make your admin identity

The node trusts exactly one client on first boot: the **bootstrap admin** named in its machine config. Make that identity now with `cryptosctl bootstrap`. You install `cryptosctl` properly on a later page; for now run it straight from the source:

```bash
go run ./cmd/cryptosctl bootstrap
```

:::tip[Expected output]
Two files in `~/.cryptos/` and the certificate to put in the machine config:

```text
wrote /home/you/.cryptos/identity.crt
wrote /home/you/.cryptos/identity.key
SHA-256: <64 hex digits>

Stamp into machine config under bootstrap.admin_cert_pem (or admin_cert_sha256):
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
```
:::

The key is an ECDSA P-256 key and the certificate is self-signed, valid for one year, for client authentication only.

:::danger[The admin certificate expires, and an expired one locks you out]
The certificate lasts for its `--validity`, 365 days by default (`8760h`). Renew it before then, while it still works; [Make your admin identity](../using/bootstrap.md) covers the limits on that today. Once it expires the node refuses it, and the only way back in today is the console reset (**Ctrl-R**), which wipes the node's CA identity. The CA key survives a reset only if you exported it beforehand with `cryptosctl ca export-key`, and a node that keeps its key in the TPM refuses that export.
:::

:::caution[identity.key is the only key to this node]
Whoever holds `~/.cryptos/identity.key` can manage the node, and it is the only credential the node accepts. `cryptosctl bootstrap` overwrites both files if you run it again, so run it once. If you lose the key, you start again from a fresh disk.
:::

## 3. Write the machine config

The machine config says what the node is. This one makes a Root CA with an ECDSA P-384 key, on the address QEMU forwards to. The block below writes it to `$LAB/machine.yaml` and pastes in your certificate from step 2:

```bash
{
cat <<'EOF'
apiVersion: cryptos.dev/v1alpha1
kind: MachineConfig
metadata: {name: local-root}
role: {kind: root}
network: {interface: eth0, address: 10.0.0.10/24, gateway: 10.0.0.1}
bootstrap:
  admin_cert_pem: |
EOF
sed 's/^/    /' "$HOME/.cryptos/identity.crt"
cat <<'EOF'
pki:
  root_key_alg: ECDSA-P384
  root_subject: {common_name: "CryptOS Local Root", organization: "Local Lab", country: "US"}
  root_validity_years: 20
EOF
} > "$LAB/machine.yaml"
```

What each part means:

| Field | Value here | Meaning |
|---|---|---|
| `metadata.name` | `local-root` | the node's hostname |
| `role.kind` | `root` | a self-signed Root CA; the first-boot ceremony only runs for a Root |
| `network` | `eth0`, `10.0.0.10/24`, gateway `10.0.0.1` | the node's static address inside QEMU's private network |
| `bootstrap.admin_cert_pem` | your certificate | the one client the node trusts |
| `pki.root_key_alg` | `ECDSA-P384` | the Root key type. `RSA-3072` and `RSA-4096` also exist |
| `pki.root_subject` | CN, O, C | the name on the Root certificate |
| `pki.root_validity_years` | `20` | the Root certificate's lifetime, 1 to 30 years |

The [machine config reference](../reference/machine-config.md) covers every field.

:::caution[Keep the network block as shown]
QEMU forwards `127.0.0.1:4443` on your machine to `10.0.0.10:443` inside the VM, with `10.0.0.1` as the VM's gateway. If you change the address, the forward reaches nothing. Keep `admin_cert_pem` as the full certificate too: the node's mutual-TLS listener needs the whole certificate, and it refuses to start with only `admin_cert_sha256`.
:::

## 4. Build the installed disk

Make a 2 GiB disk image with the two partitions the installer would create: a 512 MiB EFI partition named `EFI`, and the rest as `cryptos-state`, which the node encrypts on first boot. Then copy the machine config onto the EFI partition at `EFI/cryptos/machine.yaml`, where the node looks for it.

```bash
truncate -s 2G "$LAB/installed.img"
sgdisk \
  --new=1:0:+512MiB --typecode=1:C12A7328-F81F-11D2-BA4B-00A0C93EC93B --change-name=1:EFI \
  --new=2:0:0 --typecode=2:CA7D7CCB-63ED-4C53-861C-1742536059CC --change-name=2:cryptos-state \
  "$LAB/installed.img"
sgdisk --info=1 "$LAB/installed.img" | grep 'First sector'
```

:::tip[Expected output]
`sgdisk` reports that it wrote the new table, then prints where the EFI partition starts:

```text
First sector: 2048 (at 1024.0 KiB)
```

The EFI partition starts 1024 KiB, that is 1048576 bytes, into the image. If your number differs, multiply the first sector by 512 and use that in place of `1048576` below.
:::

```bash
ESP="$LAB/installed.img@@1048576"
mformat -F -v EFI -i "$ESP" ::
mmd -i "$ESP" ::/EFI ::/EFI/cryptos
mcopy -i "$ESP" "$LAB/machine.yaml" ::/EFI/cryptos/machine.yaml
mdir -i "$ESP" ::/EFI/cryptos
```

:::tip[Expected output]
The last command lists `machine.yaml` on the EFI partition. If `mformat` fails, the offset is probably wrong: check the first sector again.
:::

## 5. Start the software TPM

```bash
swtpm socket --tpm2 --tpmstate dir="$LAB/swtpm" --ctrl type=unixio,path="$LAB/swtpm/sock" &
```

swtpm keeps the TPM's state in `$LAB/swtpm` and waits for QEMU on the socket.

:::danger[The TPM state and the disk belong together]
On first boot the node seals its disk key to this software TPM and creates the Root key inside it. Keep `$LAB/swtpm` with `installed.img`. If you delete or swap the TPM folder, the node can never unlock its disk again, and the Root key is gone with it. The same happens if you boot this disk with a rebuilt UKI.
:::

## 6. Boot the node

```bash
qemu-system-x86_64 \
  -machine q35,accel=kvm:tcg -m 2048 -nographic \
  -drive if=pflash,format=raw,unit=0,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
  -drive if=pflash,format=raw,unit=1,file="$LAB/OVMF_VARS.fd" \
  -chardev socket,id=chrtpm,path="$LAB/swtpm/sock" \
  -tpmdev emulator,id=tpm0,chardev=chrtpm \
  -device tpm-tis,tpmdev=tpm0 \
  -drive format=raw,file="fat:rw:$LAB/esp" \
  -drive if=none,id=state,format=raw,file="$LAB/installed.img" \
  -device virtio-blk-pci,drive=state \
  -netdev user,id=n0,net=10.0.0.0/24,host=10.0.0.1,hostfwd=tcp:127.0.0.1:4443-10.0.0.10:443 \
  -device virtio-net-pci,netdev=n0
```

This terminal is now the node's serial console. The flags are the ones the integration test uses:

- 🔐 **TPM:** `-tpmdev emulator` with `tpm-tis` connects the VM to swtpm.
- 💾 **Disks:** the `fat:rw:` drive is the boot partition with the UKI; `installed.img` is the node's disk, as a virtio disk.
- 🌐 **Network:** QEMU's private network is `10.0.0.0/24` with the host side at `10.0.0.1`. Only port 443 of the node is reachable, as `127.0.0.1:4443` on your machine.
- ⚡ **Speed:** `accel=kvm:tcg` uses KVM when it can and falls back to software emulation when it cannot.

## 7. Watch the first boot

The console shows the CryptOS banner, then each boot stage as it finishes. The debug image also prints the detailed kernel and init log in between.

1. **state volume.** The `cryptos-state` partition is empty, so the node formats it as an encrypted LUKS2 volume, seals the key to the TPM, and creates a filesystem inside it.
2. **configuration.** The node reads `EFI/cryptos/machine.yaml`, saves it inside the encrypted volume, and deletes the staged copy.
3. **network.** It sets its hostname and takes `10.0.0.10`.
4. **embedded etcd.** It starts its internal database.
5. **management API.** It opens the mutual-TLS API on port 443.

:::tip[Expected output]
Each stage is marked `[ok]` as it finishes, mixed in with the detailed log lines. When **management API** is marked, the node is up and waiting for its ceremony, and the console moves on to the node's dashboard.

```text
   [ok]  state volume
   [ok]  configuration
   [ok]  network
   [ok]  embedded etcd
   [ok]  management API
```

A stage marked `[!!]` failed. The boot stops there and the node restarts; there is no shell to fall back to.
:::

With KVM the boot is quick. Under software emulation, give it several minutes.

:::warning[Ctrl-R on the console starts a reset]
The dashboard takes keys from this terminal. Once the node has its Root, **Ctrl-R** opens the reset confirmation, and typing the Root CA's common name then Enter erases the node's identity. Press Esc to back out if you hit it by mistake.
:::

Leave QEMU running and open a second terminal for the next pages.

:::caution[Ctrl-A X pulls the power]
QEMU quits on **Ctrl-A**, then **X**, but that is the same as pulling the power cord: the node gets no orderly shutdown. Once the ceremony is done, stop the node with `cryptosctl reboot --power-off` instead, as shown in [Check identity and status](./check-status.md).
:::

## Next step

Install the CLI: [Install cryptosctl](./install-cryptosctl.md).
