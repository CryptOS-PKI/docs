---
title: "📄 Machine config schema"
---

# 📄 Machine config schema

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Every field in `machine.yaml` and what it means.

A CryptOS node is described by one YAML document, the **machine config**. It sets the node's role, its network, the administrator it trusts on first boot, and every certificate setting. The node has no other settings and no way to change them by hand. See [Declarative config](../concepts/declarative-config.md) for the idea behind it.

The schema is long, so it is split across three pages:

- **This page:** the document header, `metadata`, `role`, `network`, `bootstrap`, `install`, `state_key` and `management`, plus how the node reads and applies a config.
- **[Machine config: pki](./machine-config-pki.md):** the CA key, subject and lifetime, the parent anchor, revocation, and certificate profiles.
- **[Machine config: ACME and EST](./machine-config-enrollment.md):** the two enrolment protocols.

## 🧾 A complete example

A Root CA with a static address, a DNS server, and a revocation URL:

```yaml
apiVersion: cryptos.dev/v1alpha1
kind: MachineConfig
metadata:
  name: root-ca-1
role:
  kind: root
network:
  interface: eth0
  address: 192.0.2.10/24
  gateway: 192.0.2.1
  nameservers: [192.0.2.53]
  search: [example.org]
  ntp_servers: [192.0.2.123]
bootstrap:
  admin_cert_pem: |
    -----BEGIN CERTIFICATE-----
    (the bootstrap admin certificate from cryptosctl bootstrap)
    -----END CERTIFICATE-----
install:
  disk: /dev/sda
state_key:
  mode: tpm
pki:
  root_key_alg: ECDSA-P384
  root_subject:
    common_name: Example Root CA
    organization: Example Org
    country: US
  root_validity_years: 20
  revocation_base_url: http://pki.example.org
```

With a real certificate in `admin_cert_pem`, this document passes the node's validator as written.

## 🔍 How the node reads it

- **Strict parsing.** An unknown or misspelled key is an error, not something silently ignored. A stray `name` under `role`, for example, fails like this:

  ```text
  config: parse YAML: yaml: unmarshal errors:
    line 5: field name not found in type config.Role
  ```

- **One error at a time.** Validation stops at the first rule that fails and names the field path, for example `config: network.gateway: must be IP: ...`. Fix it and validate again.
- **Checked on both ends.** `cryptosctl config apply` validates the file on your machine before it sends anything, and the node validates again before it writes. A config the node rejects comes back as `InvalidArgument` and nothing is written.
- **No network checks at validation time.** URLs are checked for shape only. Whether a name resolves or a server answers is checked at run time, because the node may validate its config before its network is up.

The node keeps the applied config at `/var/lib/cryptos/config/machine.yaml` on its encrypted state partition, next to a `generation` counter that goes up by one with every successful apply.

## 📋 Top-level fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `apiVersion` | string | yes | Must be exactly `cryptos.dev/v1alpha1`. |
| `kind` | string | yes | Must be exactly `MachineConfig`. |
| `metadata` | object | no | Operator-facing name. |
| `role` | object | yes | The CA role the node boots into. |
| `network` | object | yes | Static IPv4 network settings. |
| `bootstrap` | object | yes | The administrator certificate trusted on first boot. |
| `pki` | object | yes | CA settings. See [Machine config: pki](./machine-config-pki.md). |
| `install` | object | for an install | The disk the maintenance-mode installer writes to. |
| `state_key` | object | no | How the state-partition key is protected. |
| `management` | object | no | Set when a Fleet Manager links the node. |

| Rule | Error |
|---|---|
| `apiVersion` is not `cryptos.dev/v1alpha1` | `config: apiVersion: expected "cryptos.dev/v1alpha1", got "<value>"` |
| `kind` is not `MachineConfig` | `config: kind: expected "MachineConfig", got "<value>"` |
| Empty file | `config: empty input` |

## 🏷️ metadata

| Field | Type | Default | Meaning |
|---|---|---|---|
| `metadata.name` | string | empty | The node's hostname, set at boot. It is not used for trust. Empty leaves the hostname unset. |

## 🎭 role

| Field | Type | Default | Meaning |
|---|---|---|---|
| `role.kind` | string | none | `root`, `intermediate` or `issuing`. See [CA roles](../concepts/ca-roles.md). |

