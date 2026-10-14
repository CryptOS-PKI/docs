---
title: "🔄 Upgrade a node in place"
---

import Pre10Notice from '@site/docs/_partials/pre-1-0-notice.mdx';

# 🔄 Upgrade a node in place

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

<Pre10Notice />

A CryptOS node can take a new OS image without being re-provisioned. That matters because re-provisioning reformats the state partition and destroys the CA key with it -- on an established node that means re-issuing every certificate it ever signed.

This page is the short version. The full guide, with the TPM PCR mechanics and every edge case, is [Upgrading a CryptOS node in place](https://github.com/CryptOS-PKI/cryptos-appliance/blob/main/docs/image-upgrade.md) in the `cryptos-appliance` repository.

## Why it works

The root filesystem is an immutable SquashFS carried inside a Unified Kernel Image (UKI) on the EFI System Partition. Identity -- the CA key, etcd, issued history -- lives on a separate encrypted partition. **An upgrade writes the ESP and reboots. The state partition is never opened.**

A node accepts a new image only if its detached signature verifies against the anchor compiled into the image it is **running** -- the same key you signed that image with. Build every later image with that key; see [Secure Boot enrollment](./secure-boot.md).

## What you need

- A new signed image, built the same way as the running one: `cryptos-amd64.uki` and its detached signature, `cryptos-amd64.uki.sig`, from [Build a bootable image](./build-bootable-image.md).
- An admin credential for the node, and a maintenance window for the activation step only -- staging is not disruptive.

## 1. See where the node is

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem image status
```

:::tip[Expected output]
```text
Running version:  v0.1.0
Running image:    9f2c...
Next boot image:  9f2c...
Previous image:   (none retained)
Reboot pending:   no
```
`Running image` and `Next boot image` match when nothing is staged.
:::

## 2. Stage the new image

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem image stage \
  --image build/out/cryptos-amd64.uki
```

This is the long step -- the image is a few hundred megabytes -- and it is **not** disruptive. The node keeps serving throughout and verifies the signature before anything reaches the ESP, so a bad upload costs you only the transfer.

:::caution[A TPM node running a pre-reseal image can't be upgraded in place]
Staging reseals the state key for the incoming image. If the running image predates that reseal, the stage is refused; reinstall such a node instead. See [TPM-backed nodes](https://github.com/CryptOS-PKI/cryptos-appliance/blob/main/docs/image-upgrade.md#tpm-backed-nodes) in the full guide.
:::

## 3. Activate, in the maintenance window

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem image activate \
  --confirm "Example Root CA G1"
```

`--confirm` is the node's CA common name, the same echo the reset verbs require. This reboots the node through its orderly shutdown: every certificate operation that depends on it is unavailable until it comes back.

:::danger[An image that fails to boot at all isn't recoverable over the network]
The retained image is bootable, but selecting it means reaching the node, which is the thing that's down. Test a new image on a non-production node first.
:::

The node comes back with a new management certificate. A trust file holding your root still verifies it; a pinned certificate does not, so re-check with `image status`:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem image status
```

`Running version` should be the new one, the two digests should agree, and `Previous image` should name the image you upgraded from.

## 4. If it goes badly

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem image rollback
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem image activate \
  --confirm "Example Root CA G1"
```

The previous image is retained on the ESP and stays bootable, so a failed upgrade is recoverable over the network -- unless the new image won't boot at all, which needs console access instead.

## Limits worth knowing

- **An upgrade is not a re-key.** The CA key, the issued inventory and the node's configuration all survive untouched.
- **Only one previous image is retained.** Two upgrades in a row leave you able to roll back one.
- **An unsigned build has no anchor.** It serves the upgrade RPCs as `Unimplemented`; such a node is upgraded by reinstalling it. See [Build an unsigned ISO](./build-bootable-image.md#build-an-unsigned-iso-for-evaluation).
