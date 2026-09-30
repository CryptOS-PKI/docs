---
title: "📄 Machine config: pki"
---

# 📄 Machine config: pki

:::tip[Works today]
This describes CryptOS as it works right now.
:::

The `pki` section of the [machine config](./machine-config.md): the CA's key, name and lifetime, the parent it trusts, where it publishes revocation data, and the certificate profiles it issues from. ACME and EST have [their own page](./machine-config-enrollment.md).

## 🔑 The CA key, subject and lifetime

| Field | Type | Default | Meaning |
|---|---|---|---|
| `pki.root_key_alg` | string | none | The algorithm of this node's own CA key: `ECDSA-P384`, `RSA-3072` or `RSA-4096`. Required on every role, despite the name. |
| `pki.root_subject.common_name` | string | none | The CA's CN. Required. |
| `pki.root_subject.organization` | string | empty | O. |
| `pki.root_subject.country` | string | empty | C. |
| `pki.root_subject.province` | string | empty | ST (state or province). |
| `pki.root_subject.locality` | string | empty | L (city or locality). |
| `pki.root_validity_years` | integer | none | How long a Root's self-signed certificate lasts, 1 to 30 years. Required on a Root, unused on an intermediate or issuing node. |
| `pki.path_len_constraint` | integer | `0` | Accepted and checked (0 to 5), but not applied to any certificate in this alpha. A Root carries no path length limit; depth below it is set by the signing profile's `basic_constraints.path_len`. |

Empty subject fields are left out of the certificate. On a Root, `root_subject` becomes both the subject and the issuer of the self-signed certificate; see [Root certificate profile](./root-cert-profile.md). On an intermediate or issuing node, it's the subject of the CSR the node sends its parent.

The key algorithm decides more than the key. A certificate's signature is made with the issuer's key, so this value also sets the signature algorithm on every certificate the node signs: `ecdsa-with-SHA384` for `ECDSA-P384`, `sha384WithRSAEncryption` for either RSA size. RSA is there for platform CAs, such as VMware VMCA, that accept only RSA signatures anywhere in their chain. RSA-2048 is not offered: the node won't certify an RSA key smaller than 3072 bits, its own included.

| Rule | Error |
|---|---|
| Unknown key algorithm | `config: pki.root_key_alg: must be one of ECDSA-P384, RSA-3072, RSA-4096, got "<value>"` |
| No common name | `config: pki.root_subject.common_name: required` |
| Root lifetime out of range | `config: pki.root_validity_years: must be in [1, 30], got <n>` |
| Path length out of range | `config: pki.path_len_constraint: must be in [0, 5], got <n>` |