A `root` node creates and self-signs its own key in the first-boot ceremony. An `intermediate` or `issuing` node generates its key at first boot, stages a CSR, and waits for its parent to sign it. It must pin that parent under `pki.parent`.

| Rule | Error |
|---|---|
| Any other value | `config: role.kind: must be one of "root"/"intermediate"/"issuing", got "<value>"` |

## 🌐 network

The node is IPv4 only. At boot it flushes any address the kernel got over DHCP and applies these settings, so the static address is the one that counts.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `network.interface` | string | none | The interface name, for example `eth0`. Required. |
| `network.address` | string | none | The node's address in CIDR form, for example `192.0.2.10/24`. The management API listens on this address, port 443. Required. |
| `network.gateway` | string | none | The default gateway, as an IP address. Required. |
| `network.nameservers` | list of strings | empty | Up to 3 DNS servers, as IPv4 addresses, tried in order. Empty falls back to the DNS servers from the kernel's DHCP lease, if it had one. |
| `network.search` | list of strings | empty | Up to 6 DNS search domains, in order. Empty falls back to the domain from the DHCP lease, if any. |
| `network.ntp_servers` | list of strings | empty | Up to 3 time servers the node keeps its clock in sync with, each an IPv4 address or a hostname. A hostname is looked up at every poll. Empty falls back to the NTP servers from the kernel's DHCP lease (option 42); with neither, the node runs on its hardware clock. See [Keep the clock in sync](../using/time-sync.md). |

| Rule | Error |
|---|---|
| `interface` empty | `config: network.interface: required` |
| `address` not CIDR | `config: network.address: must be CIDR: <reason>` |
| `gateway` not an IP address | `config: network.gateway: must be IP: <reason>` |
| More than 3 nameservers | `config: network.nameservers: at most 3 entries, got <n>` |
| A nameserver that is not IPv4 | `config: network.nameservers[<i>]: must be an IPv4 address, got "<value>"` |
| `0.0.0.0`, multicast or `255.255.255.255` | `config: network.nameservers[<i>]: <address> is not a unicast address` |
| The same nameserver twice | `config: network.nameservers[<i>]: <address> is listed twice` |
| More than 6 search domains | `config: network.search: at most 6 entries, got <n>` |
| A search domain that is not a valid DNS name | `config: network.search[<i>]: <reason>`, for example `"<name>" has a label starting or ending with a hyphen` |
| More than 3 time servers | `config: network.ntp_servers: at most 3 entries, got <n>` |
| A time server that is neither an IPv4 address nor a valid hostname | `config: network.ntp_servers[<i>]: must be an IPv4 address or a hostname: <reason>` |
| An IPv6 time server | `config: network.ntp_servers[<i>]: must be an IPv4 address, got "<value>"` |
| An IPv4 time server that is `0.0.0.0`, multicast or `255.255.255.255` | `config: network.ntp_servers[<i>]: <address> is not a unicast address` |
| The same time server twice | `config: network.ntp_servers[<i>]: <value> is listed twice` |

A search domain may use letters, digits and hyphens, in labels of 1 to 63 characters, 253 characters at most, with an optional trailing dot.

:::caution[An IPv6 address passes validation but not boot]
The validator accepts any CIDR, but the node configures IPv4 only. With an IPv6 `network.address` the node fails at boot with `netlink: configure: "<interface>" needs a valid IPv4 address/prefix`. Use an IPv4 address.
:::

:::caution[Set nameservers when the revocation URL is a hostname]
If `pki.revocation_base_url` names a host and `network.nameservers` is empty, `cryptosctl config apply` prints a `WARNING:` saying the node can resolve that host only if its DHCP lease supplies DNS servers. Without a resolver the revocation preflight fails and the node refuses all issuance. Set `network.nameservers` to servers that resolve the name.
:::

:::caution[A time server hostname needs nameservers too]
If `network.ntp_servers` names a host and `network.nameservers` is empty, `cryptosctl config apply` prints a `WARNING:`: the node can look the host up only if its DHCP lease supplies DNS servers. If it can't, that server is never asked and, with no other server answering, the node refuses to sign until its clock syncs. Set `network.nameservers`, or name the server by IPv4 address. An empty `ntp_servers` also prints a `WARNING:`, which is expected on an offline Root.
:::

