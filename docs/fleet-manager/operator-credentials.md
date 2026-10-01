---
title: "🎫 Operator credentials after day zero"
---

# 🎫 Operator credentials after day zero

The Fleet Manager never signs an operator credential. Your external operator CA (see [The operator CA and revocation](./operator-ca.md)) signs every one of them, away from the manager. The manager prepares the request, checks what the CA signed, records it, and refuses it later if you deny it.

Adding an operator takes four steps:

| Step | Who | Where |
|---|---|---|
| 1. Request | An admin | The Fleet Manager |
| 2. Sign | Whoever runs the operator CA | The CA machine |
| 3. Record | An admin | The Fleet Manager |
| 4. Deny, when needed | An admin | The Fleet Manager **and** the CA |

:::info[Before you start]
You need an admin certificate from the operator CA, and the manager needs `database_url`: requests and recorded credentials live in Postgres. Without it every step fails with error 1603 (`DATABASE_REQUIRED`). With no operator CA configured at all, requesting, listing and recording fail with error 1400.
:::

:::tip[In the web UI]
The web UI's **Operators** page does each step below: see [Adding operators in the web UI](./web-operator-credentials.md). This page names the `FleetService` RPCs behind it, for scripting.
:::

## 1. Request a credential

An admin files a request with `CreateOperatorCredentialRequest`: the level (`viewer`, `operator` or `admin`), the holder's email and full name, and a CSR.

The best place to make the key and CSR is the holder's own machine, so the key never leaves it. The commands are the same on every OS:

```sh
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-384 -out alice.key
openssl req -new -key alice.key -sha384 -subj "/CN=alice@example.org" -out alice.csr
openssl req -in alice.csr -outform DER -out alice.csr.der
```

