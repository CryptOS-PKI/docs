---
title: "🔄 Rotating the operator CA"
---

# 🔄 Rotating the operator CA

This page covers one task: replacing the external operator CA a running Fleet Manager trusts with a new one, without locking anyone out and without a restart. It also covers changing a registered CA's CRL source, uploading its CRLs and setting its OCSP mode. What the operator CA is, and how revocation works, are in [The operator CA and revocation](./operator-ca.md). The same steps in the web UI are in [Managing operator CAs in the web UI](./web-operator-cas.md).

:::caution[Before you start]
You need an `admin` operator certificate, and the manager must take its operator CA from Postgres (a CA registered at first run). When `operatorCAPath` is set, every change on this page is refused with error 1607 (`OPERATOR_CA_MANAGED_BY_CONFIG`): edit the file instead, and restart.
:::

## How a rotation works

| Step | The old CA | The new CA |
|---|---|---|
| Before | `active` | not trusted |
| 1. Register the new CA | `retiring`: still trusted, still revocation-checked | `active` |
| 2. Overlap | Its certificates keep working. Its denylist, CRL and OCSP still apply. | New credentials are recorded only under it. |
| 3. Retire the old CA | `retired`: its certificates are refused from their next request | `active` |

Only one CA can be `retiring` at a time. Registering another CA before you retire the old one is refused with error 1605 `ROTATION_IN_PROGRESS`.

Every change is audited, applies at once on the manager instance that made it, and reaches every other instance within about 5 seconds.

## 1. Register the new CA

Create the new CA with the same recipe as the first one (the OpenSSL CA in the manager's [standalone deployment guide, section 3](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/deploying-standalone.md#3-the-operator-ca-is-an-external-ca), with `keyCertSign` and `cRLSign`), then call `FleetService.RegisterOperatorCA` with:

- `ca_cert_der`: the new CA certificate, DER or PEM, exactly one certificate;
- the CRL source: `url` (http or https), `crl_der` (an initial CRL) or `none` with the `NO_CRL` acknowledgement (in `acknowledgements`);
- `ocsp_mode` (`aia` by default, `url` with `ocsp_url`, or `off`).

The first call checks everything and returns a preview without storing anything: subject, issuer, expiry, the CRL status, the OCSP probe result for `url`, warnings and the SHA-256 fingerprint. The manager runs the same checks as at first run: the certificate must be a CA with at least 30 days left and must not be a CryptOS node's CA, a CRL must fetch and verify against it, and a `url` OCSP responder must answer a probe with a validly signed response.

On the machine that holds the new CA, print its fingerprint:

```bash
openssl x509 -in operator-ca-g2.crt -noout -fingerprint -sha256
```

:::danger[A trusted CA can sign in as admin]
Anyone who holds the key of a CA the manager trusts can issue themselves an admin certificate. Compare the fingerprint with the preview character by character before you confirm. If it differs, stop.
:::

Call `RegisterOperatorCA` again with the same fields and `confirm_sha256` set to that fingerprint (colons and case don't matter). The response marks the CA `active`. The previous active CA is now `retiring`.

## 2. Move operators to the new CA

Issue new operator certificates from the new CA and record them, as in [Operator credentials after day zero](./operator-credentials.md). A certificate from the retiring CA can't be recorded any more (error 1610 `NOT_ACTIVE_ANCHOR`).

:::caution[Get your own new certificate first]
Install an admin certificate from the new CA in your browser and log in with it before step 3. Otherwise retiring the old CA signs you out.
:::

## 3. Retire the old CA

Call `FleetService.RetireOperatorCA` with the old CA's `sha256`.

:::danger[Retiring stops every certificate under the CA]
Every certificate the old CA issued is refused from its next request, even over an open connection, and MCP keys bound to those certificates stop working. Retiring can't be undone except by registering the CA again.
:::

The manager refuses:

- the `active` CA, with error 1609 `OPERATOR_CA_IN_USE`: register its replacement first;
- the CA your own certificate comes from, unless you set `i_understand_self_lockout`. Log in with a certificate from the new CA instead.

The old CA's denylist entries are kept, in case it is ever registered again.

## Change a CA's CRL source

Call `FleetService.SetOperatorCACRLSource` with the CA's `sha256` and one of:

- `url`: the manager fetches the CRL now and verifies it against the CA before it saves the change;
- `crl_der`: the CA switches to uploaded CRLs, starting with this one;
- `none`: needs the `NO_CRL` acknowledgement.

A CRL that doesn't fetch or verify is refused with error 1605 (`CRL_UNREACHABLE` or `CRL_INVALID`), and nothing changes. The CA needs the `cRLSign` key usage (`CRL_SIGN_MISSING`).

:::warning[No CRL cuts off MCP]
With no CRL source, MCP keys bound to certificates under that CA fail on their next call, and revocations made at the CA are no longer seen. The CRL the manager already holds keeps applying.
:::

:::warning[hard policy and uploads]
With `operatorRevocationPolicy: hard`, the manager refuses an upload source, when registering and when changing the source: an expired CRL would lock out the admins who upload the next one. Use a CRL URL.
:::

## Upload a CRL

For a CA whose source is upload, call `FleetService.UploadOperatorCRL` with the CA's `sha256` and the CRL (DER or PEM, at most 4 MiB). It must be signed by the CA and newer than the CRL the manager holds: a lower CRL number is refused with error 1605 `CRL_ROLLBACK`. Uploading the same CRL again changes nothing. Every manager instance enforces a new CRL within about 5 seconds.

:::tip[Upload before nextUpdate]
The Operator CAs page warns once a CRL is in the last 20% of its validity. Upload the next one before its `nextUpdate`, or MCP is refused under the CA.
:::

## Set the OCSP mode

Call `FleetService.SetOperatorCAOCSP` with the CA's `sha256`, `ocsp_mode` and, for `url`, `ocsp_url`. In `url` mode the manager probes the responder first: a responder that doesn't answer, or answers with a response that isn't validly signed by the CA or its delegated responder, is refused with error 1605 (`OCSP_UNREACHABLE` or `OCSP_INVALID`). The response names who signed the probe answer. Changing the mode drops the OCSP answers every manager instance cached for that CA.

## List the CAs

`FleetService.ListOperatorCAs` (operator level) returns every CA, active first, then retiring, then retired: its fingerprint, expiry, CRL source and the CRL the manager holds, the OCSP mode, the last OCSP error the answering instance saw, and warnings. A CA from the config file is listed with `managed_by_config` set.

## Where to go next

- [Managing operator CAs in the web UI](./web-operator-cas.md): the same tasks on the Operator CAs page.
- [The operator CA and revocation](./operator-ca.md): the CRL, OCSP, the denylist and the config keys.
