# 8. Restore settings

:::info[Before you start]
Every host refreshed, renewed and Connected ([stage 7](./esxi-hosts.md)). The original values you recorded in [5.1](./cluster-prep.md#51-record-the-originals).
:::

Put back exactly what you recorded in [5.1](./cluster-prep.md#51-record-the-originals).

## 8.1 minutesBefore back to 1440

**govc:**

```sh
govc option.set vpxd.certmgmt.certs.minutesBefore 1440
```

**vSphere UI:** `vcenter.example.org` > **Configure** > **Settings** > **Advanced Settings** > **Edit Settings** > `vpxd.certmgmt.certs.minutesBefore` = `1440` > **Save**.

## 8.2 DRS back to fullyAutomated, with the original threshold

**govc:**

```sh
govc cluster.change -drs-enabled=true -drs-mode fullyAutomated -drs-vmotion-rate 3 /DC-01/host/Cluster-01
```

Use your own recorded `vmotionRate` for `-drs-vmotion-rate`.

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere DRS** > **Edit** > **Automation Level: Fully Automated**, **Migration Threshold** back to the recorded position > **OK**.

## 8.3 HA back on, with the original admission control

**govc:**

```sh
govc cluster.change -ha-enabled=true -ha-admission-control-enabled=true /DC-01/host/Cluster-01
```

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere Availability** > **Edit** > turn **vSphere HA** on. Check **Failures and responses** > **Host Monitoring** is on, and **Admission Control** matches the recorded policy (for example *Cluster resource percentage*, *Host failures cluster tolerates: 1*, *Override calculated failover capacity* unticked, which gives the auto-computed 25 % CPU and 25 % memory on a four-host cluster) > **OK**.

HA reconfigures each host and elects a new primary. Wait until every host shows the HA state **Running (Primary)** or **Connected (Secondary)** in `Cluster-01` > **Monitor** > **vSphere HA** > **Summary**.

## Verify before continuing

```sh
govc option.ls vpxd.certmgmt.certs.minutesBefore
govc object.collect -json /DC-01/host/Cluster-01 configurationEx | jq '.[0].val | {
  drs: .drsConfig,
  das: (.dasConfig | {enabled, hostMonitoring, vmMonitoring, admissionControlEnabled, admissionControlPolicy})
}'
```

- [ ] `minutesBefore` is `1440`.
- [ ] The JSON matches the JSON you saved in [5.1](./cluster-prep.md#51-record-the-originals), field for field.
- [ ] HA shows a primary and no configuration errors on any host.