:::caution[The CSR must name only the email]
The CSR's subject must be exactly `CN=<email>`, and the key must be P-384 or RSA of 3072 bits or more. The email must be the request's email (case doesn't matter). Anything else is refused with error 1606 (`SUBJECT_MISMATCH` or `KEY_TYPE`).
:::

The full name is 1 to 128 characters with no control characters.

The manager keeps the request as `pending` for 30 days and records `operator-credential-requested` in the audit log. It answers with what the CA needs:

- the CSR in PEM form;
- the OpenSSL section for the level, for example:

  ```ini
  [ op_operator ]
  basicConstraints       = critical, CA:FALSE
  keyUsage               = critical, digitalSignature
  extendedKeyUsage       = clientAuth
  subjectKeyIdentifier   = hash
  authorityKeyIdentifier = keyid
  1.3.6.1.4.1.59999.1.1  = DER:13:08:6F:70:65:72:61:74:6F:72
  ```

- the `openssl ca` command that signs the CSR with that section.

`ListOperatorCredentialRequests` lists requests newest first, all of them or only those in one state: `pending`, `completed`, `cancelled` or `expired`. It needs `operator` level. An admin can cancel a pending request with `CancelOperatorCredentialRequest`. A request's CSR is deleted once the request is completed, cancelled or expired.

## 2. Sign it at the operator CA

Sign the CSR with the section for its level. On an OpenSSL operator CA whose `operator-ca.cnf` has the `op_<level>` sections, run the command the request returned, then check the result:

```sh
openssl ca -config operator-ca.cnf -extensions op_operator -notext -in alice.csr -out alice.crt
openssl verify -CAfile operator-ca.crt alice.crt
```

An enterprise CA needs a template that gives the same result: a subject of `CN` only, extended key usage exactly `clientAuth`, key usage `digitalSignature`, `CA:FALSE`, and the level extension.

:::warning[The level extension must not be critical]
If the certificate marks `1.3.6.1.4.1.59999.1.1` as critical, the browser's connection to the manager fails and the holder can't log in at all. Recording checks this and refuses the certificate with error 1610 (`LEVEL_EXT_CRITICAL`).
:::

## 3. Record the signed certificate

An admin records the certificate with `RecordOperatorCredential`: exactly one certificate in DER form, at most 8 KiB.

- **With the request's ID**, the request must still be `pending`, and the certificate's level, email and public key must match it. The credential is recorded as `requested`, and the request becomes `completed`.
- **Without an ID**, the manager imports a certificate made entirely at the CA. It reads the level from the certificate and records it as `recorded`. A full name is optional.

Either way, the certificate must pass the same checks as any operator certificate, must not be on the denylist or in the CA's CRL, and must not be recorded already. The manager records `operator-credential-recorded` in the audit log and returns any warnings, such as a validity over 400 days.

:::caution[Only the active operator CA]
While you are replacing your operator CA, only certificates from the new, **active** CA can be recorded. One signed by the CA being retired is refused with error 1610 (`NOT_ACTIVE_ANCHOR`). Sign new credentials with the new CA.
:::

| Error | Why |
|---|---|
| 1610 `NOT_CHAINED` | No trusted operator CA signed it, or it isn't valid for logging in |
| 1610 `NOT_ACTIVE_ANCHOR` | The CA being retired signed it |
| 1610 `WRONG_LEVEL`, `SUBJECT_MISMATCH`, `KEY_MISMATCH` | It doesn't match the request |
| 1610 `DUPLICATE` | It is already recorded |
| 1610 `REVOKED` | It is on the denylist or in the CA's CRL |
| 1610 `EKU`, `KEY_USAGE`, `BASIC_CONSTRAINTS`, `KEY_TYPE`, `EXPIRING` | It doesn't have the operator certificate profile |
| 1611 `NOT_FOUND`, `EXPIRED`, `NOT_PENDING` | The request can't be used |

The holder then needs the certificate and key together in a `.p12` file, built where the key is:

```sh
openssl pkcs12 -export -inkey alice.key -in alice.crt -certfile operator-ca.crt \
  -name "FleetOS operator (alice@example.org)" -out alice.p12
```

Installing it in a browser is covered in [Logging in](./web-ui.md#logging-in).

## Credentials seen in use

With `database_url` set, the manager also notes every operator certificate it sees log in. The first time it sees one it hasn't recorded, it adds it to the list as `observed`, with the serial, CA, email, level and expiry. It keeps each credential's first and last seen times, updating the last one at most once an hour. An observed certificate you record later becomes `requested` or `recorded`.

So the list shows everyone who can actually log in, including certificates your CA signed that nobody recorded, and you can deny any of them. The noting happens in the background and never slows a request down.

## 4. Deny a credential

An admin denies a credential with `RevokeOperatorCredential`. The manager adds it to its denylist and refuses it from its next request: at once on the instance that took the request, and within about 5 seconds on the others. It doesn't contact any node, and it records `operator-revoked` in the audit log.

- The serial is in hex. Colons, upper or lower case and leading zeros don't matter. You can deny a serial the manager never recorded.
- The CA fingerprint (SHA-256) is optional. Left empty, it is the CA of the recorded credential, or the active CA if the serial isn't recorded.
- The reason is an RFC 5280 revocation reason code, 0 to 10 except 7.
- A note is kept with the entry.

:::warning[Denying in the Fleet Manager doesn't revoke at your CA]
The denylist stops the certificate at the Fleet Manager only. Anything else that trusts the same operator CA still accepts it. Revoke it at the CA as well and publish a new CRL:

```sh
openssl ca -config operator-ca.cnf -revoke alice.crt -crl_reason keyCompromise
openssl ca -config operator-ca.cnf -gencrl -out fleetos-operator.crl.pem
```
:::

## Listing credentials

`ListOperatorCredentials` needs `operator` level. For each credential it returns:

| Field | Meaning |
|---|---|
| Kind | `first_admin`, `requested`, `recorded`, `observed`, or `legacy_node` (recorded before operator CAs became external; it can't log in) |
| CA | The SHA-256 of the operator CA that signed it; empty for `legacy_node` |
| Denylisted | On the Fleet Manager's denylist |
| In the CRL | Listed in the operator CA's CRL |
| Revoked | Refused for either reason |
| First and last seen | When the manager first and last saw it log in |

AI agents can't reach any of this through MCP: operator credentials are managed by people.
