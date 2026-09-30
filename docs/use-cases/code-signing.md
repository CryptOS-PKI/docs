---
title: "✍️ Code signing"
---

# ✍️ Code signing

Signing your own software proves two things to whoever runs it: who built it, and that nobody changed it since. That covers internal tools, scripts, drivers, container images and installers. With a code-signing certificate from your own CA, every machine that trusts your root can check those signatures, and you don't need to buy a certificate from a public CA for software that never leaves the company.

CryptOS keeps to one rule here: **it never sees your software.** It doesn't take files or hashes to sign. It issues a certificate with the Code Signing usage, the private key stays with your build machine or developer, and your usual signing tool (`signtool`, `codesign`, `cosign`, `jarsigner` and so on) does the signing. The CA only vouches for who holds the key.

:::tip[Works today]
An intermediate or issuing node issues a code-signing certificate from a CSR, under a profile whose extended key usage is Code Signing (`1.3.6.1.5.5.7.3.3`). You send the CSR with `cryptosctl ca issue-leaf` or through the Fleet Manager, and revoke with `cryptosctl ca revoke` if the key leaks.
:::

## What you set up once

Add a code-signing profile to the issuing node's machine config. The profile decides everything about the certificate except its subject and public key:

```yaml
pki:
  revocation_base_url: http://pki.example.org
  profiles:
    - name: code-signing
      key_alg: ECDSA-P384
      validity_days: 365
      key_usage: [digital_signature]
      ext_key_usage: ["1.3.6.1.5.5.7.3.3"]
```

`ext_key_usage` takes `server_auth`, `client_auth`, or a dotted OID. `1.3.6.1.5.5.7.3.3` is the standard Code Signing usage. The same field accepts the Microsoft-specific signing OIDs if your platform asks for them. Apply the config with `cryptosctl config apply -f machine.yaml`. A change to profiles alone takes effect without a reboot.

Give code signing its own profile, separate from any TLS profile. Then a code-signing certificate can never double as a server certificate, and you can see at a glance which certificates are signing certificates.

## Issuing a signing certificate

`cryptosctl` runs on Linux and macOS. `openssl` works the same on every system.

:::danger[The signing key is the whole point]
Anyone with the private key can sign software that every machine trusting your root will accept. Make the key on the machine that will sign, and never send it anywhere, including to the CA. Keep it in a hardware token or the build system's secret store where you can, not in a file in a repository.
:::

:::caution[Use a P-384 or RSA 3072+ key]
The node refuses a CSR for any other key, with `subject RSA key must be at least 3072 bits` or `subject ECDSA key must be on P-384`. Check that your signing tool and the platform that verifies the signature both accept the key type before you choose it.
:::

1. On the signing machine, make the key and the CSR. The subject is what people will see as the publisher.

   ```bash
   openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-384 -nodes \
     -keyout signer.key -subj "/O=Example Org/CN=Example Build Signing" -out signer.csr
   ```

2. From your workstation, have the issuing node sign it under the code-signing profile:

   ```bash
   cryptosctl --endpoint pki-issuing.example.org:443 ca issue-leaf \
     --csr signer.csr --profile code-signing > signer.pem
   ```

   :::tip[Expected output]
   Nothing on screen: the certificate goes into `signer.pem` as PEM. A `WARNING: requested validity ends ...; capped to issuer notAfter ...` line on stderr means the issuing CA expires first, and the certificate ends on the CA's expiry date instead.
   :::

3. Check that the certificate carries the Code Signing usage:

   ```bash
   openssl x509 -in signer.pem -noout -text
   ```

   :::tip[Expected output]
   Among the extensions you should see:

   ```text
   X509v3 Key Usage: critical
       Digital Signature
   X509v3 Extended Key Usage:
       Code Signing
   ```

   If `Code Signing` is missing, the certificate was issued under the wrong profile. Revoke it and issue again under `code-signing`.
   :::

4. Hand `signer.pem`, plus the chain up to your root, to the signing tool along with the key. `cryptosctl ca get-issued --serial <hex>` prints the certificate with its whole chain. Most tools want the key and chain bundled together, for example as a PKCS#12 file for `signtool`.

## Timestamps

A signature is only as good as the certificate behind it, and the certificate expires. A signing tool that adds an RFC 3161 **timestamp** records that the signature was made while the certificate was still valid, so the signature keeps validating afterwards.

CryptOS does not serve timestamps. Either point your signing tool at another RFC 3161 timestamp service, or plan for signatures to stop validating on platforms that check expiry once the certificate runs out.

## If a signing key leaks

Revoke the certificate right away:

```bash
cryptosctl --endpoint pki-issuing.example.org:443 ca revoke --serial <hex> --reason 1
```

Reason `1` is keyCompromise. From then on the node's CRL lists the certificate and OCSP answers "revoked" for it. Anything signed with that key fails revocation checks on machines that check.

:::warning[Revoking breaks every signature made with the key]
Software that was signed properly before the leak can fail the check too. Whether it does depends on the platform that verifies it and on whether the signature carries a timestamp. Re-sign what you still ship with a new certificate.
:::

## Related

- [Internal TLS and mTLS](./internal-tls.md) uses the same issue-by-CSR flow.
- [Certificates and CAs 101](../concepts/certificates-101.md) explains key usage and extended key usage.
- [Certificate profiles](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/certificate-profiles.md) lists every profile field.
