---
title: "🌱 Trust from zero"
---

# 🌱 Trust from zero

Start with nothing: how the Root signs itself, and how your laptop earns the right to talk to the API.

:::tip[Works today]
Everything on this page up to "Where it falls short" is built and runs in the alpha. The gaps at the end are stated as they are in the code today.
:::

A freshly built CryptOS image knows nobody. It carries no administrator account, no password, no pre-shared key and no CA key. Three trust relationships have to be built from that blank state, and this page follows each one to the code that enforces it:

1. **The node trusts you:** which client may manage it.
2. **You trust the node:** that the machine answering is the one you installed.
3. **The world trusts the Root:** that the self-signed Root certificate is the one this node made.

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

## Step 1: you make your own credential

Trust starts on your workstation, not on the node. `cryptosctl bootstrap` generates a fresh ECDSA P-256 key pair and a self-signed certificate for it:

```bash
cryptosctl bootstrap
```

The certificate carries only the `clientAuth` extended key usage and the `digitalSignature` key usage. The common name defaults to `cryptos bootstrap admin` (`--common-name`) and the validity to 365 days (`--validity`, a Go duration such as `8760h`). The key and certificate are written to `~/.cryptos/identity.key` and `~/.cryptos/identity.crt` with mode `0600` (`--out-dir` changes the folder), and the command prints the certificate and its SHA-256.

The private key never leaves your workstation. The node only ever sees the certificate.

## Step 2: the certificate goes into the machine config

You put the certificate into the node's machine config under `bootstrap.admin_cert_pem`. The config also accepts `bootstrap.admin_cert_sha256` (a fingerprint only), and exactly one of the two must be set. See the [machine config reference](../reference/machine-config.md).

`LoadTrust` in `internal/bootstrap` parses the value. It accepts exactly one `CERTIFICATE` PEM block and rejects a second one, so a config can't smuggle in an extra credential.

:::caution[Use the full certificate, not only the fingerprint]
The mTLS listener needs the whole certificate to build its client trust pool. With only `admin_cert_sha256` set, the node refuses to start the listener and the boot fails with `init: ServerTLSConfig: the mTLS listener needs the full bootstrap admin certificate (PEM), not just a fingerprint`. Set `bootstrap.admin_cert_pem`.
:::

## Step 3: the config reaches the node

A node booted from the ISO with no `cryptos-state` partition runs in [maintenance mode](../concepts/maintenance-mode.md). It has no trust anchor yet, so its API runs server-side TLS only: it presents a throwaway self-signed certificate and asks for no client certificate (`MaintenanceServerTLSConfig`). You reach it with `cryptosctl --insecure`, which also skips checking the node's certificate.

