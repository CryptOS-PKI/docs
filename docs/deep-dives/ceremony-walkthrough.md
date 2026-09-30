---
title: "🔬 The ceremony, step by step"
---

# 🔬 The ceremony, step by step

A close reading of each event the first-boot ceremony emits.

:::tip[Works today]
The first-boot Root ceremony runs end to end in the alpha: it creates the Root key, self-signs the Root certificate, writes a signed ceremony manifest and commits everything in one transaction. It is a 1-of-1 ceremony; the gaps are listed at the end.
:::

This page reads the ceremony as a reviewer would: what the node checks, what it does between events, what each event carries, and what is stored at the end. The code is `Engine.Start` in `internal/ceremony/ceremony.go`. To run the ceremony as an operator, see [Run the first-boot ceremony](../using/ceremony-start.md).

## The call

The ceremony is one server-streaming RPC, `NodeService/StartCeremony`. The client sends one `StartCeremonyRequest` (a `kind` and the machine config YAML) and then only receives. `cryptosctl` sends it like this, over mTLS or the on-box socket:

```bash
cryptosctl ceremony start --config machine.yaml
```

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::tip[Expected output]
A completed ceremony prints five lines, one per event, in this order. The values differ on every run.

```text
KEY_CREATED      tpm_public=<length> bytes
CERT_SIGNED      cert_sha256=<64 hex digits>
MANIFEST_WRITTEN manifest_id=<UUID>
ADMIN_ROTATED    admin_cert_sha256=<64 hex digits>
COMPLETE
```

