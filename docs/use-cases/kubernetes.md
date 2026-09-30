---
title: "☸️ Kubernetes workloads"
---

# ☸️ Kubernetes workloads

A Kubernetes cluster uses a lot of certificates, and they come and go fast: ingress certificates for every hostname, certificates for webhooks and controllers, and mTLS between services. Nobody carries CSRs by hand for that. In Kubernetes the job usually goes to **cert-manager**, which asks a CA for certificates and renews them before they expire.

This page says how far the alpha gets.

There are two separate jobs here, and it helps to keep them apart:

- **Workload certificates**: certificates for what runs *in* the cluster, such as ingress hostnames and service-to-service TLS. This page is mostly about these.
- **The cluster's own PKI**: the API server, etcd, kubelet and front-proxy certificates that Kubernetes (or Talos) creates for itself. CryptOS does not act as the external CA for those.

:::caution[What cert-manager gets over ACME]
- **ACME is off until you switch it on.** An intermediate or issuing node serves RFC 8555 ACME, with External Account Binding and the `http-01` challenge, from the `pki.acme` block of its machine config. `cryptosctl config apply` stores the block and ACME starts at the next reboot, so plan the switch for a maintenance window. A Root refuses the block. See the [overview](./overview.md#enrolment-protocols).
- **No `dns-01` and no wildcard names**, which cert-manager usually relies on for internal names.
:::

:::tip[Works today]
You can issue certificates for cluster workloads by CSR, the same way as for any server: make the key and CSR, issue with `cryptosctl ca issue-leaf` or the Fleet Manager, and load the result into a Kubernetes TLS Secret yourself. See [Internal TLS and mTLS](./internal-tls.md). Renewal is manual.
:::

## How the ACME server behaves

Once ACME is switched on, it behaves like this:

- **One profile decides the certificate.** The node's `pki.acme.profile` names the leaf profile every ACME order uses. The client picks only the names, and only names whose challenge passed.
- **`http-01` only.** The node fetches `http://<name>:80/.well-known/acme-challenge/...` for each name, as the node itself resolves it. That works for an ingress hostname that resolves to the cluster's ingress from the CA's network. It does not work for a name the CA can't reach, and a wildcard name is refused when the order is placed.
- **Accounts need External Account Binding by default.** The operator provisions a key ID and an HMAC key of at least 32 bytes in `pki.acme.external_account_keys`, and cert-manager is given the same pair. Anonymous accounts need `allow_anonymous_accounts: true` spelled out.
- **Names can be limited.** `allowed_identifier_suffixes` restricts which DNS names the node will order for, matched on a label boundary.
- **Every authorisation is checked afresh.** Nothing is reused across orders, so every renewal re-proves every name.
- **ACME needs a TLS front end.** The node's ACME listener is plain HTTP on `http_port` (8555 by default), and `base_url` is the HTTPS address clients dial. A TLS terminator in front of the node carries the traffic to that port.

The [ACME guide](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/acme.md) in the `cryptos` repo has the full config block and client examples.

:::caution[cert-manager's default key is refused]
A CryptOS node certifies only ECDSA P-384 keys and RSA keys of 3072 bits or more. cert-manager generates RSA 2048 keys unless a Certificate says otherwise, and the node refuses those. Set the Certificate's `privateKey` to ECDSA with size 384, or RSA with size 3072 or more.
:::

cert-manager also has to trust the CryptOS chain for the HTTPS connection to the ACME directory. Give it the CryptOS root (or the chain your TLS front end serves) as the ACME issuer's CA bundle.

:::info[Tested in CI with kind and cert-manager]
Every `cryptos` pull request that touches the ACME code runs cert-manager in a [kind](https://kind.sigs.k8s.io/) cluster against a CryptOS intermediate. cert-manager registers with External Account Binding and proves the name with `http-01` through the cluster's ingress. The test checks that an ECDSA P-384 Certificate goes Ready, that its chain verifies to the CryptOS root, that the node recorded the serial, and that a forced renewal returns a new serial. The node in that test runs from the `cryptos` code on the CI runner with software keys, not from the OS image with a TPM. See [`ci-kind-acme.yml`](https://github.com/CryptOS-PKI/cryptos/blob/main/.github/workflows/ci-kind-acme.yml) and `task e2e:kind` to run it yourself on Linux.

A second, slower test runs the same enrolment against the real OS image. Every night, and on `cryptos` pull requests that touch the image build, the boot or the protocol and config code, the image boots in QEMU as a Root and an Intermediate with a TPM (swtpm). The Intermediate's CSR is signed by the Root, and ACME is switched on the production way: `config apply` with `pki.acme`, then a reboot. cert-manager in kind then gets and renews a Certificate from the booted Intermediate over `http-01`, and `cryptosctl ca list-issued` on the node shows both serials. See [`ci-e2e-image.yml`](https://github.com/CryptOS-PKI/cryptos/blob/main/.github/workflows/ci-e2e-image.yml) and `task e2e:image`.
:::

## An intermediate for the cluster

cert-manager can also act as a small CA of its own, signing from a CA key pair stored in a Kubernetes Secret. CryptOS can sign that CA certificate: a subordinate CA request from outside CryptOS is signed with `cryptosctl ca sign-subordinate --csr <file> --profile <ca-profile>`, the same step that makes vCenter's VMCA a CryptOS subordinate. The profile needs `basic_constraints.is_ca: true`, and `path_len: 0` stops the cluster CA from signing further CAs below it.

:::danger[A CA key in a Secret is only as safe as the cluster]
With this setup the cluster CA's private key sits in a Kubernetes Secret, not in a TPM. Anyone who can read that Secret can issue certificates that chain to your CryptOS root, for any name the CA certificate allows. Keep the certificate short-lived, give the CA its own profile so it can be revoked on its own, and keep RBAC on that Secret tight.
:::

This path has not been tested with cert-manager. The signing step itself is the one proven with VMCA; see [vCenter VMCA as a CryptOS subordinate](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/vmca-subordination.md) for a worked example of the profile and the command.

## Related

- [Internal TLS and mTLS](./internal-tls.md) issues certificates by CSR today.
- [CA roles](../concepts/ca-roles.md) explains Root, intermediate and issuing nodes.
- [Chain of trust](../concepts/chain-of-trust.md) explains what "chains to the root" means.