## 🔑 bootstrap

The administrator certificate the node trusts on first boot. The first-boot ceremony must be run by this certificate (or over the node's local socket), and the ceremony then promotes it to the node's administrator. `cryptosctl bootstrap` makes one; see [Bootstrap](../using/bootstrap.md).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `bootstrap.admin_cert_pem` | string | empty | The full certificate, as one PEM `CERTIFICATE` block. |
| `bootstrap.admin_cert_sha256` | string | empty | The certificate's SHA-256 fingerprint, as 64 hex characters. |

Set exactly one of the two.

| Rule | Error |
|---|---|
| Both or neither set | `config: bootstrap: exactly one of admin_cert_pem or admin_cert_sha256 is required` |
| Fingerprint not 64 characters | `config: bootstrap.admin_cert_sha256: must be 64 hex characters, got <n>` |
| Fingerprint not hex | `config: bootstrap.admin_cert_sha256: not hex: <reason>` |
| No PEM block | `config: bootstrap.admin_cert_pem: no PEM block found` |
| Wrong PEM type | `config: bootstrap.admin_cert_pem: PEM type "<type>", want CERTIFICATE` |
| More than one block | `config: bootstrap.admin_cert_pem: must contain exactly one PEM block` |
| Not a parseable certificate | `config: bootstrap.admin_cert_pem: parse: <reason>` |

:::warning[Use admin_cert_pem on a node you manage over the network]
A fingerprint-only config validates, but the node's mTLS listener needs the full certificate to verify clients against. With only `admin_cert_sha256` set, the node stops at boot with `init: ServerTLSConfig: the mTLS listener needs the full bootstrap admin certificate (PEM), not just a fingerprint`, and PID 1 reboots. Put the whole certificate in `admin_cert_pem`.
:::

## 💽 install

| Field | Type | Default | Meaning |
|---|---|---|---|
| `install.disk` | string | empty | The block device the maintenance-mode installer writes CryptOS to, for example `/dev/nvme0n1`. An installed node ignores it. |

The validator doesn't check this field, but a maintenance-mode install refuses without it: `apply-config: install.disk is required for a maintenance-mode install`. See [Install to disk](../install-deploy/install-to-disk.md).

:::danger[The install disk is wiped]
The installer erases the whole device named in `install.disk`. Check the name against the disks the node lists before you apply the config.
:::

## 🔒 state_key

How the key for the encrypted state partition (and, with it, the CA key) is protected. See [TPM-sealed keys](../concepts/tpm-sealed-keys.md).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `state_key.mode` | string | empty | `tpm`, `nodeid`, `kms`, or empty for the build-time default of the image that installs the node. Fixed at install. Standard images default to `tpm`; the nodeID image variant defaults to `nodeid`. |
| `state_key.kms.endpoint` | string | none | The base URL of the seal and unseal KMS. Required when `mode` is `kms`. |
| `state_key.kms.trust_pem` | string | empty | A PEM CA bundle that verifies the KMS server's TLS certificate. |

| Mode | State-partition key | CA key |
|---|---|---|
| `tpm` | Sealed by the TPM | Created and held inside the TPM. The TPM must support ECDSA P-384, and for an RSA CA key, that RSA size. |
| `nodeid` | Derived from the machine's SMBIOS UUID | Software key, stored on the encrypted state partition. |
| `kms` | Wrapped by the external KMS | Software key, stored on the encrypted state partition. |

Set the mode before the install. The node needs it before it can unlock the state partition, so on its first boot it reads `state_key` from the config the installer stages on the boot partition, and falls back to the image's build-time default when none is staged. Every later boot reads the mode from the state partition's LUKS2 header, which records how the partition was sealed, so the mode survives reboots and upgrades to an image built with a different `STATEKEY`. For `kms`, the endpoint also comes from the header rather than from the config.

| Rule | Error |
|---|---|
| Unknown mode | `config: state_key.mode: must be one of "nodeid"/"tpm"/"kms" (empty = build default), got "<value>"` |
| `kms` mode without a `kms` block | `config: state_key.kms: required when state_key.mode is "kms"` |
| Endpoint not an `http` or `https` URL with a host | `config: state_key.kms.endpoint: must be an http(s) URL` |
| A different mode on an installed node (`FailedPrecondition`, nothing stored) | `config: state_key.mode "<value>": this node's state volume is sealed in "<mode>" mode, which is fixed at install; reinstall the node to change it` |

:::danger[nodeid mode is for development only]
A machine's SMBIOS UUID is not a secret. In `nodeid` mode the state partition is tied to the machine, but anyone who can read the UUID and the disk can derive its key, and the CA key is a software key on that partition. Don't run a production CA in `nodeid` mode.
:::

:::caution[An RSA CA key in tpm mode needs a TPM with that RSA size]
With `mode: tpm` and an RSA `pki.root_key_alg`, the CA key is created in the TPM, with the same protections as the ECDSA key. The TPM 2.0 spec only requires RSA-2048, and many TPMs implement nothing larger. If yours lacks RSA-3072 (or RSA-4096), the root ceremony fails with `FailedPrecondition` and an error containing `tpm: key algorithm not supported by this TPM: RSA-3072`, before any key is created, and you can run it again with another algorithm. An intermediate or issuing node creates its key at boot, so its boot stops on the same error. The node never falls back to a smaller size or a software key. The boot log line `init: TPM capabilities: ... RSA key sizes [...]` lists the sizes the TPM accepted. In `nodeid` and `kms` mode an RSA CA key is a software key and is not hardware-protected.
:::

## 🛰️ management

Set by the Fleet Manager when it links the node (the node's `SetManagement` RPC writes it). Leave it out on an unmanaged node. It takes effect on the next reboot.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `management.manager_cn` | string | none | The subject CN of the managing Fleet Manager's operator identity. Required when the block is set. |
| `management.trust_pem` | string | none | The PEM trust anchor (operator CA) for the Fleet Manager. Required when the block is set. |
| `management.operator_surface_readonly` | boolean | `false` | Marks the node's own operator surface as read-only. |

| Rule | Error |
|---|---|
| `manager_cn` empty | `config: management.manager_cn: required when management is set` |
| `trust_pem` empty | `config: management.trust_pem: required when management is set` |

:::info[Stored, not enforced]
In this alpha the node validates and keeps the `management` block, but its mTLS listener still verifies clients against the bootstrap admin certificate only.
:::

## 🔁 Applying a change

Apply a new config with `cryptosctl config apply -f machine.yaml` (see [Apply a config](../using/config-apply.md)) or from the Fleet Manager. The reply names the new generation and whether the change needs a reboot:

:::tip[Expected output]
A successful apply prints one line. `requires_reboot=false` means the change is already live.

```text
applied: generation=<n> requires_reboot=<true|false> digest=<sha256 of the stored YAML>
```
:::

- **Live, no reboot:** a change to `pki.profiles`, `pki.root_leaf_issuance`, `pki.allow_unverified_revocation_url` or `pki.allow_unsynced_clock`. The signer reads them from the stored config on every request, and the apply reports `requires_reboot=false`.
- **Reboot needed:** everything else, including network (`ntp_servers` too), role, the revocation base URL and port, `management`, and switching ACME or EST on or off or changing their settings. These are read once at boot. Until the reboot, `cryptosctl status` prints `Reboot: pending`.
- **Refused:** a different `state_key.mode`. The mode is fixed at install; see [state_key](#-state_key).

`cryptosctl config apply` also prints a `WARNING:` line for each profile whose `validity_days` already runs past the node's own CA certificate. It's a warning; the config is still applied.

:::caution[What an apply can't carry]
`cryptosctl config apply` and the Fleet Manager send the config as the API's `MachineConfig` message, which doesn't cover every YAML field. **A profile's `subject.province` and `subject.locality`** are dropped, because the profile subject in the message carries only `common_name`, `organization` and `country`. The CA's own `root_subject` keeps all five.

`cryptosctl ceremony start --config machine.yaml` sends your file as-is, so those fields survive there.
:::

`pki.acme` and `pki.est` travel in the message, with their secrets write-only: `cryptosctl config get` prints them blank and an apply that leaves them blank keeps the stored ones. See [Machine config: ACME and EST](./machine-config-enrollment.md).

The `MachineConfig` message also has a `storage` field (`state_partition_label`, `first_boot`) that the node ignores. For the message itself, see the [gRPC API reference](./grpc-api.md).
