import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 1. Safety gate

:::info[Before you start]
The prerequisites and the govc setup from the [overview](./index.md#prerequisites), and SSH enabled on the VCSA ([prerequisite 5](./index.md#prerequisites)). Nothing in this stage changes vCenter.
:::

:::warning[Do not skip the safety gate]
The import restarts every vCenter service and replaces every certificate vCenter issued. If vCenter manages the VMs that run your DNS or your CAs, losing vCenter means losing management of the machines you need to recover it. Do not skip any step in this stage.
:::

## 1.1 File-based backup of the VCSA

:::caution[A snapshot is not a backup]
A file-based backup is the only backup VMware supports for restoring a VCSA. A snapshot is not a substitute.
:::

**vSphere UI (appliance management):**

1. Browse to `https://vcenter.example.org:5480` and log in as `root`.
2. **Backup** > **Backup Now**.
3. Backup location: an SFTP, FTPS, HTTPS, NFS or SMB target, with its credentials.
4. Set an **encryption password** and store it with your other recovery secrets.
5. Leave **Stats, Events, and Tasks** selected if you want history preserved.
6. **Start**, and wait for the job to show **Complete**.

Expected result: a new row in **Activity** with status `Complete`, and a folder on the target named after the appliance version and a timestamp, for example `M_8.0.3.00000_YYYYMMDD-HHMMSS_`.

There is no `govc` equivalent for the appliance backup.

## 1.2 Pre-flight census

Record the state you will compare against after the change.

**Open a shell on the VCSA.** SSH in as `root`. You land in the appliance shell (prompt `Command>`). Enable and enter the Bash shell:

```text
$ ssh root@vcenter.example.org

VMware vCenter Server 8.0.3.00000

Type: vCenter Server with an embedded Platform Services Controller

root@vcenter.example.org's password:
Connected to service

    * List APIs: "help api list"
    * List Plugins: "help pi list"
    * Launch BASH: "shell"

Command> shell.set --enabled true
Command> shell
Shell access is granted to root
root@vcenter [ ~ ]#
```

**Service census.** On the VCSA:

```sh
service-control --status --all
```

:::tip[Expected output]
The exact list depends on the features you use.

```text
Running:
 applmgmt lookupsvc lwsmd observability observability-vapi pschealth vc-ws1a-broker vlcm vmafdd vmcad vmdird vmware-analytics vmware-certificateauthority vmware-certificatemanagement vmware-cis-license vmware-content-library vmware-eam vmware-envoy vmware-envoy-hgw vmware-envoy-sidecar vmware-hvc vmware-infraprofile vmware-perfcharts vmware-pod vmware-postgres-archiver vmware-rhttpproxy vmware-sca vmware-sps vmware-stsd vmware-topologysvc vmware-trustmanagement vmware-updatemgr vmware-vapi-endpoint vmware-vdtc vmware-vmon vmware-vpostgres vmware-vpxd vmware-vpxd-svcs vmware-vsan-health vmware-vsm vsphere-ui vstats vtsdb wcp
Stopped:
 vmcam vmonapi vmware-imagebuilder vmware-netdumper vmware-rbd-watchdog vmware-vcha
```

:::

Save this output. In the tested run, 44 services were running and the six above were stopped, and that is normal for a default deployment. After the import you must see the **same** services running.

**Current certificates.** Still on the VCSA:

```sh
/usr/lib/vmware-vmafd/bin/vecs-cli store list
```

:::tip[Expected output]

```text
MACHINE_SSL_CERT
TRUSTED_ROOTS
TRUSTED_ROOT_CRLS
machine
vsphere-webclient
vpxd
vpxd-extension
hvc
data-encipherment
SMS
APPLMGMT_PASSWORD
wcp
```

There is no `BACKUP_STORE` yet if `certificate-manager` has never been run. After the import there will be.

:::

```sh
/usr/lib/vmware-vmafd/bin/vecs-cli entry list --store TRUSTED_ROOTS --text | grep -E 'Alias|Subject:|Serial' -A1
/usr/lib/vmware-vmafd/bin/vecs-cli entry getcert --store MACHINE_SSL_CERT --alias __MACHINE_CERT \
  | openssl x509 -noout -subject -issuer -serial -enddate -fingerprint -sha256 -ext subjectAltName
```

:::tip[Expected output]
One entry in `TRUSTED_ROOTS` (the self-signed VMCA root, `CN=CA, DC=vsphere, DC=local, ...`), and a machine SSL certificate issued by it:

```text
subject=CN = vcenter.example.org, C = US
issuer=CN = CA, DC = vsphere, DC = local, C = US, ST = California, O = vcenter.example.org, OU = VMware Engineering
serial=5B...A1
notAfter=Sep 16 12:00:00 2028 GMT
sha256 Fingerprint=3A:...:9F
X509v3 Subject Alternative Name:
    DNS:vcenter.example.org
```

:::

Write down the machine SSL **SHA-256 fingerprint**. Anything that pins it must be re-pinned after the change (see [11.4](./troubleshooting.md#114-re-pinning-thumbprints)).

From the operator workstation, confirm what port 443 sends today:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | grep -c 'BEGIN CERTIFICATE'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
@('' | openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts 2>$null |
  Select-String -Pattern 'BEGIN CERTIFICATE').Count
```

</TabItem>
</Tabs>

:::tip[Expected output]
The command prints `1`. A self-signed VMCA sends only the leaf.
:::

**Host state.** List the hosts, their connection state, maintenance mode, and current certificate status:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
govc ls /DC-01/host/Cluster-01
for h in esxi-01 esxi-02 esxi-03 esxi-04; do
  echo "== $h"
  govc object.collect -s /DC-01/host/Cluster-01/$h.example.org runtime.connectionState runtime.inMaintenanceMode
  govc host.cert.info -host /DC-01/host/Cluster-01/$h.example.org | grep -E 'Status|Issuer|Not After|Expiration'
done
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
govc ls /DC-01/host/Cluster-01
foreach ($h in 'esxi-01','esxi-02','esxi-03','esxi-04') {
  "== $h"
  govc object.collect -s "/DC-01/host/Cluster-01/$h.example.org" runtime.connectionState runtime.inMaintenanceMode
  govc host.cert.info -host "/DC-01/host/Cluster-01/$h.example.org" | Select-String -Pattern 'Status|Issuer|Not After|Expiration'
}
```

</TabItem>
</Tabs>

:::tip[Expected output]
For each host:

```text
== esxi-01
connected
false
Certificate Status:          good
Issuer:                      CN=CA,DC=vsphere,DC=local,C=US,ST=California,O=vcenter.example.org,OU=VMware Engineering
...
```

:::

vSphere UI: **Hosts and Clusters** > `Cluster-01` > **Hosts** tab. Every host shows **State: Connected** and **Status: Normal** (or only alarms you have already acknowledged).

**Where is the VCSA running?** You need this for the snapshot revert, because if vCenter is down you drive the revert from that host's Host Client:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
govc vm.info /DC-01/vm/vcenter | grep -E 'Name|Host|Power state'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
govc vm.info /DC-01/vm/vcenter | Select-String -Pattern 'Name|Host|Power state'
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
Name:           vcenter
  Power state:  poweredOn
  Host:         esxi-04.example.org
```

:::

vSphere UI: select the `vcenter` VM > **Summary** > **Host**.

:::warning[DRS moves the VCSA]
Do not assume the VCSA is on the host it was deployed to. DRS moves it. In the tested run it had moved to the fourth host, not the one the runbook named. Check it on the day, and check it again right before the snapshot.
:::

**Running tasks and alarms:**

```sh
govc tasks -n 15
govc object.collect -s /DC-01 triggeredAlarmState
```

vSphere UI: **Recent Tasks** pane at the bottom (nothing running), and `DC-01` > **Monitor** > **Issues and Alarms** > **Triggered Alarms**.

## 1.3 Memory snapshot of the VCSA

Take the snapshot **as late as possible**: at the end of [stage 5](./cluster-prep.md), right before [stage 6](./import.md). It is described here because it belongs to the safety gate. A snapshot that includes memory lets a revert return vCenter to its exact running state.

**govc:**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
govc snapshot.create -vm /DC-01/vm/vcenter -m=true -q=false \
  -d "Before VMCA root replacement (certificate-manager option 2). Remove within 24-48 h once verified." \
  pre-vmca-import
govc snapshot.tree -vm /DC-01/vm/vcenter -D -i -s
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
govc snapshot.create -vm /DC-01/vm/vcenter -m=true -q=false `
  -d "Before VMCA root replacement (certificate-manager option 2). Remove within 24-48 h once verified." `
  pre-vmca-import
govc snapshot.tree -vm /DC-01/vm/vcenter -D -i -s
```

</TabItem>
</Tabs>

:::tip[Expected output]
Output of `snapshot.tree` (the ID is your vCenter's snapshot MoRef):

```text
[snapshot-NN]  pre-vmca-import  21.2GB  Sep 25 18:16
```

:::

`-m=true` includes memory. `-q=false` skips guest quiescing. The tested run did not quiesce; a memory snapshot does not need it.

**vSphere UI:** right-click the `vcenter` VM > **Snapshots** > **Take Snapshot**. Name `pre-vmca-import`, description as above, tick **Include virtual machine's memory**, leave **Quiesce guest file system** unticked, **Create**. Then right-click > **Snapshots** > **Manage Snapshots** and confirm it is listed.

## 1.4 The rollback plan

Decide this before you start, and write it in the change ticket. In increasing order of severity:

| Situation | Action | Where |
| --- | --- | --- |
| `certificate-manager` rejects the chain or key | It prints `Operation failed, performing automatic rollback` and restores the old certificates by itself. Nothing else to do. | VCSA shell |
| Import succeeds but services do not start, or vCenter misbehaves | `certificate-manager`, option **Revert last performed operation by re-publishing old certificates**, then `service-control --start --all`. See [stage 10.1](./rollback.md#101-revert-with-certificate-manager). | VCSA shell |
| Revert fails, or vCenter is unreachable | Revert the memory snapshot `pre-vmca-import` from the **ESXi Host Client** of the host running the VCSA. See [stage 10.2](./rollback.md#102-revert-the-snapshot). | `https://esxi-04.example.org/ui` |
| Snapshot revert fails | Deploy a new VCSA and restore the file-based backup from [1.1](#11-file-based-backup-of-the-vcsa). | New VCSA installer |

## Verify before continuing

- [ ] File-based backup job shows **Complete**, and you know its location and encryption password.
- [ ] Service census saved.
- [ ] Old machine SSL fingerprint and the old VMCA root recorded.
- [ ] All hosts Connected, none in maintenance mode, no running tasks.
- [ ] You know which host runs the VCSA, and you can log in to that host's Host Client as `root`.
- [ ] The rollback plan is in the change ticket.
