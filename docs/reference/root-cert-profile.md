---
title: "📋 RFC 5280 Root certificate profile"
---

# 📋 RFC 5280 Root certificate profile

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Exactly what fields the Root certificate carries, and why.

A Root node makes its certificate once, in the [first-boot ceremony](../deep-dives/ceremony-walkthrough.md): it creates the key, then signs a certificate for that key with the key itself. Every field below is set by the node's code, and only a few come from the [machine config](./machine-config-pki.md). The goal is a certificate that follows RFC 5280 to the letter and carries nothing a Root doesn't need.

## 🧾 Fields

| Field | Value | From |
|---|---|---|
| Version | v3 | Fixed |
| Serial number | 20 random bytes, positive, so the DER encoding is at most 20 octets (RFC 5280 §4.1.2.2) | Random for each ceremony |
| Signature algorithm | `ecdsa-with-SHA384` for an `ECDSA-P384` key, `sha384WithRSAEncryption` for `RSA-3072` or `RSA-4096`. The same value appears in `tbsCertificate.signature`. | `pki.root_key_alg` |
| Issuer | The same name as the subject, because the Root signs itself | `pki.root_subject` |
| Subject | CN, plus O, C, ST and L when set. Empty fields are left out. | `pki.root_subject` |
| Not before | The ceremony's start time, minus 5 minutes, in UTC, to the second | Ceremony clock |
| Not after | The ceremony's start time plus `root_validity_years` | `pki.root_validity_years` |
| Public key | ECDSA on P-384, or RSA at 3072 or 4096 bits with exponent 65537 | `pki.root_key_alg` |

The 5-minute backdate is there so a relying party whose clock runs slightly behind the CA's doesn't see the certificate as "not yet valid". It applies to every certificate CryptOS signs, not only the Root.

## 🧩 Extensions

The Root carries exactly four extensions:

| Extension | Critical | Value | Why |
|---|---|---|---|
| Key Usage | yes | `keyCertSign`, `cRLSign`, and nothing else | A Root signs certificates and CRLs, nothing more. |
| Basic Constraints | yes | `cA=TRUE`, no `pathLenConstraint` | RFC 5280 §4.2.1.9 leaves a Root unconstrained. Depth is limited on the subordinates instead, through the signing profile's `basic_constraints.path_len`. |
| Subject Key Identifier | no | SHA-1 of the subject public key BIT STRING (RFC 5280 §4.2.1.2, method 1) | Lets a verifier match certificates to this key. The node computes it itself, so the value doesn't change between Go releases. |
| Authority Key Identifier | no | `keyIdentifier` equal to the Subject Key Identifier | A self-signed certificate is its own authority. |

It deliberately leaves these out:

- **Extended Key Usage.** A Root shouldn't restrict purposes; CA/Browser Forum guidance is that Roots carry no EKU.
- **Subject Alternative Name.** A Root has no DNS or network identity.
- **CRL Distribution Points and Authority Information Access.** Nothing revokes a Root, and there is nothing above it to fetch. `pki.revocation_base_url` puts these pointers on the certificates the Root issues, not on the Root itself.

Subject name attributes are encoded as PrintableString when every character allows it, and as UTF8String otherwise.

:::info[The key must clear the same bar as every other key]
Before signing, the node checks its own new key against the rule it applies to every key it certifies: ECDSA on P-384, or RSA of at least 3072 bits. A key that fails stops the ceremony, rather than signing a Root that a parent would later refuse.
:::

## 🔍 Check a Root yourself

Fetch the certificate with `cryptosctl` and read it with openssl. `cryptosctl` runs on Linux and macOS today; a Windows build is coming. For the connection flags (`--identity`, `--identity-key`, `--trust`), see the [cryptosctl reference](./cryptosctl.md).

```bash
cryptosctl --endpoint 192.0.2.10:443 identity show -o pem > root.pem
cryptosctl --endpoint 192.0.2.10:443 identity validate
```

:::tip[Expected output]
`identity validate` confirms the Root is a self-signed CA that verifies against itself:

```text
OK: certificate chain validates
```

If it prints `chain does not validate: ...` instead, don't distribute the certificate. Check that you're talking to the right node.
:::

Then read the fields:

```bash
openssl x509 -in root.pem -noout -text
```

:::tip[Expected output]
For an `ECDSA-P384` Root with the subject from the [example config](./machine-config.md#-a-complete-example), the fields look like this (the serial, dates and key IDs differ on every Root, and the long hex blocks are cut here):

```text
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number:
            (20 bytes)
    Signature Algorithm: ecdsa-with-SHA384
        Issuer: C=US, O=Example Org, CN=Example Root CA
        Validity
            Not Before: Sep 30 11:55:00 2026 GMT
            Not After : Sep 30 12:00:00 2046 GMT
        Subject: C=US, O=Example Org, CN=Example Root CA
        Subject Public Key Info:
            Public Key Algorithm: id-ecPublicKey
                Public-Key: (384 bit)
                ASN1 OID: secp384r1
                NIST CURVE: P-384
        X509v3 extensions:
            X509v3 Key Usage: critical
                Certificate Sign, CRL Sign
            X509v3 Basic Constraints: critical
                CA:TRUE
            X509v3 Subject Key Identifier:
                (20 bytes)
            X509v3 Authority Key Identifier:
                keyid:(the same 20 bytes)
    Signature Algorithm: ecdsa-with-SHA384
```

This is LibreSSL's layout, as on macOS. OpenSSL 3 prints the names with spaces (`C = US, O = Example Org, CN = Example Root CA`) and the key ID without the `keyid:` prefix. An RSA Root shows `Signature Algorithm: sha384WithRSAEncryption` and `Public-Key: (3072 bit)` or `(4096 bit)` instead. Stop if you see `pathlen`, an Extended Key Usage, or a Subject Alternative Name: that certificate wasn't made by the Root ceremony.
:::

The certificate's SHA-256 is what `cryptosctl ceremony start` printed as `cert_sha256` on its `CERT_SIGNED` line. To compare, print the fingerprint:

```bash
openssl x509 -in root.pem -noout -fingerprint -sha256
```

:::tip[Expected output]
One line starting `SHA256 Fingerprint=`, then 32 bytes as colon-separated hex. Remove the colons and compare it, ignoring case, with the `cert_sha256` value from the ceremony. If they differ, stop: the certificate isn't the one the ceremony made.
:::

## ⏳ Lifetime and renewal

The Root lasts `root_validity_years` (1 to 30) from the ceremony. A certificate a Root signs can't outlive the Root: the node caps it at the Root's notAfter.

:::info[Planned]
Renewing or re-keying a Root in place, with a cross-signed rollover, is not in the alpha. Pick `root_validity_years` for the whole life of the hierarchy.
:::