:::warning[Maintenance mode trusts the network]
In maintenance mode the node accepts `ApplyConfig` from any client that can reach it, and `cryptosctl --insecure` does not check which node answered. Whoever can reach the port at install time can apply a config, including a different `bootstrap.admin_cert_pem`, and maintenance mode keeps no audit log. Install on a network segment only you can reach, and confirm afterwards that the node trusts your certificate (Step 4 fails if it doesn't).
:::

The config you apply is written to the ESP, the node installs itself to disk, and it reboots. From here on the node is no longer in maintenance mode.

## Step 4: the node trusts exactly one certificate

On the first boot from disk, PID 1 reads the machine config and calls `LoadTrust` again. It then builds the management listener on `network.address`, port 443 (`ServerTLSConfig` in `internal/init/servertls.go`):

- TLS 1.3 minimum.
- `RequireAndVerifyClientCert`: a client without a certificate that verifies is dropped during the handshake.
- The client trust pool holds one certificate: yours. Because it is self-signed and is itself the anchor, nothing else chains to it.

On top of the handshake, every administrative RPC calls `AuthorizeAdmin` (`internal/grpc/authz.go`), which compares the SHA-256 of the presented leaf with the pinned fingerprint in constant time. A TLS caller with no leaf gets `Unauthenticated` (`grpc: no client certificate presented`), a different leaf gets `PermissionDenied` (`grpc: client certificate is not the authorized bootstrap admin`).

The node also opens a local UNIX socket at `/run/cryptos.sock`. It has no TLS and no authentication (`NewLocal`), and `AuthorizeAdmin` lets it through. It exists for on-box break-glass. The node has no shell and no login, so no human can reach this socket over the network; only processes on the node itself can.

:::caution[The certificate's expiry is the API's expiry]
The TLS handshake checks the client certificate's validity dates. When the bootstrap certificate expires, the node refuses it and the remote API is closed to you. The node reads `bootstrap.admin_cert_pem` from its stored machine config at every boot, so replace it with a new certificate through `cryptosctl config apply` and reboot before the old one runs out.
:::

## Step 5: you trust the node

The node has no CA identity before the ceremony, so it can't present a certificate your Root would vouch for. At every boot `GenerateServerCert` makes a new key and a new self-signed server certificate, valid for the `network.address` IP and `localhost`. The key is ECDSA P-256, or RSA when `pki.root_key_alg` is an RSA value. It is regenerated on every boot and never stored.

Your client pins that certificate. To check the pin against the node itself, not the network, PID 1 publishes the certificate for the console, and the console dashboard shows it as **Mgmt SHA-256**. `cryptosctl trust fetch --expect-sha256` reads the certificate from the endpoint and saves it only if the fingerprint matches what you read off the console:

```bash
cryptosctl --endpoint 192.0.2.10:443 trust fetch --expect-sha256 "<Mgmt SHA-256 from the console>"
```

The full procedure, and why the pin goes stale after every reboot, is in [Trusting a node's management certificate](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/management-trust.md).

:::caution[Fetch the pin again after every reboot]
The management certificate changes on every boot, even after the ceremony: it is never replaced by one your Root issued. A pin taken before a reboot fails afterwards with `x509: certificate signed by unknown authority`. Run `trust fetch --expect-sha256` again after each reboot, and don't drop `--expect-sha256`, because without it `trust fetch` saves whatever certificate it received.
:::

At this point both sides have proof: the node knows your certificate from the config you wrote, and you know the node's certificate from its own console.

## Step 6: the Root signs itself

Now you run the first-boot ceremony over that mutually authenticated channel:

```bash
cryptosctl ceremony start --config machine.yaml
```

The ceremony checks again that the caller presents the pinned certificate, creates the Root key (inside the TPM on a `tpm` node), and self-signs the Root certificate with it. Each step is covered in [The ceremony, step by step](./ceremony-walkthrough.md), and the key itself in [How keys never leave the TPM](./keys-never-leave-tpm.md).

The Root certificate is built by `ca.SelfSignRoot` with Go's `crypto/x509`: issuer equals subject, `cA=true` with no path length limit, key usage `keyCertSign` and `cRLSign` only, no extended key usage, no subject alternative name, and a subject key identifier that the code computes as the SHA-1 of the public key bits (RFC 5280 §4.2.1.2 method 1). `notBefore` is backdated five minutes for clock skew. The full profile is in the [Root certificate profile](../reference/root-cert-profile.md).

## Step 7: the world trusts the Root

A self-signed Root proves nothing about itself: anyone can make a certificate that signs itself. Trust in it comes from how you carry it to relying parties, and from checking that the certificate you carry is the one this node made.

The ceremony stream prints `CERT_SIGNED cert_sha256=<hex>`, the SHA-256 of the new Root's DER. `cryptosctl identity show` prints the same value as `SHA-256:`. Record it during the ceremony and compare it with the file you distribute.

:::caution[`identity validate` does not prove the Root is yours]
`cryptosctl identity validate` checks that the chain the node returns verifies against its own last certificate. For a Root that's a self-consistency check: any self-signed CA certificate passes it. Compare the SHA-256 with the value from the ceremony stream to tie the certificate to this node.
:::

## Where it falls short

These are the places where the alpha is short of the design. Each one is traceable to the code listed below. For what is planned and when, see [Project status and roadmap](../introduction/status-roadmap.md).

| Design goal | What the alpha does |
|---|---|
| The bootstrap certificate is single-use: during the ceremony the operator enrolls a long-term admin certificate and the bootstrap certificate is revoked. | Not built. The streaming RPC has no channel for the operator to send a CSR, so the ceremony promotes the bootstrap certificate to be the steady-state admin (`ADMIN_ROTATED` carries its own SHA-256). The listener keeps trusting the certificate from `bootstrap.admin_cert_pem`, and it stays the only admin. |
| M-of-N administrator quorum for Root operations. | Not built. One certificate authorizes everything. |
| The node proves to you that it runs on a genuine TPM (EK certificate, attestation quote over PCRs). | Not built. The ceremony returns the TPM creation data for the key, but no endorsement key certificate or quote, and `cryptosctl` doesn't check it. The `Attest` RPC used by the Fleet Manager is a signature by the CA key over a nonce, not a TPM quote. |
| No unauthenticated path to change a node. | Maintenance mode, before install, has none of the protections above (Step 3). |
| The management listener presents a certificate from the node's CA. | The listener presents a new self-signed certificate on every boot, pinned by fingerprint (Step 5). |

## Where this lives in the code

All paths are in [CryptOS-PKI/cryptos](https://github.com/CryptOS-PKI/cryptos) on `main`.

| Step | Code |
|---|---|
| Bootstrap credential | `cmd/cryptosctl/bootstrap.go` (`generateBootstrapCredential`) |
| Loading and pinning the admin | `internal/bootstrap/bootstrap.go` (`LoadTrust`, `VerifyPeerCertificate`, `ClientCAPool`) |
| Maintenance mode TLS | `internal/init/servertls.go` (`MaintenanceServerTLSConfig`), `internal/grpc/server.go` (`NewMaintenance`), `cmd/cryptosctl/client.go` (`insecureClientTLSConfig`) |
| Management listener | `internal/init/servertls.go` (`GenerateServerCert`, `ServerTLSConfig`, `PublishManagementCert`), `internal/init/run.go` step 12 |
| Admin check per RPC | `internal/grpc/authz.go` (`AuthorizeAdmin`) |
| Local socket | `internal/grpc/server.go` (`NewLocal`), `internal/init/boot.go` (`LocalSocketPath`) |
| Pin fetch | `cmd/cryptosctl/trust.go` (`trust fetch`) |
| Root self-sign | `internal/ceremony/ceremony.go` (`Start`), `internal/ca/ca.go` (`SelfSignRoot`) |
| Chain check | `cmd/cryptosctl/identity.go` (`validateChain`) |