If the command ends with an error before `COMPLETE`, read [When the ceremony fails](#when-the-ceremony-fails) before you run it again.
:::

## Before the first event: the checks

The node checks these in order and stops at the first that fails. Nothing is written until all of them pass.

| Check | Refusal |
|---|---|
| `kind` is `CEREMONY_KIND_FIRST_BOOT_ROOT` (or left unset). | `InvalidArgument`, `ceremony: unsupported kind` |
| No other ceremony is running. The engine takes a lock because the TPM is single-threaded; a second caller is refused, not queued. | `FailedPrecondition`, `ceremony already in progress` |
| The caller is the bootstrap admin: over TLS, the SHA-256 of the presented leaf must equal the pinned fingerprint. A call on the local socket has no TLS and is trusted. | `Unauthenticated` with no certificate, `PermissionDenied`, `ceremony: client certificate is not the authorized bootstrap admin` |
| The node has no identity yet (no `/cryptos/identity/root/cert` in etcd). | `FailedPrecondition`, `IDENTITY_EXISTS` |
| `machine_config_yaml` is present and parses. | `InvalidArgument` |
| `role.kind` is `root`. A subordinate never self-signs; it gets its certificate through the subordinate RPCs. | `FailedPrecondition`, `first-boot-root ceremony requires role "root", got ...` |

Then the node records that a ceremony has started: it sets the etcd phase to `ceremony-in-progress` (`cryptosctl status` shows `Identity: CEREMONY_IN_PROGRESS`) and writes the machine config from the request to the state volume.

:::caution[The ceremony replaces the stored machine config]
The config you pass with `--config` is written to the node before the key is created, and it stays written even if the ceremony fails later. Pass the same config the node was installed with, changed only where you mean to change it.
:::

## Event 1: `KEY_CREATED`

Between the checks and this event the node:

1. Maps `pki.root_key_alg` to a key algorithm.
2. Calls `ProvisionSRK`: on a `tpm` node, the Storage Root Key at handle `0x81000001` is created if it isn't there yet.
3. Calls `CreateKey`: `TPM2_Create` under the SRK makes the Root key inside the TPM.

The event carries `tpm_public` (the `TPM2B_PUBLIC` blob: the public key and its template) and `creation_data` (`TPM2B_CREATION_DATA`). `cryptosctl` prints only the length of `tpm_public`. The template and what it enforces are in [How keys never leave the TPM](./keys-never-leave-tpm.md).

:::info[On a software-key node the event means something else]
On a `nodeid` or `kms` node the key comes from the software backend. `tpm_public` then holds the PKIX DER public key, `creation_data` is empty, and there is no TPM evidence at all.
:::

## Event 2: `CERT_SIGNED`

The node loads the new key (`LoadKey`) and calls `ca.SelfSignRoot`:

- Subject from `pki.root_subject`: `common_name`, and `organization`, `country`, `province` and `locality` when set. Empty ones are left out.
- `notBefore` is the ceremony start, truncated to the second and backdated five minutes for clock skew. `notAfter` is the start plus `pki.root_validity_years`.
- `cA=true` with no path length limit, key usage `keyCertSign` and `cRLSign`, no extended key usage, no subject alternative name, subject and authority key identifiers equal.
- A 159-bit random serial.
- The key must pass the same subject-key checks every issued key does, so a Root can't be made with a key its own subordinates would refuse.

`crypto/x509.CreateCertificate` builds and hashes the certificate; the TPM only signs the SHA-384 digest. The event carries `cert_sha256`, the SHA-256 of the Root certificate's DER.

:::tip[Record this value]
`cert_sha256` is how you tie the Root certificate you distribute to this ceremony. `cryptosctl identity show` prints the same value as `SHA-256:`. See [Trust from zero](./trust-from-zero.md#step-7-the-world-trusts-the-root).
:::

## Between events: the manifest and the commit

There is no event for these two steps, but they are what makes the ceremony durable.

**The manifest.** The node builds a `CeremonyManifest` (defined in the `api` repo's `ceremony.proto`):

| Field | Value in the alpha |
|---|---|
| `manifest_version` | `1` |
| `ceremony_id` | A random version 4 UUID from `crypto/rand` |
| `ceremony_kind` | `root_first_boot` |
| `node_id` | The constant `cryptos` |
| `started_at`, `completed_at` | UTC, truncated to the second |
| `key_creation_attestation` | `tpm_public`, `tpm_creation_data` and `tpm_creation_ticket` from `TPM2_Create` |
| `resulting_cert_sha256` | The same value as `CERT_SIGNED` |
| `prev_manifest_sha256` | Empty: this is the first ceremony |
| `operator_signatures` | One entry, described below |

The signature is made by the node, not by you. The node derives an Ed25519 key with HKDF-SHA256 from its 32-byte master seed (`/var/lib/cryptos/seed`, generated from `crypto/rand` on first boot, on the encrypted volume), with the info label `cryptos.dev/ceremony-signer/v1`. It clears `operator_signatures`, marshals the manifest with deterministic protobuf encoding, and signs those bytes. The entry it adds has `signer_id` set to your admin certificate's SHA-256 in hex, `sig_alg` set to `ed25519`, and the signature. So the manifest records who authorized the ceremony, inside the signed bytes, but the signing key belongs to the node. Your private key never reaches the node, so it can't sign.

**The commit.** One etcd transaction, guarded so it applies only if `/cryptos/identity/root/cert` has never been created, writes:

- `/cryptos/identity/root/cert`: the Root certificate DER
- `/cryptos/identity/root/key-blob` and `/cryptos/identity/root/key-public`: the wrapped key blobs
- `/cryptos/ceremony/manifests/<ceremony_id>`: the signed manifest
- `/cryptos/admins/<admin SHA-256>`: the admin record
- `/cryptos/state/phase`: `identity-established`

Either all of it lands or none of it does. If another commit won the race, the ceremony returns `IDENTITY_EXISTS`.

## Event 3: `MANIFEST_WRITTEN`

Sent after the transaction commits. It carries `manifest_id`, the ceremony UUID, which is also the manifest's etcd key suffix. From this event on, the node has an identity.

## Event 4: `ADMIN_ROTATED`

It carries `admin_cert_sha256`. Despite the name, nothing rotates in the alpha: the value is the SHA-256 of the bootstrap admin certificate you presented (or the configured one, for a local-socket call), which the commit recorded as the steady-state admin. The mTLS listener keeps trusting the same certificate.

## Event 5: `COMPLETE`

The stream ends. `cryptosctl status` now shows `Identity: ESTABLISHED`, and `cryptosctl identity show` returns the Root certificate.

## When the ceremony fails

Where it stopped decides what you do next:

- **Before `MANIFEST_WRITTEN`** (a check, key creation, signing, or the commit failed, or the connection dropped): no identity was stored. The phase stays `ceremony-in-progress` and the new config stays written. Fix the cause and run `cryptosctl ceremony start` again; it creates a new key. The node does not restart the ceremony on its own at the next boot.
- **After `MANIFEST_WRITTEN`** (the connection dropped before `COMPLETE`): the identity is committed. Running the ceremony again returns `IDENTITY_EXISTS`. Check with `cryptosctl identity show` and take the SHA-256 from there.

Every `StartCeremony` call is recorded in the audit log as one entry when the stream ends, with its outcome. Streaming calls carry no request digest, so the entry doesn't bind the config you sent. See [How the audit log proves integrity](./audit-integrity.md).

## Where it falls short

| Design goal | What the alpha does |
|---|---|
| M-of-N: the ceremony waits for M administrators to authorize it. | 1-of-1. The manifest's `operator_signatures` list is shaped for more entries, but only one is ever written. |
| The operator signs the manifest with their own key. | The node signs with its HKDF-derived ceremony key, and the admin identity is bound into the signed bytes. |
| The operator enrolls a long-term admin certificate and the bootstrap certificate is revoked. | Not built; see `ADMIN_ROTATED` above. |
| You can fetch and verify the manifest offline. | Not available. `ceremony.VerifyManifest` exists in the code, but no RPC returns a stored manifest or the ceremony verifying key, and `cryptosctl` has no command for it. |
| The key creation evidence proves the key came from a genuine TPM. | The creation data and ticket are recorded, but nothing certifies them (no `TPM2_CertifyCreation`, no endorsement key certificate), and nothing checks them. |
| Each manifest names the node that ran it. | `node_id` is the constant `cryptos` on every node. |
| An interrupted ceremony resumes on the next boot. | The operator runs it again; see above. |

## Where this lives in the code

All paths are in [CryptOS-PKI/cryptos](https://github.com/CryptOS-PKI/cryptos) on `main`, except the proto, which is in [CryptOS-PKI/api](https://github.com/CryptOS-PKI/api).

| Piece | Code |
|---|---|
| The state machine | `internal/ceremony/ceremony.go` (`Start`, `authorizeCaller`, `signedManifest`, `VerifyManifest`, `deriveCeremonySigner`) |
| Root certificate | `internal/ca/ca.go` (`SelfSignRoot`, `ClockSkewBackdate`) |
| The commit | `internal/node/store.go` (`CommitFirstCeremony`, `HasIdentity`, `SetPhase`) |
| etcd keys | `internal/storage/etcd/etcd.go` |
| Master seed | `internal/init/seed.go` (`LoadOrCreateSeed`) |
| Client output | `cmd/cryptosctl/ceremony.go` (`formatEvent`) |
| Messages | `proto/cryptos/v1/ceremony.proto` in `api` |
