---
title: "▶️ Start the ceremony"
---

# ▶️ Start the ceremony

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Kick off the first-boot Root ceremony from your workstation.

The **first-boot ceremony** is how a Root CA node gets its identity. In one run the node creates its CA key (inside the TPM on a TPM node), signs its own Root certificate with it, writes a signed **ceremony manifest** that records what happened, and makes your bootstrap identity its standing administrator. It happens once per node, and only on a Root.

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::info[Before you start]
- A node installed with `role.kind: root` and booted from its disk. See [Reboot into the ceremony](../install-deploy/reboot-ceremony.md) for the first boot.
- `cryptosctl` set up to reach it, with a fresh pin of its management certificate: [Setup](./setup.md).
- The bootstrap identity named in the node's machine config: [Make your admin identity](./bootstrap.md).
- The machine config file you installed the node with, for example `root.yaml`.
:::

## 1. Check the node is ready

```bash
cryptosctl --endpoint 192.0.2.10:443 status
```

:::tip[Expected output]
`Role: ROOT` and `Identity: NONE` mean the node is installed and waiting for its ceremony.

```text
Role:            ROOT
Identity:        NONE
TPM:             OK
etcd:            OK
...
```

`Identity: ESTABLISHED` means the ceremony already ran; there is nothing to do here. `Role: INTERMEDIATE` or `ISSUING` means this is a subordinate, which never runs this ceremony: its parent signs it instead (see [Subordinate nodes](../install-deploy/reboot-ceremony.md)). `TPM: UNAVAILABLE` is expected on a `nodeid` image, where the CA key is kept in software instead of a TPM. The other lines are explained in [Check status](./status.md).
:::

## 2. Check the config you will send

The ceremony takes the machine config in the request. It reads the Root's name, key type and lifetime from it, and it **saves the file as the node's config**, in place of the one the node was installed with.

:::caution[Send the same file you installed with]
Whatever you send becomes the node's config. A different `network.address`, a different `bootstrap` certificate or a missing section takes effect at the next reboot. Use the exact file you installed the node with, and change only what you mean to.
:::

Check these fields in particular, because the ceremony fixes them into the Root certificate:

| Field | What it sets |
|---|---|
| `pki.root_subject` | the Root certificate's name; `common_name` is required |
| `pki.root_key_alg` | the key type: `ECDSA-P384`, `RSA-3072` or `RSA-4096` |
| `pki.root_validity_years` | how long the Root certificate lasts, 1 to 30 years |

The fields are described in the [machine config reference](../reference/machine-config.md).

:::danger[The ceremony runs once]
After it succeeds, the Root's name, key and lifetime cannot be changed. Running it again fails with `IDENTITY_EXISTS`. The only way to start over is `cryptosctl reset`, which erases the node's key material and reboots it into maintenance mode. Check `root.yaml` before you go on.
:::

## 3. Run the ceremony

```bash
cryptosctl --endpoint 192.0.2.10:443 ceremony start --config root.yaml
```

:::tip[Expected output]
Each line is a step of the ceremony as it finishes. `COMPLETE` means the Root exists.

```text
KEY_CREATED      tpm_public=<size> bytes
CERT_SIGNED      cert_sha256=<SHA-256 of the new Root certificate>
MANIFEST_WRITTEN manifest_id=<ceremony ID>
ADMIN_ROTATED    admin_cert_sha256=<SHA-256 of your bootstrap certificate>
COMPLETE
```

Write down the `cert_sha256` value. It is the fingerprint of the new Root certificate, and you check it against the certificate in step 4.
:::

What the node does, in order:

1. checks that the client certificate you connected with is the bootstrap admin in its config;
2. checks that no identity exists yet and that the config's role is `root`;
3. saves the config and creates the CA key;
4. self-signs the Root certificate with that key;
5. writes and signs the ceremony manifest;
6. records your bootstrap identity as the node's administrator.

Only one ceremony can run at a time.

### If it fails

The error comes back as `cryptosctl: rpc error: code = <code> desc = <message>`. The common ones:

| Message | Cause | What to do |
|---|---|---|
| `IDENTITY_EXISTS` | the node already has its identity | nothing; [check it](./identity.md) instead |
| `ceremony already in progress` | another ceremony is running on this node | wait for it to finish, then check `status` |
| `first-boot-root ceremony requires role "root", got ...` | the config you sent is not for a Root | send the Root's config; a subordinate is signed by its parent |
| `ceremony: client certificate is not the authorized bootstrap admin` | you connected with a different identity than the one in the config | use the matching `--identity` and `--identity-key` |
| `ceremony: config: ...` | the file failed the config checks | fix the field it names and run it again |
| `not available in maintenance mode` | the node has not been installed yet | [install it first](../install-deploy/bootstrap-apply.md) |

The node refuses a second run only once an identity exists, so after a failure that stopped before `COMPLETE` you can fix the cause and run the same command again.

## 4. Check the Root

```bash
cryptosctl --endpoint 192.0.2.10:443 status
cryptosctl --endpoint 192.0.2.10:443 identity show
```

:::tip[Expected output]
`status` now reads `Identity: ESTABLISHED`. `identity show` describes the Root certificate:

```text
Subject:      CN=Example Root CA G1,O=Example Org,C=US
Issuer:       CN=Example Root CA G1,O=Example Org,C=US
Serial:       <serial in hex>
NotBefore:    <the ceremony time>
NotAfter:     <the ceremony time plus root_validity_years>
IsCA:         true
SHA-256:      <the cert_sha256 from step 3>
Chain length: 1
```

Subject and issuer are the same because a Root signs itself. If `SHA-256` does not match the `cert_sha256` the ceremony printed, stop: you are not looking at the certificate the ceremony made.
:::

Then publish the Root certificate to the systems that should trust it: [Show and validate identity](./identity.md).

## Next step

[Show and validate identity](./identity.md), then keep an eye on the node with [Check status](./status.md).
