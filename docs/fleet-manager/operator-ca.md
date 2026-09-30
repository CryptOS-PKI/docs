---
title: "🪪 The operator CA and revocation"
---

# 🪪 The operator CA and revocation

Operators log in to the Fleet Manager with a client certificate. The CA that signs those certificates, the **operator CA**, is always **external**: an offline OpenSSL CA, or an enterprise or offline CA that can issue the operator profile. It is **never a CryptOS node**. The manager learns only the CA's certificate, the trust anchor. It never holds the CA's key and never signs an operator credential.

This page covers where the manager gets the anchor, how revocation works, and the config keys. Moving a manager off `operator_ca_node` is on its own page: [Migrating from operator_ca_node](./migrating-from-operator-ca-node.md).

## Where the anchor comes from

The source depends only on what is configured:

| Source | When | Trusted | Revocation |
|---|---|---|---|
| Config file | `operatorCAPath` is set | The certificates in that PEM file | The denylist (needs Postgres), plus the CRLs in `operatorCRL` |
| Registered | No `operatorCAPath`, `database_url` set, `firstRun` not `disabled` | The operator CAs stored in Postgres | The denylist, plus each CA's own CRL source |
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

:::warning[The denylist doesn't revoke at your CA]
The denylist stops a certificate at the Fleet Manager only. Anything else that trusts the same CA still accepts it. Revoke the certificate at your CA as well, and publish a new CRL.
:::

The CRL must be a complete CRL for end-entity certificates, signed by the operator CA itself, with a next update time. The manager refuses delta CRLs, indirect CRLs, CRLs limited to CA certificates or to some revocation reasons, and CRLs with an unknown critical extension. A certificate on hold counts as revoked while it is listed.

A CA with no CRL source is checked against the denylist only: revocations made at the CA are not seen.

### When the CRL is out of date

`operatorRevocationPolicy` decides what happens when a CA's CRL is past its next update time, or a configured CRL has never been downloaded:

| | `soft` (default) | `hard` |
|---|---|---|
| Web UI and API | Keep enforcing the last good CRL and the denylist. Log it every hour, and record `operator-crl-expired` in the audit log once. | Refuse certificates from that CA with error 1608 (`STALE_CRL`) until a current CRL is loaded. |
| MCP | Refused with 1608 (`STALE_CRL`) | Refused |

:::warning[hard can lock everyone out]
With `hard`, a CRL address that stops answering locks every operator from that CA out of the web UI until the CRL is published again. Use `hard` only when the CRL is published automatically from a highly available location.
:::

### MCP needs a current CRL

MCP keys live a long time, so they get a stricter rule. When a key is made and on every call, the operator CA of the key's certificate must have a CRL source with a CRL that isn't out of date, and the manager instance must have read the denylist in the last 5 minutes. Otherwise the call is refused with error 1608 and the reason `NO_CRL`, `STALE_CRL` or `STALE_DENYLIST`.

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

:::info[OCSP isn't checked yet]
The manager checks `operatorOCSP` when it loads the config, but this version doesn't ask OCSP responders yet. Revocation comes from the denylist and the CRL.
:::

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
