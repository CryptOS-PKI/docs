---
title: "🕵️ How the audit log proves integrity"
---

# 🕵️ How the audit log proves integrity

Why a changed or missing entry cannot hide.

:::tip[Works today]
Every gRPC call a serving node receives is appended to a signed, hash-chained log on the encrypted state volume, and the code can verify the whole chain.
:::

:::info[The log stays on the node]
Reading the log through the API, publishing its verifying key, and shipping it off the node are not available. The log stays on the node, and there is no supported way for you to fetch it or run the verifier. See [Where it falls short](#where-it-falls-short).
:::

This page explains what the log records, how each entry is bound to the one before it, what a verifier checks, and which kinds of tampering that catches and which it can't. The code is `internal/audit/audit.go` and the audit interceptors in `internal/grpc/server.go`. The entry fields are in the [audit log reference](../reference/audit-log.md).

## What gets an entry

Both management listeners, the mTLS API on port 443 and the local socket `/run/cryptos.sock`, run every call through an audit interceptor. Each call except `GetStatus` and `GetIdentity` produces exactly one entry, written after the handler returns:

| Field | Value |
|---|---|
| `seq` | The next sequence number, starting at 1. |
| `ts` | The node's clock when the entry was written. |
| `actor_subject` | The subject DN of the verified client certificate. Empty for calls on the local socket. |
| `rpc_method` | The full gRPC method name, for example `/cryptos.node.v1.NodeService/IssueLeaf`. |
| `request_digest_sha256` | SHA-256 of the request message in deterministic protobuf encoding. Empty for streaming calls. |
| `outcome` | `OUTCOME_OK`, `OUTCOME_DENIED` (the call returned `PermissionDenied`) or `OUTCOME_ERROR` (any other error). |
| `prev_entry_sha256` | The hash that chains this entry to the one before it (below). |
| `details` | A few facts in the clear, where a reader needs them without the request: the serial a revocation named (`serial_hex`), the DNS names asserted on `IssueLeaf` (`request_dns_names`), the requested and effective expiry when a validity cap applied (`requested_not_after`, `effective_not_after`), the generation, digest and reboot need of an applied config (`config_generation`, `config_digest_sha256`, `requires_reboot`), and whether a `Reboot` asked for a restart or a power-off (`reboot_kind`). |

The request itself is not stored, only its digest. Anyone holding the original request can hash it the same way and match it to its entry. Streaming calls (`StartCeremony`, `StageImage`) get one entry when the stream ends, and their requests are not digested.

:::caution[Not everything reaches the log]
Only gRPC calls on a serving node, and SCEP enrolment decisions, are recorded. These are not:

- `GetStatus` and `GetIdentity`, which the node console polls every 2 seconds and the Fleet Manager calls whenever it shows a node. They are skipped by name, as an allow-list: they change nothing and return only what the node publishes anyway, and recording them made up almost all of a log. Every other call, reads included, is recorded;
- anything in maintenance mode (before install, or after a reset), which drops audit events;
- ACME, EST, CRL and OCSP traffic on their HTTP listeners (certificates issued through ACME and EST are still recorded in the issued-certificate store, but not in the audit log);
- connections rejected during the TLS handshake, such as a client without the admin certificate, because they never reach gRPC;
- boot, unseal and shutdown events.
:::

## How an entry is written

The log is a directory of files, one per UTC day: `/var/lib/cryptos/audit/<YYYY-MM-DD>.log`. The directory is mode `0700` and each file `0600`, inside the LUKS-encrypted state volume. Each entry is one line:

```text
<protojson of the AuditEvent> <Ed25519 signature, base64 without padding>
```

`Append` does this under a lock, so entries are strictly ordered even with concurrent calls:

1. Fill in `seq`, `ts` and `prev_entry_sha256`.
2. Marshal the entry to protojson. These exact bytes are what gets signed and hashed.
3. Sign the bytes with the audit key.
4. Write the line and `fsync` the file before returning.
5. Remember `SHA-256(bytes)` as the `prev_entry_sha256` of the next entry.

**The chain.** Each entry's `prev_entry_sha256` is the SHA-256 of the previous entry's protojson bytes, as written. The very first entry uses the SHA-256 of an empty input. The chain runs across day files: the first entry of a new day links to the last entry of the day before. After a reboot, `Open` reads the newest file's last complete entry and continues its `seq` and hash, so a restart doesn't break the chain.

**The key.** The audit signing key is an Ed25519 key derived with HKDF-SHA256 from the node's 32-byte master seed (`/var/lib/cryptos/seed`, generated from `crypto/rand` on first boot), with the info label `cryptos.dev/audit-signer/v1`. It is not the CA key, and it is a different key from the ceremony manifest signer (label `cryptos.dev/ceremony-signer/v1`), which comes from the same seed. The label is fixed for the life of the project; changing it would invalidate every past signature.

## What the verifier checks

`VerifyChain(dir, publicKey)` walks every `.log` file in date order and every line in each, and stops at the first failure. For each line it checks:

1. The line splits into protojson and a signature (`malformed line`).
2. The signature verifies against the audit public key (`signature mismatch`).
3. The protojson parses as an `AuditEvent`.
4. `seq` is exactly one more than the previous entry's, with no gap (`seq=N want M`).
5. `prev_entry_sha256` equals the SHA-256 of the previous line's protojson bytes (`prev_entry_sha256 mismatch`).

Each error names the file and line number, so a failure points at the entry where the log stops being trustworthy.

## What that catches, and what it doesn't

| Someone... | Caught? | Why |
|---|---|---|
| Changes any field of an entry | Yes | The signature no longer verifies, and the next entry's `prev_entry_sha256` no longer matches. |
| Deletes an entry in the middle | Yes | The next entry's `seq` skips, and its `prev_entry_sha256` points at the missing line. |
| Reorders entries | Yes | `seq` and the hash chain are both out of order. |
| Inserts a made-up entry | Yes, without the key | A valid entry needs a signature from the audit key, and it would also break the `seq` and hash of the entry after it. |
| Removes the newest entries, or the newest day files | **No** | What is left is still a valid chain from the first entry. Nothing on the node records how long the chain should be. |
| Deletes the whole log | **No** | An empty directory verifies. |
| Holds the master seed | **No** | With the seed they can derive the audit key and write a new, fully consistent log. |

The last three need something outside the node: a copy of the latest `seq` and hash kept elsewhere, or the log shipped to a system the node can't rewrite. Neither exists in the alpha.

What keeps the seed and the files out of reach is the state volume. On a `tpm` node its key unseals only under the booted image's PCR values ([How keys never leave the TPM](./keys-never-leave-tpm.md)), the image has no shell, and no RPC reads or writes the audit directory. On a `nodeid` node the volume key is derived from the machine's UUID, which is not a secret, so someone with the disk and the UUID can read the seed and rewrite the log.

## Where it falls short

| Design goal | What the alpha does |
|---|---|
| Operators fetch the log and verify it offline. | No RPC returns the log, and no RPC or command publishes the audit public key. `VerifyChain` is a library function with no `cryptosctl` command around it. The `Audit.StreamEvents` RPC in the design is not in the API. |
| The log is shipped to the Fleet Manager and to a SIEM. | Not built. The log exists only on the node. |
| Truncation and whole-log deletion are detectable. | Not detectable (table above); it needs an external anchor off the node, which the alpha doesn't have. |
| A node that can't write its audit log says so. | `Append` errors are ignored so a failed write doesn't change the RPC's result, and the code comment says `GetStatus` reports audit health instead, but `NodeStatus` has no audit field. A failing log is not visible to you today. |
| Every action on the node is audited. | Only gRPC calls on a serving node (see the caution above). |
| Timestamps are trustworthy. | `ts` comes from the node's clock, and the alpha has no time sync client. Use `seq` for ordering, not `ts`. |

The `AuditEvent` comment in `audit.proto` describes the files as newline-delimited protobuf. The files are protojson lines with a detached signature, as described on this page and in `internal/audit`.

## Where this lives in the code

All paths are in [CryptOS-PKI/cryptos-node](https://github.com/CryptOS-PKI/cryptos-node) on `main`, the proto included.

| Piece | Code |
|---|---|
| Logger, chain and verifier | `internal/audit/audit.go` (`Open`, `Append`, `VerifyChain`, `AuditSignerLabel`) |
| What each call records | `internal/grpc/server.go` (`unaryAudit`, `streamAudit`, `recordAudit`, `digestRequest`, `setAuditDetail`) |
| Maintenance mode drops events | `internal/init/maintenance.go` (`nopAuditor`) |
| Opening the log at boot | `internal/init/run.go` step 9, `internal/init/boot.go` (`DerivePaths`) |
| Master seed | `internal/init/seed.go` (`LoadOrCreateSeed`) |
| Entry schema | `proto/cryptos/node/v1/audit.proto` |
