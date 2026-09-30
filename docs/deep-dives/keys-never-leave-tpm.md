---
title: "🗝️ How keys never leave the TPM"
---

# 🗝️ How keys never leave the TPM

Following the private key from creation to signing without it ever touching disk.

:::tip[Works today]
On a node built with the default `tpm` state-key mode and `pki.root_key_alg: ECDSA-P384`, the CA key is created inside the TPM, is marked non-exportable by the TPM itself, and signs only inside the TPM. The rest of this page shows where that holds and where it doesn't.
:::

## First, which key and which mode

The claim in the title holds for one configuration. The image is built with a state-key mode (`STATEKEY=tpm|nodeid` at build time, and `state_key.mode` in the machine config can pick `tpm`, `nodeid` or `kms`). The mode decides where the CA key lives:

| State-key mode | State volume key | CA key backend | CA key algorithms | CA key exportable |
|---|---|---|---|---|
| `tpm` (default) | Sealed to the TPM under PCR 7 and PCR 11 | TPM (`tpmRootBackend`) | `ECDSA-P384` only | No |
| `nodeid` | Derived from the SMBIOS product UUID | Software (`softRootBackend`) | `ECDSA-P384`, `RSA-3072`, `RSA-4096` | Yes |
| `kms` | Wrapped by an external KMS | Software (`softRootBackend`) | `ECDSA-P384`, `RSA-3072`, `RSA-4096` | Yes |

:::danger[Only the `tpm` mode keeps the CA key in hardware]
In the `nodeid` and `kms` modes the CA key is generated in process memory with Go's `crypto/rand` and stored as a plain DER key inside the encrypted state volume. The code calls this backend "NOT hardware-protected. Dev tier only." In `nodeid` mode the volume key comes from the SMBIOS UUID, which is not a secret, so the encryption binds the data to the machine but doesn't keep a determined attacker with the disk out. Use the `tpm` image for any CA you rely on.
:::

:::caution[An RSA CA always uses a software key today]
The TPM path is written for ECC only. With `pki.root_key_alg` set to `RSA-3072` or `RSA-4096` on a `tpm` node, the ceremony stops at key creation with an error ending `tpm: RSA-3072 CA keys cannot be created in the TPM; use a software-backed state key mode for an RSA CA` (or `RSA-4096`). An RSA CA needs the `nodeid` or `kms` image, and its key is a software key.
:::

From here on, this page covers the `tpm` mode.

## Boot: the TPM has to be able to do the job

