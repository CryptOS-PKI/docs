---
title: "🔧 Boot and maintenance mode"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🔧 Boot and maintenance mode

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

The first time a machine boots the CryptOS ISO, nothing is installed yet. The node notices this and starts in **maintenance mode**: a small, temporary service that waits for you to send it a machine config. There is no installer menu and no login prompt. Everything happens over the network with `cryptosctl`.

## Prepare the machine

- **UEFI firmware.** The ISO boots only through UEFI; it has no legacy BIOS boot entry.
- **Secure Boot.** Turn it off for an unsigned image. For a signed image, enroll your certificate first ([Secure Boot enrollment](./secure-boot.md)).
- **A TPM**, for a TPM-backed image. On vSphere, add a vTPM to the VM (this needs a key provider). If you cannot, use the `STATEKEY=nodeid` image instead ([Build a bootable image](./build-bootable-image.md)).
- **A disk to install to.** The install erases it completely.
- **A network with DHCP.** In maintenance mode the node takes its address from DHCP.

:::danger[Decide on Secure Boot before the install]
On a TPM node, changing Secure Boot afterwards locks the node out of its own disk. Set it on or off now and leave it that way.
:::

:::danger[Use a trusted, isolated network]
Maintenance mode accepts connections **without any authentication**. Whoever reaches the node first can send it a config, erase its disk and take it over. Boot a maintenance node only on a provisioning network you control, and finish the install before you move it anywhere else.
:::

## What happens at boot

1. The node looks for a disk partition named `cryptos-state`. On a brand-new machine there is none, so it goes into maintenance mode. This check runs before the TPM is touched, so a machine without a TPM still reaches maintenance mode cleanly.
2. The kernel has already asked DHCP for an address (the image boots with `ip=dhcp`).
3. The node opens its management API on **port 443**. It uses a fresh, self-signed certificate that names only `localhost`, and it does **not** ask the client for a certificate.
4. The console shows **Awaiting configuration** and **MAINTENANCE MODE**, the node's address under **Address**, and the SHA-256 of the certificate it presents under **Mgmt SHA-256**:

   ```text
   Awaiting configuration

   Run: cryptosctl config apply

   Address        192.0.2.50
   Mgmt SHA-256   2D71 1642 B726 B044 0162 7CA9 FBAC 32F5
                  C853 0FB1 903C C4DB 0225 8717 921A 4881
   ```

   The two lines appear once DHCP has answered and the management API is up. A node with more than one address lists each one on its own line.

There is no TPM, no encrypted disk, no database and no CA key yet. The only useful things the node can do in this state are report its status and accept a config.

## Find the node's address

Read it off the console's **Address** line. Without console access, look it up where the address came from: your DHCP server's lease list, or the VM's network summary in your hypervisor.

## Check the node's certificate

The certificate is new at every boot, so its fingerprint is only on the console. Before you send the node a config, or adopt it with the Fleet Manager, compare the fingerprint you see over the network with the console's **Mgmt SHA-256** line:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
openssl s_client -connect 192.0.2.50:443 </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
'Q' | openssl s_client -connect 192.0.2.50:443 2>$null | openssl x509 -noout -fingerprint -sha256
```

</TabItem>
</Tabs>

openssl prints the value with colons; ignore them, and case, when you compare.

:::caution[A different fingerprint means a different machine]
If the value doesn't match the console, something other than your node answered on that address. Don't send it a config; find out what answered first. The Fleet Manager's adoption preview shows the same fingerprint, so check it there the same way.
:::

## Talk to a maintenance node

Because the node has no identity to prove yet, you reach it with `--insecure`. That flag skips checking the node's certificate and sends no client certificate:

```bash
cryptosctl --insecure --endpoint 192.0.2.50:443 status
```

`--insecure` is only for maintenance mode. A node that is fully installed requires mutual TLS and rejects a client that sends no certificate.

`cryptosctl` runs on Linux and macOS.

## Next step

Write the node's machine config and send it: [Bootstrap and apply config](./bootstrap-apply.md).
