---
title: "⬇️ Install cryptosctl"
---

# ⬇️ Install cryptosctl

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Get the command-line tool that talks to the node.

`cryptosctl` is the only way to manage a standalone CryptOS node. Every command goes to the node's API over mutual TLS: you prove who you are with your admin identity, and `cryptosctl` checks the node against a certificate you pinned. There is no login and no shell behind it.

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::info[Before you start]
You need the `cryptos` checkout and Go from [What you need](./requirements.md). If you followed [Boot it in QEMU](./boot-qemu.md), your admin identity is already in `~/.cryptos/`, and the node is running in another terminal.
:::

## 1. Build it

From the root of the `cryptos` checkout:

```bash
task build
```

This builds the CryptOS binaries into `bin/`, stamped with the version, commit and build date of your checkout. The one you need is `bin/cryptosctl`.

To build only the CLI, run the same `go build` the task runs for it:

```bash
go build -ldflags "$(bash build/ci/buildinfo.sh)" -o bin/cryptosctl ./cmd/cryptosctl
```

## 2. Put it on your PATH

```bash
sudo install -m 0755 bin/cryptosctl /usr/local/bin/cryptosctl
```

Any folder on your `PATH` works. The rest of this section assumes you can type `cryptosctl`.

## 3. Check it runs

```bash
cryptosctl version
```

:::tip[Expected output]
The build identity of the binary you just installed:

```text
Client version:  <git describe of your checkout>
Client commit:   <full commit hash>
Client built:    <commit date, UTC>
Go version:      go1.25...
```

The version is what `git describe --tags --always --dirty` says about your checkout. It reads `dev`, with the commit and date `unknown`, when the source had no Git history. That is harmless here, but build from a full clone if you want to tell builds apart.
:::

Pass a node address and `version` also asks the node which version it runs, so a stale CLI or a node on the wrong image stands out. You try that on [Check identity and status](./check-status.md).

## Where cryptosctl keeps its files

By default `cryptosctl` reads three files from `~/.cryptos/`. Each has a flag to point somewhere else.

| File | Flag | What it is | Made by |
|---|---|---|---|
| `identity.crt` | `--identity` | your admin certificate | `cryptosctl bootstrap` |
| `identity.key` | `--identity-key` | your admin private key | `cryptosctl bootstrap` |
| `trust.crt` | `--trust` | the node's management certificate, pinned | `cryptosctl trust fetch` |

You made the identity pair on [Boot it in QEMU](./boot-qemu.md), with the same code you just installed. You fetch `trust.crt` on the next page.

:::caution[Keep ~/.cryptos private]
`identity.key` is the admin key for your node, and `cryptosctl bootstrap` writes it readable only by you. Do not copy it into shared folders, backups you do not control, or chat. Anyone with it can run every command on these pages against your node.
:::

## Flags you will use here

The node in QEMU is reachable as `127.0.0.1:4443`, but its management certificate names `10.0.0.10` and `localhost`, not `127.0.0.1`. So every command on the next pages passes the same two flags:

| Flag | Value | Why |
|---|---|---|
| `--endpoint` | `127.0.0.1:4443` | the port QEMU forwards to the node's API. The default is `localhost:443`. |
| `--server-name` | `localhost` | the name to check on the node's certificate |

The [cryptosctl command reference](../reference/cryptosctl.md) lists every command and flag.

## Release downloads

Tagged `cryptos` releases are set up to attach ready-made `cryptosctl` binaries for Linux and macOS, on amd64 and arm64 (`cryptosctl-linux-amd64`, `cryptosctl-darwin-arm64` and so on), with a `SHA256SUMS` file. No release has been published yet, so build from source for now.

## Next step

Create the Root: [Run the first-boot ceremony](./first-boot-ceremony.md).
