---
title: "📤 Apply config"
---

# 📤 Apply config

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Push a machine config to a node.

Everything a CryptOS node does comes from one YAML file, its **machine config**. There is no setting you change by hand on the node. To change something, you fetch the node's current config, edit the file, and send the whole file back. The node checks it, saves it, and tells you whether the change needs a reboot.

This page is for a node that is already installed. Sending a config to a node in maintenance mode installs it instead; that is covered in [Bootstrap and apply config](../install-deploy/bootstrap-apply.md).

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::info[Before you start]
- `cryptosctl` set up to reach the node, with a fresh pin: [Setup](./setup.md).
- The node's CA common name, if the change needs a reboot.
:::

## 1. Get the current config

```bash
cryptosctl --endpoint 192.0.2.10:443 config get > node.yaml
```

This writes the config the node holds now, in the same YAML format `config apply` takes. Start from this file rather than from an old copy: it is what the node really runs.

:::info[acme and est are not included]
The `acme` and `est` sections are left out of `config get`, because they hold secrets. The node keeps its own copy of them when you apply the edited file, so leaving them out does not turn those protocols off.
:::

## 2. Edit the file

Change only what you mean to. The fields are described in the [machine config reference](../reference/machine-config.md).

:::caution[apply replaces the whole config]
The node stores the file you send as its entire config, not as a patch. A section you delete from the file is gone from the node at the next reboot. Always edit the output of `config get`, never a partial file.
:::

:::caution[acme and est cannot be changed this way]
The API does not carry the `acme` and `est` sections yet, so `cryptosctl` does not send them even when they are in your file. The node keeps what it already has. Changing ACME or EST settings through `config apply` does not work today.
:::

## 3. Send it

:::danger[allow_unverified_revocation_url cannot be undone]
If the file turns on `pki.allow_unverified_revocation_url`, the node issues certificates whose revocation addresses were never checked, and every certificate issued while it is set keeps that address for good. On a Root that includes every subordinate CA it signs. `cryptosctl` stops and asks first: on a Root you type the Root's common name, on other roles `yes`. Leave it off and fix the revocation address instead.
:::

```bash
cryptosctl --endpoint 192.0.2.10:443 config apply -f node.yaml
```

:::tip[Expected output]
The node saved the config.

```text
applied: generation=4 requires_reboot=true digest=<sha256 of the saved config>
```

- `generation` goes up by one every time a config is saved on the node.
- `requires_reboot` says whether the change waits for a reboot (step 4).
- `digest` is the SHA-256 of the config as the node stored it.
:::

`cryptosctl` checks the file before it sends anything, and refuses unknown field names, so a typo fails on your workstation:

:::tip[Expected output]
A check that fails on your workstation names the field, and nothing is sent. For example:

```text
cryptosctl: config: bootstrap.admin_cert_sha256: must be 64 hex characters, got 3
```

The node checks the file again. If it refuses it, the error reads `rpc error: code = InvalidArgument desc = node: Apply: ...` and nothing is saved: the node keeps its old config and generation.
:::

### Warnings

Some problems don't stop the apply but are printed as `WARNING:` lines before the `applied:` line:

- **A certificate profile that outlives the CA.** `profile "<name>": validity_days <n> runs past this CA's notAfter <date>; its certificates will be capped to that date`. With `validity_policy: reject` on that profile, issuance from it is refused instead. See [certificate profiles](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/certificate-profiles.md) in the `cryptos` repository.
- **A revocation host with no DNS servers.** When `pki.revocation_base_url` names a host and `network.nameservers` is empty, the node can resolve it only if its DHCP lease gave it DNS servers. If it can't, the revocation check fails and the node refuses all issuance. Set `network.nameservers`.

## 4. Reboot if it asks for one

Only two kinds of change take effect straight away: the certificate profiles (`pki.profiles`) and `pki.root_leaf_issuance`. The node signs with the new values from the next request, and the apply reports `requires_reboot=false`.

Every other change is saved but waits for the next boot, and the apply reports `requires_reboot=true`. Until you reboot, the node keeps running the old values.

:::warning[A reboot takes the CA offline]
While the node restarts it signs nothing and answers nothing, including its revocation addresses. Pick a quiet moment. `--confirm` must be the node's CA common name.
:::

```bash
cryptosctl --endpoint 192.0.2.10:443 reboot --confirm "Example Root CA G1"
```

:::tip[Expected output]
The node accepted the reboot and is shutting down in order.

```text
reboot accepted: the node is shutting down cleanly and rebooting
```
:::

After the reboot the node has a new management certificate, so fetch the pin again ([Setup](./setup.md)). If you changed `network.address`, the node comes back on the new address: fetch the pin from there.

## 5. Check the change

```bash
cryptosctl --endpoint 192.0.2.10:443 status
cryptosctl --endpoint 192.0.2.10:443 config get
```

:::tip[Expected output]
`status` shows a healthy node (see [Check status](./status.md)), and `config get` shows your change.
:::

If the node does not come back, look at its console: a boot step that fails restarts the node, so a config the node can't boot with shows up there.

## Next step

[Check status](./status.md) to confirm the node is healthy, or see the full `config` flags in the [cryptosctl command reference](../reference/cryptosctl.md).
