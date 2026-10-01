---
title: "4. Get the first admin certificate"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 4. Get the first admin certificate

:::info[Before you start]
A registered operator CA that **this** session confirmed ([stage 3](./register-operator-ca.md)), and the CA machine from [stage 1](./create-operator-ca.md). The commands continue from stage 3's shell.
:::

The manager never signs this certificate: your operator CA does, out of band. The manager checks the result against the confirmed CA and records it as the first admin. Signing in with it closes first run.

There are two ways to make it:

- **With a CSR (recommended).** The key and the certificate request are made on your workstation, and only the request goes to the CA. You send the manager both the certificate and the request, and it checks that they carry the same key.
- **Entirely at the CA.** The key, request and certificate are all made on the CA machine. Sending the certificate to the manager is then an optional **pre-flight**: the same checks, without the key match, so a profile mistake shows up before you install anything.

## 4.1 The key and the request

On your workstation for the CSR way, or on the CA machine for the other (the commands are the same on every OS). Use your email address in lower case as the CN:

```sh
openssl ecparam -name secp384r1 -genkey -noout -out admin.key
openssl req -new -key admin.key -subj "/CN=admin@example.org" -out admin.csr
```

:::caution[Keep the key safe]
`admin.key` is your admin credential. It never goes to the manager or to the CA; only `admin.csr` goes to the CA. Keep it until the certificate is installed, and protect it like a password.
:::

## 4.2 Sign at the CA

On the CA machine, in the CA folder, with the request copied over:

```sh
openssl ca -config operator-ca.cnf -extensions op_admin -notext -in admin.csr -out admin.crt
openssl verify -CAfile operator-ca.crt admin.crt
```

Review the prompt and confirm. `openssl verify` prints `admin.crt: OK`. Check the level extension:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl x509 -in admin.crt -noout -text | grep -A1 '59999.1.1'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
openssl x509 -in admin.crt -noout -text | Select-String -Context 0,1 '59999.1.1'
```

</TabItem>
</Tabs>

:::tip[Expected output]
The OID line with nothing after the colon, then `..admin`. If the OID line says `critical`, the certificate can't sign in; fix the section and sign again.
:::

Copy `admin.crt` back to your workstation.

## 4.3 Submit it

Send the certificate, your full name (1 to 128 characters) and, for the CSR way, the request. For a pre-flight, leave `csrDer` out.

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
jq -n --arg cert "$(openssl x509 -in admin.crt -outform DER | openssl base64 -A)" \
      --arg csr "$(openssl req -in admin.csr -outform DER | openssl base64 -A)" \
  '{certDer: $cert, csrDer: $csr, fullName: "Ada Example"}' > submit.json
curl -sk "$FM/cryptos.fleet.v1.BootstrapService/SubmitFirstAdminCertificate" \
  -H 'Content-Type: application/json' -H "Fleetos-Bootstrap-Session: $SESSION" \
  -d @submit.json | jq .
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
openssl x509 -in admin.crt -outform DER -out admin.der
openssl req -in admin.csr -outform DER -out admin.csr.der
$submit = @{
  certDer  = [Convert]::ToBase64String((Get-Content -AsByteStream -Path ./admin.der))
  csrDer   = [Convert]::ToBase64String((Get-Content -AsByteStream -Path ./admin.csr.der))
  fullName = 'Ada Example'
}
Invoke-RestMethod -Method Post -Uri "$fm/cryptos.fleet.v1.BootstrapService/SubmitFirstAdminCertificate" `
  -ContentType 'application/json' -Headers @{ 'Fleetos-Bootstrap-Session' = $session } `
  -Body ($submit | ConvertTo-Json) -SkipCertificateCheck
```

</TabItem>
</Tabs>

