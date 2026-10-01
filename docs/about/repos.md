---
title: "🗂️ The repos"
---

# 🗂️ The repos

CryptOS is built in the open in the [CryptOS-PKI](https://github.com/CryptOS-PKI) organization on GitHub. Three repos make up the system itself: `cryptos-node`, `cryptos-manager` and `cryptos-web`. A few more hold the things around it: the release manifest and Helm chart, test tooling, this site and the organization profile. Every repo on this page is public.

## How they fit together

```text
     cryptos-node                cryptos-manager   <----   cryptos-web
     (the CA node,               (Fleet Manager,          (its web UI,
      node API proto)             fleet API proto)          embedded in the manager)
          ^                            |
          |                            |
          +------- mTLS gRPC ----------+
          |
      cryptosctl
  (the operator CLI, built in cryptos-node)
```

- Each service owns the API it serves. `cryptos-node` holds the node API (`cryptos.node.v1`), and `cryptos-manager` holds the Fleet Manager API (`cryptos.fleet.v1`), which imports the node API from `cryptos-node`.
- `cryptos-node` is the CA node. It builds the operating system image and `cryptosctl`.
- `cryptos-manager` and `cryptos-web` are the optional Fleet Manager: one application split into a backend and a frontend.

A single CA node needs only `cryptos-node`. You manage it with `cryptosctl`. The Fleet Manager is for when you want a web UI or a view across many nodes.

## 🧠 cryptos-node

[github.com/CryptOS-PKI/cryptos-node](https://github.com/CryptOS-PKI/cryptos-node)

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
| `proto/cryptos/node/v1/` | The node API: `NodeService` and its messages (`node.proto`, `identity.proto`, `ceremony.proto`, `status.proto`, `config.proto`, `audit.proto` and the protocol files). |
| `gen/go/cryptos/node/v1/` | The generated Go stubs (package `nodev1`), committed so you need no toolchain to use them. |
| `internal/` | The node itself: TPM, CA templates, ceremony, LUKS and etcd storage, the gRPC server, audit log and machine config. |
| `build/` | Kernel config, SquashFS templates and the UKI assembly and signing recipes. |
| `docs/` | Task guides kept next to the code, such as Secure Boot, management trust, certificate profiles and Active Directory. |

Each `v*` tag attaches its release assets to the GitHub Release: the unsigned UKI and installer ISO (TPM-backed and `nodeid` variants), `cryptosctl` for Linux and macOS on amd64 and arm64, and a `SHA256SUMS` file.

:::caution[Release images are for evaluation]
The release UKIs and ISOs carry no Secure Boot signature and no upgrade anchor. A node installed from one cannot be upgraded in place. For real use, build the image with your own Secure Boot key. See [Secure Boot](../install-deploy/secure-boot.md).
:::

To write your own Go client for a node, use the stubs as a Go module:

```bash
go get github.com/CryptOS-PKI/cryptos-node@main
```

The surface is still changing while the alpha lands. The [gRPC API reference](../reference/grpc-api.md) walks through the RPCs.

Start with [Build a bootable image](../install-deploy/build-bootable-image.md), or try it in a VM with [Try It Locally](../try-it-locally/requirements.md).

## 🛰️ cryptos-manager

[github.com/CryptOS-PKI/cryptos-manager](https://github.com/CryptOS-PKI/cryptos-manager)

The Fleet Manager backend, written in Go. It talks to CA nodes over mTLS gRPC, keeps a cross-node inventory in Postgres, and serves the `cryptos-web` bundle and its own API on one TLS listener. Operators sign in with a client certificate; no usernames or passwords are stored.

The Fleet Manager is never an issuing authority. Its certificate lacks `keyCertSign` and `cRLSign`, so it cannot sign certificates even if it is compromised.

| Path | What it is |
|---|---|
| `cmd/manager` | The server: it dials the configured nodes and serves `cryptos.fleet.v1.FleetService` to the web UI. |
| `proto/cryptos/fleet/v1/` | The Fleet Manager API: `FleetService` and `BootstrapService` (`fleet.proto`, `bootstrap.proto`, `operator_ca.proto`, `errors.proto`). |
| `gen/go/cryptos/fleet/v1/` | The generated Go and connect-go stubs. |
| `internal/` | The backend itself. |
| `chart/fleet-manager/` | A Helm chart, published with the image on each release tag. |
| `deploy/` | A worked single-host `docker compose` example and its config. |
| `Dockerfile` | Builds the single image, with the `cryptos-web` bundle embedded. |
| `docs/` | Operator guides: operator certificates, standalone deployment, the MCP endpoint and error codes. |

A release tag builds the container image `ghcr.io/cryptos-pki/cryptos-manager` and pushes the chart to `oci://ghcr.io/cryptos-pki/charts/fleet-manager`. Before the first release tag there is no published image, so you build it yourself. The build context is a folder that holds the `cryptos-manager` and `cryptos-web` checkouts side by side, as `manager` and `web`.

See the [Fleet Manager overview](../fleet-manager/overview.md).

## 🎨 cryptos-web

[github.com/CryptOS-PKI/cryptos-web](https://github.com/CryptOS-PKI/cryptos-web)

The Fleet Manager web UI, and the only web UI in the project. CA nodes ship no web frontend. It is React and TypeScript, built with Vite into a static bundle that the manager embeds and serves. It is a monorepo: the console app in `apps/console`, the UI kit in `packages/ui`, and the TypeScript stubs for both APIs in `packages/api-client`, generated from the `cryptos-node` and `cryptos-manager` protos. It talks to the manager over Connect, and runs under a strict content security policy with no third-party scripts and no CDN fetches, so it works air-gapped.

`cryptos-manager` and `cryptos-web` are one application in two repos, so the frontend and backend can be built and tested on their own. You do not deploy `cryptos-web` on its own; it ships inside the manager image.

See [The web UI](../fleet-manager/web-ui.md).

## The other public repos

| Repo | What it holds |
|---|---|
| ⚓ [cryptos-release](https://github.com/CryptOS-PKI/cryptos-release) | The release manifest (`manifest/release.yaml`, the pinned node image, manager image digest and web console of a release) and a deprecated Helm chart, `charts/manager`. See [Deploy with Helm](../fleet-manager/helm.md). |
| 🧪 [cryptos-lab](https://github.com/CryptOS-PKI/cryptos-lab) | Scripts for testing CryptOS on real and virtual hardware. `esxi/` boots CryptOS on VMware ESXi with `govc`: upload an ISO, create a UEFI VM, boot it and capture the serial console. Bare metal is planned. |
| 📚 [website](https://github.com/CryptOS-PKI/website) | This site. Docusaurus 3, with the pages under `docs/` and the sidebar in `sidebars.ts`. |
| 🏠 [.github](https://github.com/CryptOS-PKI/.github) | The organization profile README shown on the CryptOS-PKI GitHub page. |

The `api` repo, which held both protos before they moved to the services that serve them, is archived.

:::info[Two Fleet Manager charts]
There are two Helm charts for the Fleet Manager today: `charts/manager` in the `cryptos-release` repo, and `chart/fleet-manager` in the `cryptos-manager` repo. The `cryptos-manager` repo's chart is the one its release tags publish, to `oci://ghcr.io/cryptos-pki/charts/fleet-manager`.
:::

## Which repo do I need?

| I want to... | Go to |
|---|---|
| Build and run a CA node | `cryptos-node` |
| Manage a node from the command line | `cryptos-node` (`cryptosctl`) |
| Write my own client for the node API | `cryptos-node` (`proto/`, `gen/`) |
| Write my own client for the Fleet Manager API | `cryptos-manager` (`proto/`, `gen/`) |
| Run the Fleet Manager with Docker | `cryptos-manager` |
| Run the Fleet Manager on Kubernetes | `cryptos-manager` |
| Change the Fleet Manager web UI | `cryptos-web` |
| See what a release pins | `cryptos-release` |
| Test CryptOS on ESXi | `cryptos-lab` |
| Fix or add to these docs | `website` |

Report a problem in the repo that holds the code.
