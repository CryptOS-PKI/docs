---
title: "📝 Declarative config (machine.yaml)"
---

# 📝 Declarative config (machine.yaml)

:::tip[Works today]
This describes CryptOS as it works right now.
:::

How you describe a node in one file instead of clicking around.

## One file describes the whole node

Everything a CryptOS node is told lives in one YAML document, the **machine config**, usually kept as `machine.yaml`. There is no settings screen and no command that changes one setting in place. To change a node you change the file and send the whole file.

That keeps the node's state easy to reason about: the file you hold is exactly what the node runs. You can review a change before it is sent, keep every version in git, and rebuild a node from its file.

## What is in it

Every machine config starts with the same two lines. Any other value is rejected, with no silent migration:

```yaml
apiVersion: cryptos.dev/v1alpha1
kind: MachineConfig
```

The rest is split into sections:

| Section | What it describes |
|---|---|
| `metadata` | `name`, the node's hostname. For people, not for trust. |
| `role` | `kind`: `root`, `intermediate` or `issuing`. See [CA roles](./ca-roles.md). |
| `network` | `interface`, `address` (CIDR), `gateway`, and optional `nameservers` and `search` domains. |
| `bootstrap` | The first administrator's client certificate, as `admin_cert_pem` or its `admin_cert_sha256`. Exactly one is required. |
| `pki` | The CA itself: key algorithm, subject, validity, the parent pin on a subordinate, certificate profiles, revocation endpoints, and the ACME and EST endpoints. |
| `install` | `disk`, the block device to install to. Used only by the [maintenance-mode](./maintenance-mode.md) install. |
| `state_key` | How the encrypted state partition is unlocked. Empty means the image's build-time default. See [The TPM and sealed keys](./tpm-sealed-keys.md). |
| `management` | Set when the node is linked to a [Fleet Manager](../fleet-manager/overview.md). Absent on a standalone node. |

A small Root looks like this:

```yaml
apiVersion: cryptos.dev/v1alpha1
kind: MachineConfig
metadata:
  name: pki-root
role:
  kind: root
network:
  interface: eth0
  address: 192.0.2.10/24
  gateway: 192.0.2.1
  nameservers: [192.0.2.53]
bootstrap:
  admin_cert_sha256: "<64 hex characters: SHA-256 of the admin certificate>"
pki:
  root_key_alg: ECDSA-P384
  root_subject:
    common_name: Example Root CA G1
    organization: Example Org
    country: US
  root_validity_years: 20
install:
  disk: /dev/nvme0n1
```

[Machine config schema](../reference/machine-config.md) lists every field and its rules.

## Where the config lives

The CryptOS image carries **no** machine config. The same image can become any node, and the config reaches it in one way only:

1. The node boots the image with an empty disk and comes up in [maintenance mode](./maintenance-mode.md).
2. You send the config with `cryptosctl config apply -f machine.yaml`. The node installs itself to `install.disk` and stages the config on the new disk's EFI partition.
3. On the first boot of the installed system, the node reads the staged copy, saves it to its encrypted state partition and deletes the staged file.
4. From then on, the copy on the encrypted state partition is the only one the node reads.

Because it sits on the encrypted partition, the config is unreadable to anyone holding the disk without the key that unlocks it.

## Changing a running node

The cycle is read, edit, apply:

```bash
cryptosctl --endpoint 192.0.2.10:443 config get > machine.yaml
# edit machine.yaml
cryptosctl --endpoint 192.0.2.10:443 config apply -f machine.yaml
```

`cryptosctl` runs on Linux and macOS today. A Windows build is coming. The connection flags (`--identity`, `--identity-key`, `--trust`) are covered in the [cryptosctl reference](../reference/cryptosctl.md).

`config get` prints the node's current config as YAML in the same schema `config apply` accepts, so you always start from what the node really has rather than from memory.

`config apply` **replaces** the whole config. `cryptosctl` checks the file before sending it, and the node checks it again. A config that fails a rule is refused with the field that broke it, for example:

```text
config: network.address: must be CIDR: ...
```

An unknown field is an error too, so a misspelt key is refused rather than silently ignored. When the node refuses a config, nothing is written: the node keeps running its old one.

:::tip[Expected output]
A line like this means the node accepted and saved the config:

```text
applied: generation=4 requires_reboot=true digest=<sha256>
```

- `generation` counts every config the node has saved.
- `digest` is the SHA-256 of the stored config, so you can compare it with what you meant to send.
- `requires_reboot` says whether the change is live yet. See below.
:::

### When a change takes effect

Most of the config is read once, at boot. Two fields are read live, every time the node signs:

- `pki.profiles`, the certificate profiles;
- `pki.root_leaf_issuance`.

A change limited to those two takes effect straight away and reports `requires_reboot=false`. Anything else (network, role, revocation settings, the management link, and so on) is saved but only takes effect on the next boot, and reports `requires_reboot=true`. The node never switches those at runtime.

:::warning[A reboot takes the CA offline]
Restart the node with an orderly shutdown, not a hypervisor hard reset:

```bash
cryptosctl --endpoint 192.0.2.10:443 reboot --confirm "Example Root CA G1"
```

`--confirm` must be the node's CA common name. The CA does not sign or answer the API until it is back up. Its management certificate is regenerated on every boot, so refresh your `--trust` pin afterwards.
:::

### Warnings that need a decision

`config apply` stops and asks before one change:

:::danger[allow_unverified_revocation_url is permanent for every certificate issued with it]
With `pki.allow_unverified_revocation_url: true`, the node issues certificates whose CRL and OCSP pointers were never checked to resolve. Those pointers are baked into each certificate. On a Root, every subordinate it signs inherits them. `cryptosctl` asks you to type the Root CA common name (or `yes` on a subordinate) before sending. Leave it `false` outside an isolated lab, and fix DNS for `pki.revocation_base_url` instead.
:::

`config apply` also prints a warning, without stopping, when a profile's `validity_days` runs past the node's own CA certificate. Certificates from that profile will be cut short to the CA's `notAfter`.

## Parts the API does not carry

:::caution[The acme and est blocks do not travel over the API]
`pki.acme` and `pki.est` hold secrets (account binding keys and enrolment passwords) and are not part of the API's config message. `config get` leaves them out, and `config apply` keeps whatever blocks the node already has. You cannot turn ACME or EST on, off or change them through `config apply` today.
:::

## The Fleet Manager uses the same file

A node linked to a [Fleet Manager](../fleet-manager/overview.md) is configured the same way. The Fleet Manager sends the same machine config over the same API call, so the rules on this page apply there too.

## Next

- [Maintenance mode and the install lifecycle](./maintenance-mode.md): how the first config arrives.
- [Apply a config change](../using/config-apply.md): the step-by-step task.
