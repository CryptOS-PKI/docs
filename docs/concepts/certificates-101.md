---
title: "📜 Certificates and CAs 101"
---

# 📜 Certificates and CAs 101

The absolute basics: what a certificate is, and what a certificate authority does. If you already run a PKI, skip ahead to [The Root CA and the chain of trust](./chain-of-trust.md).

## Keys come in pairs

Everything starts with a **key pair**: a private key and a public key that are made together.

- The **private key** is secret. Whoever holds it can make a **signature**, a small block of data that only that key could have produced.
- The **public key** is shared freely. Anyone can use it to check a signature, but nobody can use it to make one.

So a signature proves "this came from whoever holds the private key". What it does not prove is *who* that is. A public key on its own is just a long number.

## A certificate ties a name to a key

A **certificate** is a small signed document that says, in effect: "this public key belongs to `www.example.org`, from this date until that date". It carries:

- a **subject**: the name it is about (a server, a person, a device, or another CA);
- the subject's **public key**;
- a **validity period**, from `notBefore` to `notAfter`;
- **extensions** that limit how the key may be used, for example "may authenticate a TLS server" or "may sign other certificates";
- the name of the **issuer**, and the issuer's **signature** over all of the above.

The format is X.509, defined for the internet in RFC 5280. It is the same format every browser, operating system and TLS library understands.

You can look inside any certificate with openssl:

```bash
openssl x509 -in cert.pem -noout -text
```

:::tip[Expected output]
A readable dump of the certificate. The lines that matter most are `Issuer:`, `Subject:`, the `Validity` dates, `Public-Key:` with its size, and the `X509v3 extensions` block.
:::

## A certificate authority signs certificates

A **certificate authority (CA)** is whoever does the signing. Before it signs, it decides whether the request deserves a certificate: is this really `www.example.org`, and is it allowed to have this kind of certificate?

The request usually arrives as a **certificate signing request (CSR)**. The requester makes its own key pair, puts its public key and the name it wants into a CSR, and signs the CSR with its private key. That signature proves the requester holds the matching private key. The CA checks the CSR, builds a certificate from it and signs that certificate with **the CA's own private key**.

Notice what never moves: the requester's private key stays with the requester, and the CA's private key stays with the CA. Only the CSR and the finished certificate travel.

## Checking a certificate

When a client connects to `www.example.org`, the server hands over its certificate. The client then checks that:

1. the signature on it is valid, using the issuer's public key;
2. the name matches the host it meant to reach;
3. today falls between `notBefore` and `notAfter`;
4. the extensions allow this use;
5. the certificate has not been **revoked**;
6. the issuer is someone it trusts, which is where the [chain of trust](./chain-of-trust.md) comes in.

If any check fails, the connection is refused.

## Revocation

Sometimes a certificate has to stop being trusted before it expires, for example because its private key leaked. The CA then **revokes** it and publishes that fact in two standard ways:

- a **CRL** (certificate revocation list), a signed list of revoked serial numbers that clients download;
- an **OCSP** responder, which answers "is serial X still good?" one certificate at a time.

A certificate carries pointers to both, so clients know where to look.

## Why the CA's private key matters so much

Anyone who holds the CA's private key can sign a certificate for any name, and every client that trusts the CA will believe it. That one key is the whole value of a CA. Protecting it is the main job CryptOS is built for. The next pages explain how:

- [The Root CA and the chain of trust](./chain-of-trust.md): how one key vouches for many.
- [The TPM and sealed keys](./tpm-sealed-keys.md): where CryptOS keeps that key.
- [Immutable, and why there is no login](./immutable-no-login.md): why there is no way in to take it.
