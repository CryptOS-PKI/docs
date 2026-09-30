---
title: "3. Register the operator CA"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 3. Register the operator CA

:::info[Before you start]
A session secret from [stage 2](./start-first-run.md), and the operator CA's certificate (`operator-ca.crt`) with its fingerprint from [stage 1](./create-operator-ca.md). The commands continue from stage 2's shell: `FM`/`$fm` and `SESSION`/`$session` are set.
:::

Registering is two calls with the same fields. The first checks everything and returns a **preview** with the CA's fingerprint. The second repeats the request with `confirmSha256` set to that fingerprint, and the manager stores the CA and trusts it at once, with no restart.

## 3.1 Choose how the manager learns about revocations

**CRL source**, one of:

| Choice | Field | What happens now |
|---|---|---|
| URL | `url` | The manager fetches the CRL from that http or https URL and checks it against the CA. A URL that doesn't answer fails with 1605 `CRL_UNREACHABLE`, a CRL the CA didn't sign with 1605 `CRL_INVALID`. It refreshes the CRL every 15 minutes afterwards. |
| Upload | `crlDer` | The CRL you send (DER or PEM, base64 in JSON, at most 4 MiB) is checked the same way. Later CRLs are uploaded by an admin. Suits an offline CA. |
| None | `none: true` | No CRL. Needs the acknowledgement `OPERATOR_CA_ACKNOWLEDGEMENT_NO_CRL`, or fails with 1605 `NO_CRL_NOT_ACKNOWLEDGED`. |

:::caution[Without a CRL]
Revocations you make at the CA aren't seen by the Fleet Manager, so revoke operators in the Fleet Manager as well: its denylist always applies. A CA with no CRL also gets **no MCP keys**.
:::

With a URL or an upload, the CA needs the `cRLSign` key usage, or it fails with 1605 `CRL_SIGN_MISSING`.

**OCSP mode**, one of:

- `OCSP_MODE_AIA` (the default): ask the responder named in each operator certificate, if it names one. Nothing is checked now.
- `OCSP_MODE_URL` with `ocspUrl`: ask this responder. The manager probes it now; no answer fails with 1605 `OCSP_UNREACHABLE`, a badly signed answer with 1605 `OCSP_INVALID`.
- `OCSP_MODE_OFF`: no OCSP.

## 3.2 Preview

The examples upload the CRL from stage 1.4. For a URL, put `"url": "http://pki.example.org/fleetos-operator.crl"` in place of `crlDer`; for no CRL, `"none": true` and `"acknowledgements": ["OPERATOR_CA_ACKNOWLEDGEMENT_NO_CRL"]`.

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
CA=$(openssl x509 -in operator-ca.crt -outform DER | openssl base64 -A)
CRL=$(openssl crl -in fleetos-operator.crl.pem -outform DER | openssl base64 -A)
jq -n --arg ca "$CA" --arg crl "$CRL" \
  '{caCertDer: $ca, crlDer: $crl, ocspMode: "OCSP_MODE_AIA"}' > register.json
curl -sk "$FM/cryptos.fleet.v1.BootstrapService/RegisterOperatorCA" \
  -H 'Content-Type: application/json' -H "Fleetos-Bootstrap-Session: $SESSION" \
  -d @register.json | jq .
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
openssl x509 -in operator-ca.crt -outform DER -out operator-ca.der
openssl crl -in fleetos-operator.crl.pem -outform DER -out fleetos-operator.crl
$register = @{
  caCertDer = [Convert]::ToBase64String((Get-Content -AsByteStream -Path ./operator-ca.der))
  crlDer    = [Convert]::ToBase64String((Get-Content -AsByteStream -Path ./fleetos-operator.crl))
  ocspMode  = 'OCSP_MODE_AIA'
}
$preview = Invoke-RestMethod -Method Post -Uri "$fm/cryptos.fleet.v1.BootstrapService/RegisterOperatorCA" `
  -ContentType 'application/json' -Headers @{ 'Fleetos-Bootstrap-Session' = $session } `
  -Body ($register | ConvertTo-Json) -SkipCertificateCheck
