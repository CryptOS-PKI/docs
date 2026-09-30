import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 10. Rollback and cleanup

:::info[Before you start]
For a rollback: the file-based backup ([1.1](./safety-gate.md#11-file-based-backup-of-the-vcsa)), the `pre-vmca-import` snapshot ([1.3](./safety-gate.md#13-memory-snapshot-of-the-vcsa)), and the host that runs the VCSA ([1.2](./safety-gate.md#12-pre-flight-census)). For cleanup: vCenter, every host and all clients verified ([stage 9](./verify.md)).
:::

## 10.1 Revert with certificate-manager

Use this if the import completed but vCenter misbehaves. It republishes the certificates saved in `BACKUP_STORE`.

On the VCSA Bash shell:

```sh
/usr/lib/vmware-vmca/bin/certificate-manager
```

At `Option[1 to 8]:`, choose the option labelled **Revert last performed operation by re-publishing old certificates**. On the vCenter 8.0 menu in [6.2](./import.md#62-prompt-and-answer-transcript) that is option **7**.

:::danger[Option 8 resets every certificate]
Go by the label, not the number: option **8**, *Reset all Certificates*, is a different operation that generates a brand-new self-signed VMCA root and replaces everything.
:::

It asks for the SSO credentials and a `Y` confirmation, restarts services, and ends with `100% Completed`. Then:

```sh
service-control --start --all
service-control --status --all
```

Afterwards, every host you already renewed holds a certificate from the new VMCA that vCenter no longer trusts. Run **Refresh CA Certificates** and **Renew** on each host again ([stage 7](./esxi-hosts.md)), so they get certificates from the restored VMCA root.

## 10.2 Revert the snapshot

Use this if the revert fails or vCenter is unreachable.

:::caution[Revert from the ESXi host, not vCenter]
**vCenter cannot revert its own snapshot while it is down**, so do it on the host that runs the VCSA (from [1.2](./safety-gate.md#12-pre-flight-census)).
:::

**ESXi Host Client:**

1. Browse to `https://esxi-04.example.org/ui` and log in as `root`.
2. **Virtual Machines** > `vcenter` > **Actions** > **Snapshots** > **Manage snapshots**.
3. Select `pre-vmca-import` > **Restore snapshot** > confirm.

Because the snapshot holds memory, the VCSA comes back running, in its state from before the import.

**govc against the host directly:**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
GOVC_URL='https://esxi-04.example.org/sdk' GOVC_USERNAME=root GOVC_PASSWORD='...' GOVC_INSECURE=1 GOVC_DATACENTER=ha-datacenter \
  govc snapshot.revert -vm vcenter pre-vmca-import
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
# these replace the vCenter values for the whole session; set them back from "Set up govc once" afterwards
$env:GOVC_URL = 'https://esxi-04.example.org/sdk'; $env:GOVC_USERNAME = 'root'; $env:GOVC_PASSWORD = '...'
$env:GOVC_INSECURE = '1'; $env:GOVC_DATACENTER = 'ha-datacenter'
govc snapshot.revert -vm vcenter pre-vmca-import
```

</TabItem>
</Tabs>

After a snapshot revert, re-check the cluster settings: they revert with vCenter's database, so DRS is back to what it was when the snapshot was taken (partially automated, HA off). Restore them with [stage 8](./restore.md). Hosts you renewed after the snapshot need Refresh CA Certificates and Renew again, as in [10.1](#101-revert-with-certificate-manager).

## 10.3 Cleanup

Do these once vCenter, the hosts and all clients have been verified.

1. **Remove the snapshot within 24 to 48 hours.** A memory snapshot on the VCSA grows delta disks and slows the appliance.

   ```sh
   govc snapshot.remove -vm /DC-01/vm/vcenter pre-vmca-import
   govc snapshot.tree -vm /DC-01/vm/vcenter
   ```

   `snapshot.tree` prints nothing when no snapshots remain. vSphere UI: right-click `vcenter` > **Snapshots** > **Manage Snapshots** > select `pre-vmca-import` > **Delete**.

2. **Archive, then delete, the working files on the VCSA.** VMCA now holds its key in VECS; the copy in `/root/vmca` is only needed as an escrow. Archive it to your secrets store, then remove it:

   ```sh
   cd /root
   tar -czf /root/vmca-archive.tar.gz vmca
   sha256sum /root/vmca-archive.tar.gz
   # copy vmca-archive.tar.gz to your offline escrow, verify the digest there, then:
   shred -u /root/vmca/vmca.key
   rm -rf /root/vmca /root/vmca-archive.tar.gz
   ```

   :::danger[The archive holds a CA private key]
   Treat the archive like any CA private key: it can issue certificates your whole estate trusts.
   :::

3. **Close the shell access you opened.** In the appliance shell: `shell.set --enabled false`. Disable SSH if it was off before the change: `https://vcenter.example.org:5480` > **Access** > **SSH Login** > **Edit** > disable. If you changed root's login shell for `scp`, confirm it is back to `/bin/appliancesh`.

4. **Workstation:** delete `node-trust.pem` (it goes stale at the next node reboot anyway), keep `vmca-fullchain.pem` and the change ticket records.

5. **Schedule recurring file-based backups** of the VCSA if they were not already scheduled: `https://vcenter.example.org:5480` > **Backup** > **Backup Schedule** > **Configure**.

## Verify before continuing

- [ ] No snapshot remains on the VCSA.
- [ ] `/root/vmca` is gone from the VCSA, and the archive is in escrow with a verified digest.
- [ ] The Bash shell is disabled and SSH is in its pre-change state.