:::tip[Expected output]
`serialHex`, `notAfter`, `email` (the CN, in lower case) and `issuerSha256` (your CA's fingerprint), and `warnings` if there are any. The manager logs `first admin certificate recorded` and records `operator-first-admin-recorded` in the audit log.
:::

A full name that is empty, longer than 128 characters or holds a control character (such as a line break) is refused with 1610 `FULL_NAME` before the certificate is checked.

The manager refuses, with 1610 and a sub-reason, a certificate that:

| Sub-reason | Problem |
|---|---|
| `NOT_CHAINED` | It doesn't verify against the confirmed CA for client authentication, or isn't valid yet or any more. |
| `WRONG_LEVEL` | The level extension is missing, or isn't `admin`. |
| `LEVEL_EXT_CRITICAL` | The level extension is marked critical. |
| `EKU` | Extended key usage isn't exactly `clientAuth`. |
| `KEY_USAGE` | Key usage lacks `digitalSignature`, or has `keyCertSign` or `cRLSign`. |
| `BASIC_CONSTRAINTS` | Basic constraints is missing, or says `CA:TRUE`. |
| `SUBJECT_MISMATCH` | The subject isn't exactly `CN=<email>`, or the CSR is for another email. |
| `KEY_TYPE` | The key isn't P-384 or RSA of 3072 bits or more. |
| `KEY_MISMATCH` | The key isn't the CSR's. |
| `EXPIRING` | Less than a day is left. |
| `REVOKED` | It is on the manager's denylist or in the CA's CRL. |
| `REVOKED_OCSP` | The CA's OCSP responder says it is revoked. |
| `OCSP_UNKNOWN` | The CA's OCSP responder doesn't know it, which counts as revoked. |

The OCSP checks apply where OCSP is configured for the certificate: the CA was registered in `url` mode, or in `aia` mode and the certificate names a responder. If no fresh revocation data is available (the responder doesn't answer and there is no current CRL), `operatorRevocationPolicy: soft` accepts the certificate, and `hard` refuses it with 1608 `STALE_OCSP` or `STALE_CRL`.

A refused CSR gets 1606 (`SIGNATURE`, `SUBJECT_MISMATCH`, `KEY_TYPE`, `SIZE`). If the session hasn't confirmed the registered CA, the call fails with 1605 `NOT_CONFIRMED`; confirm it as in [stage 3.4](./register-operator-ca.md#34-a-new-session-confirms-again).

Submitting again with the same certificate changes only the name. Submitting a **different** certificate replaces the first: the earlier one goes on the manager's denylist and stops working, and `operator-first-admin-superseded` is recorded. Only the newest first admin certificate can sign in.

## 4.4 Sign in, which closes first run

Bundle the key and certificate, with the CA certificate as the chain, and install the bundle in your browser or OS certificate store (the command is the same on every OS; it asks for a passphrase):

```sh
openssl pkcs12 -export -inkey admin.key -in admin.crt -certfile operator-ca.crt \
  -name "FleetOS admin (admin@example.org)" -out admin.p12
```

Reload the Fleet Manager and choose this certificate when the browser asks. The first API request made with an admin certificate from a trusted CA, that isn't revoked, **closes first run**. From a shell it looks like this:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
curl -sk "$FM/cryptos.fleet.v1.FleetService/WhoAmI" --cert admin.crt --key admin.key \
  -H 'Content-Type: application/json' -d '{}'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new("$PWD/admin.p12", (Read-Host -AsSecureString 'PKCS#12 passphrase'))
Invoke-RestMethod -Method Post -Uri "$fm/cryptos.fleet.v1.FleetService/WhoAmI" -Certificate $cert `
  -ContentType 'application/json' -Body '{}' -SkipCertificateCheck
```

</TabItem>
</Tabs>

:::warning[First run closes for good]
Closing ends every bootstrap session and deletes every token. The manager logs `first run CLOSED by <cn> (<serial>)` and records `bootstrap-closed`, and never prints a token again. There is no way to reopen first run from the web UI or the API; only the offline [break-glass reset](./break-glass.md) does. Make sure the certificate you sign in with is the one you mean to keep.
:::

If you skipped the submit step, signing in records the certificate as the first admin anyway. A viewer or operator certificate doesn't close first run; neither does a revoked admin certificate.

## Verify

- [ ] `WhoAmI` returns your email with level `admin`.
- [ ] `GetBootstrapState` reports `BOOTSTRAP_STATE_CLOSED`.
- [ ] The manager's log shows `first run CLOSED by` your email.

Previous: [3. Register the operator CA](./register-operator-ca.md)
