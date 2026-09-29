---
title: "⌨️ cryptosctl command reference"
---

# ⌨️ cryptosctl command reference

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

Every command and flag, in one place. `cryptosctl` is the only management tool for a standalone node, and it speaks the same API the Fleet Manager uses. `cryptosctl <command> --help` prints the same information on your machine.

## Connecting to a node

Every command that talks to a node picks one of three ways to connect:

| Mode | Flags | Use it for |
|---|---|---|
| Mutual TLS (the default) | `--endpoint`, plus the identity and trust files | every installed node |
| Server TLS only | `--insecure` | a node in maintenance mode, which has no identity yet and asks for no client certificate |
| Local socket | `--socket /run/cryptos.sock` | on the node itself only; no TLS and no client certificate |

Mutual TLS always uses TLS 1.3. The identity is the bootstrap admin certificate and key from `cryptosctl bootstrap`. The trust file is the node's current self-signed management certificate, pinned, which changes on every reboot; see [Reboot into the ceremony](../install-deploy/reboot-ceremony.md#trust-the-nodes-management-certificate).

## Global flags

These work with every command.

| Flag | Default | Meaning |
|---|---|---|
| `--endpoint` | `localhost:443` | the node's `host:port` |
| `--identity` | `~/.cryptos/identity.crt` | your client certificate (PEM) |
| `--identity-key` | `~/.cryptos/identity.key` | your client private key (PEM) |
| `--trust` | `~/.cryptos/trust.crt` | the pinned certificate the node must present (PEM) |
| `--server-name` | the host part of `--endpoint` | the name checked against the node's certificate; set it to the node's IP when you connect through a DNS name |
| `--insecure` | off | skip the client identity and do not verify the node; maintenance mode only |
| `--socket` | none | connect to the node's local UNIX socket instead, such as `/run/cryptos.sock` |
| `-o`, `--output` | `human` | `human`, `json` or `yaml`; `identity show` also accepts `pem` |

## Setup and status

### `bootstrap`

Makes the bootstrap admin identity on your workstation: an ECDSA P-256 key and a self-signed client certificate. It prints the certificate and its SHA-256 for the machine config's `bootstrap` section. It does not contact a node.

| Flag | Default | Meaning |
|---|---|---|
| `--common-name` | `cryptos bootstrap admin` | the certificate's common name |
| `--out-dir` | `~/.cryptos` | where `identity.crt` and `identity.key` are written |
| `--validity` | `8760h` (one year) | how long the certificate is valid |

### `status`

Shows the node's role, identity state, TPM and etcd health, boot count and software version, plus the revocation check and DNS resolver when they apply. No flags.

### `version`

Prints the version, commit and build date of this `cryptosctl` binary. With `--endpoint` or `--socket` it also asks the node for its version, so a stale CLI or a node running the wrong image stands out. No flags.

### `identity show`

Shows the node's CA certificate: subject, issuer, serial, validity, SHA-256 and chain length. `-o pem` prints the chain as PEM. Fails with a hint to run the ceremony if the node has no identity yet.

### `identity validate`

Checks the node's certificate chain and prints `OK: certificate chain validates`.

### `completion`

Prints a shell completion script: `cryptosctl completion bash`, `zsh`, `fish` or `powershell`.

## Configuration and ceremony

### `config apply`

Sends a machine config. `cryptosctl` validates the file first and refuses unknown fields, then the node validates it again. On a maintenance node this is what installs the node.

| Flag | Meaning |
|---|---|
| `-f`, `--file` | the machine config YAML (required) |
| `--yes` | skip the confirmation for `pki.allow_unverified_revocation_url` (for automation) |

If the config turns on `pki.allow_unverified_revocation_url`, `cryptosctl` asks for a confirmation first, because every certificate issued while it is set carries a revocation address that was never checked. On a Root you must type the Root's common name; on other roles, `yes`.

It prints `applied: generation=<n> requires_reboot=<true|false> digest=<sha256>`. Most changes need a reboot to take effect.

### `config get`

Prints the node's current machine config as YAML, ready to edit and send back with `config apply -f`. The `acme` and `est` sections are left out because they hold secrets; the node keeps them from its existing config when you apply the edited file. No flags.

### `ceremony start`

Runs the first-boot Root ceremony on a Root node: creates the CA key, self-signs the Root certificate, writes the signed ceremony manifest, and makes your bootstrap identity the node's administrator. It streams each step as it happens. It runs once per node.