PID 1 opens `/dev/tpmrm0` (the kernel's resource-managed TPM device) and asks it for its supported curves with `TPM2_GetCapability(TPM_CAP_ECC_CURVES)`. If the TPM can't be opened the boot fails with a hint to use the nodeID image; if it doesn't list NIST P-384 the boot fails with `init: TPM does not advertise ECDSA P-384`. A node never falls back to a software key on its own.

## Creation: the key is born inside the TPM

When the [ceremony](./ceremony-walkthrough.md) runs, two TPM objects are involved.

**The Storage Root Key (SRK).** `ProvisionSRK` creates a primary key in the owner (storage) hierarchy from the TCG reference ECC P-256 SRK template and makes it persistent at handle `0x81000001`. If an object already lives at that handle it is reused, so the call is idempotent. The SRK never leaves the TPM; it only wraps other keys.

**The CA key.** `CreateKey` runs `TPM2_Create` under the SRK with this template (`publicTemplate` in `internal/tpm/key.go`):

| Template field | Value | What it means |
|---|---|---|
| Type, curve | ECC, `TPM_ECC_NIST_P384` | An ECDSA P-384 key. |
| Scheme | ECDSA with SHA-384 | The TPM signs only with this scheme. |
| `sensitiveDataOrigin` | set | The TPM generated the private key itself; it was never supplied from outside. |
| `fixedTPM` | set | The key can't be duplicated to another TPM. |
| `fixedParent` | set | The key can't be re-wrapped under another parent. |
| `sign` | set | A signing key. |
| `userWithAuth` | set, with an empty auth value | Use is authorized by an empty password, not by a policy. |

`TPM2_Create` returns four things, and these are all that ever leave the TPM:

- **`TPM2B_PRIVATE`**: the private key encrypted and integrity-protected by the SRK. It can only be loaded back into this TPM, under this SRK.
- **`TPM2B_PUBLIC`**: the public key and the template above.
- **`TPM2B_CREATION_DATA`** and the **creation ticket**: the TPM's record of the conditions the key was created under.

The ceremony streams the public blob and creation data in its `KEY_CREATED` event and records all three pieces of evidence in the ceremony manifest. The two key blobs are written, in the ceremony's single etcd transaction, to `/cryptos/identity/root/key-blob` and `/cryptos/identity/root/key-public`. etcd's data lives in `/var/lib/cryptos/etcd`, on the encrypted state volume.

The plaintext private key exists only inside the TPM. No code path in `internal/tpm` can read it back, and the attributes above tell the TPM to refuse if one tried.

## Signing: load, sign, flush

The CA key is not kept loaded. Every operation that needs it (issuing a leaf, signing a subordinate CSR, building a CRL, minting the OCSP responder certificate, answering `Attest`) goes through one key loader in `internal/init/run.go`:

1. Read the two blobs from etcd.
2. `TPM2_Load` them under the SRK. The TPM decrypts the private part internally and returns a transient handle.
3. Go's `crypto/x509` builds the structure to sign and hashes it with SHA-384 on the host.
4. `Key.Sign` sends only the 48-byte digest to `TPM2_Sign` and gets back `r` and `s`, which it DER-encodes as the `SEQUENCE { r, s }` that `crypto/x509` expects. A digest of any other length is refused.
5. `TPM2_FlushContext` releases the transient handle.

The randomness for each ECDSA signature comes from the TPM, not from the host. Certificate construction stays in the Go standard library, and `go-tpm` only marshals TPM commands.

:::info[Other keys are software keys by design]
Only the CA key is in the TPM. The delegated OCSP responder key and the EST server TLS key are generated in software and certified by the CA key. The per-boot management TLS key is generated in software, self-signed, and pinned by fingerprint. The OCSP responder key is stored in etcd at `/cryptos/pki/ocsp-responder/key-blob`, so OCSP responses are signed without loading the CA key per request.
:::

## What keeps the wrapped blob safe: the sealed state volume

A wrapped key blob plus the TPM it belongs to is enough to sign: the CA key carries no PCR policy of its own. So the second half of the design is keeping the blob where only the right software, on the right machine, can read it.

The state partition (GPT name `cryptos-state`) is LUKS2-encrypted, and on first boot `tpmProtector.ProvisionKey` generates a random volume key and seals it with `SealToPCR`:

- The sealed object is a keyed-hash object under the SRK with `fixedTPM` and `fixedParent`, and **without** `userWithAuth`: the only way to unseal it is to satisfy its policy.
- The policy is `TPM2_PolicyPCR` over the SHA-256 bank of **PCR 7** (the Secure Boot policy) and **PCR 11** (systemd-stub's measurement of the UKI sections: kernel, initrd, command line and the rest). PCRs 0, 2 and 4 are left out on purpose so a firmware update doesn't lock the node out.
- The sealed blobs are stored in the LUKS2 header as a CryptOS-native token of type `cryptos-tpm2`.

On every later boot `UnsealWithPCR` loads the sealed object and satisfies the policy with the live PCR values. If the booted image or the Secure Boot state differs from the one the key was sealed under, the TPM refuses, the boot fails with an error containing `unseal (PCR drift requires reinit)`, and PID 1 reboots. There is no shell to drop into.

So an attacker who copies the disk gets an encrypted volume and a sealed blob that only this TPM will open, and only while this image is running. Booting other software on the same machine changes PCR 11, and the TPM won't unseal. See [Secure Boot](../install-deploy/secure-boot.md) for PCR 7.

**In-place upgrades** keep this working. Before a new image is written to the ESP, the node predicts the PCR 11 value the new UKI will measure (`ukipcr.Predict`, which replays systemd-stub's section order), checks the prediction against the running image and the live PCR 11 first, and seals a copy of the same volume key for each bootable image. A prediction it can't trust refuses the stage before anything is written.

## No way out: export and reset

`ExportCAKey` (`cryptosctl ca export-key`) refuses on a `tpm` node with `grpc: CA key is non-exportable (TPM-backed)`. On the software modes it seals the key and chain with Argon2id and AES-256-GCM under a passphrase of at least 18 bytes.

:::danger[A reset destroys a TPM-held CA key for good]
`cryptosctl reset` (confirmed with `--confirm` and the CA common name) erases the LUKS header of the state partition. The volume key is gone, so the etcd data holding the wrapped key blob can never be decrypted, and the blob could only have been loaded into this TPM anyway. A `tpm` node has no export and no escrow: after a reset, its CA key and everything it could sign are unrecoverable. Before you reset a CA, make sure nothing still depends on it.
:::

## Where it falls short

| Design goal | What the alpha does |
|---|---|
| Private keys are TPM-sealed and never live on the filesystem in the clear. | True in `tpm` mode for ECDSA P-384 only. RSA CA keys, and every key in `nodeid` and `kms` mode, are software keys stored inside the encrypted volume. |
| RSA CA keys in the TPM. | Not built. Most TPM 2.0 parts implement only RSA-2048, which is below the RSA-3072 floor. |
| The CA key's use is bound to the booted image. | Indirectly. The key object has no PCR policy and an empty auth value; the binding comes from the wrapped blob living only inside the PCR-sealed volume. A PolicyPCR on the key object itself is not in the code. |
| The seal uses `TPM2_PolicyAuthorize`, so a signed new image doesn't need a reseal. | The code uses a plain `TPM2_PolicyPCR`. Every new image needs a reseal, which the upgrade path does. |
| A hardware presence check before a Root key unseals. | Not built. |
| HA pairs share one CA key with `TPM2_Duplicate`. | Not built. The key is created with `fixedTPM` and `fixedParent`, so it can't be duplicated as it stands. |
| Extensions are measured into PCR 14, and the seal binds to it. | Not built. `ExtendPCR` exists in `internal/tpm`, but nothing calls it and the seal set is PCR 7 and 11. |
| The CA key signs only certificates, CRLs and OCSP material built by the policy path. | The `Attest` RPC signs the SHA-384 of a caller-supplied nonce with the CA key, with no domain separation from certificate signing. It is admin-only and audited (the request digest covers the nonce), but an admin can get a CA signature over bytes of their choice. |

## Where this lives in the code

All paths are in [CryptOS-PKI/cryptos](https://github.com/CryptOS-PKI/cryptos) on `main`.

| Piece | Code |
|---|---|
| Mode selection and fail-fast | `internal/init/run.go` (`newStateKeyBackends`, `StateKeyMode`) |
| SRK | `internal/tpm/srk.go` (`ProvisionSRK`, `SRKPersistentHandle`) |
| Key template and creation | `internal/tpm/key.go` (`CreateKey`, `LoadKey`, `publicTemplate`) |
| TPM signer | `internal/tpm/signer.go` (`Key.Sign`) |
| Capability probe | `internal/tpm/capabilities.go` (`Probe`) |
| Seal and unseal | `internal/tpm/seal.go` (`SealToPCR`, `UnsealWithPCR`, `DefaultSealPCRs`), `internal/init/statekey.go` (`tpmProtector`) |
| LUKS2 token | `internal/storage/luks/token.go` (`TPM2TokenType`) |
| Upgrade reseal | `internal/init/statekeyreseal.go`, `internal/ukipcr/ukipcr.go` |
| Software backend | `internal/init/softroot.go`, `internal/init/nodeid.go`, `internal/init/kms_protector.go` |
| Where the blobs are stored | `internal/node/store.go` (`CommitFirstCeremony`, `RootKeyBlobs`), `internal/storage/etcd/etcd.go` |
| Export and reset | `internal/init/escrow.go`, `internal/backup/backup.go`, `internal/reset/reset.go` |
| Nonce signing | `internal/init/attest.go`, `internal/grpc/attest.go` |
