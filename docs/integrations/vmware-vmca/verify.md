import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 9. Verification

:::info[Before you start]
The settings restored ([stage 8](./restore.md)). `root.pem` on the workstation ([4.2](./sign-and-chain.md#42-get-the-root-certificate)), and the service census from [1.2](./safety-gate.md#12-pre-flight-census).
:::

## 9.1 vCenter port 443, with hostname verification

This is the check a browser does. On the workstation, with only the Root as the trust anchor:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org \
  -CAfile root.pem -verify_hostname vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | grep -E '^ *[0-9] s:|^ *i:|Verify return code'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
'' | openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org `
  -CAfile root.pem -verify_hostname vcenter.example.org -showcerts 2>$null |
  Select-String -Pattern '^ *[0-9] s:|^ *i:|Verify return code'
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
 0 s:CN = vcenter.example.org, ...
   i:CN = Example vSphere CA, ...
 1 s:CN = Example vSphere CA, ...
   i:CN = Example Intermediate CA G1, ...
 2 s:CN = Example Intermediate CA G1, ...
   i:CN = Example Root CA G1, ...
Verify return code: 0 (ok)
```

:::

The same check with `openssl verify` on saved files:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/{n++; f=1} f{print > ("vc-" n ".pem")} /-----END CERTIFICATE-----/{f=0}'
cat vc-2.pem vc-3.pem > vc-intermediates.pem
openssl verify -CAfile root.pem -untrusted vc-intermediates.pem -verify_hostname vcenter.example.org vc-1.pem
openssl x509 -in vc-1.pem -noout -serial -dates -fingerprint -sha256 -ext subjectAltName
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$served = '' | openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts 2>$null
$n = 0
[regex]::Matches(($served -join "`n"), '(?s)-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----') |
  ForEach-Object { $n++; [IO.File]::WriteAllText("$PWD\vc-$n.pem", $_.Value + "`n") }
[IO.File]::WriteAllText("$PWD\vc-intermediates.pem", (Get-Content -Raw vc-2.pem) + (Get-Content -Raw vc-3.pem))
openssl verify -CAfile root.pem -untrusted vc-intermediates.pem -verify_hostname vcenter.example.org vc-1.pem
openssl x509 -in vc-1.pem -noout -serial -dates -fingerprint -sha256 -ext subjectAltName
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
vc-1.pem: OK
serial=6E...0C
notBefore=Sep 25 18:15:00 2026 GMT
notAfter=Sep 24 18:15:00 2028 GMT
sha256 Fingerprint=7C:...:1B
X509v3 Subject Alternative Name:
    DNS:vcenter.example.org, IP Address:192.0.2.10, email:ca-admin@example.org
```

:::

- The server sends the leaf **and** the intermediates. A server that sends only the leaf fails on clients that hold only the Root.
- The SAN includes the PNID.
- Every certificate is RSA-signed (`openssl x509 -in vc-N.pem -noout -text | grep 'Signature Algorithm'`).

## 9.2 VECS stores on the VCSA

```sh
V=/usr/lib/vmware-vmafd/bin/vecs-cli
$V store list
for s in MACHINE_SSL_CERT machine vsphere-webclient vpxd vpxd-extension hvc wcp data-encipherment SMS; do
  echo "== $s"
  $V entry list --store "$s" --text | grep -E 'Alias :|Issuer:' | head -4
done
```

:::tip[Expected output]

| Store | Issued by after the import |
| --- | --- |
| `MACHINE_SSL_CERT` (`__MACHINE_CERT`) | `Example vSphere CA`, with the full chain |
| `machine` | `Example vSphere CA` |
| `vsphere-webclient` | `Example vSphere CA` |
| `vpxd` | `Example vSphere CA` |
| `vpxd-extension` | `Example vSphere CA` |
| `hvc` | `Example vSphere CA` |
| `wcp` | `Example vSphere CA` |
| `data-encipherment` | **the old self-signed VMCA root.** Expected: `certificate-manager` does not reissue it. |
| `SMS` | **the old self-signed VMCA root.** Expected, same reason. |

:::

```sh
$V entry list --store TRUSTED_ROOTS --text | grep -E 'Alias :|Subject:'
```

:::tip[Expected output]
Four entries. The new `Example vSphere CA`, `Example Intermediate CA G1`, `Example Root CA G1`, and the **old** self-signed VMCA root (`CN=CA, DC=vsphere, DC=local, ...`). Leave the old root in place; `data-encipherment` and `SMS` still chain to it.
:::

```sh
$V entry list --store BACKUP_STORE --text | grep 'Alias :'
```

:::tip[Expected output]
A new `BACKUP_STORE` with `bkp_*` entries (seven in the tested run: `bkp___MACHINE_CERT`, `bkp_machine`, `bkp_vsphere-webclient`, `bkp_vpxd`, `bkp_vpxd-extension`, `bkp_hvc`, `bkp_wcp`). These are what the revert option in [10.1](./rollback.md#101-revert-with-certificate-manager) republishes.
:::

## 9.3 ESXi hosts

Repeat the openssl loop from the [stage 7 verify block](./esxi-hosts.md#verify-before-continuing). Each host must present leaf, VMCA, Intermediate, and verify to the Root with its own hostname. Also browse to `https://esxi-01.example.org/ui` from a client that trusts only the Root and confirm there is no certificate warning.

## 9.4 Clients and automation

:::caution[Distribute only the Root as a trust anchor]
Do not distribute the VMCA or Intermediate certificates as trust anchors.
:::

- **Browsers and operating systems** need only `Example Root CA G1` in their trust store. If a browser still warns after the Root is installed, clear its cache or HSTS state for the site, or restart it, and re-check with [9.1](#91-vcenter-port-443-with-hostname-verification).
- **govc:** turn verification back on. Unset `GOVC_INSECURE` and point govc at the Root:

  <Tabs groupId="os" queryString>
  <TabItem value="unix" label="Linux / macOS" default>

  ```sh
  unset GOVC_INSECURE
  export GOVC_TLS_CA_CERTS=/path/to/root.pem
  govc about | head -1
  ```

  </TabItem>
  <TabItem value="windows" label="Windows (PowerShell)">

  ```powershell
  Remove-Item Env:GOVC_INSECURE
  $env:GOVC_TLS_CA_CERTS = 'C:\path\to\root.pem'
  govc about | Select-Object -First 1
  ```

  </TabItem>
  </Tabs>

  If you use `GOVC_TLS_KNOWN_HOSTS`, remove the old vCenter entry first.

- **Anything that pinned the old vCenter thumbprint** (backup software, monitoring, PowerCLI with a saved thumbprint, Kubernetes CSI or CPI secrets, telemetry collectors) must be re-pinned to the new fingerprint from [9.1](#91-vcenter-port-443-with-hostname-verification), or better, switched to trusting the Root.

- **Alarms and tasks:** `DC-01` > **Monitor** > **Issues and Alarms** shows nothing new, and **Recent Tasks** shows the refresh and renew tasks as completed.

## Verify before continuing

- [ ] vCenter and every host verify to the Root with hostname checking, from a machine that trusts only the Root.
- [ ] VECS stores as in the table; `data-encipherment` and `SMS` on the old root is expected.
- [ ] `BACKUP_STORE` exists.
- [ ] No new alarms.
- [ ] govc works with verification on.
