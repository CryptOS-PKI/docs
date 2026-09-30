---
title: "🏛️ CA roles: Root, Intermediate, Issuing"
---

# 🏛️ CA roles: Root, Intermediate, Issuing

:::tip[Works today]
Root, Intermediate and Issuing are all in the alpha. A two-tier hierarchy (a Root plus an Intermediate, both RSA-4096 on VMware) runs today, with leaf issuance from the Intermediate and a VMware VMCA signed by that Intermediate as a subordinate CA.
:::

The three kinds of CA node and how they stack. If the terms are new, read [The Root CA and the chain of trust](./chain-of-trust.md) first.

## One image, three roles

There is one CryptOS image. What a node becomes is decided by one field in its [machine config](./declarative-config.md):

```yaml
role:
  kind: root   # or: intermediate, issuing
```

Any other value is rejected when the config is validated. The role is read at boot, so choose it before the node's first boot. A node's CA identity is created for the role it booted with.

Every CA node, whatever its role, generates its own CA key on its own box and never hands it to another node. Only CSRs and signed certificates travel between nodes.

## Root

A `root` node is the top of a tree. Its certificate is self-signed during the **first-boot ceremony** (`cryptosctl ceremony start`), which creates the key, signs the Root certificate and commits the node's identity in one step. [The first-boot ceremony](../using/ceremony-start.md) walks through it.

Config fields that only matter on a Root:

- `pki.root_validity_years`: the Root certificate's lifetime, from 1 to 30 years. Required on a Root.
- `pki.parent` must be absent. A Root has no issuer to pin.

The Root certificate carries no path length limit. Per RFC 5280 the depth of the tree is bounded at the CAs below it instead.

### A Root does not issue leaves

A Root signs CA certificates. By default it refuses to sign a leaf certificate:

```text
node: a ROOT node refuses to issue leaf certificates without the irreversible acknowledgement
```

A Root that has signed a leaf can no longer claim it only ever signed CAs, so turning this on is a one-way decision.

:::danger[Leaf issuance from a Root cannot be taken back]
Setting `pki.root_leaf_issuance: acknowledged-irreversible` lets the Root sign leaves directly. Every leaf it signs stays signed by the Root for its whole lifetime. Leave it unset and issue leaves from an Intermediate or Issuing CA instead.
:::

## Intermediate and Issuing

`intermediate` and `issuing` nodes are **subordinate** CAs: their certificate is signed by a parent CA, which can be a Root or another Intermediate.

A subordinate needs one extra field, the parent it trusts:

```yaml
pki:
  parent:
    ca_cert_sha256: "<64 hex characters>"   # or ca_cert_pem: the parent's CA certificate
```

Exactly one of `ca_cert_pem` or `ca_cert_sha256` must be set. The node uses this pin to check the chain it is handed back, and refuses a chain that does not lead to that parent.

### How a subordinate gets its certificate

1. **First boot on the child.** The node creates its CA key and a CSR for the subject in `pki.root_subject`, then waits in the awaiting-certificate state.
2. **Fetch the CSR** from the child with `cryptosctl ca get-subordinate-csr`.
3. **Sign it on the parent** with `cryptosctl ca sign-subordinate --csr <file> --profile <name>`. The profile must be a CA profile (`basic_constraints.is_ca: true`), and it decides the child's validity, key usage and path length.
4. **Hand the chain back** to the child with `cryptosctl ca submit-subordinate-cert --chain <file>`. The child checks it against `pki.parent` and against its own key, then commits its identity.

The operator carries the files between the two nodes, so the parent never needs a network path to the child. That is what lets a Root stay offline.

### What the parent decides

The parent stamps the child's certificate from its own profile, and two limits always apply:

- **Validity.** A child certificate never runs past the parent's own `notAfter`. With `validity_policy: cap` (the default) it is shortened to fit and `cryptosctl` prints a warning; with `validity_policy: reject` the parent refuses to sign. `root_validity_years` is not used on a subordinate.
- **Path length.** The profile's `path_len` is clamped to what the parent's own certificate allows. A parent with a path length of `N` can give a child at most `N-1`.

### Intermediate or Issuing?

On the node the two roles behave the same: both can sign subordinate CSRs and both issue leaves. The label records where the node sits in your design, and the console and `cryptosctl status` show it. What actually stops an Issuing CA from having CA children is the path length its parent gave it: sign it with a profile that sets `path_len: 0` and any CA certificate it signed would fail path validation.

A common two-tier layout:

| Node | `role.kind` | Signed by | Profile it was signed under | Issues |
|---|---|---|---|---|
| Root | `root` | itself | none (self-signed) | CA certificates only |
| Issuing CA | `issuing` | the Root | a CA profile with `path_len: 0` | leaves |

Add an `intermediate` in between (signed with `path_len: 1` or more) when you need more than one level of CAs under the Root.

## A platform CA as a subordinate

The CA below a CryptOS node does not have to be CryptOS. Any CA that can produce a CSR can be signed with `ca sign-subordinate`, and its certificate then chains to your CryptOS Root.

This runs today with VMware's built-in CA, VMCA, as a subordinate of a CryptOS Intermediate:

```text
Example Root CA G1               CryptOS Root, role root
└── Example Intermediate CA G1   CryptOS Intermediate, role intermediate, pathlen:1
    └── Example vSphere CA       VMCA, signed under a CA profile with path_len: 0
        ├── vCenter certificates
        └── ESXi host certificates
```

VMCA keeps issuing certificates for vCenter and the ESXi hosts, and clients only need the CryptOS Root to trust them. vSphere accepts only SHA-2 RSA signatures on that chain, so both CryptOS nodes hold RSA keys. [vSphere: subordinate VMCA to a CryptOS Intermediate](../integrations/vmware-vmca/index.md) is the step-by-step procedure.

## Where leaves come from

A subordinate issues leaf certificates from leaf profiles (`is_ca: false`) in its machine config:

- `cryptosctl ca issue-leaf --csr <file> --profile <name>` for a one-off certificate;
- the ACME (RFC 8555) and EST (RFC 7030) endpoints, when they are turned on in `pki.acme` or `pki.est`.

SCEP and WSTEP are not available.

## Key algorithms

`pki.root_key_alg` sets the node's own CA key: `ECDSA-P384`, `RSA-3072` or `RSA-4096`. Despite the name, it applies to every role. The CA key also decides the signature algorithm on everything the node signs, so a platform that only accepts RSA signatures needs an RSA key at every level of its chain.

:::caution[RSA CA keys are not held in the TPM]
The TPM backend creates ECDSA P-384 keys only. An RSA CA key needs a software state-key mode, where the key is kept on the encrypted state partition instead of inside the TPM. [The TPM and sealed keys](./tpm-sealed-keys.md) explains the difference.
:::

## What is not available today

- A Root has no hardware presence check before its key unseals.
- One admin certificate authorizes every operation, Root operations included. There is no multi-person quorum.
- Each CA runs on a single node. There are no HA pairs.
- Roots are not cross-signed. Each Root is its own tree.

## Next

- [Declarative config (machine.yaml)](./declarative-config.md): where the role and profiles are set.
- [Machine config schema](../reference/machine-config.md): every field.
