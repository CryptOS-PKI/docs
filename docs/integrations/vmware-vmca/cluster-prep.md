import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 5. Pre-change cluster settings

:::info[Before you start]
`vmca-fullchain.pem` on the VCSA, with every check in [4.5](./sign-and-chain.md#45-copy-the-full-chain-to-the-vcsa) passing. `govc` set up as in the [overview](./index.md#set-up-govc-once). The snapshot steps in [1.3](./safety-gate.md#13-memory-snapshot-of-the-vcsa), which you run at the end of this stage.
:::

:::caution[Record the original values first]
These changes reduce noise and risk while vCenter restarts. **Record the original values first**: you restore them exactly in [stage 8](./restore.md).
:::

## 5.1 Record the originals

**Certificate management settings:**

```sh
govc option.ls vpxd.certmgmt
```

:::tip[Expected output]
Defaults on a fresh vCenter 8:

```text
vpxd.certmgmt.certs.cn.country:                   US
vpxd.certmgmt.certs.cn.email:                     vmca@vmware.com
vpxd.certmgmt.certs.cn.localityName:              Palo Alto
vpxd.certmgmt.certs.cn.organizationalUnitName:    VMware Engineering
vpxd.certmgmt.certs.cn.organizationName:          VMware
vpxd.certmgmt.certs.cn.state:                     California
vpxd.certmgmt.certs.daysValid:                    1825
vpxd.certmgmt.certs.hardThreshold:                30
vpxd.certmgmt.certs.minutesBefore:                1440
vpxd.certmgmt.certs.pollIntervalDays:             5
vpxd.certmgmt.certs.softThreshold:                240
vpxd.certmgmt.mode:                               vmca
```

:::

**DRS and HA:**

```sh
govc object.collect -json /DC-01/host/Cluster-01 configurationEx | jq '.[0].val | {
  drs: .drsConfig,
  das: (.dasConfig | {enabled, hostMonitoring, vmMonitoring, admissionControlEnabled, admissionControlPolicy})
}'
```

:::tip[Expected output]
Your values may differ; write down what **you** see.

```json
{
  "drs": {
    "enabled": true,
    "enableVmBehaviorOverrides": true,
    "defaultVmBehavior": "fullyAutomated",
    "vmotionRate": 3
  },
  "das": {
    "enabled": true,
    "hostMonitoring": "enabled",
    "vmMonitoring": "vmMonitoringDisabled",
    "admissionControlEnabled": true,
    "admissionControlPolicy": {
      "cpuFailoverResourcesPercent": 25,
      "memoryFailoverResourcesPercent": 25,
      "failoverLevel": 1,
      "autoComputePercentages": true,
      "resourceReductionToToleratePercent": 100
    }
  }
}
```

:::

Save this JSON in the change ticket.

vSphere UI: `Cluster-01` > **Configure** > **Services** > **vSphere DRS** (automation level and migration threshold), and **vSphere Availability** (host monitoring, admission control: policy, host failures to tolerate, reserved CPU and memory percentages).

## 5.2 minutesBefore: 1440 to 5

`vpxd.certmgmt.certs.minutesBefore` back-dates the `notBefore` of certificates VMCA issues to ESXi hosts. The default of 1440 minutes (24 hours) can make a freshly issued host certificate start *before* the new VMCA certificate itself does, which a host rejects. Setting it to 5 minutes for the window avoids that (VMware KB 2123386).

**govc:**

```sh
govc option.set vpxd.certmgmt.certs.minutesBefore 5
govc option.ls vpxd.certmgmt.certs.minutesBefore
```

:::tip[Expected output]

```text
vpxd.certmgmt.certs.minutesBefore:  5
```

:::

**vSphere UI:** select `vcenter.example.org` in the inventory > **Configure** > **Settings** > **Advanced Settings** > **Edit Settings**. Filter on `minutesBefore`, change the value from `1440` to `5`, **Save**.

## 5.3 DRS: fullyAutomated to partiallyAutomated

This stops DRS from migrating VMs, including the VCSA itself, while vCenter restarts.

:::warning[Do not disable DRS]
**Do not disable DRS.** Disabling DRS deletes every resource pool in the cluster.
:::

**govc:**

```sh
govc cluster.change -drs-mode partiallyAutomated /DC-01/host/Cluster-01
```

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere DRS** > **Edit** > **Automation Level: Partially Automated** > **OK**. Leave the vSphere DRS toggle on.

## 5.4 HA: off

This avoids HA elections and host isolation responses while the hosts' trust changes.

**govc:**

```sh
govc cluster.change -ha-enabled=false /DC-01/host/Cluster-01
```

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere Availability** > **Edit** > turn **vSphere HA** off > **OK**.

Turning HA off keeps the admission control policy stored in the cluster configuration, so turning it back on in [stage 8](./restore.md) restores the same percentages. You verify that in [stage 8](./restore.md).

## 5.5 Take the snapshot now

Run [1.3](./safety-gate.md#13-memory-snapshot-of-the-vcsa) now. Re-check the VCSA's host first (`govc vm.info /DC-01/vm/vcenter | grep Host`), since it is the host you would revert from.

## Verify before continuing

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
govc option.ls vpxd.certmgmt.certs.minutesBefore
govc object.collect -json /DC-01/host/Cluster-01 configurationEx \
  | jq -c '.[0].val | {drs: .drsConfig.defaultVmBehavior, rate: .drsConfig.vmotionRate, ha: .dasConfig.enabled}'
govc snapshot.tree -vm /DC-01/vm/vcenter
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
govc option.ls vpxd.certmgmt.certs.minutesBefore
govc object.collect -json /DC-01/host/Cluster-01 configurationEx |
  jq -c '.[0].val | {drs: .drsConfig.defaultVmBehavior, rate: .drsConfig.vmotionRate, ha: .dasConfig.enabled}'
govc snapshot.tree -vm /DC-01/vm/vcenter
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
vpxd.certmgmt.certs.minutesBefore:  5
{"drs":"partiallyAutomated","rate":3,"ha":false}
pre-vmca-import
```

:::

- [ ] `minutesBefore` is `5`.
- [ ] DRS is enabled and `partiallyAutomated`. HA is `false`.
- [ ] Snapshot `pre-vmca-import` exists, with memory.
- [ ] Original values saved in the ticket.
