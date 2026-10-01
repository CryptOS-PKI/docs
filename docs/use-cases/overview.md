---
title: "🎯 What you can do with CryptOS"
---

# 🎯 What you can do with CryptOS

CryptOS is a certificate authority, so every use case comes down to the same thing: a machine, a person or a build job needs a certificate, and something has to hand it over. What changes from one use case to the next is **how** the request reaches the CA. Some requests are carried by hand, and some arrive over a standard enrolment protocol that a client already speaks.

These pages are honest about where the alpha stands. Each one says what works today and what doesn't.

## How a certificate gets out of CryptOS today

:::tip[Works today]
A node in the **intermediate** or **issuing** role issues end-entity certificates. You pick a named **certificate profile** from the machine config, hand the node a CSR, and get the certificate back. There are two ways to do that:

- `cryptosctl ca issue-leaf --csr <file> --profile <name>` from your workstation, over mTLS.
- The **Fleet Manager** web UI, which issues a leaf from a CSR on a node it manages.

Every certificate a node issues is recorded. `cryptosctl ca list-issued` lists them, `ca revoke` revokes one, and when `pki.revocation_base_url` is set the node serves its CRL at `/crl`, OCSP at `/ocsp` and its own CA certificate at `/ca.cer`.
:::

The profile decides everything about the certificate except the subject and the public key, which come from the CSR. SANs and EKUs asked for in the CSR are ignored. That is deliberate: a request can never widen what the CA hands out. See [certificate profiles](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/certificate-profiles.md) for every field.

A **Root** node refuses to issue leaf certificates unless its config sets `root_leaf_issuance: acknowledged-irreversible`. A Root normally signs only subordinate CAs, and that is how the use cases here are written. See [CA roles](../concepts/ca-roles.md).

## Enrolment protocols

Carrying CSRs by hand works, but it does not scale to hundreds of servers or a rack of switches. The enrolment protocols let clients ask for, and renew, certificates on their own. Here is what works in the alpha.

| Protocol | What speaks it | State in the alpha |
|---|---|---|
| gRPC `IssueLeaf` | `cryptosctl`, the Fleet Manager | Works today |
| CRL and OCSP | Every TLS client that checks revocation | Works today |
| ACME (RFC 8555, `http-01`) | certbot, lego, acme.sh, win-acme, cert-manager | Off until you switch it on in the machine config |
| EST (RFC 7030) | Network gear and devices with an EST client | Off until you switch it on in the machine config |

ACME and EST run on an intermediate or issuing node. You switch each one on by adding its `pki.acme` or `pki.est` block to the node's machine config and running `cryptosctl config apply`, and off by removing the block and applying again. See the [machine config reference](../reference/machine-config.md) and the [ACME](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/acme.md) and [EST](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/est.md) guides.

:::warning[Switching ACME or EST needs a reboot]
The listeners start only at boot. `config apply` stores the switch, on or off, and prints `requires_reboot=true`; the protocol starts or stops at the next reboot, and the node stops issuing while it restarts. Plan the reboot for a maintenance window. Until then `cryptosctl status` shows the protocol with `reboot pending`.
:::

:::caution[A Root never serves ACME or EST]
A config that sets `pki.acme` or `pki.est` on a Root is refused, and nothing is stored. Serve them from an issuing node under the Root.
:::

The Fleet Manager lists each enrolment protocol adapter with an **Enabled** switch. As the page itself says, enabling records intent: it does not start the protocol on a node.

The node does not serve SCEP, ACME `dns-01` or RFC 3161 timestamps.

## One rule for every key

A node certifies only two kinds of subject key: **ECDSA P-384**, and **RSA of 3072 bits or more**. It refuses a CSR for anything else with `subject ECDSA key must be on P-384` or `subject RSA key must be at least 3072 bits`. Many tools default to RSA 2048 or ECDSA P-256, so check the key before you send the request. Each use case page says where this bites.

## The use cases

| Page | The job | Where it stands |
|---|---|---|
| [Internal TLS and mTLS](./internal-tls.md) | Certificates for your own servers and services | Works today, by CSR |
| [Kubernetes workloads](./kubernetes.md) | Certificates for pods, ingress and controllers | By CSR today |
| [Devices and IoT](./devices-iot.md) | Routers, switches and small devices | By CSR today |
| [Code signing](./code-signing.md) | Certificates your build tools sign with | By CSR today |
| [Air-gapped Root CA](./air-gapped-root.md) | An offline Root over one or more subordinates | Two-tier works |

Two integrations have their own step-by-step guides in the `cryptos-node` repo, and both have been run against real systems:

- [vCenter VMCA as a CryptOS subordinate](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/vmca-subordination.md), so every ESXi host chains to your root.
- [Active Directory domain controllers](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/active-directory.md), with LDAPS and KDC certificates and no AD CS.

## Where to go next

- New to certificates? Start with [Certificates and CAs 101](../concepts/certificates-101.md).
- Want a node to try this on? Head to [Try It Locally](../try-it-locally/requirements.md).
- Looking for a command? See the [cryptosctl reference](../reference/cryptosctl.md).
