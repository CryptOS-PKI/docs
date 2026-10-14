---
title: "🗂️ The repos"
---

# 🗂️ The repos

CryptOS is built in the open in the [CryptOS-PKI](https://github.com/CryptOS-PKI) organization on GitHub. Four repos make up the system itself: `cryptos-node`, `cryptos-appliance`, `cryptos-manager` and `cryptos-web`. A few more hold the things around it: a deprecated Helm chart, test tooling, this site and the organization profile. Every repo on this page is public.

## How they fit together

```text
     cryptos-appliance            cryptos-manager   <----   cryptos-web
     (the signed boot image,      (Fleet Manager,          (its web UI,
      pins + builds cryptos-node)  fleet API proto)          embedded in the manager)
          ^                            |
          |                            |
          |                            |
     cryptos-node                      |
     (the CA engine,                   |
      node API proto)                  |
          ^                            |
          |                            |
          +------- mTLS gRPC ----------+
          |
      cryptosctl
  (the operator CLI, built in cryptos-node)
```

- Each service owns the API it serves. `cryptos-node` holds the node API (`cryptos.node.v1`), and `cryptos-manager` holds the Fleet Manager API (`cryptos.fleet.v1`), which imports the node API from `cryptos-node`.
- `cryptos-node` is the PKI engine: the node API, PID 1, the management CLI and the bare-metal installer. `cryptos-appliance` pins `cryptos-node` at a version and builds the signed boot image around it (kernel, SquashFS, UKI assembly, Secure Boot signing).
- `cryptos-manager` and `cryptos-web` are the optional Fleet Manager: one application split into a backend and a frontend.

A single CA node needs only the image `cryptos-appliance` builds. You manage it with `cryptosctl`. The Fleet Manager is for when you want a web UI or a view across many nodes.

## 🧠 cryptos-node

[github.com/CryptOS-PKI/cryptos-node](https://github.com/CryptOS-PKI/cryptos-node)

The PKI engine. This repo builds no bootable image on its own; `cryptos-appliance` pins it at a version and builds the signed Unified Kernel Image (UKI) around it.

What it holds:

| Path | What it is |
|---|---|
| `cmd/init` | PID 1. It becomes `/init` in the SquashFS image. |
| `cmd/cryptosctl` | The operator CLI, and the only management tool for a node that is not linked to a Fleet Manager. |
| `cmd/cryptos-console` | The dashboard on the node's local console. It reads status and identity over the on-box UNIX socket. |
| `cmd/cryptos-install` | The bare-metal disk installer (GPT, ESP and UKI). |
| `proto/cryptos/node/v1/` | The node API: `NodeService` and its messages (`node.proto`, `identity.proto`, `ceremony.proto`, `status.proto`, `config.proto`, `audit.proto` and the protocol files). |
| `gen/go/cryptos/node/v1/` | The generated Go stubs (package `nodev1`), committed so you need no toolchain to use them. |
| `internal/` | The node itself: TPM, CA templates, ceremony, LUKS and etcd storage, the gRPC server, audit log and machine config. |
| `docs/` | Task guides kept next to the code, such as management trust, certificate profiles and Active Directory. |

## 🧰 cryptos-appliance

[github.com/CryptOS-PKI/cryptos-appliance](https://github.com/CryptOS-PKI/cryptos-appliance)

The signed boot image. It requires `cryptos-node` at a pinned version and builds `init`, `cryptosctl` and `cryptos-console` by import path into a hardened Linux kernel, a read-only SquashFS root filesystem and a TPM-sealed encrypted state partition, assembled and signed as a Unified Kernel Image (UKI). One image boots as a Root, Intermediate or Issuing CA, depending on its machine config.

What it holds:

| Path | What it is |
|---|---|
| `cmd/cryptos-sbkey` | Generates your own Secure Boot signing key and certificate. |
| `cmd/cryptos-switchroot` | A small `/init` shim that loop-mounts the SquashFS root and pivots into it. |
| `build/` | Kernel config, SquashFS templates and the UKI assembly and signing recipes. |
| `test/image/`, `test/integration/` | The QEMU + `swtpm` full-image suites. |
| `docs/` | Secure Boot and image upgrade guides. |

CryptOS ships source only: a `v*` tag is the tag, its release notes and the source archive, with no UKI, ISO or binary attached. Build the image yourself and sign it with your own Secure Boot key; see [Secure Boot](../install-deploy/secure-boot.md) and [Check the source you built](./verify-source.md).

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

A release tag builds the container image `ghcr.io/cryptos-pki/cryptos-manager` and pushes the chart to `oci://ghcr.io/cryptos-pki/charts/fleet-manager`. Pull either directly, or build the image yourself from a folder that holds the `cryptos-manager` and `cryptos-web` checkouts side by side, as `manager` and `web`.

See the [Fleet Manager overview](../fleet-manager/overview.md).

## 🎨 cryptos-web

[github.com/CryptOS-PKI/cryptos-web](https://github.com/CryptOS-PKI/cryptos-web)

The Fleet Manager web UI, and the only web UI in the project. CA nodes ship no web frontend. It is React and TypeScript, built with Vite into a static bundle that the manager embeds and serves. It is a monorepo: the console app in `apps/console`, the UI kit in `packages/ui`, and the TypeScript stubs for both APIs in `packages/api-client`, generated from the `cryptos-node` and `cryptos-manager` protos. It talks to the manager over Connect, and runs under a strict content security policy with no third-party scripts and no CDN fetches, so it works air-gapped.

`cryptos-manager` and `cryptos-web` are one application in two repos, so the frontend and backend can be built and tested on their own. You do not deploy `cryptos-web` on its own; it ships inside the manager image.

See [The web UI](../fleet-manager/web-ui.md).

## The other public repos

| Repo | What it holds |
|---|---|
| ⚓ [cryptos-release](https://github.com/CryptOS-PKI/cryptos-release) | A deprecated Helm chart, `charts/manager`. See [Deploy with Helm](../fleet-manager/helm.md). |
| 🧪 [cryptos-lab](https://github.com/CryptOS-PKI/cryptos-lab) | Scripts for testing CryptOS on real and virtual hardware. `esxi/` boots CryptOS on VMware ESXi with `govc`: upload an ISO, create a UEFI VM, boot it and capture the serial console. Bare metal is planned. |
| 📚 [website](https://github.com/CryptOS-PKI/website) | This site. Docusaurus 3, with the pages under `docs/` and the sidebar in `sidebars.ts`. |
| 🏠 [.github](https://github.com/CryptOS-PKI/.github) | The organization profile README shown on the CryptOS-PKI GitHub page. |

The `api` repo, which held both protos before they moved to the services that serve them, is archived.

:::info[Two Fleet Manager charts]
There are two Helm charts for the Fleet Manager today: `charts/manager` in the `cryptos-release` repo, and `chart/fleet-manager` in the `cryptos-manager` repo. `chart/fleet-manager` is the one its release tags publish, to `oci://ghcr.io/cryptos-pki/charts/fleet-manager`.
:::

## Which repo do I need?

| I want to... | Go to |
|---|---|
| Build and run a CA node | `cryptos-appliance` |
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