$preview | ConvertTo-Json -Depth 5
```

</TabItem>
</Tabs>

The preview shows `operatorCa` with the CA's `sha256`, `subject`, `issuer`, `notAfter`, the CRL status (`thisUpdate`, `nextUpdate`, `crlNumber`) and any `warnings`, plus `adminExtfile`: the OpenSSL section for an admin certificate under this CA, the same as `[ op_admin ]` in stage 1.2. `confirmed` is `false`: nothing is stored yet.

The manager refuses a CA that:

- isn't a CA with `keyCertSign` (1605 `NOT_A_CA`);
- has less than 30 days left (1605 `EXPIRING`);
- has a key other than P-384, P-256 or RSA of 3072 bits or more (1605 `KEY_TYPE`);
- is a CryptOS node's CA, or has the same public key as one (1605 `IS_NODE_CA`).

A CA issued by a node's CA is accepted with a warning in `warnings`.

## 3.3 Confirm

:::danger[Compare the fingerprint]
The manager trusts whatever CA you confirm. Check that `operatorCa.sha256` is the fingerprint you noted on the CA machine in stage 1.5, ignoring case and colons. If it isn't, stop: the certificate you sent isn't your CA's, or someone is between you and the manager.
:::

Send the same request again with `confirmSha256`. The `openssl` form with colons is accepted as is.

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
FP=$(openssl x509 -in operator-ca.crt -noout -fingerprint -sha256 | cut -d= -f2)
jq --arg fp "$FP" '. + {confirmSha256: $fp}' register.json > confirm.json
curl -sk "$FM/cryptos.fleet.v1.BootstrapService/RegisterOperatorCA" \
  -H 'Content-Type: application/json' -H "Fleetos-Bootstrap-Session: $SESSION" \
  -d @confirm.json | jq '{confirmed, state: .operatorCa.state}'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$register.confirmSha256 = $preview.operatorCa.sha256
$done = Invoke-RestMethod -Method Post -Uri "$fm/cryptos.fleet.v1.BootstrapService/RegisterOperatorCA" `
  -ContentType 'application/json' -Headers @{ 'Fleetos-Bootstrap-Session' = $session } `
  -Body ($register | ConvertTo-Json) -SkipCertificateCheck
$done.confirmed; $done.operatorCa.state
```

</TabItem>
</Tabs>

:::tip[Expected output]
`confirmed` is `true` and the state is `OPERATOR_CA_STATE_ACTIVE`. The manager logs `operator CA registered` with the subject and fingerprint, and records `operator-ca-registered` in the audit log.
:::

A `confirmSha256` that doesn't match fails with 1605 `NOT_CONFIRMED`.

Registering a different CA later in first run replaces this one: the earlier CA stops being trusted at once, and certificates it signed are refused on their next request.

## 3.4 A new session confirms again

A new session keeps the registered CA, but must confirm it before it can submit a certificate, so whoever continues always sees which CA is trusted. Call `RegisterOperatorCA` with no certificate to get the current registration's preview:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
curl -sk "$FM/cryptos.fleet.v1.BootstrapService/RegisterOperatorCA" \
  -H 'Content-Type: application/json' -H "Fleetos-Bootstrap-Session: $SESSION" \
  -d '{}' | jq .operatorCa.sha256
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
(Invoke-RestMethod -Method Post -Uri "$fm/cryptos.fleet.v1.BootstrapService/RegisterOperatorCA" `
  -ContentType 'application/json' -Headers @{ 'Fleetos-Bootstrap-Session' = $session } `
  -Body '{}' -SkipCertificateCheck).operatorCa.sha256
```

</TabItem>
</Tabs>

If it is your CA's fingerprint, confirm it by sending only `{"confirmSha256": "<fingerprint>"}` the same way. Nothing else changes. If it isn't yours, someone else registered a CA: register your own as in 3.2 and 3.3, which retires theirs.

## Verify before continuing

- [ ] `confirmed` was `true`, and the fingerprint was your CA's.
- [ ] `GetBootstrapState` reports `BOOTSTRAP_STATE_OPEN_IN_PROGRESS`.

Previous: [2. Start first run](./start-first-run.md) · Next: [4. Get the first admin certificate](./first-admin-certificate.md)
