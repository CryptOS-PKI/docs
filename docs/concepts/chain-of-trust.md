---
title: "🔗 The Root CA and the chain of trust"
---

# 🔗 The Root CA and the chain of trust

How one trusted Root vouches for everything below it. This page assumes the basics from [Certificates and CAs 101](./certificates-101.md).

## Trust has to start somewhere

A client checks a certificate by checking its issuer's signature. But then it has to trust the issuer, which means checking *its* certificate, and so on. The climb has to stop at a certificate the client trusts without being told to by anyone else. That is a **trust anchor**, and in practice it is a **Root CA** certificate.

A Root certificate is **self-signed**: its issuer and subject are the same, and it is signed with its own private key. The self-signature proves nothing about who made it. A Root is trusted only because someone deliberately installed it in a **trust store**: the operating system, the browser, a Java keystore, or a Kubernetes secret. Getting a Root into the right trust stores is a manual, careful step, and that is the point.

## From the Root down to a leaf

A Root rarely signs server certificates itself. Instead it signs certificates for other CAs, and they sign the certificates that servers and devices actually use:

```text
Root CA            self-signed, installed in trust stores
  └── Intermediate CA   signed by the Root
        └── Issuing CA  signed by the Intermediate
              └── www.example.org   a leaf, signed by the Issuing CA
```

- **Root CA**: the anchor. Kept offline or close to it, and used rarely.
- **Intermediate CA** (also called a subordinate CA): a CA whose certificate the Root signed. It can sign further CAs.
- **Issuing CA**: a CA that signs only leaves.
- **Leaf** (end-entity) certificate: a certificate for a server, person or device. It cannot sign other certificates.

When the server at `www.example.org` connects, it sends its leaf and, usually, the CA certificates above it, but not the Root. The client already has the Root. It checks each signature up the chain until it reaches that anchor. This is **path validation**, and RFC 5280 defines it exactly.

## The rules that shape a chain

Two extensions on CA certificates decide what a chain may look like:

- **basicConstraints** says whether a certificate is a CA at all (`CA:TRUE`) and, optionally, sets a **pathLenConstraint**: how many more CA levels may sit below it. A CA with a path length of `0` may sign leaves but no further CAs.
- **keyUsage** on a CA includes `keyCertSign` (may sign certificates) and `cRLSign` (may sign revocation lists).

A child certificate also cannot usefully outlive its parent. Once the parent expires, every chain through it fails, whatever the child's own dates say.

## Why the layers are worth it

The layers keep the most valuable key out of daily use:

- The Root's key signs only a handful of CA certificates over its life. It can stay switched off most of the time, which is the idea behind an [air-gapped root](../use-cases/air-gapped-root.md).
- If an Issuing CA's key is compromised, the Root revokes that one CA and signs a new one. Clients keep the same Root, and nothing else has to change.
- Different Issuing CAs can serve different purposes (servers, devices, code signing) with different rules, all under one anchor.

## How CryptOS fits

Each CA in the tree is its own CryptOS node. A node's role is set in its machine config: `root`, `intermediate` or `issuing`. A Root node signs its own certificate during the first-boot ceremony. A subordinate node makes its key and CSR on first boot, and an operator carries that CSR to the parent and the signed chain back. Private keys never move between nodes. [CA roles: Root, Intermediate, Issuing](./ca-roles.md) covers how that works.
