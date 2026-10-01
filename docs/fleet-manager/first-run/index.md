---
title: "🚀 First run"
---

# 🚀 First run

A Fleet Manager can start with no operator CA at all. It serves a self-signed certificate and prints a single-use **bootstrap token** in its log. Whoever holds the token registers your external operator CA's certificate and checks the first admin certificate that CA signed. First run then closes for good, the first time that admin certificate signs in.

The manager signs nothing during first run. Your operator CA signs the admin certificate, out of band, and the manager only learns which CA to trust. How the manager uses that CA afterwards is in [The operator CA and revocation](../operator-ca.md).

## When first run is open

First run is open only when all of these hold:

- `operatorCAPath` is **not** set. With it set, the operator CA comes from the file and there is no first run.
- `authBypass` is `false`.
- `firstRun` is `auto`, the default. `firstRun: disabled` turns first run off.
- `database_url` is set. First run keeps its state in Postgres; without it, first run is unavailable.
- First run hasn't closed yet.

## Prerequisites

1. **A Fleet Manager** configured as above, reachable over HTTPS, and access to its log.
2. **An external operator CA.** An OpenSSL CA on an offline machine is the simplest; [stage 1](./create-operator-ca.md) creates one. An enterprise or offline CA also works if it can issue the operator certificate profile. A CryptOS node can't be the operator CA.
3. **The CA certificate file**, and a way to get a certificate signed by the CA.
4. **`openssl`** and **`curl`** (Linux or macOS) or **PowerShell 7** (Windows) on the machine you work from. Every step here calls the manager's `BootstrapService` API, so it can be scripted.

:::caution[The token is in the log]
Anyone who can read the manager's log until first run closes can start first run and register a CA they control. Keep log access, including any log shipping, as tight as access to the manager itself.
:::

## Stages

Work through the stages in order.

1. [Create the operator CA](./create-operator-ca.md)
2. [Start first run](./start-first-run.md): check the certificate, find the token, start a session.
3. [Register the operator CA](./register-operator-ca.md)
4. [Get the first admin certificate](./first-admin-certificate.md), and sign in, which closes first run.

## The API

`BootstrapService` is served only over HTTPS, outside the client-certificate check, and never on the plaintext HTTP port. It has four procedures, called as Connect JSON (`POST`, `Content-Type: application/json`):

| Procedure | Needs | Does |
|---|---|---|
| `GetBootstrapState` | nothing | Reports `OPEN`, `OPEN_IN_PROGRESS`, `CLOSED`, `NOT_APPLICABLE` or `UNAVAILABLE` |
| `StartBootstrapSession` | the token | Starts the one live session |
| `RegisterOperatorCA` | the session | Previews, then stores and trusts, the operator CA |
| `SubmitFirstAdminCertificate` | the session | Checks and records the first admin certificate |

A refusal carries a numeric code in the `x-cryptos-error-code` response header, and often a sub-reason in `x-cryptos-error-reason`:

| Code | Meaning |
|---|---|
| 1600 | The token is wrong, expired or already used |
| 1601 | First run is closed, or doesn't apply (`operatorCAPath` is set) |
| 1602 | Too many failures from your address; wait a minute per failure |
| 1603 | First run is unavailable: `DATABASE_REQUIRED` or `FIRST_RUN_DISABLED` |
| 1604 | The session is unknown, expired or ended |
| 1605 | The operator CA, its CRL or its OCSP settings were refused; the sub-reason says why |
| 1606 | The CSR was refused |
| 1608 | No fresh revocation data for the certificate under `operatorRevocationPolicy: hard` |
| 1610 | The certificate was refused; the sub-reason says why |

## Limits

- **Per address:** 5 failures, then 1602. One failure is forgiven each minute.
- **Overall:** 50 failures within an hour, from anywhere, replace the token and end the live session. The new token's banner says why.
- A failure is a wrong token or session, or a refused CA, CRL, CSR or certificate.

:::info[Behind a proxy or ingress]
Every client then reaches the manager from the proxy's address, so the per-address limit is shared. `X-Forwarded-For` isn't trusted; the overall limit is what protects the token.
:::

## After first run

Once closed, first run stays closed. The API refuses every session procedure with 1601, and the manager never prints a token again. Revoking or retiring every admin certificate doesn't reopen it. From then on an admin adds operators with credential requests, as in [Operator credentials after day zero](../operator-credentials.md), and the operator CA is managed as described in [The operator CA and revocation](../operator-ca.md).
