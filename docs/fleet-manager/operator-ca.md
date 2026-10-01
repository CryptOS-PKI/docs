---
title: "🪪 The operator CA and revocation"
---

# 🪪 The operator CA and revocation

Operators log in to the Fleet Manager with a client certificate. The CA that signs those certificates, the **operator CA**, is always **external**: an offline OpenSSL CA, or an enterprise or offline CA that can issue the operator profile. It is **never a CryptOS node**. The manager learns only the CA's certificate, the trust anchor. It never holds the CA's key and never signs an operator credential.

This page covers where the manager gets the anchor, how revocation works, and the config keys. Moving a manager off `operator_ca_node` is on its own page: [Migrating from operator_ca_node](./migrating-from-operator-ca-node.md). So is adding operators once the manager is running: [Operator credentials after day zero](./operator-credentials.md).

## Where the anchor comes from

The source depends only on what is configured:

| Source | When | Trusted | Revocation |
|---|---|---|---|
| Config file | `operatorCAPath` is set | The certificates in that PEM file | The denylist (needs Postgres), plus the CRLs in `operatorCRL`, plus OCSP as `operatorOCSP` says |
| Registered | No `operatorCAPath`, `database_url` set, `firstRun` not `disabled` | The operator CAs stored in Postgres | The denylist, plus each CA's own CRL source, plus OCSP as that CA's OCSP mode says |
| None | No `operatorCAPath`, and no `database_url` or `firstRun: disabled` | Nothing | Nothing. Every API call is refused. |

The config file wins: while `operatorCAPath` is set, any operator CA stored in the database is ignored, and the manager logs that at start.

:::caution[The operator CA can't be a node's CA]
The manager refuses to start when a certificate in `operatorCAPath` is a CryptOS node's CA, or has the same public key as one. Put only your external operator CA in that file, never a node's CA chain.
:::

Every start logs each trusted operator CA's subject and SHA-256. Compare it with the fingerprint on the CA machine (the command is the same on every OS):

```sh
openssl x509 -in operator-ca.crt -noout -fingerprint -sha256
```

The manager checks the certificate again on every request, not only when the browser connects. A certificate whose CA is no longer trusted, or which is on the denylist, is refused on its next request, even on a connection that is already open.

## Revocation

A certificate is refused if any source lists it. Serial numbers are unique per CA only, so each source is keyed by the CA as well as the serial.

- **The denylist** is the Fleet Manager's own list, kept in Postgres and always on. Revoking an operator in the manager adds to it. The manager instance that takes the request refuses the certificate at once, and the other instances within about 5 seconds. Without `database_url` there is no denylist, and revoking fails with error 1603 (`DATABASE_REQUIRED`).
- **The CRL** is your CA's own revocation list, optional for each CA. The manager downloads it (or reads the file), checks it against the CA, and refuses a CRL older than the one it holds. It refreshes the CRL every 15 minutes and at the CRL's next update time, and after a failure tries again after a minute, then less often, up to every 15 minutes.
- **OCSP** is your CA's live answer about one certificate, optional for each CA. It can only add a refusal: `revoked` refuses the certificate with error 1610 (`REVOKED_OCSP`), and `unknown` counts as revoked (1610, `OCSP_UNKNOWN`, recorded as `operator-ocsp-unknown` in the audit log). A `good` answer never overrides the denylist or the CRL.

