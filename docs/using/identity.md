---
title: "📇 Show and validate identity"
---

# 📇 Show and validate identity

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Print the CA certificate and confirm the chain is valid.

A node's **identity** is its CA certificate and the chain above it. A Root's chain is one certificate, signed by itself. An intermediate or issuing CA's chain runs from its own certificate up to the Root. `cryptosctl identity show` prints it, and `cryptosctl identity validate` checks it. Both only read.

`cryptosctl` runs on Linux and macOS.

:::info[Before you start]
- `cryptosctl` set up to reach the node: [Setup](./setup.md).
- A node whose `status` reads `Identity: ESTABLISHED`: a Root after [its ceremony](./ceremony-start.md), or a subordinate whose signed chain has been submitted.
:::

## 1. Show the certificate

```bash
cryptosctl --endpoint 192.0.2.10:443 identity show
```

:::tip[Expected output]
The node's own CA certificate, the first one in its chain.

```text
Subject:      CN=Example Root CA G1,O=Example Org,C=US
Issuer:       CN=Example Root CA G1,O=Example Org,C=US
Serial:       <serial in hex>
NotBefore:    <start of validity, UTC>
NotAfter:     <end of validity, UTC>
IsCA:         true
SHA-256:      <fingerprint of the certificate>
Chain length: 1
```
:::

How to read it:

- **Subject and Issuer** are the same on a Root, because it signs itself. On a subordinate the issuer is the parent CA.
- **IsCA** is `true` on every CryptOS node certificate.
- **SHA-256** is the fingerprint of the certificate, in lower-case hex. On a Root it matches the `cert_sha256` the ceremony printed.
- **Chain length** is `1` for a Root and grows by one for each CA above a subordinate.

If the node has no identity yet, the command fails with:

```text
cryptosctl: node has no identity yet (run 'cryptosctl ceremony start')
```

On a Root that means the ceremony has not run. On an intermediate or issuing node it means the node is still waiting for its signed chain; `status` shows `Identity: AWAITING_CERT`.

## 2. Validate the chain

```bash
cryptosctl --endpoint 192.0.2.10:443 identity validate
```

:::tip[Expected output]
The chain the node returned is complete and every signature in it checks out.

```text
OK: certificate chain validates
```

Anything else ends with `chain does not validate:` and the reason. Stop and don't hand the certificate to anyone until you know why.
:::

:::info[What validate proves]
`identity validate` checks the chain against the **last certificate in that same chain**. It proves the chain is consistent, not that it ends at *your* Root. To tie it to your Root, check it against a copy of the Root you already trust, as in step 4.
:::

## 3. Save the certificate as PEM

`-o pem` prints the whole chain as PEM, leaf first, ready to save:

```bash
cryptosctl --endpoint 192.0.2.10:443 -o pem identity show > node-chain.pem
```

On a Root this file is the Root certificate. That is the file the systems that should trust your CA need. Some of them, such as Windows, often want the DER form in a `.cer` file:

```bash
openssl x509 -in node-chain.pem -outform DER -out root-ca.cer
```

:::caution[Check the fingerprint before you publish a Root]
Every system that trusts this file trusts everything the Root signs. Before you hand it out, confirm it is the certificate the ceremony made: the fingerprint below must match the `cert_sha256` from the ceremony and the `SHA-256` from step 1.
:::

```bash
openssl x509 -in node-chain.pem -noout -subject -issuer -enddate -fingerprint -sha256
```

:::tip[Expected output]
The same subject, issuer and end date as step 1. openssl prints the fingerprint in upper case with colons, so compare the hex digits, not the formatting.

```text
subject=<the Root's name>
issuer=<the same name>
notAfter=<end of validity>
sha256 Fingerprint=<the same fingerprint, as AB:CD:...>
```

The exact layout differs between openssl versions: some print the name as `/C=US/O=Example Org/CN=...`, others as `C=US, O=Example Org, CN=...`, and the fingerprint label may read `SHA256` or `sha256`.
:::

## 4. Check a subordinate against your Root

For an intermediate or issuing node, check its chain against the Root file you saved from the Root in step 3, not against the copy inside the chain:

```bash
cryptosctl --endpoint 192.0.2.20:443 -o pem identity show > sub-chain.pem
openssl verify -CAfile root-ca.pem -untrusted sub-chain.pem sub-chain.pem
```

Here `root-ca.pem` is the Root's `node-chain.pem` from step 3, and `192.0.2.20` stands for the subordinate's address.

:::tip[Expected output]
The subordinate's certificate chains up to your Root.

```text
sub-chain.pem: OK
```

Any error means the chain does not end at the Root you trust. Stop and find out which parent signed it.
:::

## Next step

Change what the node does with [Apply config](./config-apply.md), or watch its health with [Check status](./status.md).
