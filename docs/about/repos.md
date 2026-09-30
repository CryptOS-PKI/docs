---
title: "🗂️ The four repos"
---

# 🗂️ The four repos

CryptOS is built in the open in the [CryptOS-PKI](https://github.com/CryptOS-PKI) organization on GitHub. Four repos make up the system itself: `cryptos`, `api`, `manager` and `web`. A few more hold the things around it: the Helm chart, test tooling, this site and the organization profile. Every repo on this page is public.

## How the four fit together

```text
                     api
       (.proto contract + generated stubs)
          |               |               |
          v               v               v
       cryptos         manager   <----   web
     (the CA node)  (Fleet Manager)  (its web UI,
          ^               |           embedded in manager)
          |               |
          +--- mTLS gRPC -+
          |
      cryptosctl
  (the operator CLI, built in cryptos)
```

- `api` is the contract. It holds the `.proto` files every other part speaks.
- `cryptos` is the CA node. It builds the operating system image and `cryptosctl`.
- `manager` and `web` are the optional Fleet Manager: one application split into a backend and a frontend.

A single CA node needs only `cryptos`. You manage it with `cryptosctl`. The Fleet Manager is for when you want a web UI or a view across many nodes.

## 🧠 cryptos

[github.com/CryptOS-PKI/cryptos](https://github.com/CryptOS-PKI/cryptos)

The operating system and CA engine. It builds a signed Unified Kernel Image (UKI): a hardened Linux kernel, a Go PID 1, a read-only SquashFS root filesystem and a TPM-sealed encrypted state partition. One image boots as a Root, Intermediate or Issuing CA, depending on its machine config.

What it holds:

| Path | What it is |
|---|---|
| `cmd/init` | PID 1. It becomes `/init` in the SquashFS image. |
| `cmd/cryptosctl` | The operator CLI, and the only management tool for a node that is not linked to a Fleet Manager. |
| `cmd/cryptos-console` | The dashboard on the node's local console. It reads status and identity over the on-box UNIX socket. |
| `cmd/cryptos-install` | The bare-metal disk installer (GPT, ESP and UKI). |
| `cmd/cryptos-sbkey` | Generates your own Secure Boot signing key and certificate. |
| `cmd/cryptos-switchroot` | A small `/init` shim that loop-mounts the SquashFS root and pivots into it. |
| `internal/` | The node itself: TPM, CA templates, ceremony, LUKS and etcd storage, the gRPC server, audit log and machine config. |
| `build/` | Kernel config, SquashFS templates and the UKI assembly and signing recipes. |
| `docs/` | Task guides kept next to the code, such as Secure Boot, management trust, certificate profiles and Active Directory. |

Each `v*` tag attaches its release assets to the GitHub Release: the unsigned UKI and installer ISO (TPM-backed and `nodeid` variants), `cryptosctl` for Linux and macOS on amd64 and arm64, and a `SHA256SUMS` file.

:::caution[Release images are for evaluation]
The release UKIs and ISOs carry no Secure Boot signature and no upgrade anchor. A node installed from one cannot be upgraded in place. For real use, build the image with your own Secure Boot key. See [Secure Boot](../install-deploy/secure-boot.md).
:::

Start with [Build a bootable image](../install-deploy/build-bootable-image.md), or try it in a VM with [Try It Locally](../try-it-locally/requirements.md).

## 📡 api

[github.com/CryptOS-PKI/api](https://github.com/CryptOS-PKI/api)

The wire contract. It holds the Protocol Buffers definitions and the code generated from them, so every part of CryptOS speaks exactly the same messages.

| Path | What it is |
|---|---|
| `proto/cryptos/v1/` | The node API: `NodeService` and its messages (`node.proto`, `identity.proto`, `ceremony.proto`, `status.proto`, `config.proto`, `audit.proto`). |
| `proto/cryptos/fleet/v1/` | The Fleet Manager API: `FleetService` (`fleet.proto`). |
| `go/cryptos/` | Generated Go stubs, committed so you need no toolchain to use them. |
| `gen/ts/cryptos/` | Generated TypeScript stubs, used by `web`. |

`cryptos` and `manager` use it as a Go module:

```bash
go get github.com/CryptOS-PKI/api@latest
```

The surface is still changing while the alpha lands. The [gRPC API reference](../reference/grpc-api.md) walks through the RPCs.

## 🛰️ manager

[github.com/CryptOS-PKI/manager](https://github.com/CryptOS-PKI/manager)

The Fleet Manager backend, written in Go. It talks to CA nodes over mTLS gRPC, keeps a cross-node inventory in Postgres, and serves the `web` bundle and its own API on one TLS listener. Operators sign in with a client certificate; no usernames or passwords are stored.

The Fleet Manager is never an issuing authority. Its certificate lacks `keyCertSign` and `cRLSign`, so it cannot sign certificates even if it is compromised.

| Path | What it is |
|---|---|
| `cmd/manager` | The server: it dials the configured nodes and serves `cryptos.fleet.v1.FleetService` to the web UI. |
| `internal/` | The backend itself. |
| `chart/fleet-manager/` | A Helm chart, published with the image on each release tag. |
| `deploy/` | A worked single-host `docker compose` example and its config. |
| `Dockerfile` | Builds the single image, with the `web` bundle embedded. |
| `docs/` | Operator guides: operator certificates, standalone deployment, the MCP endpoint and error codes. |

A release tag builds the container image `ghcr.io/cryptos-pki/manager` and pushes the chart to `oci://ghcr.io/cryptos-pki/charts/fleet-manager`. Before the first release tag there is no published image, so you build it yourself. The build context is a folder that holds the `manager` and `web` checkouts side by side.

See the [Fleet Manager overview](../fleet-manager/overview.md).

## 🎨 web

[github.com/CryptOS-PKI/web](https://github.com/CryptOS-PKI/web)

The Fleet Manager web UI, and the only web UI in the project. CA nodes ship no web frontend. It is React and TypeScript, built with Vite into a static bundle that `manager` embeds and serves. It talks to `manager` over Connect, using the TypeScript stubs from `api`, and runs under a strict content security policy with no third-party scripts and no CDN fetches, so it works air-gapped.

`manager` and `web` are one application in two repos, so the frontend and backend can be built and tested on their own. You do not deploy `web` on its own; it ships inside the `manager` image.

See [The web UI](../fleet-manager/web-ui.md).

## The other public repos

| Repo | What it holds |
|---|---|
| ⚓ [helm](https://github.com/CryptOS-PKI/helm) | Helm charts for the control plane on Kubernetes. Today it has one chart, `charts/manager`, which deploys the Fleet Manager. It needs a TLS Secret and a Postgres DSN Secret that you create yourself. See [Deploy with Helm](../fleet-manager/helm.md). |
| 🧪 [lab](https://github.com/CryptOS-PKI/lab) | Scripts for testing CryptOS on real and virtual hardware. `esxi/` boots CryptOS on VMware ESXi with `govc`: upload an ISO, create a UEFI VM, boot it and capture the serial console. Bare metal is planned. |
| 📚 [docs](https://github.com/CryptOS-PKI/docs) | This site. Docusaurus 3, with the pages under `docs/` and the sidebar in `sidebars.ts`. |
| 🏠 [.github](https://github.com/CryptOS-PKI/.github) | The organization profile README shown on the CryptOS-PKI GitHub page. |

:::info[Two Fleet Manager charts]
There are two Helm charts for the Fleet Manager today: `charts/manager` in the `helm` repo, and `chart/fleet-manager` in the `manager` repo. The `manager` repo's chart is the one its release tags publish, to `oci://ghcr.io/cryptos-pki/charts/fleet-manager`.
:::

## Which repo do I need?

| I want to... | Go to |
|---|---|
| Build and run a CA node | `cryptos` |
| Manage a node from the command line | `cryptos` (`cryptosctl`) |
| Write my own client for the node or Fleet Manager API | `api` |
| Run the Fleet Manager with Docker | `manager` |
| Run the Fleet Manager on Kubernetes | `manager` or `helm` |
| Change the Fleet Manager web UI | `web` |
| Test CryptOS on ESXi | `lab` |
| Fix or add to these docs | `docs` |

Report a problem in the repo that holds the code.
