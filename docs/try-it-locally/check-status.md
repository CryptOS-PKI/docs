---
title: "✅ Check identity and status"
---

# ✅ Check identity and status

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Confirm the node has an identity and is healthy.

After the ceremony the node is a working Root CA. This page proves it: the node reports its identity, the Root certificate checks out, and everything survives a restart.

:::info[Before you start]
You need the node from [Run the first-boot ceremony](./first-boot-ceremony.md), with the ceremony ended on `COMPLETE`, and `$LAB/root.pem` from step 4 of that page. Use the second terminal, with `LAB` set.
:::

## 1. Check the node's status

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name 10.0.0.10 --trust "$LAB/root.pem" status
```

:::tip[Expected output]
The same fields as before the ceremony, with the identity now established:

```text
Role:            ROOT
Identity:        ESTABLISHED
TPM:             OK
etcd:            OK
Boot count:      1
Version:         <your build>
Revocation:      NOT_CONFIGURED
DNS:             <resolver>
```
:::

What the lines mean:

| Line | Meaning |
|---|---|
| `Role` | what the machine config made this node: `ROOT`, `INTERMEDIATE` or `ISSUING` |
| `Identity` | `NONE` before the ceremony, `ESTABLISHED` once the node has its CA certificate. A subordinate waiting for its parent shows `AWAITING_CERT` |
| `TPM` | `OK` when the TPM is there and able. A TPM-less `nodeid` image shows `UNAVAILABLE` |
| `etcd` | the node's internal database, `OK` or `DEGRADED` |
| `Boot count` | how many times this node has booted from its disk |
| `Version` | the build the node runs, the same identity `cryptosctl version` shows for the CLI |
| `Revocation` | the check of the node's CRL and OCSP address. This config sets no `pki.revocation_base_url`, so it is `NOT_CONFIGURED` |
| `DNS` | where the node's resolver came from: `MACHINE_CONFIG`, `DHCP_LEASE` or `NONE`, with the nameservers |

## 2. Look at the Root certificate

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name 10.0.0.10 --trust "$LAB/root.pem" identity show
```

:::tip[Expected output]
A summary of the certificate the ceremony made:

```text
Subject:      CN=CryptOS Local Root,O=Local Lab,C=US
Issuer:       CN=CryptOS Local Root,O=Local Lab,C=US
Serial:       <hex>
NotBefore:    <ceremony time, UTC>
NotAfter:     <20 years later>
IsCA:         true
SHA-256:      <64 hex digits>
Chain length: 1
```

Subject and issuer match because a Root signs itself. `SHA-256` is the `cert_sha256` the ceremony printed at `CERT_SIGNED`. `Chain length: 1` is right for a Root: it has no parent.
:::

## 3. Validate the chain

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name 10.0.0.10 --trust "$LAB/root.pem" identity validate
```

:::tip[Expected output]
```text
OK: certificate chain validates
```

Any other result is an error with the reason. For a Root it means the certificate does not verify against itself.
:::

## 4. Inspect it with openssl

Read the `$LAB/root.pem` you saved on the previous page with a tool that has nothing to do with CryptOS:

```bash
openssl x509 -in "$LAB/root.pem" -noout -subject -issuer -dates -fingerprint -sha256 -ext basicConstraints,keyUsage
```

:::tip[Expected output]
The subject and issuer from step 2, the validity dates, the SHA-256 fingerprint (the same value, written with colons), and the CA extensions:

```text
X509v3 Basic Constraints: critical
    CA:TRUE
X509v3 Key Usage: critical
    Certificate Sign, CRL Sign
```

The Root carries no path length limit. Limits belong on the intermediates below it.
:::

`$LAB/root.pem` is the file a client would install to trust this Root. For this lab Root, don't.

## 5. Compare the CLI and node versions

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name 10.0.0.10 --trust "$LAB/root.pem" version
```

:::tip[Expected output]
The CLI's build lines from [Install cryptosctl](./install-cryptosctl.md), plus one more:

```text
Node version:    <your build>
```

When the CLI and the node come from the same checkout, the two versions match.
:::

## 6. Power off and boot again

A restart proves the node keeps its identity: it unseals its disk with the TPM, reads its config from the encrypted volume, and comes back as the same Root.

:::warning[The node goes offline]
`reboot` stops every listener while the node shuts down. `--confirm` must be the Root's common name exactly, which is what stops you from taking the wrong node down.
:::

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name 10.0.0.10 --trust "$LAB/root.pem" reboot --confirm "CryptOS Local Root" --power-off
```

:::tip[Expected output]
```text
power-off accepted: the node is shutting down cleanly and powering off
```

The node closes its database and audit log, locks its disk, and powers off, and QEMU exits in the first terminal.
:::

In the first terminal, start swtpm again if it exited with QEMU (`pgrep -a swtpm` prints nothing), then run the same `qemu-system-x86_64` command as on [Boot it in QEMU](./boot-qemu.md). Keep the same `$LAB` folder: the same disk, the same TPM state, the same UKI. When **management API** is marked `[ok]`, check again, with the same `root.pem`:

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name 10.0.0.10 --trust "$LAB/root.pem" status
```

:::tip[Expected output]
The node is the same Root, one boot later:

```text
Identity:        ESTABLISHED
Boot count:      2
```

The management certificate has a new key, so the console's SHA-256 differs from before the restart. `root.pem` still works because the new certificate is signed by the same Root.
:::

## Run the whole flow as a test

The `cryptos` repository runs this same flow automatically: build the debug image, stage a config, boot QEMU with swtpm, run the ceremony, check the Root certificate with zlint, validate the chain and read the status. It skips itself unless every tool is present. From the `cryptos` checkout, after [Build the image](./build-image.md) and `task build`:

```bash
export OVMF_CODE=/usr/share/OVMF/OVMF_CODE_4M.fd
export OVMF_VARS=/usr/share/OVMF/OVMF_VARS_4M.fd
export CRYPTOSCTL="$PWD/bin/cryptosctl"
export CRYPTSETUP_STATIC="$PWD/build/out/cryptsetup-amd64"
task test:integration
```

It also needs `zlint` on your `PATH`. The test package holds more than the ceremony run, including a reboot and a reset, and each boots its own VM, so under software emulation it takes a long time.

## Clean up

Power the node off as in step 6, then remove the lab folder. The Root, its key and the TPM state go with it, and there is no way to get them back, which is what you want for a lab Root. Delete `~/.cryptos/` too if you are done with this admin identity.

## Where to go next

- 📖 Understand what just happened: [How keys never leave the TPM](../deep-dives/keys-never-leave-tpm.md) and [The ceremony, step by step](../deep-dives/ceremony-walkthrough.md).
- 🏗️ Install a real node: [Build a bootable image](../install-deploy/build-bootable-image.md).
- ⌨️ Every command: [cryptosctl command reference](../reference/cryptosctl.md).
