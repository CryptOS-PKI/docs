---
title: "🔌 gRPC API"
---

# 🔌 gRPC API

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

CryptOS exposes two gRPC services. The protobuf definitions in the [CryptOS-PKI/api](https://github.com/CryptOS-PKI/api) repository are the source of truth; this page explains the parts that need more than the field comments.

| Service | Package | Served by | What it covers |
|---|---|---|---|
| `NodeService` | `cryptos.v1` | each CryptOS node, over mTLS on port 443 and the local UNIX socket | one node: config, status, ceremony, issuance, revocation, key backup and rotation, image upgrades, the audit log |
| `FleetService` | `cryptos.fleet.v1` | the Fleet Manager, as a Connect endpoint | many nodes: inventory, the profile catalog, enrollment, the audit log, operator credentials, MCP agent keys, step-up approvals |

> The rest of the RPCs are not written up here yet. Until they are, read the comments in `proto/cryptos/v1/node.proto` and `proto/cryptos/fleet/v1/fleet.proto`. 🚧

## Issuance warnings

Three `NodeService` responses carry a `repeated string warnings` field. A warning never means the call failed: the node did the work and is telling the operator something they should read.

| RPC | Field | When it is set |
|---|---|---|
| `IssueLeaf` | `IssueLeafResponse.warnings` (2) | the leaf's notAfter was capped to the issuing CA's own notAfter |
| `SignSubordinateCSR` | `SignSubordinateCSRResponse.warnings` (3) | the child CA certificate's notAfter was capped to the parent's notAfter |
| `ApplyConfig` | `ApplyConfigResponse.warnings` (4) | a profile's `validity_days`, counted from now, already runs past this CA's notAfter |

The `ApplyConfig` warnings are advisory. A CA's remaining lifetime shrinks every day, so every profile eventually outlives it; the config is still applied. Each warning names the profile and the CA's notAfter date, and says what will happen: under `cap` its certificates will be capped to that date, and under `reject` issuance from it will be refused.

The warnings are plain text for a person to read. Don't parse them.

The Fleet Manager's own `FleetService.IssueLeaf` response carries only `cert_der` today; it doesn't pass the node's warnings through.

## Validity policy

`CertificateProfile.validity_policy` (field 11) decides what a node does when a profile's `validity_days` would run past the issuing CA's own notAfter. A certificate can never outlive its issuer, so the node has to either shorten it or refuse it.

| Value | Behaviour |
|---|---|
| `cap` (or empty) | The default. The node shortens the certificate so it ends when the issuer ends, issues it, and reports the cap in the response `warnings`. |
| `reject` | The node refuses to issue with `FAILED_PRECONDITION`, before it loads the CA key. The error names the profile, the requested end date and the issuer's notAfter. |

Any other value fails config validation. The policy applies to both `IssueLeaf` and `SignSubordinateCSR`.

Profiles live in `pki.profiles[]` in the node's machine config; see [Machine config schema](./machine-config.md). The Fleet Manager's catalog (`ListProfiles`, `CreateProfile`, `UpdateProfile`, `ApplyProfileToNode`) uses the same `cryptos.v1.CertificateProfile` message, so `validity_policy` travels with a profile when the manager pushes it to a node.

## MCP agent keys

The Fleet Manager serves an MCP endpoint so AI agents can work with the fleet. An agent authenticates with an **MCP key**: a bearer key bound to one operator's client certificate. MCP clients that can run the OAuth login get a key from that flow; `CreateMcpKey` mints one for clients that can't. Both produce the same kind of key.

A key is identity only. On every request its effective level is the lower of the bound certificate's live level and the key's `level_ceiling`, and the key stops working as soon as that certificate is revoked or expires.

### Access rules

- **Operator certificate only.** All three RPCs need an operator client certificate. A call that arrives with an MCP key is refused with `PERMISSION_DENIED`: a key can never mint, list or revoke keys.
- **`ListMcpKeys`** returns the keys bound to the caller's certificate. Setting `all` lists every operator's keys and is admin-only; a non-admin who sets it is refused.
- **`RevokeMcpKey`** lets an operator revoke the keys bound to their own certificate, and an admin revoke any key. It is idempotent: revoking a key that is already revoked returns it unchanged and writes no second audit entry. The revocation takes effect on the key's next request.
- **`CreateMcpKey`** binds the new key to the caller's certificate serial. `level_ceiling` may not exceed the caller's own level.
- `CreateMcpKey` and `RevokeMcpKey` are audited. The create entry names the key id, label and ceiling, never the key.

### `ListMcpKeys`

| Request field | Type | Meaning |
|---|---|---|
| `all` (1) | `bool` | list every operator's keys instead of only the caller's; admin only |

| Response field | Type | Meaning |
|---|---|---|
| `items` (1) | `repeated McpKey` | the keys, newest first, revoked ones included |

The listing never carries a key or its hash.

### `RevokeMcpKey`

| Request field | Type | Meaning |
|---|---|---|
| `id` (1) | `string` | the `McpKey.id` to revoke |

| Response field | Type | Meaning |
|---|---|---|
| `mcp_key` (1) | `McpKey` | the key after revocation, with `revoked_at` set |

An unknown id returns `NOT_FOUND`.

### `CreateMcpKey`

| Request field | Type | Meaning |
|---|---|---|
| `label` (1) | `string` | free-text name for the key, shown in listings |
| `level_ceiling` (2) | `string` | `viewer`, `operator` or `admin`; empty means no ceiling below the operator's own level |

| Response field | Type | Meaning |
|---|---|---|
| `plaintext_key` (1) | `string` | the bearer key: `fos_mcp_` followed by base64url of 32 random bytes |
| `mcp_key` (2) | `McpKey` | the stored metadata for the new key |

:::warning[🔑 Shown once]
`plaintext_key` is returned in this response only. The manager stores just its hash, so it can't show the key again. A lost key is revoked and a new one minted; it is never recovered. Don't log it.
:::

A ceiling that isn't a known level, or that is above the caller's level, returns `INVALID_ARGUMENT`. When the manager's MCP endpoint is disabled, `CreateMcpKey` returns `FAILED_PRECONDITION`.

### `McpKey`

The metadata of one key. It never carries the key or its hash. Timestamps are RFC 3339 strings; an unset one is empty.

| Field | Type | Meaning |
|---|---|---|
| `id` (1) | `string` | stable identifier, used by `RevokeMcpKey` and the audit `key_id` |
| `label` (2) | `string` | the operator's name for the key |
| `client_name` (3) | `string` | the name the MCP client registered with during the OAuth login; empty for a key from `CreateMcpKey` |
| `operator_cn` (4) | `string` | subject CN of the operator certificate the key is bound to |
| `operator_serial` (5) | `string` | hex serial of that certificate |
| `level_ceiling` (6) | `string` | `viewer`, `operator` or `admin`; empty means no ceiling below the operator's own level |
| `created_at` (7) | `string` | when the key was minted |
| `last_used_at` (8) | `string` | when the key last authenticated a request; empty if never |
| `revoked_at` (9) | `string` | when the key was revoked; empty while it is active |

## Step-up approvals

Some MCP tool calls are too risky for an agent to run on its own: revocation, profile and adapter changes, and issuance from a CA profile or the root node. When an agent makes one of these calls, the manager doesn't run it. It raises an **approval** instead and returns its id to the agent. A person then decides the approval with their operator certificate, and the agent calls the tool again, with the same arguments plus the `approval_id`, to run it.

An approval covers one exact request: the tool, the `request_digest` of its arguments and the MCP key that raised it. It runs at most once, and a pending or approved approval that isn't used lapses 15 minutes after it was raised.

### Access rules

- **Operator certificate only.** Both RPCs need an operator client certificate. A call that arrives with an MCP key is refused with `PERMISSION_DENIED`: an agent can never list or decide approvals.
- **`ListApprovals`** is open to any operator certificate.
- **`DecideApproval`** needs the deciding certificate's level to be at least the approval's `required_level`; a lower level is refused with `PERMISSION_DENIED` and the refusal is audited. The operator whose key raised the request may decide it themselves, because the agent holds only the key.
- When the manager's MCP endpoint is disabled, both RPCs return `FAILED_PRECONDITION`.

### `ListApprovals`

| Request field | Type | Meaning |
|---|---|---|
| `status` (1) | `string` | keep only approvals in this state: `pending`, `approved`, `denied`, `expired` or `used`; `all` or empty lists all |

| Response field | Type | Meaning |
|---|---|---|
| `items` (1) | `repeated Approval` | the approvals, newest first |

Any other `status` value returns `INVALID_ARGUMENT`.

### `DecideApproval`

:::danger[✋ You are authorizing the agent]
Approving lets the agent run that exact call once, with your approval on its audit entry. Revoking a certificate can't be undone, and issuing from a CA profile or the root node creates a CA. Read the approval's `tool` and `summary`, and check `requested_by_cn` and `key_id` name a key you expect, before you approve. If anything is unexpected, deny it and revoke the key with `RevokeMcpKey`.
:::

| Request field | Type | Meaning |
|---|---|---|
| `id` (1) | `string` | the `Approval.id` to decide |
| `approve` (2) | `bool` | `true` approves the request, `false` denies it |

| Response field | Type | Meaning |
|---|---|---|
| `approval` (1) | `Approval` | the approval after the decision, with `status` and the `decided_by` fields set |

An unknown id returns `NOT_FOUND`. An approval that is no longer pending (already decided, expired or used) returns `FAILED_PRECONDITION`.

### `Approval`

Timestamps are RFC 3339 strings; an unset one is empty.

| Field | Type | Meaning |
|---|---|---|
| `id` (1) | `string` | stable identifier, used by `DecideApproval` and the audit `approval_id` |
| `tool` (2) | `string` | the MCP tool the request would run |
| `summary` (3) | `string` | one line for a person to read, describing the action |
| `request_digest` (4) | `string` | lowercase hex SHA-256 of the canonical request, so the approval covers exactly the request that raised it |
| `requested_by_cn` (5) | `string` | subject CN of the operator certificate behind the requesting MCP key |
| `requested_by_serial` (6) | `string` | hex serial of that certificate |
| `key_id` (7) | `string` | the `McpKey.id` that made the request |
| `required_level` (8) | `string` | the lowest level that may decide it: `viewer`, `operator` or `admin` |
| `created_at` (9) | `string` | when the approval was raised |
| `expires_at` (10) | `string` | when a pending or approved approval lapses to `expired` |
| `status` (11) | `string` | `pending`, `approved`, `denied`, `expired` or `used` |
| `decided_by_cn` (12) | `string` | subject CN of the deciding operator certificate; empty until decided |
| `decided_by_serial` (13) | `string` | hex serial of that certificate; empty until decided |
| `decided_at` (14) | `string` | when it was decided; empty until decided |

## Node audit log

Two `NodeService` calls read the node's hash-chained audit log (see [Audit log format](./audit-log.md)). They are authorized like `ListIssued`: the local socket, or the bootstrap admin certificate over mTLS; any other certificate gets `PERMISSION_DENIED`. A node in maintenance mode answers `FAILED_PRECONDITION`. Both calls are recorded in the log like any other.

### `ListAuditEvents`

Returns entries oldest first (ascending `seq`), a page at a time. Every filter is optional, and they combine.

| Request field | Type | Meaning |
|---|---|---|
| `page_size` (1) | `int32` | most entries to return; `0` means 100, larger values are capped at 1000, negative is `INVALID_ARGUMENT` |
| `page_token` (2) | `string` | the previous response's `next_page_token`, sent with the same filters; empty starts at the oldest match |
| `from_time` (3) | `string` | RFC 3339; keeps entries whose `ts` is at or after it |
| `to_time` (4) | `string` | RFC 3339; keeps entries whose `ts` is before it |
| `event_type` (5) | `string` | the full `rpc_method` (`/cryptos.v1.NodeService/RevokeCertificate`) or its method name alone (`RevokeCertificate`) |
| `actor` (6) | `string` | keeps entries whose `actor_subject` contains it; case-sensitive |

A time that isn't RFC 3339, a `to_time` earlier than `from_time`, and a `page_token` the node didn't issue or that was issued for other filters are `INVALID_ARGUMENT`.

The response holds `entries` and a `next_page_token` that is empty on the last page. Each `AuditLogEntry` carries:

| Field | Type | Meaning |
|---|---|---|
| `event` (1) | `AuditEvent` | the entry exactly as stored, signed and chained |
| `entry_sha256` (2) | `bytes` | SHA-256 of the entry's bytes on disk: the value the next entry's `prev_entry_sha256` holds. Re-encoding `event` doesn't reproduce those bytes, so use this value |
| `target` (3) | `string` | what the call acted on when the entry records it, such as the serial on `RevokeCertificate` or the asserted names on `IssueLeaf`; empty otherwise |
| `summary` (4) | `string` | one line for a person to read, such as `revoked a certificate: 4f1a09c2` |

`target` and `summary` are worked out when the entry is read and aren't part of the chain. Don't parse `summary`.

### `VerifyAuditChain`

Takes no fields and walks the whole stored log. A broken chain is a result, not an error; the call fails only when the log can't be read.

| Field | Type | Meaning |
|---|---|---|
| `entry_count` (1) | `uint64` | entries in the log, counted past a break |
| `intact` (2) | `bool` | every entry verified |
| `first_broken_sequence` (3) | `uint64` | the `seq` the first failing entry holds, or the one expected at its place when the line can't be read; `0` when intact |
| `reason` (4) | `string` | the file, line and failure (a signature mismatch, a sequence gap, a `prev_entry_sha256` mismatch, or a line that is malformed or does not parse); empty when intact |

## Fleet Manager audit events

`FleetService.ListAudit` returns `cryptos.fleet.v1.AuditEvent` entries. This is the manager's log, separate from the hash-chained `cryptos.v1.AuditEvent` log each node keeps (see [Audit log format](./audit-log.md)).

| Field | Type | Meaning |
|---|---|---|
| `id` (1) | `string` | entry id |
| `at` (2) | `string` | when it happened |
| `kind` (3) | `string` | what happened, e.g. `issued`, `revoked`, `config-applied`, `profile-updated`, `node-renamed`, `mcp-key-created`, `mcp-key-first-used`, `mcp-key-rejected`, `mcp-key-revoked`, `approval-requested`, `approval-approved`, `approval-denied`, `approval-decide-refused`, `approval-used` |
| `summary` (4) | `string` | one line for a person to read |
| `target_kind` (5) | `string` | `approval`, `cert`, `enrollment`, `mcp-key`, `node`, `profile` or `protocol` |
| `target_path` (6) | `string` | the object acted on |
| `node_id` (17) | `string` | the stable id (`NodeSummary.id`) of the node the entry concerns; empty when it concerns no node. For entries recorded before node ids, the manager fills it from the name the node held at the time |

### Actor fields

Fields 7 onward say who acted and through which surface. They are empty on entries recorded before the manager captured an actor.

| Field | Type | Meaning |
|---|---|---|
| `actor_kind` (7) | `string` | how the actor authenticated: `cert` for an operator client certificate, `mcp_key` for an MCP key |
| `actor_cn` (8) | `string` | subject CN of the operator certificate that acted, or that the MCP key is bound to |
| `actor_serial` (9) | `string` | hex serial of that operator certificate |
| `key_id` (10) | `string` | the `McpKey.id` when `actor_kind` is `mcp_key`; empty otherwise |
| `via` (11) | `string` | the surface the action came through: `web`, `mcp` or `api` |
| `tool` (12) | `string` | the MCP tool name when `via` is `mcp`; empty otherwise |
| `request_digest` (13) | `string` | lowercase hex SHA-256 of the canonical request, so an entry can be matched to the exact request without storing its body |
| `outcome` (14) | `string` | `ok`, `denied`, `pending` or `error` |
| `approval_id` (15) | `string` | the `Approval.id` on entries in an approval's lifecycle and on the action an approval authorized; empty otherwise |
| `approver_serial` (16) | `string` | hex serial of the operator certificate that decided the approval; set on `approval-approved`, `approval-denied` and `approval-used` entries and on the approved action's own entry; empty otherwise |

:::info[🧭 Following an approved action]
An agent's approved action leaves a trail you can join on `approval_id`: `approval-requested` (outcome `pending`) when the agent asked, `approval-approved` or `approval-denied` when a person decided, then `approval-used` and the action's own entry when the agent ran it. See [Step-up approvals](#step-up-approvals).
:::

Because an MCP key is always bound to a certificate, an action an agent takes is still attributed to a person: `actor_cn` and `actor_serial` name the operator, and `key_id` names the key they gave the agent.
