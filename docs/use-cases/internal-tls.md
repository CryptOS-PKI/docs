---
title: "🔐 Internal TLS and mTLS"
---

# 🔐 Internal TLS and mTLS

Your own servers and services need certificates too: the internal web apps, the APIs that call each other, the databases, the message brokers. A public CA can't issue for names that only exist inside your network, and a self-signed certificate per service means every client has to trust every service one by one.

With CryptOS, each service gets a certificate from your own issuing CA. Clients trust **one root**, and everything that chains to it is trusted. The same CA can also issue **client** certificates, so two services can prove who they are to each other (mutual TLS, or mTLS).

:::tip[Works today]
An intermediate or issuing node issues server and client certificates from a CSR, under a profile you define. You send the CSR with `cryptosctl ca issue-leaf` or through the Fleet Manager. The node records every certificate, revokes on request, and serves a CRL and OCSP.
:::

:::info[Planned]
Automatic enrolment and renewal. The node code has an ACME server (`http-01`) and an EST server, but the alpha can't switch either on yet: the wire config has no field for them. Until it does, each certificate is requested by hand and renewed by hand. See the [overview](./overview.md#enrolment-protocols).
:::

## What you set up once

Everything the certificate carries, apart from its subject and public key, comes from a **profile** in the issuing node's machine config. A server profile and a client profile look like this:

```yaml
pki:
  revocation_base_url: http://pki.example.org
  profiles:
    - name: leaf-server
      key_alg: ECDSA-P384
      validity_days: 90
      key_usage: [digital_signature]
      ext_key_usage: [server_auth]
      allow_request_sans: true
    - name: leaf-client
      key_alg: ECDSA-P384
      validity_days: 30
      key_usage: [digital_signature]
      ext_key_usage: [client_auth]
      allow_request_sans: true
```

- `ext_key_usage` is what makes a certificate a server certificate (`server_auth`), a client certificate (`client_auth`), or both.
- `allow_request_sans: true` lets you name the host with `--dns` when you issue. Without it, the certificate carries only the SANs listed in the profile's `sans` field, and SANs in the CSR are always ignored.
- `revocation_base_url` makes every certificate point at the node's CRL (`/crl`), OCSP responder (`/ocsp`) and CA certificate (`/ca.cer`).

Apply the config with `cryptosctl config apply -f machine.yaml`. A change to profiles alone takes effect straight away, with no reboot. Setting or changing `revocation_base_url` needs a reboot, and the apply says so with `requires_reboot=true`. The [certificate profiles](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/certificate-profiles.md) guide lists every field.

:::caution[Revocation URL must be reachable before you issue]
When `revocation_base_url` is set, the node checks that the URL resolves and that its own `/crl`, `/ocsp` and `/ca.cer` answer there. While that check fails, every issuance fails with `revocation preflight failing for configured revocation_base_url; issuance blocked`. Fix DNS or the network first. `allow_unverified_revocation_url` overrides the check, but every certificate issued while it is set carries the unchecked pointer for life.
:::

## Issuing a server certificate

`cryptosctl` runs on Linux and macOS today. A Windows build is coming ([cryptos#275](https://github.com/CryptOS-PKI/cryptos/issues/275)). `openssl` works the same on every system.

:::caution[Use a P-384 or RSA 3072+ key]
The node refuses a CSR for any other key. Many tools default to RSA 2048 or ECDSA P-256, and the node answers those with `subject RSA key must be at least 3072 bits` or `subject ECDSA key must be on P-384`.
:::

1. On the server, make a key and a CSR. The key stays on the server.

   ```bash
   openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-384 -nodes \
     -keyout web01.key -subj "/CN=web01.example.org" -out web01.csr
   ```

2. From your workstation, have the issuing node sign it under the server profile, naming the host:

   ```bash
   cryptosctl --endpoint pki-issuing.example.org:443 ca issue-leaf \
     --csr web01.csr --profile leaf-server --dns web01.example.org > web01.pem
   ```

   :::tip[Expected output]
   Nothing on screen: the certificate goes into `web01.pem` as PEM. If the requested validity runs past the issuing CA's own expiry, the node shortens it and `cryptosctl` prints a line on stderr such as `WARNING: requested validity ends 2046-09-22; capped to issuer notAfter 2041-09-21`. The certificate is still issued.
   :::

3. Check what you got:

   ```bash
   openssl x509 -in web01.pem -noout -text
   ```

   :::tip[Expected output]
   Among the extensions, look for the name you asked for and the server usage:

   ```text
   X509v3 Subject Alternative Name:
       DNS:web01.example.org
   X509v3 Extended Key Usage:
       TLS Web Server Authentication
   ```

   With `revocation_base_url` set you also see `X509v3 CRL Distribution Points` and `Authority Information Access` pointing at your base URL. If the SAN is missing, the profile does not set `allow_request_sans` or the `--dns` flag was left off.
   :::

4. Install `web01.pem` and `web01.key` on the server, along with the issuing CA's certificate as the chain. The CA certificate is served at `<revocation_base_url>/ca.cer`, and `cryptosctl ca get-issued --serial <hex>` prints the certificate with its whole chain up to the root.

## Issuing a client certificate for mTLS

A client certificate is issued the same way, under the client profile. Name the identity the server will check:

```bash
cryptosctl --endpoint pki-issuing.example.org:443 ca issue-leaf \
  --csr billing-api.csr --profile leaf-client --dns billing-api.example.org > billing-api.pem
```

On the server side, trust the CryptOS root (or the issuing CA) for client certificates and require one. Every TLS stack names this differently, but the idea is the same: the server accepts only clients whose certificate chains to your CA.

## Keeping track, and revoking

The node keeps every certificate it issues:

- `cryptosctl ca list-issued` lists them.
- `cryptosctl ca get-issued --serial <hex>` prints one with its chain and its status: `valid`, `revoked` or `expired`.
- `cryptosctl ca revoke --serial <hex> --reason <code>` revokes one. The reason is an RFC 5280 code, and `0` means unspecified.

:::warning[Revocation can't be undone]
A revoked certificate stays on the CRL, and OCSP answers "revoked" for it from then on. There is no way to un-revoke it. Issue a replacement before you revoke a certificate that a service is still using.
:::

See [issued certificates](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/issued-certificates.md) for the full commands and output.

## Renewing

The alpha has no automatic renewal. Before a certificate expires, make a fresh CSR and issue again. With 90-day certificates that is a calendar job, which is exactly what ACME and EST will take off your hands once they can be switched on.

## Related

- [Chain of trust](../concepts/chain-of-trust.md) explains why clients need only the root.
- [Active Directory domain controllers](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/active-directory.md) covers LDAPS and KDC certificates, including `certreq` on Server Core.
- [Kubernetes workloads](./kubernetes.md) covers certificates for pods and ingress.
