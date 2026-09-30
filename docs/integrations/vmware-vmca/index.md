---
title: "vSphere: subordinate VMCA to a CryptOS Intermediate"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import VmwareLogo from '@site/static/img/integrations/vmware.svg';

# <VmwareLogo className="integration-logo" role="img" aria-label="VMware" /> vSphere: subordinate VMCA to a CryptOS Intermediate

:::tip[✅ Tested]
This procedure was carried out end to end on vCenter Server 8.0.3 with four ESXi 8 hosts. The timings and outputs below come from that run, with names and numbers replaced by documentation examples.
:::

This page walks through making vCenter's built-in certificate authority (VMCA) a **subordinate CA** of a CryptOS Intermediate CA, and then bringing vCenter and every ESXi host to a verified working state under the new chain. It is written so that one person can do every step by hand. Where a step has both a vSphere Client click-path and a `govc` command, both are given. Use whichever you prefer.

Every stage ends with a **Verify before continuing** block. Do not move to the next stage until every item in it holds.

## Overview

### What changes

Before the change, VMCA is a self-signed root. Browsers and tools only trust vCenter and ESXi if they hold that VMCA root, which is not part of your PKI.

After the change, VMCA holds a CA certificate issued by your CryptOS Intermediate. VMCA keeps doing its job, issuing certificates for vCenter services and ESXi hosts, but everything it issues now chains to your CryptOS Root:

```text
Example Root CA G1                 (CryptOS Root, RSA-4096, self-signed)
└── Example Intermediate CA G1     (CryptOS Intermediate, RSA-4096, pathlen:1)
    └── Example vSphere CA         (VMCA, RSA-3072, CA:TRUE pathlen:0)
        ├── vcenter.example.org        machine SSL certificate (port 443)
        ├── vCenter solution users     machine, vpxd, vpxd-extension, vsphere-webclient, hvc, wcp
        └── esxi-01..04.example.org    ESXi host certificates (port 443)
```

Clients then need **only the Root anchor** (`Example Root CA G1`) in their trust store. vCenter and each ESXi host send the intermediate certificates themselves.

### Names used on this page

All names and addresses are documentation examples (RFC 2606 and RFC 5737). Replace them with your own.

| Item | Example value |
| --- | --- |
| vCenter Server Appliance (VCSA) | `vcenter.example.org`, `192.0.2.10`, VM name `vcenter` |
| SSO administrator | `administrator@vsphere.local` |
| Datacenter / cluster | `DC-01` / `Cluster-01` |
| ESXi hosts | `esxi-01.example.org` to `esxi-04.example.org`, `192.0.2.101` to `192.0.2.104` |
| CryptOS Root node | `pki-root.example.org`, `192.0.2.20`, CA `Example Root CA G1` |
| CryptOS Intermediate node | `pki-inter.example.org`, `192.0.2.21`, CA `Example Intermediate CA G1` |
| New VMCA CA name | `Example vSphere CA` |
| Contact email | `ca-admin@example.org` |
| Serial numbers and fingerprints | placeholders such as `3A:...:9F` |

### Versions tested

| Component | Version |
| --- | --- |
| vCenter Server Appliance | 8.0.3 (vCenter Server with an embedded Platform Services Controller) |
| ESXi | 8.0 |
| OpenSSL on the VCSA | 3.0.x |
| govc | 0.4x or later (any build that has `cluster.change -drs-mode`) |
| CryptOS | a build with RSA CA keys, `revocation_base_url` and the `/ca.cer` endpoint |

### Time and outage budget

