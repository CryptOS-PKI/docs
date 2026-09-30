import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 7. ESXi hosts: refresh CA certificates, then renew

:::info[Before you start]
The import finished with `100% Completed` and the same services running ([stage 6](./import.md)). `root.pem` on the workstation ([4.2](./sign-and-chain.md#42-get-the-root-certificate)).
:::

Each host must first learn the new trust chain (**Refresh CA Certificates**, which also pushes CRLs), and then get a new certificate from the new VMCA (**Renew**).

:::caution[Refresh first, then Renew, one host at a time]
Do the two steps in that order, one host at a time, and check that the host stays **Connected** before moving to the next.
:::

In the tested run each step took about 5 seconds per host, and no host went Not Responding.

## 7.1 vSphere UI, per host

1. **Hosts and Clusters** > `Cluster-01` > `esxi-01.example.org`.
2. **Configure** > **System** > **Certificate**.
3. **Refresh CA Certificates** (in some builds it sits under a **Manage with VMCA** menu). Wait for the task in **Recent Tasks** to show **Completed**.
4. **Renew**, and confirm. Wait for the task to complete.
5. Refresh the Certificate page. **Issuer** now shows `CN=Example vSphere CA, ...`, **Valid From** is a few minutes ago, **Valid To** is five years out, and **Status** is **Good**.
6. Check the host **Summary**: state **Connected**.
7. Repeat for `esxi-02`, `esxi-03`, `esxi-04`.

## 7.2 API equivalents

`govc` has no command for these two host operations. They are methods on the vCenter `CertificateManager` managed object:

- `CertMgrRefreshCACertificatesAndCRLs_Task(host=[...])`
- `CertMgrRefreshCertificates_Task(host=[...])`

With PowerCLI, one host at a time:

```powershell
Connect-VIServer vcenter.example.org -User administrator@vsphere.local
$certMgr = Get-View -Id (Get-View ServiceInstance).Content.CertificateManager

foreach ($name in 'esxi-01.example.org','esxi-02.example.org','esxi-03.example.org','esxi-04.example.org') {
    $h = Get-VMHost -Name $name
    # the methods without the _Task suffix wait for the task to finish
    $certMgr.CertMgrRefreshCACertificatesAndCRLs(@($h.ExtensionData.MoRef))
    $certMgr.CertMgrRefreshCertificates(@($h.ExtensionData.MoRef))
    Get-VMHost -Name $name | Select-Object Name, ConnectionState
}
```

:::tip[Expected output]
Per host:

```text
Name                  ConnectionState
----                  ---------------
esxi-01.example.org   Connected
```

:::

Any vSphere SDK works the same way (pyVmomi, the Go `govmomi` library): call the two tasks in order and wait for each to finish.

## 7.3 If a host goes Not Responding

This did not happen in the tested run, but it is the documented failure mode when a host still trusts only the old VMCA root:

1. Run **Refresh CA Certificates** on that host again.
2. Right-click the host > **Connection** > **Connect**, and accept the new certificate thumbprint if asked.
3. Then **Renew**.

## Verify before continuing

**govc, per host:**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
for h in esxi-01 esxi-02 esxi-03 esxi-04; do
  echo "== $h"
  govc object.collect -s /DC-01/host/Cluster-01/$h.example.org runtime.connectionState
  govc host.cert.info -host /DC-01/host/Cluster-01/$h.example.org | grep -E 'Status|Issuer|Not Before|Not After|Expiration'
done
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
foreach ($h in 'esxi-01','esxi-02','esxi-03','esxi-04') {
  "== $h"
  govc object.collect -s "/DC-01/host/Cluster-01/$h.example.org" runtime.connectionState
  govc host.cert.info -host "/DC-01/host/Cluster-01/$h.example.org" | Select-String -Pattern 'Status|Issuer|Not Before|Not After|Expiration'
}
```

</TabItem>
</Tabs>

:::tip[Expected output]
For each host:

```text
== esxi-01
connected
Certificate Status:          good
Issuer:                      CN=Example vSphere CA,C=US,ST=Example State,L=Example City,O=Example Organization,OU=IT Infrastructure
...
```

:::

**openssl, per host, from the workstation:**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
for h in esxi-01 esxi-02 esxi-03 esxi-04; do
  echo "== $h"
  openssl s_client -connect $h.example.org:443 -servername $h.example.org -CAfile root.pem \
    -verify_hostname $h.example.org </dev/null 2>/dev/null \
    | grep -E '^ *[0-9] s:|Verify return code'
done
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
foreach ($h in 'esxi-01','esxi-02','esxi-03','esxi-04') {
  "== $h"
  '' | openssl s_client -connect "$h.example.org:443" -servername "$h.example.org" -CAfile root.pem `
    -verify_hostname "$h.example.org" 2>$null |
    Select-String -Pattern '^ *[0-9] s:|Verify return code'
}
```

</TabItem>
</Tabs>

:::tip[Expected output]
For each host:

```text
== esxi-01
 0 s:... CN = esxi-01.example.org
 1 s:CN = Example vSphere CA, ...
 2 s:CN = Example Intermediate CA G1, ...
Verify return code: 0 (ok)
```

Any `Verify return code` other than `0 (ok)` means the host does not verify to the Root; don't continue.

:::

- [ ] Every host is **Connected**.
- [ ] Every host certificate is issued by `Example vSphere CA`, status good.
- [ ] Every host presents leaf, VMCA, Intermediate on port 443, and verifies to `root.pem` with its hostname.