:::warning[The denylist doesn't revoke at your CA]
The denylist stops a certificate at the Fleet Manager only. Anything else that trusts the same CA still accepts it. Revoke the certificate at your CA as well, and publish a new CRL.
:::

The CRL must be a complete CRL for end-entity certificates, signed by the operator CA itself, with a next update time. The manager refuses delta CRLs, indirect CRLs, CRLs limited to CA certificates or to some revocation reasons, and CRLs with an unknown critical extension. A certificate on hold counts as revoked while it is listed.

A CA with no CRL source and no OCSP is checked against the denylist only: revocations made at the CA are not seen. With OCSP on, the CA's revocations are seen through OCSP only.

### OCSP

Each operator CA has an OCSP mode: `operatorOCSP.mode` for the config file, or the CA's own setting when it is registered in the manager.

| Mode | Which responder the manager asks |
|---|---|
| `aia` (default) | The OCSP address in the operator certificate's Authority Information Access extension. A certificate without one gets no OCSP check. The manager reads the address only after the certificate has been checked against the CA, so only your CA can choose it. |
| `url` | The address you set (`operatorOCSP.url`, or the CA's OCSP address). The certificate's own address is ignored. |
| `off` | None. |

The manager sends each request as an HTTP POST with a 32-byte nonce. It uses GET only when the responder answers POST with 405 and the request is small enough (under 255 bytes once base64-encoded). Requests follow the same limits as CRL downloads: http or https only, 10 seconds, at most 3 redirects, no proxy from the environment, and at most 64 KiB in the answer.

The manager uses an answer only if it is about exactly the certificate it asked about, its this-update time is at most 5 minutes ahead, its next-update time hasn't passed, and it is signed by one of:

- the operator CA itself;
- a delegated OCSP signing certificate issued **directly** by the operator CA, with the `OCSPSigning` extended key usage, valid now, and named in the answer. With the `noCheck` extension it isn't checked for revocation; without it, it must not be on the CA's denylist or CRL.

If the answer repeats the nonce, it must match. An answer without a nonce is accepted, because responders for offline CAs often sign answers in advance. Anything else counts as no answer. The manager logs the responder address and `OCSP_INVALID` or `OCSP_UNREACHABLE`, never the answer itself.

:::caution[Renew the delegated OCSP signing certificate in time]
The manager refuses answers signed by an expired delegated signing certificate. Renew it before it expires, or every check falls back to the CRL and then to `operatorRevocationPolicy`.
:::

Each manager instance keeps answers in memory until the answer's next-update time, for at most 1 hour, or 5 minutes when the answer has no next-update time. A certificate that is in use is checked again in the background half way through that time; unused entries just expire. Requests for the same certificate at the same moment share one query, and a failed query is remembered for 30 seconds, so a responder that is down doesn't slow every request. A denylist entry still refuses the certificate at once, whatever the cache holds.

When OCSP applies to a certificate but there is no fresh answer, the manager falls back to the CA's CRL: with a CRL that isn't out of date, the certificate is allowed unless the CRL lists it. With no current CRL either, `operatorRevocationPolicy` decides.

### When revocation data is out of date

`operatorRevocationPolicy` decides what happens when a CA's CRL is past its next update time, a configured CRL has never been downloaded, or OCSP applies to the certificate with no fresh answer and no current CRL to fall back on:

| | `soft` (default) | `hard` |
|---|---|---|
| Web UI and API | Keep enforcing the last good CRL and the denylist. Log it every hour, and record `operator-crl-expired` in the audit log once. For OCSP, show the `OCSP responder unreachable` banner, log it every hour, and record `operator-ocsp-unavailable` once per outage. | Refuse certificates from that CA with error 1608: `STALE_OCSP` when OCSP applied to the certificate, otherwise `STALE_CRL`. A certificate with a fresh OCSP `good` is still allowed when the CRL is out of date. |
| MCP | Refused with 1608 (`STALE_CRL`) | Refused |

:::warning[hard can lock everyone out]
With `hard`, a CRL address or OCSP responder that stops answering locks every operator from that CA out of the web UI until it answers again. Use `hard` only when the CRL is published automatically from a highly available location and the responder is highly available too.
:::

### MCP needs a current CRL

MCP keys live a long time, so they get a stricter rule. When a key is made and on every call, the operator CA of the key's certificate must have a CRL source with a CRL that isn't out of date, and the manager instance must have read the denylist in the last 5 minutes. Otherwise the call is refused with error 1608 and the reason `NO_CRL`, `STALE_CRL` or `STALE_DENYLIST`. A fresh OCSP `good` doesn't replace the CRL here.

When OCSP applies to the key's certificate and there is a fresh answer, it must be `good`: `revoked` or `unknown` refuse the call with error 1610 (`REVOKED_OCSP` or `OCSP_UNKNOWN`). When the responder can't be reached, or its answer is invalid, the call is allowed, because the current CRL covers it.

## Config keys

```yaml
# Your external operator CA. Put only that CA's certificates in the file.
operatorCAPath: /etc/cryptos/fleet/operator-ca/operator-ca.pem

# Optional: where the CRLs for those CAs come from. Each entry is a url
# (http or https) or a path. Each CRL is matched to the CA that signed it.
operatorCRL:
  - url: http://pki.example.org/fleetos-operator.crl
  # - path: /etc/cryptos/fleet/operator-crl/fleetos-operator.crl

# Optional: soft (default) or hard.
operatorRevocationPolicy: soft

# Optional: off, aia (default) or url.
operatorOCSP:
  mode: aia

# Optional: auto (default) or disabled.
firstRun: auto
```

| Key | Default | Rules |
|---|---|---|
| `operatorCAPath` | not set | A PEM file of operator CA certificates. |
| `operatorCRL` | none | Needs `operatorCAPath`. Each entry sets exactly one of `url` (http or https) and `path`. |
| `operatorRevocationPolicy` | `soft` | `soft` or `hard`. |
| `operatorOCSP.mode` | `aia` | `off`, `aia` or `url`. Needs `operatorCAPath`. |
| `operatorOCSP.url` | not set | Required with `mode: url`, http or https. Refused with any other mode. |
| `firstRun` | `auto` | `auto` or `disabled`. With `disabled` and no `operatorCAPath`, no operator CA is trusted. |

:::caution[A misspelt key stops the start]
The manager refuses keys it doesn't know, and says which one. Before this change an unknown key was ignored.
:::

`mcp.enabled` needs `database_url` and `authBypass: false`. It no longer needs `operator_ca_node` or `operatorCAPath`.

## The self-signed certificate

Without `tlsCert` and `tlsKey`, the manager serves a self-signed certificate. With `database_url` it keeps that certificate in Postgres, so a restart or a second instance serves the same one, and replaces it 7 days before it expires. It deletes it once `tlsCert` is set. Every start logs its fingerprint:

```
manager: WARNING serving a SELF-SIGNED bootstrap certificate, SHA-256 AB:CD:...:EF, valid until 2026-12-29; ...
```

:::danger[Check the fingerprint before you trust the page]
Compare the fingerprint in the log with the one your browser shows for the page. If they differ, something between you and the manager is presenting its own certificate. Don't continue.
:::
