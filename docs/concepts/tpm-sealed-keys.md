---
title: "🔑 The TPM and sealed keys"
---

# 🔑 The TPM and sealed keys

How the private key is locked inside a hardware chip and never written to disk in the clear.

## What a TPM is

A **TPM** (Trusted Platform Module, version 2.0) is a small security chip on the motherboard, or a virtual one (a **vTPM**) that a hypervisor such as VMware gives a VM. It can do three things that matter here:

- **Make keys that cannot leave it.** A key created inside the TPM can be used for signing, but the TPM never hands out the private part.
- **Seal data.** It can encrypt a small secret so that only this TPM can decrypt it, and only while the machine is in a stated condition.
- **Measure what booted.** While the machine starts, each boot stage records a hash of the next one into the TPM's **PCRs** (Platform Configuration Registers). A PCR can only be extended, never set, so its value is a fingerprint of everything that ran.

## Two secrets, two protections

A CryptOS node guards two secrets:

1. **The state key**, which unlocks the encrypted state partition where the node keeps its config, certificates, issued history and audit log.
2. **The CA private key**, which signs certificates.

How each one is protected depends on the node's **state-key mode**. The default image uses the TPM for both.

## TPM mode (the default)

### The state key is sealed to the boot

On first boot the node makes a random state key, formats the state partition as an encrypted LUKS2 volume with it, and then **seals** the key to the TPM under a policy over two PCRs:

- **PCR 7**: the Secure Boot policy, meaning whether Secure Boot is on and which keys the firmware trusts.
- **PCR 11**: the measurement of the CryptOS image (the UKI) that booted.

Only the sealed copy is kept, in the LUKS2 header. On every later boot the TPM unseals the key only if both PCRs hold the same values as when it was sealed. Boot something else, or change the Secure Boot policy, and the TPM refuses: the disk stays locked. PCRs 0, 2 and 4, which change with firmware updates, are left out on purpose so a firmware update does not lock the disk.

:::caution[Changing Secure Boot settings after install locks the state partition]
PCR 7 records the firmware's Secure Boot state and its key databases. Turning Secure Boot on or off, or changing the enrolled keys, after a node is installed changes PCR 7, and the node can no longer unseal its state key. Decide on Secure Boot before the node's first boot. See [Secure Boot](../install-deploy/secure-boot.md).
:::

Because PCR 11 measures the image, every new image changes it. Before an in-place upgrade writes a new image, the node seals a copy of the same state key for each image that will be bootable afterwards (the running one, the new one, and the one kept for rollback) and then drops older copies. It first checks its prediction for the running image against the PCR 11 value the TPM holds right now, and refuses the upgrade if they differ, rather than risk a node that cannot unlock its disk.

### The CA key never leaves the TPM

The CA key is created **inside** the TPM, under the TPM's storage root key, marked as fixed to this TPM. What the node stores on its state partition is the TPM's wrapped copy, which is useless without this TPM. When the node signs a certificate, the TPM does the signing, and the private key never exists in the node's memory.

Consequences:

- The node's TPM must support ECDSA on the P-384 curve. If it does not, the node refuses to boot rather than fall back to a weaker key.
- The key cannot be exported. `cryptosctl ca export-key` is refused on a TPM-mode node with `this node's CA key is non-exportable (TPM-backed)`.
- The first-boot ceremony records the TPM's creation evidence for the key in the signed Ceremony Manifest, so you can later show where the key was made.

[Keys that never leave the TPM](../deep-dives/keys-never-leave-tpm.md) goes deeper into the TPM calls.

:::danger[A TPM-mode CA key has no backup]
If the TPM or its vTPM state is lost (the VM's vTPM is removed, the VM is re-created, or the motherboard is replaced), the CA key is gone. There is no export to restore from. Certificates it signed stay valid, but nothing can renew or revoke them. Protect the VM and its vTPM state, and keep your hierarchy able to replace a subordinate CA.
:::

:::caution[RSA CA keys are not supported in TPM mode yet]
The TPM backend creates ECDSA P-384 keys only. A node whose `pki.root_key_alg` is `RSA-3072` or `RSA-4096` needs one of the software-backed modes below.
:::

## Software-backed modes

For hosts that cannot give the VM a TPM, and for RSA CA keys, two other modes exist. In both, the CA key is generated in software and stored on the encrypted state partition. It is protected by the disk encryption, not by hardware, and it **can** be exported with `cryptosctl ca export-key` into a passphrase-protected backup.

### nodeid

Built into an image with `STATEKEY=nodeid`. There is no TPM at all. The state key is derived from the VM's SMBIOS product UUID.

:::danger[nodeid is for development only]
A VM's UUID is not secret. Anyone who has both the disk image and the UUID can derive the state key, open the partition and read the CA key. `cryptosctl status` reports `TPM: UNAVAILABLE` on such a node so the weaker protection is never hidden. Use `nodeid` to try CryptOS where there is no vTPM, never for a CA that guards real trust.
:::

### kms

Set with `state_key.mode: kms` and `state_key.kms.endpoint` (plus an optional `trust_pem` to pin the KMS server's certificate). The node makes a random state key and has an external key management service encrypt it. Only the encrypted copy and the KMS address are stored in the LUKS2 header, and every boot asks the KMS to decrypt it. The machine config is only read for this on first boot.

With `kms`, the node cannot unlock its disk while the KMS is unreachable.

:::caution[kms has not been through a tested deployment]
The `kms` mode is in the code, but no reference deployment has run it, and the image build has no `kms` default (`STATEKEY` takes only `tpm` or `nodeid`). Treat it as experimental.
:::

## Choosing a mode

| Mode | State key protected by | CA key held in | Exportable | Key algorithms |
|---|---|---|---|---|
| `tpm` (default) | TPM, sealed to PCR 7 and 11 | the TPM | no | ECDSA-P384 |
| `kms` | an external KMS | encrypted state partition | yes | ECDSA-P384, RSA-3072, RSA-4096 |
| `nodeid` | the VM's UUID (not secret) | encrypted state partition | yes | ECDSA-P384, RSA-3072, RSA-4096 |

`state_key.mode` left empty means the image's build-time default: `tpm`, or `nodeid` for an image built with `STATEKEY=nodeid`.

:::caution[Match state_key.mode to the image]
The node reads `state_key.mode` from the staged config on its first boot only. On every later boot the staged config is gone and the node uses the image's build-time default. Leave `state_key.mode` empty, or set it to the mode the image was built for, so that every boot unlocks the disk the same way.
:::

## What is not built yet

:::info[Planned]
- **RSA keys inside the TPM.** Today an RSA CA needs a software-backed mode.
- **HA key sharing.** For a two-node pair, the standby will hold a copy of the CA key duplicated from the primary's TPM into its own, under a PCR policy, so either node can sign without the key ever being in the clear.
- **Hardware presence check** before a Root key is unsealed.
:::
