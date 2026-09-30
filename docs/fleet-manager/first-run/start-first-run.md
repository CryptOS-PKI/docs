---
title: "2. Start first run"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 2. Start first run

:::info[Before you start]
The operator CA from [stage 1](./create-operator-ca.md). A manager with `database_url` set and no `operatorCAPath`, and access to its log.
:::

## 2.1 What the manager prints

With first run open, the manager logs two things at start. The self-signed certificate it serves, with its fingerprint:

```text
manager: WARNING serving a SELF-SIGNED bootstrap certificate, SHA-256 AB:CD:...:EF, valid until 2026-12-29; verify this fingerprint in your browser before entering the bootstrap token
```

And a banner with the bootstrap token:

```text
manager: ================= FLEETOS FIRST RUN =================
manager: bootstrap token: fos_boot_7K3Q-M2XD-...-9FJA  (single use, expires 2026-09-30T15:04:05Z)
manager: server certificate SHA-256: AB:CD:...:EF  (check this in the browser first)
manager: open https://<this-host>/ and enter this token to register your operator CA certificate
manager: ======================================================
```

- The token works **once**. Starting a session uses it up, and the manager prints a new banner at once, with the next token and the line `new bootstrap token: the previous token started a session`.
- It expires after **60 minutes**. The manager then prints a new one.
- Only the newest token works. The manager keeps only a hash of it; nothing can show it again.
- With Postgres, the self-signed certificate is kept there, so a restart, or another replica, serves the same fingerprint.

## 2.2 Find the token

Both lines contain `bootstrap token`, so one search shows the fingerprint and the token together. Use the newest token in the output.

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
# docker compose (the service is named manager)
docker compose logs manager 2>&1 | grep 'bootstrap token'
# a single container
docker logs fleet-manager 2>&1 | grep 'bootstrap token'
# Kubernetes (the Deployment is named after the Helm release)
kubectl logs deploy/fleet-manager | grep 'bootstrap token'
# systemd, on the manager host (use your unit's name)
journalctl -u cryptos-fleet-manager | grep 'bootstrap token'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
# docker compose (the service is named manager)
docker compose logs manager 2>&1 | Select-String 'bootstrap token'
# a single container
docker logs fleet-manager 2>&1 | Select-String 'bootstrap token'
# Kubernetes (the Deployment is named after the Helm release)
kubectl logs deploy/fleet-manager | Select-String 'bootstrap token'
```

</TabItem>
</Tabs>

:::info[More than one replica]
One replica prints the token at start and when it expires. A token used up, or replaced after too many failures, is replaced by the replica that took the request. Search every replica's log, for example `kubectl logs -l app.kubernetes.io/name=fleet-manager --prefix`, and use the newest token.
:::

## 2.3 Check the certificate first

:::danger[Compare the fingerprint before you send the token]
The manager's certificate is self-signed, so your browser or client can't tell it from an impostor's. Someone between you and the manager could capture the token and register their own CA. Check that the certificate you reach has the fingerprint from the log, and stop if it doesn't.
:::

In a browser, open the site's certificate details and compare the SHA-256 fingerprint. From a shell:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl s_client -connect fleet.example.org:443 </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$null | openssl s_client -connect fleet.example.org:443 2>$null | openssl x509 -noout -fingerprint -sha256
```

</TabItem>
</Tabs>

:::tip[Expected output]
`sha256 Fingerprint=` followed by the same value as `server certificate SHA-256` in the banner.
:::

The commands below skip certificate verification (`-k`, `-SkipCertificateCheck`) because the certificate is self-signed. That is safe only after this check.

## 2.4 Check that first run is open

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
FM=https://fleet.example.org
curl -sk "$FM/cryptos.fleet.v1.BootstrapService/GetBootstrapState" \
  -H 'Content-Type: application/json' -d '{}'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$fm = 'https://fleet.example.org'
Invoke-RestMethod -Method Post -Uri "$fm/cryptos.fleet.v1.BootstrapService/GetBootstrapState" `
  -ContentType 'application/json' -Body '{}' -SkipCertificateCheck
```

</TabItem>
</Tabs>

| `state` | Meaning |
|---|---|
| `BOOTSTRAP_STATE_OPEN` | Ready. `tokenExpiresAt` says when the current token expires. |
| `BOOTSTRAP_STATE_OPEN_IN_PROGRESS` | Someone started a session or registered a CA. If that wasn't you, carry on with the newest token: it ends their session, and registering your CA retires theirs. |
| `BOOTSTRAP_STATE_CLOSED` | An admin certificate has signed in. First run is over. |
| `BOOTSTRAP_STATE_NOT_APPLICABLE` | `operatorCAPath` is set; the CA comes from the file. |
| `BOOTSTRAP_STATE_UNAVAILABLE` | `reasonCode` is `ERROR_REASON_DATABASE_REQUIRED` (no `database_url`) or `ERROR_REASON_FIRST_RUN_DISABLED`. |

## 2.5 Start a session

Put the newest token in place of the example. Case and dashes don't matter.

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
SESSION=$(curl -sk "$FM/cryptos.fleet.v1.BootstrapService/StartBootstrapSession" \
  -H 'Content-Type: application/json' \
  -d '{"token":"fos_boot_7K3Q-M2XD-...-9FJA"}' | jq -r .sessionSecret)
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$session = (Invoke-RestMethod -Method Post -Uri "$fm/cryptos.fleet.v1.BootstrapService/StartBootstrapSession" `
  -ContentType 'application/json' -SkipCertificateCheck `
  -Body (@{ token = 'fos_boot_7K3Q-M2XD-...-9FJA' } | ConvertTo-Json)).sessionSecret
```

</TabItem>
</Tabs>

The reply's `sessionSecret` starts with `fos_bsess_`. Every call in the next stages sends it in the `Fleetos-Bootstrap-Session` header. It is never stored by the manager, only its hash.

- The session ends after **15 minutes without a call**, or **60 minutes** after it started, whichever comes first.
- There is only **one** session. Starting another ends this one: its calls then fail with 1604.
- A session that ends isn't a problem: start a new one with the newest token, and confirm the registered CA again as in [stage 3.4](./register-operator-ca.md#34-a-new-session-confirms-again).

A wrong, used or expired token fails with 1600, whichever it was.

## Verify before continuing

- [ ] The certificate fingerprint matched the log.
- [ ] `GetBootstrapState` reported `OPEN` or `OPEN_IN_PROGRESS`.
- [ ] You hold a `fos_bsess_` session secret.

Previous: [1. Create the operator CA](./create-operator-ca.md) · Next: [3. Register the operator CA](./register-operator-ca.md)
