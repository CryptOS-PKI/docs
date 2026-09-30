---
title: "📄 Machine config: ACME and EST"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 📄 Machine config: ACME and EST

:::tip[Works today]
ACME (RFC 8555, `http-01` only) and EST (RFC 7030) both work in the alpha. SCEP and WSTEP are not available.
:::

The `pki.acme` and `pki.est` blocks of the [machine config](./machine-config.md). Each enrolment protocol is off unless its block is present: a protocol is opened on purpose, never by forgetting to close it. Both issue from a leaf profile defined under [`pki.profiles`](./machine-config-pki.md#-certificate-profiles).

:::caution[A Root never serves ACME or EST]
A Root keeps every enrolment protocol off. A config that sets `pki.acme` or `pki.est` on a Root is refused by `cryptosctl config apply`, by the maintenance-mode install and by `cryptosctl ceremony start --config`, and nothing is stored. Serve ACME and EST from an intermediate or issuing node.
:::

## 🔀 Switching a protocol on or off

To switch a protocol on, add its block and run `cryptosctl config apply`. To switch it off, remove the block and apply again. Changing a setting works the same way. In the API's `MachineConfig` the blocks are `Pki.acme` and `Pki.est`, each with an `enabled` flag: `enabled: false` switches the protocol off, and an `ApplyConfig` that leaves a block out keeps what the node has.

:::warning[A switch takes effect at the next reboot]
`config apply` stores the change and prints `requires_reboot=true`. The listener starts, stops or picks up the new settings only when the node boots again, and the node stops issuing while it restarts. Plan the reboot for a maintenance window, then run `cryptosctl reboot`.
:::

Until the reboot, `cryptosctl status` shows the stored state against what is running:

```text
Protocols:       ACME on (not running, reboot pending), EST off
Reboot:          pending (the stored config changes take effect at the next boot)
```

The secrets are write-only: `hmac_key_base64` for ACME and `password_sha256` for EST. `cryptosctl config get` prints them blank, next to their `key_id` or `username`. Leave a blank value as it is and `config apply` keeps the one the node stores for that identifier; set a value to replace it. A new `key_id` or `username` needs its value, or the apply is refused. Removing an entry revokes it.

## 🤖 ACME

```yaml
pki:
  revocation_base_url: http://pki.example.org
  profiles:
    - name: leaf-server
      key_alg: ECDSA-P384
      validity_days: 90
      key_usage: [digital_signature]
      ext_key_usage: [server_auth]
  acme:
    base_url: https://ca.example.org/acme
    profile: leaf-server
    allowed_identifier_suffixes: [example.org]
    external_account_keys:
      - key_id: ops-team
        hmac_key_base64: (at least 32 random bytes, base64url, no padding)
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `base_url` | string | none | The base URL clients dial, for example `https://ca.example.org/acme`. Required. Every URL handed to a client is built from it, and every signed request's `url` is checked against it, so it must be what clients reach, not what the node binds. |
| `http_port` | integer | `0` (port 8555) | The TCP port the ACME listener binds. It serves plain HTTP and is meant to sit behind a TLS terminator. |
| `profile` | string | none | The leaf profile ACME issues under. Required, and it must not be a CA profile. |
| `terms_of_service` | string | empty | When set, advertised in the directory, and new accounts must agree to it. |
| `website` | string | empty | Advertised in the directory metadata. |
| `allow_anonymous_accounts` | boolean | `false` | Drops the External Account Binding requirement, so anyone who can answer an `http-01` challenge can register and order. |
| `external_account_keys` | list | empty | The External Account Binding keys: `key_id`, the identifier the client sends, and `hmac_key_base64`, the shared secret. At least one is required unless `allow_anonymous_accounts` is `true`. |
| `allowed_identifier_suffixes` | list | empty | When set, a name must equal one of these or be a subdomain of one. Empty places no name restriction. |
| `order_ttl_hours` | integer | `0` (168 hours) | How long an order and its authorizations stay valid. `0` means seven days. |

| Rule | Error |
|---|---|
| Bad base URL | `config: pki.acme.base_url: must be an http(s) URL` |
| No profile | `config: pki.acme.profile: required when pki.acme is set` |
| Profile not found | `config: pki.acme.profile: no profile named "<name>" in pki.profiles` |
| CA profile | `config: pki.acme.profile: "<name>" is a CA profile; ACME issues end-entity certificates only` |
| No keys and anonymous accounts not allowed | `config: pki.acme.external_account_keys: at least one key is required unless pki.acme.allow_anonymous_accounts is true` |
| Key with no ID, or a repeated ID | `config: pki.acme.external_account_keys[<i>].key_id: required` or `... key_id: "<id>" is duplicated` |
| Secret not base64url without padding | `config: pki.acme.external_account_keys[<i>].hmac_key_base64: must be base64url without padding` |
| Secret shorter than 32 bytes | `config: pki.acme.external_account_keys[<i>].hmac_key_base64: must decode to at least 32 bytes, got <n>` |
| Blank secret for a `key_id` the node doesn't have | `config: pki.acme.external_account_keys[<i>].hmac_key_base64: empty, and the node has no stored key for key_id "<id>" to keep; send the secret for a new key` |
| Set on a Root | `config: pki.acme: must not be set on a root node; a root serves no enrolment protocol, so serve ACME from an intermediate or issuing node` |

One way to make a 32-byte key:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; echo
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')
```

</TabItem>
</Tabs>

:::tip[Expected output]
One line of 43 characters, using letters, digits, `-` and `_`, with no `=` at the end. Hand the same value and its `key_id` to whoever runs the ACME client.
:::

:::warning[Anonymous accounts open the CA to the whole network]
With `allow_anonymous_accounts: true` and no `allowed_identifier_suffixes`, any host that can answer an `http-01` challenge for a name can get a certificate for it. Keep the account binding on, or at least restrict the names.
:::

## 📮 EST

```yaml
pki:
  est:
    hostnames: [est.example.org, 192.0.2.20]
    profile: leaf-server
    allowed_identifier_suffixes: [example.org]
    enroll_credentials:
      - username: switch-fleet
        password_sha256: (64 lowercase hex characters)
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `hostnames` | list | none | The names and IP addresses clients reach the endpoint on. Required. The listener terminates TLS itself, with a server certificate the node mints for these names from its own CA. |
| `http_port` | integer | `0` (port 8443) | The TCP port the EST listener binds. |
| `profile` | string | none | The leaf profile EST issues under. Required, and it must not be a CA profile. Include `client_auth` in its `ext_key_usage` if clients will renew with `simplereenroll`. |
| `label` | string | empty | The optional path segment between `/.well-known/est` and the operation, so one host can offer several CAs. Empty serves the unlabelled paths. |
| `realm` | string | empty | The HTTP Basic realm offered when `simpleenroll` asks for credentials. |
| `allowed_identifier_suffixes` | list | empty | Restricts the names `simpleenroll` will issue for. It doesn't restrict `simplereenroll`, whose names are pinned to the certificate the client already holds. |
| `allow_any_identifier` | boolean | `false` | Drops that restriction. Must be set by name. |
| `enroll_credentials` | list | empty | HTTP Basic credentials that authorize `simpleenroll`: `username` and `password_sha256`, the lowercase hex SHA-256 of the password. Empty keeps `simpleenroll` closed and offers certificate-authenticated renewal only. |

| Rule | Error |
|---|---|
| No hostnames | `config: pki.est.hostnames: at least one hostname is required; the node mints its TLS server certificate for them` |
| An empty hostname | `config: pki.est.hostnames[<i>]: must not be empty` |
| `label` contains `/` | `config: pki.est.label: must be a single path segment, got "<value>"` |
| No profile, profile not found, or a CA profile | `config: pki.est.profile: required when pki.est is set`, `... no profile named "<name>" in pki.profiles` or `... "<name>" is a CA profile; EST issues end-entity certificates only` |
| Credential with no username, or a repeated one | `config: pki.est.enroll_credentials[<i>].username: required` or `... username: "<name>" is duplicated` |
| Bad password digest | `config: pki.est.enroll_credentials[<i>].password_sha256: must be 64 lowercase hex characters (a SHA-256 digest)` |
| Credentials without a name restriction | `config: pki.est.allowed_identifier_suffixes: required when pki.est.enroll_credentials is set, unless pki.est.allow_any_identifier is true; simpleenroll has no proof of control` |
| Blank digest for a `username` the node doesn't have | `config: pki.est.enroll_credentials[<i>].password_sha256: empty, and the node has no stored credential for username "<name>" to keep; send the digest for a new credential` |
| Set on a Root | `config: pki.est: must not be set on a root node; a root serves no enrolment protocol, so serve EST from an intermediate or issuing node` |

:::caution[Only a generated password is safe here]
The node stores only a SHA-256 of each password, which protects a long random value but not a chosen word: a plain digest of a dictionary word falls in seconds. Generate the password (for example with the key command above) and give its digest to the node.
:::

To get the digest of a password held in a file with no trailing newline:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
openssl dgst -sha256 -r password.txt | cut -d' ' -f1
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
(Get-FileHash -Path password.txt -Algorithm SHA256).Hash.ToLower()
```

</TabItem>
</Tabs>

:::tip[Expected output]
64 lowercase hex characters. Put them in `password_sha256`. A trailing newline in the file changes the digest, so check the file holds only the password.
:::