:::caution[An RSA key needs a software state key]
The TPM path holds ECDSA P-384 keys only. An RSA `root_key_alg` works only with `state_key.mode` set to `nodeid` or `kms`, where the CA key is a software key on the encrypted state partition. See [state_key](./machine-config.md#-state_key).
:::

## 🔗 parent

A subordinate pins the CA that signs it, so it can check the chain it is handed. Required on an `intermediate` or `issuing` node, forbidden on a Root.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `pki.parent.ca_cert_pem` | string | empty | The parent CA's certificate, as one PEM `CERTIFICATE` block. |
| `pki.parent.ca_cert_sha256` | string | empty | The parent certificate's SHA-256 fingerprint, as 64 hex characters. |

Set exactly one of the two.

| Rule | Error |
|---|---|
| Set on a Root | `config: pki.parent: must not be set on a root node` |
| Missing on a subordinate | `config: pki.parent: required on an intermediate/issuing node` |
| Both or neither set | `config: pki.parent: exactly one of ca_cert_pem or ca_cert_sha256 is required` |
| Fingerprint not 64 characters, or not hex | `config: pki.parent.ca_cert_sha256: must be 64 hex characters, got <n>` or `config: pki.parent.ca_cert_sha256: not hex: <reason>` |
| Bad PEM | `config: pki.parent.ca_cert_pem: no PEM block found`, `... PEM type "<type>", want CERTIFICATE`, `... must contain exactly one PEM block` or `... parse: <reason>` |

## 📡 Revocation

| Field | Type | Default | Meaning |
|---|---|---|---|
| `pki.revocation_base_url` | string | empty | The base URL where this node publishes its CRL, OCSP responder and CA certificate. Empty turns revocation publishing off. |
| `pki.allow_unverified_revocation_url` | boolean | `false` | Lets the node issue even when the revocation preflight fails. For an isolated lab only. |
| `pki.crl_next_update_hours` | integer | `0` (168 hours) | The CRL's validity window: `nextUpdate` is `thisUpdate` plus this many hours. `0` means one week. |
| `pki.revocation_http_port` | integer | `0` (port 80) | The TCP port of the plain-HTTP revocation listener. `0` means 80. |

When `revocation_base_url` is set, every certificate the node issues carries three pointers built from it:

| Extension | URL |
|---|---|
| CRL Distribution Points | `<base>/crl` |
| Authority Information Access, OCSP | `<base>/ocsp` |
| Authority Information Access, CA Issuers | `<base>/ca.cer` |

The node serves all three paths over anonymous HTTP on `revocation_http_port`. Before it issues, it runs a **revocation preflight**: the base URL's host must resolve and `/crl`, `/ocsp` and `/ca.cer` must answer. While the preflight fails, issuance is refused with `node: revocation preflight failing for configured revocation_base_url; issuance blocked (set allow_unverified_revocation_url to override)`. `cryptosctl status` reports the preflight result.

| Rule | Error |
|---|---|
| Not an `http` or `https` URL with a host | `config: pki.revocation_base_url: must be an http(s) URL` |

:::danger[allow_unverified_revocation_url can't be undone for issued certificates]
With this set, the node stamps CRL and OCSP pointers that may never resolve, and every certificate issued meanwhile keeps them for life. On a Root, every subordinate it signs inherits the pointer. `cryptosctl config apply` stops and asks you to type the Root CA's common name exactly (or `yes` on an intermediate or issuing node) before it sends such a config; `--yes` skips the prompt. Fix DNS and reachability instead wherever you can.
:::

## 🌳 Leaf issuance from a Root

| Field | Type | Default | Meaning |
|---|---|---|---|
| `pki.root_leaf_issuance` | string | empty | Set to exactly `acknowledged-irreversible` to let a Root issue end-entity certificates directly. Any other value leaves it refusing. |

Without it, a Root refuses leaf issuance with `node: a ROOT node refuses to issue leaf certificates without the irreversible acknowledgement`. The field takes effect without a reboot.

:::danger[A Root that signs a leaf can't take it back]
Good practice issues leaves from an issuing CA and keeps the Root for signing CAs. Once a Root has signed a leaf, it can no longer claim to have signed only CAs, and removing the setting later doesn't change that. Issue leaves from a subordinate unless you have a reason not to.
:::

## 🧩 Certificate profiles

`pki.profiles` is a list of named templates. `cryptosctl ca issue-leaf`, `ca sign-subordinate`, ACME and EST all issue from a profile, which sets everything about the certificate except its subject and public key; those come from the CSR. A change to profiles takes effect without a reboot.

```yaml
pki:
  profiles:
    - name: leaf-server
      key_alg: ECDSA-P384
      validity_days: 90
      key_usage: [digital_signature]
      ext_key_usage: [server_auth]
      sans:
        dns: [web.example.org]
    - name: platform-sub-ca
      key_alg: RSA-3072
      validity_days: 1825
      validity_policy: cap
      basic_constraints:
        is_ca: true
        path_len: 0
      key_usage: [digital_signature, cert_sign, crl_sign]
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | none | Required and unique. Callers pick the profile by name. |
| `key_alg` | string | none | Required: `ECDSA-P384`, `RSA-3072` or `RSA-4096`. Governs keys this node generates, not the subject keys it certifies. |
| `subject` | object | empty | `common_name`, `organization`, `country`, `province`, `locality`. Used when the node builds a CSR itself. An issued certificate takes its subject from the CSR. |
| `validity_days` | integer | none | Required, greater than 0. The requested lifetime, counted from signing. |
| `validity_policy` | string | `cap` | What happens when `validity_days` would run past the issuing CA's own notAfter: `cap` ends the certificate with its issuer, `reject` refuses to issue. |
| `basic_constraints.is_ca` | boolean | `false` | Marks a CA profile, for signing subordinates. |
| `basic_constraints.path_len` | integer | unset | CA profiles only. `0` means no CA may be issued below; unset means no limit. It is clamped to what the signing CA's own certificate allows. |
| `key_usage` | list | empty | Any of `digital_signature`, `key_encipherment`, `key_agreement`, `cert_sign`, `crl_sign`. |
| `ext_key_usage` | list | empty | `server_auth`, `client_auth`, or dotted OIDs such as `1.3.6.1.5.2.3.5` (Kerberos KDC). |
| `sans` | object | empty | `dns`, `ip`, `email`, `uri`, `krb5_principal`, `upn`. Stamped on every certificate the profile issues; SANs in the CSR are ignored. ACME and EST replace them with the names the client proved. |
| `allow_request_sans` | boolean | `false` | Leaf profiles only. Lets `cryptosctl ca issue-leaf --dns` replace the profile's SANs. |
| `extra_extensions` | list | empty | Raw extensions for anything not modelled above: `oid`, `critical`, and `value`, the DER bytes of the extension value. |

A few formats worth knowing:

- **`krb5_principal`** is `name[/instance]@REALM`, for example `krbtgt/AD.EXAMPLE.ORG@AD.EXAMPLE.ORG`, stamped as a KRB5PrincipalName otherName. Each part must be non-empty printable ASCII without `/`, `@` or `\`.
- **`upn`** is `prefix@suffix`, for example `user@ad.example.org`, stamped as a Microsoft UPN otherName (`1.3.6.1.4.1.311.20.2.3`).
- **Dotted OIDs** in `ext_key_usage` need at least two arcs, digits only, no leading zeros, a first arc of 0, 1 or 2, and a second arc of at most 39 under 0 or 1. An OID the Go standard library knows by name counts as that name, so listing `server_auth` and `1.3.6.1.5.5.7.3.1` together is a duplicate.
- **`extra_extensions[].value`** is a YAML list of byte values, for example `value: [5, 0]` for a DER NULL. A base64 string is rejected.

| Rule | Error |
|---|---|
| No name, or a repeated name | `config: pki.profiles[<i>].name: required` or `config: pki.profiles[<i>].name: duplicate name "<name>"` |
| Unknown key algorithm | `config: pki.profiles[<i>].key_alg: must be one of ECDSA-P384, RSA-3072, RSA-4096, got "<value>"` |
| `validity_days` is 0 | `config: pki.profiles[<i>].validity_days: must be greater than 0` |
| Unknown key usage | `config: pki.profiles[<i>].key_usage: ca: ParseKeyUsage: unknown key usage "<value>"` |
| Unknown, malformed or repeated extended key usage | `config: pki.profiles[<i>].ext_key_usage: ca: ParseExtKeyUsage: <reason>` |
| Bad extension OID | `config: pki.profiles[<i>].extra_extensions[<j>].oid: invalid OID "<oid>": <reason>` |
| Unknown validity policy | `config: pki.profiles[<i>].validity_policy: must be "cap" or "reject", got "<value>"` |
| `allow_request_sans` on a CA profile | `config: pki.profiles[<i>].allow_request_sans: applies to leaf profiles only, not a CA profile` |
| Bad Kerberos principal or UPN | `config: pki.profiles[<i>].sans.krb5_principal[<j>]: invalid Kerberos principal "<value>": <reason>` or `... sans.upn[<j>]: invalid UPN "<value>": <reason>` |
| A raw SAN extension next to otherName SANs | `config: pki.profiles[<i>].extra_extensions[<j>]: a raw subjectAltName extension cannot be combined with sans.krb5_principal or sans.upn` |

### Validity and the issuer's lifetime

A certificate can't outlive the CA that signed it, so the node caps every certificate at its own notAfter. With `cap`, `cryptosctl` prints a warning such as `WARNING: requested validity ends 2046-09-22; capped to issuer notAfter 2041-09-21` and issues the shorter certificate. With `reject`, the call fails with `FailedPrecondition` before the CA key is loaded. ACME and EST issue the capped certificate without a warning, because those protocols have no channel for one.

:::caution[Profile subjects lose ST and L over the API]
`cryptosctl config apply` and the Fleet Manager carry a profile's `subject.common_name`, `organization` and `country` only. A `province` or `locality` in a profile subject is dropped on apply. The CA's own `root_subject` isn't affected.
:::
