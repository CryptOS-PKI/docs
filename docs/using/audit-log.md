---
title: "🧾 Check the audit log"
---

# 🧾 Check the audit log

:::tip[Works today]
This describes CryptOS as it works right now.
:::

See who did what on a node, and check that nobody changed the record.

A node records every call to its API in a signed, hash-chained audit log: the ceremony, every issuance and revocation, each config apply, key exports and reboots. `cryptosctl audit list` reads it and `cryptosctl audit verify` checks the chain. Neither changes anything, and both calls are themselves recorded.

`cryptosctl` runs on Linux and macOS.

:::info[Before you start]
- `cryptosctl` set up to reach the node, with a fresh pin: [Setup](./setup.md).
- The bootstrap admin identity. Over mutual TLS both commands need it, the same as `ca list-issued`; on the node itself the local socket works too.
- A running node. A node in maintenance mode has no audit log open and answers `FailedPrecondition`.
:::

## 1. List the entries

```bash
cryptosctl --endpoint 192.0.2.10:443 audit list
```

:::tip[Expected output]
The oldest entries first, one page at a time:

```text
SEQ  TIME                  ACTOR               EVENT              OUTCOME  SUMMARY
1    2026-09-30T14:02:11Z  CN=admin            StartCeremony      ok       ran the first-boot ceremony
2    2026-09-30T14:05:40Z  CN=admin            ApplyConfig        ok       applied a machine config
3    2026-09-30T14:07:02Z  CN=admin            IssueLeaf          ok       issued a leaf certificate: web.example.org
4    2026-09-30T14:09:15Z  CN=admin            RevokeCertificate  ok       revoked a certificate: 4f1a09c2
5    2026-09-30T14:11:30Z  (local socket)      Reboot             ok       rebooted or powered off the node
(more entries: repeat with --page-token YTE6NTozZjljMmExYjdkMDA0ZTYx, or use --all)
```
:::

- **ACTOR** is the subject of the caller's client certificate, or `(local socket)` for a call made on the node itself.
- **OUTCOME** is `ok`, `denied` (the caller wasn't authorized) or `error`.
- The last line appears only when there are more entries. Add `--all` to fetch every page.

To narrow it down, combine the filters:

```bash
cryptosctl --endpoint 192.0.2.10:443 audit list \
  --type RevokeCertificate --actor "CN=operator-a" --since 168h
```

| Flag | Keeps |
|---|---|
| `--since` | entries at or after a time: RFC 3339 (`2026-09-30T12:00:00Z`) or a duration back from now (`24h`) |
| `--until` | entries before a time, in the same forms |
| `--type` | one call, by name (`RevokeCertificate`) or full method |
| `--actor` | entries whose actor subject contains the text; case-sensitive |

:::caution[Keep the filters with a page token]
A `--page-token` belongs to the filters it was printed with. Change a filter and keep the token, and the node refuses it with `InvalidArgument`. Drop the token and start again.
:::

`-o json` or `-o yaml` gives each entry as the node stored it, with its SHA-256 and summary, for a script or a ticket.

## 2. Verify the chain

```bash
cryptosctl --endpoint 192.0.2.10:443 audit verify
```

The node walks the whole log: every entry's signature, sequence numbers from 1 with no gaps, and each entry's link to the one before it.

:::tip[Expected output]
```text
audit chain intact: 1284 entries verified
```
:::

:::warning[A broken chain means the log was changed]
If an entry was changed, removed or corrupted after it was written, `audit verify` prints where the chain broke and exits non-zero:

```text
audit chain broken at seq 812 of 1284 entries: 2026-09-30.log:40: signature mismatch
```

Nothing is repaired, and the node keeps adding entries after the break. Leave the node as it is, save the listing with `audit list --all -o json`, and read the entries around that sequence number before you change anything. Don't reset the node: a reset destroys the log.
:::

`audit verify -o json` gives `entry_count`, `intact`, `first_broken_sequence` and `reason`, and still exits non-zero on a broken chain, so a scheduled check can alert on either.

## Related

- [Audit log format](../reference/audit-log.md): what an entry holds and how the chain is built.
- [cryptosctl reference](../reference/cryptosctl.md#audit-log): every flag.