| Flag | Meaning |
|---|---|
| `--config` | the machine config YAML (required) |

## Certificate authority

The `ca` commands marked **child** run on the subordinate being set up, and **parent** on the CA that signs it.

| Command | Flags | What it does |
|---|---|---|
| `ca get-subordinate-csr` | | **child:** print this node's pending subordinate-CA CSR |
| `ca sign-subordinate` | `--csr` (PEM or DER, required), `--profile` (required) | **parent:** sign a child's CSR under a certificate profile |
| `ca submit-subordinate-cert` | `--chain` (PEM, leaf first, required) | **child:** install the chain the parent signed |
| `ca get-renewal-csr` | | **child:** print a CSR for the current CA key, to get a fresh certificate without a new key |
| `ca submit-renewed-cert` | `--chain` (PEM, leaf first, required) | **child:** install the re-issued certificate for the current key |
| `ca rotate-key` | | **child:** start a CA key rotation and print the CSR for the new key |
| `ca submit-rotation` | `--chain` (PEM, leaf first, required) | **child:** install the parent-signed chain for the rotated key |
| `ca issue-leaf` | `--csr` (PEM or DER, required), `--profile` (required), `--dns` (repeatable) | issue an end-entity certificate from a CSR |
| `ca list-issued` | | list the certificates this node has issued |
| `ca revoke` | `--serial` (hex, required), `--reason` (RFC 5280 reason code, default `0`) | revoke a certificate this node issued |
| `ca revocations` | | list this node's revoked certificates |
| `ca crl` | | print this node's revocation list as a table |
| `ca export-key` | `--out` (required), `--role`, `--yes` | export the CA key to a passphrase-encrypted backup file |
| `ca import-key` | `--backup` (required) | restore a CA from a backup file onto a fresh node |

Notes:

- `ca issue-leaf --dns` replaces the profile's DNS names, and only works when the profile sets `allow_request_sans`.
- `ca export-key` asks for a new passphrase twice and for a confirmation: the Root's common name on a Root, `yes` on a subordinate. `--role root` or `--role subordinate` overrides the role read from the node, and `--yes` skips the confirmation. A TPM-backed node refuses the export, because its CA key cannot leave the TPM.
- `ca import-key` asks for the backup's passphrase, and refuses a node that already has an identity.
- Step-by-step guides in the `cryptos` repository: [subordinating vCenter's VMCA](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/vmca-subordination.md) and [re-certifying a subordinate](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/subordinate-recertify.md).

## Image upgrades

These replace the node's CryptOS image without reinstalling it. The encrypted state (CA key, issued history, identity) is never touched. The node must have been built with an upgrade anchor; see [Secure Boot enrollment](../install-deploy/secure-boot.md).

| Command | Flags | What it does |
|---|---|---|
| `image status` | | show the running and staged images |
| `image stage` | `--image` (the signed UKI), `--signature` (default `<image>.sig`) | upload a signed image; the node checks the signature before writing anything, keeps the current image for rollback, and does not reboot |
| `image activate` | `--confirm` (the CA common name) | reboot into the staged image |
| `image rollback` | | put the retained previous image back on the boot path; run `image activate` to boot it |

The full procedure is the [in-place upgrade guide](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/image-upgrade.md).

## Power and reset

### `reboot`

Restarts the node through an orderly shutdown: it stops its listeners, closes etcd and the audit log, and locks the encrypted volume, which a hypervisor hard reset skips. Over mutual TLS it needs the bootstrap admin certificate.

| Flag | Meaning |
|---|---|
| `--confirm` | the node's CA common name, to authorize the reboot |
| `--power-off` | power off instead of restarting; the node stays off until someone powers it on |

### `reset`

Erases the node's key material and reboots it into maintenance mode, so it can be given a new config and a new CA identity. **This cannot be undone.** Certificates the CA already signed stay valid until they expire, but nothing can issue, renew or publish a new revocation list for them. Export the key first with `ca export-key` if that matters.

| Flag | Meaning |
|---|---|
| `--confirm` | the node's CA common name, to authorize the erase |
| `--yes` | skip the interactive confirmation (for automation) |

Over mutual TLS it needs the bootstrap admin certificate. After the reboot the node takes its address from DHCP, so on a network without DHCP it can only be reached from the console or hypervisor.
