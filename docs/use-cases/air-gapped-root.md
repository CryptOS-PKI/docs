---
title: "🏝️ Air-gapped Root CA"
---

# 🏝️ Air-gapped Root CA

The Root CA is the one key everything else depends on. If it leaks, every certificate below it is suspect and the whole hierarchy has to be rebuilt. So the usual practice is to keep the Root **offline**: it signs a few subordinate CAs, then it is switched off and put away. It comes back only to sign a new subordinate, re-certify one, or publish a fresh revocation list. Day-to-day issuing happens on the subordinates.

CryptOS is built for this. A Root node only signs CAs unless you tell it otherwise, and a two-tier hierarchy (an offline-style Root with an Intermediate below it) has been run on VMware with vTPMs, including a vCenter VMCA chained underneath.

:::tip[Works today]
- A node in the **root** role runs the first-boot ceremony, creates its key and self-signs its certificate.
- A node in the **intermediate** or **issuing** role gets its CA certificate from the Root by CSR: `ca get-subordinate-csr` on the child, `ca sign-subordinate` on the Root, `ca submit-subordinate-cert` back on the child.
- A Root refuses to issue leaf certificates unless its config sets `root_leaf_issuance: acknowledged-irreversible`.
- A subordinate can be re-certified on the same key later (`ca get-renewal-csr`, `ca sign-subordinate`, `ca submit-renewed-cert`), so nothing below it has to re-pin.
- Between signings the Root can be shut down cleanly with `cryptosctl reboot --confirm "<Root CA CN>" --power-off`.
:::

:::info[Offline means powered off]
CryptOS has no locked-down mode for a Root. While it runs, a Root serves its management API like any other node, there is no hardware presence check before its key unseals, and one admin certificate authorizes every operation. "Offline" means the Root node is powered off, or cut off from the network, between signings.
:::

## Choosing where the Root key lives

The node's **state-key mode** (`state_key.mode` in the machine config, or the default the image was built with) decides where the CA key is kept. Choose it before the ceremony, because the key is created where the mode says. There are two very different options today.

| | `tpm` mode | `nodeid` or `kms` mode |
|---|---|---|
| Where the key lives | Inside the TPM (a vTPM on a VM) | In software, on the LUKS-encrypted state partition |
| Key algorithm | ECDSA P-384 | ECDSA P-384, RSA-3072 or RSA-4096 |
| Can it be backed up? | No. `ca export-key` is refused | Yes, with `ca export-key` to a passphrase-sealed file |
| Protected by hardware? | Yes | No |

An RSA CA key can't be held in the TPM. If something you must chain to only accepts RSA, the whole chain above it has to be RSA, and today that means the software modes.

:::danger[A TPM-held Root can't be backed up]
In `tpm` mode the Root key never leaves the TPM, by design. `cryptosctl ca export-key` answers `this node's CA key is non-exportable (TPM-backed)`. If that TPM or vTPM is lost, for example when the VM is deleted or its encryption keys are gone, the Root is gone. Every subordinate then has to be re-issued under a new Root, and every client has to trust the new one. Plan for that before the ceremony. Keep the VM, its vTPM and the host keys that protect it backed up by your platform.
:::

:::warning[A software Root key is only as safe as its backup]
In `nodeid` or `kms` mode, `cryptosctl ca export-key --out <file>` writes the CA key and chain to a file sealed with a passphrase you type. On a Root it asks you to type the Root CA's common name first. Anyone with that file and the passphrase holds your Root. Store the file offline, apart from the passphrase, and never on the machine you run `cryptosctl` from. `ca import-key --backup <file>` restores it onto a fresh node.
:::

## The shape of a two-tier hierarchy

1. **Root.** Its machine config sets `role.kind: root`, the key algorithm (`pki.root_key_alg`), the subject (`pki.root_subject`) and the lifetime (`pki.root_validity_years`, 1 to 30). It also holds a CA profile for signing subordinates: `basic_constraints.is_ca: true`, a `path_len`, and `key_usage: [digital_signature, cert_sign, crl_sign]`. See [The first-boot ceremony](../deep-dives/ceremony-walkthrough.md) for how the Root key is made.
2. **Intermediate or issuing CA.** Its machine config sets `role.kind: intermediate` or `issuing`, and pins the Root it expects in `pki.parent`, as the Root's certificate (`ca_cert_pem`) or its SHA-256 (`ca_cert_sha256`). After its own ceremony it waits for a signed certificate.
3. **Signing.** Bring the Root online, fetch the child's CSR, sign it, and hand the chain back:

   ```bash
   cryptosctl --endpoint pki-intermediate.example.org:443 ca get-subordinate-csr > intermediate.csr
   cryptosctl --endpoint pki-root.example.org:443 ca sign-subordinate \
     --csr intermediate.csr --profile intermediate-ca > intermediate-chain.pem
   cryptosctl --endpoint pki-intermediate.example.org:443 ca submit-subordinate-cert \
     --chain intermediate-chain.pem
   ```

   The child checks the chain against the Root it pinned before it accepts it. `cryptosctl` runs on Linux and macOS today. A Windows build is coming ([cryptos#275](https://github.com/CryptOS-PKI/cryptos/issues/275)).

4. **Offline.** Power the Root off until it is needed again.

A CA profile's `path_len` is clamped to what the signing CA's own certificate leaves (a Root has no limit of its own), and a subordinate's certificate never outlives the Root: it is capped at the Root's notAfter, or refused if the profile sets `validity_policy: reject`.

## Revocation with an offline Root

Relying parties that check revocation will look up the subordinate CA certificates too, and those point at the **Root's** CRL and OCSP when the Root has `pki.revocation_base_url` set.

:::caution[An offline Root serves no CRL or OCSP]
The Root's `/crl`, `/ocsp` and `/ca.cer` are served by the Root node itself, and only while it runs. The CRL it signs is valid for `crl_next_update_hours` (168 hours, one week, by default). CryptOS has no built-in way to publish the Root's CRL from somewhere else while the Root is off. Before you rely on an offline Root, decide how clients will reach a current CRL for your subordinates, and bring the Root up often enough to renew it.
:::

:::caution[Signing needs the revocation URL to resolve]
With `revocation_base_url` set, the Root refuses to sign while its revocation check fails, with `revocation preflight failing for configured revocation_base_url; issuance blocked`. When you bring the Root up to sign, make sure the base URL resolves to it and its `/crl`, `/ocsp` and `/ca.cer` answer there. `allow_unverified_revocation_url` skips the check, but on a Root every subordinate signed while it is set carries the unchecked pointer permanently.
:::

## Related

- [CA roles](../concepts/ca-roles.md) explains root, intermediate and issuing nodes.
- [TPM-sealed keys](../concepts/tpm-sealed-keys.md) explains what the TPM protects.
- [Re-certifying a subordinate](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/subordinate-recertify.md) walks through a renewal on the same key.
- [vCenter VMCA as a CryptOS subordinate](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/vmca-subordination.md) is a worked example of a third tier below the Intermediate.
