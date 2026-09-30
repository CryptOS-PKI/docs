---
title: "🔒 Immutable, and why there is no login"
---

# 🔒 Immutable, and why there is no login

Why you cannot log in, and why the running system cannot be changed.

## There is nothing to log in to

A CryptOS node has no SSH server, no login prompt, no shell and no user accounts. This is not a setting that is switched off. The programs are not in the image:

- The image build refuses to finish if a shell or login program ends up in the root filesystem. It checks for `sh`, `bash`, `dash`, `ash`, `busybox`, `getty`, `agetty` and `login`.
- PID 1, the first program the kernel starts, is CryptOS's own Go program. It brings the node up, supervises it and serves the API. There is no service manager and no second way in.
- The image ships no guest tools and no web interface.

What the root filesystem does hold is short: the CryptOS init program, `cryptosctl`, the console dashboard, and four static disk tools the installer needs (`cryptsetup`, `mkfs.ext4`, `sgdisk` and `mkfs.vfat`).

Every way into a computer is also a way in for an attacker. A CA's private key is worth more than almost anything else on a network, so CryptOS removes the doors instead of guarding them.

## How you manage it instead

A node has exactly two management surfaces, and both use the same API:

- **`cryptosctl`**, the command-line tool you run on your own workstation. It talks to the node's API on port 443 over TLS 1.3 with **mutual TLS**: the node checks your client certificate on every connection and refuses one it does not trust.
- **The [Fleet Manager](../fleet-manager/overview.md)**, a separate web app that manages many nodes through that same API.

Every call is checked against who you are and written to the node's hash-chained audit log, so each entry depends on the one before it and a quiet edit would show.

The one exception is [maintenance mode](./maintenance-mode.md), before a node is installed. It has no administrator yet, so its limited API accepts any client until it receives its first config.

## The console

The node's screen shows a status dashboard, not a prompt: the CA's name labelled by role, its issuer, the node's state, the Fleet Manager link, the TPM state, uptime, and the SHA-256 fingerprint of the node's management certificate. The dashboard reads its data from a local socket on the node (`/run/cryptos.sock`) that only processes on the node can reach.

The keyboard does two things:

- **Ctrl-R** starts a [reset](./maintenance-mode.md#re-provisioning-after-a-reset), which asks you to type the CA's common name before it erases anything.
- **Ctrl-Alt-Del** reboots the node through its orderly shutdown.

## The system cannot change while it runs

The whole operating system is one signed file, a **Unified Kernel Image (UKI)**: the kernel, a small starter program, the root filesystem and the kernel command line bundled together. At boot:

1. The firmware starts the UKI. With Secure Boot on, the firmware checks its signature first.
2. The starter program mounts the root filesystem, a compressed **SquashFS** image held in memory, **read-only**, and hands over to the CryptOS init program.
3. Nothing in the running system can write to that filesystem. Even `/etc` is read-only. The one file that must change at boot, the DNS resolver list, is a link into `/run`, which lives in memory and is rebuilt on every boot.

The kernel is locked down as well. It runs in `lockdown=confidentiality` mode, which blocks the ways a privileged process could read or change kernel memory, and it is built with no loadable modules: every driver is compiled in, so no new kernel code can be added at runtime.

## Where state lives

A CA has to remember things: its key, its certificates, what it has issued and revoked, its config and its audit log. All of that lives in exactly one place, the encrypted **state partition**, mounted at `/var/lib/cryptos`. It is unlocked at boot with a key the node protects itself. [The TPM and sealed keys](./tpm-sealed-keys.md) explains how.

So a node has two parts: an image that never changes and can be replaced, and a state partition that holds everything about this CA.

## Failing closed

If any step of bringing the node up fails, the node does not drop to a recovery shell, because there is none. It reboots and tries again, and the console marks the step that failed. A node that cannot come up safely does not come up.

## How a node does change

Since nothing changes at runtime, every change is a new input and, usually, a reboot:

- **Configuration** changes go through the API as a new machine config. Most take effect on the next boot. See [Declarative config (machine.yaml)](./declarative-config.md).
- **Software** changes replace the whole image. `cryptosctl image stage` uploads a new signed image, `cryptosctl image activate` reboots into it, and `cryptosctl image rollback` puts the previous one back. The state partition is not touched. See [Platform profiles and the image factory](./image-factory.md#upgrading-in-place).

:::caution[A reboot is an outage]
Every reboot takes the CA offline until it is back up. In the reference deployment an in-place upgrade took about 8 to 11 seconds of downtime per node. Plan reboots like any other CA maintenance.
:::

## The management certificate changes on every boot

The node's own TLS certificate for the management API is self-signed and made fresh on every boot. `cryptosctl` pins it with `--trust`, so after a reboot the old pin no longer matches. Fetch the new one and check it against the fingerprint on the console:

```bash
cryptosctl --endpoint 192.0.2.10:443 trust fetch --expect-sha256 <fingerprint from the console>
```

`cryptosctl` runs on Linux and macOS today. A Windows build is coming.

:::caution[Check the fingerprint before you trust it]
With `--expect-sha256`, `trust fetch` refuses any certificate that does not match. Without it, it saves whatever certificate it is handed. Always pass it, and read the fingerprint from the node's console, not from the network, so that nobody in between can hand you their own certificate.
:::

## What is not built yet

:::info[Planned]
**Extensions**: signed add-ons such as hypervisor guest agents or extra hardware drivers, overlaid on the read-only image and measured into the TPM. Until they land, the image is exactly what was built, with nothing added at boot.
:::
