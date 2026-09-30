---
title: "🎉 Run the first-boot ceremony"
---

# 🎉 Run the first-boot ceremony

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Create the Root CA for the first time and watch each step.

The **first-boot ceremony** is the moment a Root CA is born. The node creates its Root key inside the TPM, signs its own Root certificate with it, and writes a signed record of what it did. It runs once per node.

:::info[Before you start]
You need:

- the node running in QEMU, with **management API** marked `[ok]` on its console ([Boot it in QEMU](./boot-qemu.md));
- `cryptosctl` on your `PATH` ([Install cryptosctl](./install-cryptosctl.md));
- your admin identity in `~/.cryptos/` and the machine config at `$LAB/machine.yaml`, both from the boot page.

Use a second terminal, with `LAB` set as on the boot page.
:::

## 1. Pin the node's management certificate

Every call is mutual TLS, so `cryptosctl` needs to know which certificate the node will present. The node makes a new self-signed management certificate at every boot. Fetch it and save it as your pin:

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name localhost trust fetch
```

:::tip[Expected output]
The certificate the node presented, and where the pin was saved:

```text
Subject:    CN=10.0.0.10
Issuer:     CN=10.0.0.10
SANs:       10.0.0.10, localhost
Not after:  <date>
SHA-256:    <fingerprint>
Saved to:   /home/you/.cryptos/trust.crt
Pin not verified: compare the SHA-256 above with the Mgmt SHA-256 on the node console before relying on it.
```

Subject and issuer are the same because the certificate is self-signed. If the command cannot connect, the node is not up yet: wait for **management API** on the console and try again.
:::

:::caution[The first pin is trust on first use]
`trust fetch` saves whatever certificate answers on that port. Here the port is a forward to a VM on your own machine, so that is fine. On a real network, compare the SHA-256 with the **Mgmt SHA-256** on the node's console, or pass it as `--expect-sha256` so `cryptosctl` refuses any other certificate. The [management trust guide](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/management-trust.md) explains what the pin proves.
:::

## 2. Check the node is ready

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name localhost status
```

:::tip[Expected output]
The node is a Root with no identity yet, and its TPM and database are healthy:

```text
Role:            ROOT
Identity:        NONE
TPM:             OK
etcd:            OK
Boot count:      1
Version:         <your build>
Revocation:      NOT_CONFIGURED
DNS:             <resolver>
```

`Identity: ESTABLISHED` means this node already has its Root, so skip to the next page. If `TPM` is not `OK`, check that swtpm is running and QEMU was started with the TPM flags.
:::

## 3. Run the ceremony

Pass the same machine config the node booted with:

:::danger[This Root is for learning only]
The ceremony creates the Root key inside swtpm, and swtpm keeps its state as ordinary files in `$LAB/swtpm`. That key has none of the protection of a hardware TPM. Never let anything trust this Root for real. The ceremony also runs only once: this node keeps this Root until you throw the disk and TPM state away.
:::

```bash
cryptosctl --endpoint 127.0.0.1:4443 --server-name localhost ceremony start --config "$LAB/machine.yaml"
```

:::tip[Expected output]
One line per step, as the node reports it:

```text
KEY_CREATED      tpm_public=<n> bytes
CERT_SIGNED      cert_sha256=<64 hex digits>
MANIFEST_WRITTEN manifest_id=<id>
ADMIN_ROTATED    admin_cert_sha256=<64 hex digits>
COMPLETE
```

`COMPLETE` means the Root exists. The node commits the Root just before it reports `MANIFEST_WRITTEN`. If the output stops before that line, nothing was committed and you can run the command again. If it stops after it, the Root exists: check with `status` on the next page.
:::

## What each step means

| Event | What happened on the node |
|---|---|
| `KEY_CREATED` | The TPM created a new ECDSA P-384 key pair. The private half never leaves the TPM; `tpm_public` is the size of the public half the TPM returned. |
| `CERT_SIGNED` | The node built the Root certificate from `pki.root_subject` and `pki.root_validity_years`, and the TPM signed it. `cert_sha256` is the certificate's fingerprint. |
| `MANIFEST_WRITTEN` | The node wrote a **ceremony manifest**, a signed record of the ceremony, and committed the certificate, the wrapped key and the manifest in one step. |
| `ADMIN_ROTATED` | Your bootstrap admin certificate became the node's admin. `admin_cert_sha256` matches the `SHA-256` that `cryptosctl bootstrap` printed. |
| `COMPLETE` | The ceremony is over. |

The [ceremony walkthrough](../deep-dives/ceremony-walkthrough.md) goes deeper into each step.

## If it fails

| Message | Cause | What to do |
|---|---|---|
| `IDENTITY_EXISTS` | The node already has a Root. | Nothing: go to the next page. The ceremony never runs twice. |
| `first-boot-root ceremony requires role "root"` | The config passed with `--config` is not a Root. | Pass the `machine.yaml` from the boot page. |
| `ceremony already in progress` | Another ceremony call is running. | Wait for it to finish, then check `status`. |
| `x509: certificate signed by unknown authority` | The pin in `~/.cryptos/trust.crt` is stale, usually because the node rebooted. | Run `trust fetch` again. |

## Next step

Prove it worked: [Check identity and status](./check-status.md).
