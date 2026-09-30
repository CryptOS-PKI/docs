---
title: "📡 Devices and IoT"
---

# 📡 Devices and IoT

Routers, switches, firewalls, VPN concentrators, printers and small embedded devices all need certificates: for their management web page, for 802.1X and RADIUS, for VPN tunnels, and for talking to a controller. Most of them can't run certbot. They speak the enrolment protocols built for network gear instead: **SCEP**, which almost every network platform supports, and **EST**, its newer replacement.

The goal is a device that enrols once and then renews itself for years, with no one carrying CSRs around.

:::tip[Works today]
Any device that can produce a CSR, or accept a certificate and key you load onto it, can get a certificate from an intermediate or issuing node. You issue it with `cryptosctl ca issue-leaf` or the Fleet Manager, the same way as for a server. See [Internal TLS and mTLS](./internal-tls.md) for the steps. Renewal is manual.
:::

:::caution[Devices can't enrol on their own today]
- **No SCEP.** The node does not serve SCEP (RFC 8894), so a Cisco IOS or IOS-XE trustpoint, and most other network platforms, can't enrol or renew on their own.
- **EST can't be switched on.** The node code has a full RFC 7030 EST server, but the alpha can't switch it on: the wire config that `cryptosctl config apply` and the Fleet Manager send has no field for the `pki.est` block. See the [overview](./overview.md#enrolment-protocols).
:::

## Check the device's key first

:::caution[Many devices can't make a key CryptOS will sign]
A CryptOS node certifies only **ECDSA P-384** keys and **RSA keys of 3072 bits or more**. Plenty of devices generate RSA 2048 or ECDSA P-256 by default, and some can do nothing else. The node refuses those CSRs with `subject RSA key must be at least 3072 bits` or `subject ECDSA key must be on P-384`. Before you plan a rollout, check that the device can generate RSA 3072, RSA 4096 or P-384.
:::

## What the EST server does

The EST server is written and tested in the `cryptos` code. It can't be switched on in the alpha, but how it behaves is fixed in the code:

| Operation | Authenticated by | Names it may ask for |
|---|---|---|
| `/cacerts` | Nobody: the CA chain is public | (none) |
| `/simpleenroll` | An HTTP Basic credential you provision | Anything in `allowed_identifier_suffixes` |
| `/simplereenroll` | The device's current certificate, over TLS | Exactly the names already on that certificate |
| `/csrattrs` | Nobody | Returns 204: no extra attributes are asked for |

- **Renewal can't be turned into escalation.** A device renewing with `simplereenroll` gets the same names back, or a 403. An expired or revoked certificate can't renew.
- **First enrolment can be closed.** Leaving `enroll_credentials` empty keeps `simpleenroll` shut, so devices can only renew certificates you issued some other way.
- **The listener does its own TLS**, on `http_port` (8443 by default), with a server certificate the node issues to itself for the names in `hostnames`. A device that trusts your CA trusts the listener. TLS 1.2 is allowed, because many embedded clients stop there.
- **The profile needs `client_auth`** in `ext_key_usage` for certificates that will renew themselves later. `simplereenroll` checks the certificate for client authentication.
- **Limits:** wildcards are refused, non-DNS names are refused, there is no server-side key generation, and there is no manual-approval (202 Retry-After) flow.

The [EST guide](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/est.md) in the `cryptos` repo has the full config block, credential provisioning and `curl` examples.

:::danger[An EST enrolment credential can mint a certificate for any allowed name]
Nothing in `simpleenroll` proves that the device owns the name it asks for. Whoever holds the credential can get a certificate for any name under `allowed_identifier_suffixes`. That is why the node refuses a config with credentials and no suffix list unless `allow_any_identifier` is set by name. Keep the suffix list as narrow as the fleet, generate each password at random (the config stores only its SHA-256), and never reuse one across fleets.
:::

## SCEP, and why it matters

Most network platforms have neither an EST client nor an ACME client. A Cisco switch, for example, enrols a **trustpoint** over SCEP. CryptOS does not serve SCEP, so those devices get certificates by CSR, and each renewal is a manual job.

## Revocation for devices

A device that checks revocation needs to reach the CRL or the OCSP responder. With `pki.revocation_base_url` set, every certificate the node issues points at `<base>/crl` and `<base>/ocsp`, and the node serves both over plain HTTP on port 80 by default (`revocation_http_port` changes it). Make sure that URL is reachable from the network the devices sit on, including management VLANs that are cut off from everything else.

## Related

- [Internal TLS and mTLS](./internal-tls.md) issues certificates by CSR today.
- [What you can do with CryptOS](./overview.md) shows every enrolment protocol and where it stands.
- [Certificates and CAs 101](../concepts/certificates-101.md) explains keys, CSRs and certificates.
