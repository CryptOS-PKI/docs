---
title: "🎯 What you can do with CryptOS"
---

# 🎯 What you can do with CryptOS

CryptOS is a certificate authority, so every use case comes down to the same thing: a machine, a person or a build job needs a certificate, and something has to hand it over. What changes from one use case to the next is **how** the request reaches the CA. Some requests are carried by hand, and some arrive over a standard enrolment protocol that a client already speaks.

These pages are honest about where the alpha stands. Each one splits into what works today and what is planned.

## How a certificate gets out of CryptOS today

:::tip[Works today]
A node in the **intermediate** or **issuing** role issues end-entity certificates. You pick a named **certificate profile** from the machine config, hand the node a CSR, and get the certificate back. There are two ways to do that:

- `cryptosctl ca issue-leaf --csr <file> --profile <name>` from your workstation, over mTLS.
- The **Fleet Manager** web UI, which issues a leaf from a CSR on a node it manages.

Every certificate a node issues is recorded. `cryptosctl ca list-issued` lists them, `ca revoke` revokes one, and when `pki.revocation_base_url` is set the node serves its CRL at `/crl`, OCSP at `/ocsp` and its own CA certificate at `/ca.cer`.
:::

The profile decides everything about the certificate except the subject and the public key, which come from the CSR. SANs and EKUs asked for in the CSR are ignored. That is deliberate: a request can never widen what the CA hands out. See [certificate profiles](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/certificate-profiles.md) for every field.

A **Root** node refuses to issue leaf certificates unless its config sets `root_leaf_issuance: acknowledged-irreversible`. A Root normally signs only subordinate CAs, and that is how the use cases here are written. See [CA roles](../concepts/ca-roles.md).

## Enrolment protocols

Carrying CSRs by hand works, but it does not scale to hundreds of servers or a rack of switches. The enrolment protocols let clients ask for, and renew, certificates on their own. Here is where each one stands in the alpha.

| Protocol | What speaks it | State in the alpha |
|---|---|---|
| gRPC `IssueLeaf` | `cryptosctl`, the Fleet Manager | Works today |
| CRL and OCSP | Every TLS client that checks revocation | Works today |
| ACME (RFC 8555) | certbot, lego, acme.sh, win-acme, Posh-ACME, cert-manager | Server built, `http-01` only, can't be switched on yet (see below) |
| EST (RFC 7030) | Network gear, appliances, anything that renews with the certificate it holds | Server built, can't be switched on yet (see below) |
| SCEP (RFC 8894) | Cisco IOS and IOS-XE trustpoints, most routers, switches, firewalls and MDM | Planned |
| WSTEP / MS-XCEP | Windows autoenrolment through Group Policy | Planned |
| RFC 3161 timestamps | Code-signing tools | Planned |

:::caution[ACME and EST are built but not reachable yet]
The node code has full ACME and EST servers. They start only when the node's machine config has a `pki.acme` or `pki.est` block. The config that crosses the wire (the `MachineConfig` message used by `cryptosctl config apply`, the maintenance-mode install and the Fleet Manager) has no field for either block yet. An apply keeps a block that is already on the node, but it can't add one. So in this alpha there is no supported way to switch ACME or EST on. Plan on `cryptosctl ca issue-leaf` or the Fleet Manager until that lands.
:::

The Fleet Manager lists each enrolment protocol adapter with an **Enabled** switch. As the page itself says, enabling records intent: it does not start the protocol on a node.

:::info[Planned]
- **SCEP**, so network devices can enrol a trustpoint without a CSR ferry. Tracked in [cryptos#185](https://github.com/CryptOS-PKI/cryptos/issues/185).
- **ACME `dns-01`** and wildcard names, which cert-manager usually needs for internal names. Tracked in [cryptos#110](https://github.com/CryptOS-PKI/cryptos/issues/110).
- **Windows autoenrolment** over MS-XCEP and WSTEP. Tracked in [cryptos#108](https://github.com/CryptOS-PKI/cryptos/issues/108).
- **Machine and user certificates** for VPN, 802.1X and MDM. Tracked in [cryptos#112](https://github.com/CryptOS-PKI/cryptos/issues/112).
- **CryptOS as the external CA for a Kubernetes cluster's own PKI.** Tracked in [cryptos#113](https://github.com/CryptOS-PKI/cryptos/issues/113).
- **An RFC 3161 timestamp service** for code signing.
:::

## One rule for every key

A node certifies only two kinds of subject key: **ECDSA P-384**, and **RSA of 3072 bits or more**. It refuses a CSR for anything else with `subject ECDSA key must be on P-384` or `subject RSA key must be at least 3072 bits`. Many tools default to RSA 2048 or ECDSA P-256, so check the key before you send the request. Each use case page says where this bites.

## The use cases

| Page | The job | Where it stands |
|---|---|---|
| [Internal TLS and mTLS](./internal-tls.md) | Certificates for your own servers and services | Works today, by CSR |
| [Kubernetes workloads](./kubernetes.md) | Certificates for pods, ingress and controllers | Mostly planned |
| [Devices and IoT](./devices-iot.md) | Routers, switches and small devices | By CSR today; EST and SCEP to come |
| [Code signing](./code-signing.md) | Certificates your build tools sign with | By CSR today; timestamps to come |
| [Air-gapped Root CA](./air-gapped-root.md) | An offline Root over one or more subordinates | Two-tier works; Root Mode to come |

Two integrations have their own step-by-step guides in the `cryptos` repo, and both have been run against real systems:

- [vCenter VMCA as a CryptOS subordinate](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/vmca-subordination.md), so every ESXi host chains to your root.
- [Active Directory domain controllers](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/active-directory.md), with LDAPS and KDC certificates and no AD CS.

## Where to go next

- New to certificates? Start with [Certificates and CAs 101](../concepts/certificates-101.md).
- Want a node to try this on? Head to [Try It Locally](../try-it-locally/requirements.md).
- Looking for a command? See the [cryptosctl reference](../reference/cryptosctl.md).
