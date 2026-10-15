---
title: "📋 Prepare the node"
---

# 📋 Prepare the node

Make the two things a CryptOS node needs before it can boot: an admin identity, and a machine config that names it.

A real node gets its machine config from the installer: you boot the ISO, send the config, and the installer lays out the disk and stages the config on it. On your laptop you skip the installer and build that installed disk by hand, the same way the `cryptos-appliance` QEMU integration test does. This page makes the pieces; [Boot it in QEMU](./boot-qemu.md) puts them on a disk and starts the node.

:::info[Before you start]
You need:

- the debug UKI from [Build the image](./build-image.md), at `build/out/cryptos-amd64.uki.unsigned` in your `cryptos-appliance` checkout;
- `cryptosctl`'s source, from the `cryptos-node` checkout `cryptos-appliance` pinned.

Run the commands from the root of the `cryptos-appliance` checkout.
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

## Next step

Build the node's disk and boot it: [Boot it in QEMU](./boot-qemu.md).
