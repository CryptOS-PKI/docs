---
title: "☁️ CryptOS and the CNCF"
---

# ☁️ CryptOS and the CNCF

CryptOS is preparing an application to the [Cloud Native Computing Foundation](https://www.cncf.io/) (CNCF) Sandbox. It is not a CNCF project. This page says how CryptOS fits cloud native infrastructure today, which CNCF conventions the project already follows, and how to take part.

## How CryptOS fits cloud native

A Kubernetes cluster uses a lot of certificates: ingress certificates for every hostname, certificates for webhooks and controllers, and mTLS between services. In Kubernetes that job usually goes to **cert-manager**, which asks a CA for certificates and renews them before they expire. A CryptOS node is that CA, with its signing key sealed in the node's TPM.

What works with the alpha today:

- **Workload certificates by CSR.** Make the key and CSR, issue with `cryptosctl ca issue-leaf` or the Fleet Manager, and load the result into a Kubernetes TLS Secret yourself. Renewal is manual. See [Internal TLS and mTLS](../use-cases/internal-tls.md).
- **cert-manager over ACME.** An intermediate or issuing node serves ACME (RFC 8555) with the `http-01` challenge once you add the `pki.acme` block to its machine config and reboot it. There is no `dns-01` and no wildcard names, and cert-manager's default RSA 2048 key is refused. See [Kubernetes workloads](../use-cases/kubernetes.md) for what to set.
- **A CA for the cluster.** `cryptosctl ca sign-subordinate` can sign a CA certificate for cert-manager's own CA issuer, so its certificates chain to your CryptOS root. The signing step is the one proven with vCenter's VMCA; it has not been tested with cert-manager.
- **The Fleet Manager in a cluster.** The Fleet Manager runs in Kubernetes from the chart in the `cryptos-manager` repo. No chart or container image is published, so you render the chart and build the image yourself. See [Deploy with Helm](../fleet-manager/helm.md).

CryptOS does not act as the external CA for the cluster's own PKI: the API server, etcd, kubelet and front-proxy certificates that Kubernetes creates for itself.

## CNCF conventions the project follows

These apply across the [CryptOS-PKI](https://github.com/CryptOS-PKI) organization.

| Convention | What CryptOS does | Where it lives |
|---|---|---|
| Apache License 2.0 | Every repo is licensed under the Apache License 2.0, and its `LICENSE` file is the text exactly as the Apache Software Foundation publishes it. | [License](./license.md) |
| Developer Certificate of Origin | Contributions are taken under the [DCO](https://developercertificate.org/), version 1.1, instead of a contributor license agreement. Contributors sign off every commit with `git commit -s`. | [`CONTRIBUTING.md`](https://github.com/CryptOS-PKI/.github/blob/main/CONTRIBUTING.md) |
| CNCF Code of Conduct | The organization-wide code of conduct is the CNCF Community Code of Conduct, version 1.3. Because CryptOS is not a CNCF project, reports go to the project's maintainers. | [`CODE_OF_CONDUCT.md`](https://github.com/CryptOS-PKI/.github/blob/main/CODE_OF_CONDUCT.md) |
| Security policy | Vulnerabilities are reported privately to the maintainers, never in a public issue, pull request or discussion. Before `1.0.0`, only the latest `0.x` release of each repo gets security fixes. | [`SECURITY.md`](https://github.com/CryptOS-PKI/.github/blob/main/SECURITY.md) |

## Licenses inside the OS image

The CryptOS code is Apache 2.0, but a CryptOS image contains more than CryptOS code.

:::info[The image also carries GPL and LGPL components]
A CryptOS image built from `cryptos` includes third-party components built from their own sources, and they keep their own licenses. The Linux kernel and the disk tools (cryptsetup, e2fsprogs, gptfdisk and dosfstools) are under the GNU GPL. Some libraries linked into those tools, such as glibc, and the systemd EFI stub that boots the image are under the GNU LGPL. See [License](./license.md) for what the license checks cover.
:::

## Get involved

The code and the source of this site are public on GitHub in the [CryptOS-PKI](https://github.com/CryptOS-PKI) organization. See [The repos](./repos.md) for what each repo holds.

:::note[Issues and pull requests are limited to collaborators today]
Today, opening issues and pull requests and commenting on every CryptOS-PKI repo are limited to the project's collaborators. They will open to the public.
:::

When they open, a change starts as an issue from one of the repo's templates, and every commit in a pull request is signed off. [`CONTRIBUTING.md`](https://github.com/CryptOS-PKI/.github/blob/main/CONTRIBUTING.md) has the whole workflow. Security problems are never reported in public; follow [`SECURITY.md`](https://github.com/CryptOS-PKI/.github/blob/main/SECURITY.md) instead.
