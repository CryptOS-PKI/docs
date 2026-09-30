---
title: "📚 Audit log format"
---

# 📚 Audit log format

:::tip[Works today]
The node writes and chains its audit log today, and `cryptosctl audit list` and `audit verify` read and check it (see [Check the audit log](../using/audit-log.md)). Exporting the raw files for verification off the node is not available; see [What you can't do today](#-what-you-cant-do-today).
:::

How the tamper-evident log is structured and verified.

Every CryptOS node keeps an **audit log**: one entry for every call to its API, each entry signed and chained to the one before it. A changed, removed or reordered entry breaks the chain from that point on. For the reasoning behind the design, see [How the audit log proves integrity](../deep-dives/audit-integrity.md). The Fleet Manager keeps a separate log of its own, described [at the end of this page](#-the-fleet-manager-audit-log).

## 📝 What gets recorded

- **Every gRPC call** on the node's mTLS listener and on its local socket, one entry per call, written when the call finishes, whatever its outcome.
- **Streaming calls** (for example `StartCeremony` and `StageImage`) get one entry for the whole stream, with no request digest.
- **Not recorded:** calls in maintenance mode, where there is no state partition to write to yet; HTTP requests to the ACME, EST, CRL and OCSP listeners; and a client whose certificate fails the TLS handshake, since it never reaches an API call.

## 📂 Where it lives

The log is a directory of files on the node's encrypted state partition, one file per UTC day:

```text
/var/lib/cryptos/audit/2026-09-30.log
/var/lib/cryptos/audit/2026-10-01.log
```

The directory is mode `0700` and each file `0600`. Entries are only ever appended, and each write is flushed to disk before the next. After a reboot the node reads the newest file and carries on from the last sequence number and hash, so the chain continues across boots and across days.

## 🧾 Line format

Each line is one entry:

```text
<entry as protobuf JSON> <signature>
```

- **The entry** is an `AuditEvent` message (from the API's `audit.proto`) encoded as protobuf JSON, on one line.
- **One space** separates it from the signature.
- **The signature** is an Ed25519 signature over the entry's JSON bytes exactly as written, encoded as base64 with no padding.

Three real entries, as the node writes them:

```text
{"seq":"1", "ts":"2026-09-30T14:02:11.482Z", "actorSubject":"CN=admin", "rpcMethod":"/cryptos.v1.NodeService/GetStatus", "requestDigestSha256":"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=", "outcome":"OUTCOME_OK", "prevEntrySha256":"47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="} RQvUXbWcr7F2EZDtdSHWIoELUw/HQNwlqtZ/AZVdw3b3bhMxP+KiaeVr8qKROQmywWbdI3rPXsATBOQRKc7IBA
{"seq":"2", "ts":"2026-09-30T14:02:11.482Z", "actorSubject":"CN=admin", "rpcMethod":"/cryptos.v1.NodeService/IssueLeaf", "requestDigestSha256":"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=", "outcome":"OUTCOME_OK", "prevEntrySha256":"NiQ5UXTWRM6xAu6Zzn/MzqLYtJTDBcNDtXgoVWq7WVE=", "details":{"request_dns_names":"web.example.org"}} uW3SfFHJswOg9YtWcUNrJr8p4kcGqFDG8u4BnsfAEtcee2BmHl+YSRkyA15oZVZ5xczAKBNraV04JkZguPFfDA
{"seq":"3", "ts":"2026-09-30T14:02:11.482Z", "rpcMethod":"/cryptos.v1.NodeService/StartCeremony", "outcome":"OUTCOME_ERROR", "prevEntrySha256":"cWaCj8mpClYsWucjexbnYViPcq1DCwkoR1CsuGTRwhQ="} /wnvI2TADiLazVj0HD51BURPEU4qkRGh2Bc1REX+uJ//1XCcs6652uaMU6xmM54qWzqBNHlEsga397SyRw+QDA
```

The request digests here are a placeholder pattern; a real one is the SHA-256 of a real request.

## 📋 Fields

Fields that are empty are left out of the JSON, as protobuf JSON does for default values.

| JSON key | Proto field | Meaning |
|---|---|---|
| `seq` | `seq` (uint64) | The entry's sequence number: 1 for the first entry, then up by exactly one. Written as a JSON string, as protobuf JSON does for 64-bit integers. A gap means entries are missing. |
| `ts` | `ts` (Timestamp) | When the call was recorded, in RFC 3339 UTC. |
| `actorSubject` | `actor_subject` | The subject DN of the verified client certificate, for example `CN=admin`. Empty (left out) on the local socket, which has no TLS. |
| `rpcMethod` | `rpc_method` | The full gRPC method, for example `/cryptos.v1.NodeService/IssueLeaf`. |
| `requestDigestSha256` | `request_digest_sha256` | The SHA-256 of the request message, in deterministic protobuf binary encoding, as standard base64. It binds every field of the request without storing it. Left out for streaming calls. |
| `outcome` | `outcome` | `OUTCOME_OK` on success, `OUTCOME_DENIED` when the call was refused with `PermissionDenied`, `OUTCOME_ERROR` for any other failure. |
| `prevEntrySha256` | `prev_entry_sha256` | The SHA-256 of the previous entry's JSON bytes, as standard base64. See the chain rules below. |
| `details` | `details` (map) | A few facts recorded in the clear for a reader of the log. Absent on most entries. |

The `details` keys the node writes today:

| Key | Written by | Value |
|---|---|---|
| `serial_hex` | `RevokeCertificate` | The serial the call named, in the node's form: lower-case hex with no leading zeros. Recorded once the caller is authorized, whether or not the revocation succeeds. |
| `request_dns_names` | `IssueLeaf`, when the caller passes DNS names (`cryptosctl ca issue-leaf --dns`) | The names, comma-separated. Recorded once the caller is authorized, whether or not the signer accepts them. |
| `requested_not_after` | `IssueLeaf` or `SignSubordinateCSR`, when the certificate was capped at the issuer's notAfter | The notAfter the profile asked for, RFC 3339 UTC. |
| `effective_not_after` | Same | The notAfter the certificate received, RFC 3339 UTC. |

## 🔗 Chain and signature rules

A verifier checks every file in date order (the file names sort by date) and every line in order:

1. **Split the line** at its last space into the JSON bytes and the signature. A line that doesn't split, or whose signature isn't valid base64 without padding, is malformed.
2. **Check the signature:** Ed25519 over the JSON bytes, with the node's audit public key.
3. **Check the sequence:** the first entry across all files is `1`, and each entry is one more than the last.
4. **Check the link:** `prevEntrySha256` must equal the SHA-256 of the previous line's JSON bytes. For the very first entry it's the SHA-256 of empty input, which is `47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=` in base64 (`e3b0c442...b855` in hex).

Stop at the first failure and note its file and line: every entry after it is unproven. `cryptosctl audit verify` runs these checks on the node and reports the first failure's sequence number (the one the failing entry holds, or the one expected at its place when the line can't be read), its file and line, and the reason.

:::caution[Hash the bytes as written, never a re-encoded copy]
Protobuf JSON output isn't byte-stable: the spacing and order can differ between encoder versions and runs. The signature and the chain cover the exact bytes on the line. A verifier that parses an entry and encodes it again will get different bytes and report a false mismatch.
:::

### The signing key

The audit key is an Ed25519 key derived, not stored. The node generates a 32-byte master seed at first boot and keeps it at `/var/lib/cryptos/seed` on the encrypted state partition. The audit key is HKDF-SHA256 over that seed, with no salt and the info string `cryptos.dev/audit-signer/v1`. The key is separate from the CA key, so audit signing never touches the key that issues certificates. The [ceremony manifest](../deep-dives/ceremony-walkthrough.md) is signed by a second key from the same seed, with the info string `cryptos.dev/ceremony-signer/v1`.

## 🚧 What you can't do today

:::info[Verification runs on the node]
`ListAuditEvents` returns each entry and its SHA-256, and `VerifyAuditChain` checks the chain on the node. Neither returns the entry signatures or the audit public key, and the node doesn't ship entries to a SIEM, so you can't verify the log independently off the node in this alpha.
:::

:::caution[A failed audit write doesn't fail the call]
If the node can't append an entry, the API call still returns its normal result to the client. The audit write error is dropped rather than turned into a failure the caller sees.
:::

:::warning[A reset destroys the audit log]
`cryptosctl reset` erases the state partition's key material, and the audit log lives on that partition, so a reset takes the node's audit history with it. `cryptosctl audit list --all -o json` saves a readable copy first, but that copy can't be verified off the node.
:::

## 🧭 The Fleet Manager audit log

The Fleet Manager records its own actions (approving an enrolment, applying a profile, issuing, revoking, and so on) in its database. It's hash-chained too, but its format differs from the node's.

`ListAudit` returns the entries as `cryptos.fleet.v1.AuditEvent` messages:

| Field | Meaning |
|---|---|
| `id` | The entry's ID, `aud-` followed by 32 hex characters. |
| `at` | When it happened, RFC 3339 UTC. |
| `kind` | What happened: `approval-approved`, `approval-decide-refused`, `approval-denied`, `approval-requested`, `approval-used`, `config-applied`, `enroll-approved`, `enroll-rejected`, `issued`, `mcp-key-created`, `mcp-key-first-used`, `mcp-key-rejected`, `mcp-key-revoked`, `profile-applied`, `profile-created`, `profile-deleted`, `profile-updated`, `protocol-toggled`, `rekeyed`, `renewed` or `revoked`. |
| `summary` | A one-line human description. |
| `target_kind`, `target_path` | What it acted on: `approval`, `cert`, `enrollment`, `mcp-key`, `node`, `profile` or `protocol`, and which one. |
| `actor_kind` | `cert` for an operator client certificate, `mcp_key` for an MCP agent key. |
| `actor_cn`, `actor_serial` | The CN and hex serial of the operator certificate that acted, or that the MCP key is bound to. |
| `key_id` | The MCP key's ID when `actor_kind` is `mcp_key`. |
| `via`, `tool` | The surface the action came through (`web`, `mcp` or `api`), and the MCP tool name when `via` is `mcp`. |
| `request_digest` | Lowercase hex SHA-256 of the canonical request. |
| `outcome` | `ok`, `denied`, `pending` or `error`. |
| `approval_id`, `approver_serial` | The step-up approval an MCP call ran under, and the serial of the operator certificate that decided it. Empty when no approval was involved. |

Entries recorded before the manager captured actors have the actor fields empty. The chain hash of each row is the lowercase hex SHA-256 of the previous row's hash and the row's fields, each field length-prefixed. The manager stores the hash and previous hash with each row, but `ListAudit` doesn't return them. For the RPC itself, see the [gRPC API reference](./grpc-api.md).