| Phase | Measured | Budget for the change ticket |
| --- | --- | --- |
| Preparation (stages [1](./safety-gate.md) to [4](./sign-and-chain.md)): backup, CSR, sign, verify | 30 to 60 min, no outage | 1 h |
| Cluster settings and VCSA memory snapshot ([stage 5](./cluster-prep.md), [1.3](./safety-gate.md#13-memory-snapshot-of-the-vcsa)) | about 2 min (a 20 GB memory snapshot took under a minute) | 10 min |
| `certificate-manager` import ([stage 6](./import.md)) | **about 3.5 min** from the final `Y` to `100% Completed` | 40 min |
| vCenter unavailable (inside [stage 6](./import.md)) | **about 2.5 min** while all services stop and start | 40 min |
| ESXi refresh and renew ([stage 7](./esxi-hosts.md)) | about 5 s per host | 15 min |
| Restore and verify (stages [8](./restore.md) and [9](./verify.md)) | 15 to 20 min | 30 min |

Running virtual machines are not affected. This is a management-plane outage only: the vSphere Client, the API, and anything that talks to vCenter are unavailable while services restart. Plan the window for the budget column, not the measured one.

### Prerequisites

Work through this list before scheduling the window.

1. **The whole CryptOS chain is RSA.** vSphere accepts only SHA-2 RSA signatures (`sha256WithRSAEncryption`, `sha384WithRSAEncryption`, and so on). It rejects any `ecdsa-with-SHA*` signature anywhere in the imported chain. A certificate's signature algorithm comes from its **issuer's** key, so the Root and the Intermediate must both hold RSA keys (`pki.root_key_alg: RSA-3072` or `RSA-4096`). An RSA intermediate under an ECDSA root does not work.
2. **The CryptOS Intermediate has a working revocation endpoint.** `pki.revocation_base_url` is set on the Intermediate, the node has a resolver that can resolve that name, and `cryptosctl status` shows `Revocation: OK`. See [stage 2](./profile.md).
3. **The Intermediate's own certificate carries CDP and AIA pointers.** If the Root's `revocation_base_url` was set after the Intermediate enrolled, re-certify the Intermediate first (same key, new certificate with pointers), using `cryptosctl ca get-renewal-csr`, `ca sign-subordinate` on the Root, and `ca submit-renewed-cert --chain`. Doing it after the import also works, because the key and subject key identifier do not change, but the chain inside vCenter would keep the older intermediate copy.
4. **An operator workstation** with `cryptosctl`, `openssl` (1.1.1 or later), `govc`, `jq`, `curl`, and the Intermediate's bootstrap admin client credential (`admin.crt`, `admin.key`).
5. **vCenter access:** the SSO administrator password, the VCSA `root` password, SSH enabled on the VCSA. Turn it on in the appliance management interface: `https://vcenter.example.org:5480` > **Access** > **SSH Login** > **Edit** > enable.
6. **ESXi access:** the `root` password of every host, in case you need the ESXi Host Client for a snapshot revert while vCenter is down.
7. **DNS:** forward and reverse records for `vcenter.example.org` match the vCenter PNID ([stage 3.1](./generate-csr.md#31-find-the-pnid) shows how to read it).
8. **Time:** vCenter and every ESXi host are in sync (NTP).
9. **Cluster health:** every host is Connected, none is in maintenance mode, no vMotion or other task is running, and there are no unacknowledged alarms you cannot explain.

:::info[cryptosctl on Windows]
`cryptosctl` runs on Linux and macOS today; a Windows build is coming. The `cryptosctl` steps in this procedure are shown for Linux and macOS only. Every other workstation command has a **Linux / macOS** tab and a **Windows (PowerShell)** tab. The PowerShell commands work in Windows PowerShell 5.1 and PowerShell 7, and use `curl.exe`, which ships with Windows 10 and later.
:::

### Set up govc once

Every `govc` command in this procedure assumes these variables on the operator workstation:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
export GOVC_URL='https://vcenter.example.org/sdk'
export GOVC_USERNAME='administrator@vsphere.local'
export GOVC_PASSWORD='...'            # or leave unset and let govc prompt
export GOVC_DATACENTER='DC-01'
export GOVC_INSECURE=1                # the vCenter certificate changes during this procedure
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$env:GOVC_URL = 'https://vcenter.example.org/sdk'
$env:GOVC_USERNAME = 'administrator@vsphere.local'
$env:GOVC_PASSWORD = '...'            # or leave unset and let govc prompt
$env:GOVC_DATACENTER = 'DC-01'
$env:GOVC_INSECURE = '1'              # the vCenter certificate changes during this procedure
```

</TabItem>
</Tabs>

:::caution[govc skips certificate checks during the window]
`GOVC_INSECURE=1` is deliberate for the duration of the window. Anything that pins the old vCenter certificate or thumbprint stops working at the import, and `govc` should not be one of those things mid-change. Turn it off again in [stage 9.4](./verify.md#94-clients-and-automation).
:::

```sh
govc about
```

:::tip[Expected output]
Abridged:

```text
FullName:     VMware vCenter Server 8.0.3 build-...
Name:         VMware vCenter Server
Vendor:       VMware, Inc.
Version:      8.0.3
Build:        ...
OS type:      linux-x64
API type:     VirtualCenter
API version:  8.0.3.0
```

:::

## Stages

Work through the stages in order.

1. [Safety gate](./safety-gate.md)
2. [The CryptOS profile for the VMCA subordinate](./profile.md)
3. [Generate the VMCA CSR on the VCSA (non-destructive)](./generate-csr.md)
4. [Sign with cryptosctl and build the full chain](./sign-and-chain.md)
5. [Pre-change cluster settings](./cluster-prep.md)
6. [The import](./import.md)
7. [ESXi hosts: refresh CA certificates, then renew](./esxi-hosts.md)
8. [Restore settings](./restore.md)
9. [Verification](./verify.md)
10. [Rollback and cleanup](./rollback.md)
11. [Troubleshooting and gotchas](./troubleshooting.md)

---

VMware and vCenter are trademarks of Broadcom Inc.
