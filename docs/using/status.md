---
title: "📊 Check status"
---

# 📊 Check status

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Read a node's role, identity state, and health.

`cryptosctl status` is the first command to run against any node: after an install, after a reboot, before a ceremony, and whenever something looks wrong. It changes nothing on the node.

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::info[Before you start]
- `cryptosctl` set up to reach the node, with a fresh pin: [Setup](./setup.md).
:::

## Run it

```bash
cryptosctl --endpoint 192.0.2.10:443 status
```

:::tip[Expected output]
A healthy Root after its ceremony:

```text
Role:            ROOT
Identity:        ESTABLISHED
TPM:             OK
etcd:            OK
Boot count:      3
Version:         <the image version>
Revocation:      NOT_CONFIGURED
DNS:             MACHINE_CONFIG 192.0.2.53
```
:::

## What each line means

### Role

The role the node booted into, from `role.kind` in its machine config: `ROOT`, `INTERMEDIATE` or `ISSUING`.

### Identity

Whether the node has its CA identity yet.

| Value | Meaning | What to do |
|---|---|---|
| `NONE` | a Root with no CA yet | [start the ceremony](./ceremony-start.md) |
| `CEREMONY_IN_PROGRESS` | the ceremony has started and has not finished | wait for it; if it failed, run it again |
| `AWAITING_CERT` | a subordinate that has made its key and CSR and waits for its parent to sign them | carry the CSR to the parent (see [Subordinate nodes](../install-deploy/reboot-ceremony.md)) |
| `ESTABLISHED` | the node has its CA identity and can sign | nothing; [check it](./identity.md) |

### TPM

| Value | Meaning |
|---|---|
| `OK` | the TPM opened and supports what the node needs; CA keys are made inside it |
| `UNAVAILABLE` | the node runs without a TPM: a `nodeid` image, or one that keeps its state key in an external KMS. The CA key is kept in software |

A TPM image that cannot open its TPM, or whose TPM lacks ECDSA P-384, does not finish booting, so a serving node never shows those failures here.

### etcd

The node's internal database. It reads `OK` on a serving node; the alpha does not report `DEGRADED` yet.

### Boot count

How many times the node has booted from its disk. It goes up by one on every boot, once the internal database has started. A number that jumps when nobody restarted the node is worth investigating: any boot step that fails restarts the node.

### Version

The CryptOS image the node is running. `cryptosctl version` with `--endpoint` shows it next to your CLI's own version.

### Revocation

The latest check of `pki.revocation_base_url`: whether its host resolves and the `/crl`, `/ocsp` and `/ca.cer` addresses stamped into certificates answer.

| Value | Meaning |
|---|---|
| `NOT_CONFIGURED` | no `pki.revocation_base_url` is set, so there is nothing to check |
| `PENDING` | a URL is set and the first check has not finished |
| `OK` | the URL checked out; the line also shows the URL and when it was checked |
| `FAILING` | the last check failed; the line ends with the error |

:::warning[FAILING stops issuance]
While the check is failing, the node refuses to issue any certificate that would carry the revocation addresses. Fix what the error names: most often the host does not resolve (see the `DNS` line) or the address does not answer. `pki.allow_unverified_revocation_url` turns the refusal off, but every certificate issued while it is set keeps an address nobody checked, and that cannot be undone; see [Apply config](./config-apply.md).
:::

### DNS

Where the node's DNS servers came from, the servers in order, and the search list if there is one.

| Value | Meaning |
|---|---|
| `MACHINE_CONFIG` | from `network.nameservers` in the machine config |
| `DHCP_LEASE` | from the DHCP lease, because `network.nameservers` is empty |
| `NONE` | neither gave a server, so the node cannot resolve any name |

`NONE` together with a `revocation_base_url` that names a host is why a revocation check fails. Set `network.nameservers` and apply the config.

## A node in maintenance mode

A node that has not been installed yet has no identity to check against, so ask it over `--insecure`:

```bash
cryptosctl --insecure --endpoint 192.0.2.50:443 status
```

:::tip[Expected output]
Maintenance mode reports only its version. The other values are `UNSPECIFIED` and the boot count is `0`, because nothing is installed yet.

```text
Role:            UNSPECIFIED
Identity:        UNSPECIFIED
TPM:             UNSPECIFIED
etcd:            UNSPECIFIED
Boot count:      0
Version:         <the image version>
```
:::

## For scripts

`-o json` and `-o yaml` print the full status, with the field names from the API. They include one field the human output leaves out: `fleet_manager`, which reads `FLEET_MANAGER_STATE_NOT_ENROLLED`, `FLEET_MANAGER_STATE_CONNECTED` or `FLEET_MANAGER_STATE_DISCONNECTED`.

```bash
cryptosctl --endpoint 192.0.2.10:443 -o json status
```

:::tip[Expected output]
The values are the full enum names from the API.

```text
{
  "role": "NODE_ROLE_ROOT",
  "identity_state": "IDENTITY_STATE_ESTABLISHED",
  "tpm_state": "TPM_STATE_OK",
  "etcd_state": "ETCD_STATE_OK",
  "boot_count": "3",
  "software_version": "<the image version>",
  "fleet_manager": "FLEET_MANAGER_STATE_NOT_ENROLLED",
  ...
}
```
:::

The fields are listed in the [gRPC API reference](../reference/grpc-api.md).

## When status fails

| Error | Cause | What to do |
|---|---|---|
| `x509: certificate signed by unknown authority` | the pin is stale: the node rebooted since you fetched it | [fetch it again](./setup.md) |
| `load client identity: ...` | your identity files are missing or unreadable | check `--identity` and `--identity-key` |
| a connection error or a timeout | the node is down, still booting, or unreachable | check the console and your network path |

## Next step

[Show and validate identity](./identity.md).
