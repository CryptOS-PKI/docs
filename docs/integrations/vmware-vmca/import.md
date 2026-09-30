import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 6. The import

:::info[Before you start]
The cluster settings changed and the `pre-vmca-import` snapshot taken ([stage 5](./cluster-prep.md)). `/root/vmca/vmca-fullchain.pem` and `/root/vmca/vmca.key` on the VCSA ([3.2](./generate-csr.md#32-generate-the-key-and-csr-with-certool), [4.5](./sign-and-chain.md#45-copy-the-full-chain-to-the-vcsa)). The service census from [1.2](./safety-gate.md#12-pre-flight-census), the SSO administrator password, and the rollback plan from [1.4](./safety-gate.md#14-the-rollback-plan).
:::

:::warning[vCenter goes down in this stage]
This is the disruptive step. From the final `Y` onward, `certificate-manager` replaces the VMCA root, regenerates every certificate vCenter issued, and restarts every service.
:::

## 6.1 Before you start

:::caution[Use an SSH session that will not drop]
Run it from an SSH session that will not drop. `sshd` is not restarted, but if your client disconnects mid-run the process can be killed. The VM console in the vSphere Client is a fallback, but it becomes unavailable as soon as vCenter's services stop, so the ESXi Host Client console is the better fallback.
:::

- Have ready: the SSO administrator password, `/root/vmca/vmca-fullchain.pem`, `/root/vmca/vmca.key`, and the answers in the table in [6.2](#62-prompt-and-answer-transcript).
- Keep a second terminal open on the workstation for watching port 443.

## 6.2 Prompt-and-answer transcript

Start it on the VCSA Bash shell:

```sh
/usr/lib/vmware-vmca/bin/certificate-manager
```

**Main menu.** The menu box wording may vary by build; the option you need is the one labelled *Replace VMCA Root certificate with Custom Signing Certificate and replace all Certificates*:

```text
         _________________________________________________________________________________________
        |                                                                                         |
        |      *** Welcome to the vSphere 8.0 Certificate Manager  ***                            |
        |                                                                                         |
        |                   -- Select Operation --                                                |
        |                                                                                         |
        |      1. Replace Machine SSL certificate with Custom Certificate                         |
        |                                                                                         |
        |      2. Replace VMCA Root certificate with Custom Signing                               |
        |         Certificate and replace all Certificates                                        |
        |                                                                                         |
        |      3. Replace Machine SSL certificate with VMCA Certificate                           |
        |                                                                                         |
        |      4. Regenerate a new VMCA Root Certificate and                                      |
        |         replace all certificates                                                        |
        |                                                                                         |
        |      5. Replace Solution user certificates with                                         |
        |         Custom Certificate                                                              |
        |                                                                                         |
        |      6. Replace Solution user certificates with VMCA certificates                       |
        |                                                                                         |
        |      7. Revert last performed operation by re-publishing old                            |
        |         certificates                                                                    |
        |                                                                                         |
        |      8. Reset all Certificates                                                          |
        |_________________________________________________________________________________________|
Note : Use Ctrl-D to exit.
Option[1 to 8]: 2
```

Answer: **`2`**.

**Use a configuration file:**

```text
Do you wish to generate all certificates using configuration file : Option[Y/N] ? : Y
```

Answer: **`Y`**. `certificate-manager` then asks for the certool values below and uses them for every certificate it regenerates.

**SSO credentials:**

```text
Please provide valid SSO and VC privileged user credential to perform certificate operations.
Enter username [Administrator@vsphere.local]: administrator@vsphere.local
Enter password:
```

Answer: `administrator@vsphere.local`, then its password (not echoed).

**certool values.** Each prompt shows a default in brackets that varies by build. Type the value from the table and press Enter. The exact bracketed text after each field name may differ on your build; the field names are fixed.

```text
Please configure certool.cfg with proper values before proceeding to next step.

Press Enter key to skip optional parameters or use Default value.

Enter proper value for 'Country' [Default value : US] : US
Enter proper value for 'Name' [Default value : CA] : Example vSphere CA
Enter proper value for 'Organization' [Default value : VMware] : Example Organization
Enter proper value for 'OrgUnit' [Default value : VMware Engineering] : IT Infrastructure
Enter proper value for 'State' [Default value : California] : Example State
Enter proper value for 'Locality' [Default value : Palo Alto] : Example City
Enter proper value for 'IPAddress' (Provide comma separated values for multiple IP addresses) [optional] : 192.0.2.10
Enter proper value for 'Email' [Default value : email@acme.com] : ca-admin@example.org
Enter proper value for 'Hostname' (Provide comma separated values for multiple Hostname entries) [Enter valid Fully Qualified Domain Name(FQDN), For Example : example.domain.com] : vcenter.example.org
Enter proper value for VMCA 'Name' : Example vSphere CA
```

| Prompt field | Answer | What it becomes |
| --- | --- | --- |
| `Country` | `US` | `C=` on regenerated certificates |
| `Name` | `Example vSphere CA` | `CN=` in the certool config |
| `Organization` | `Example Organization` | `O=` |
| `OrgUnit` | `IT Infrastructure` | `OU=` |
| `State` | `Example State` | `ST=` |
| `Locality` | `Example City` | `L=` |
| `IPAddress` | `192.0.2.10` | an IP SAN on the machine SSL certificate |
| `Email` | `ca-admin@example.org` | an email SAN on the machine SSL certificate |
| **`Hostname`** | **`vcenter.example.org`** | **the DNS SAN on the machine SSL certificate. Must equal the PNID from [3.1](./generate-csr.md#31-find-the-pnid).** |
| VMCA `Name` | `Example vSphere CA` | the name VMCA uses for itself; keep it equal to the CA certificate's CN |

:::warning[The Hostname field decides whether browsers trust vCenter]
Browsers match only on the SAN `dNSName` and ignore the CN. If `Hostname` is wrong or empty, the chain can be perfect and clients still get a name-mismatch error. Enter the PNID. Add further names (comma-separated) only if they already resolve in DNS. The machine SSL certificate may carry several names; the VMCA CA certificate may not, and it does not get them from here.
:::

**Import, not generate:**

```text
         1. Generate Certificate Signing Request(s) and Key(s) for VMCA Root Signing certificate

         2. Import custom certificate(s) and key(s) to replace existing VMCA Root Signing certificate

Option [1 or 2]: 2
```

Answer: **`2`**.

**The chain and the key:**

```text
Please provide valid custom certificate for Root.
File : /root/vmca/vmca-fullchain.pem

Please provide valid custom key for Root.
File : /root/vmca/vmca.key
```

Answers: `/root/vmca/vmca-fullchain.pem` (the **full chain** from [stage 4](./sign-and-chain.md), not the VMCA certificate alone), then `/root/vmca/vmca.key`.

**Final confirmation.**

:::warning[Point of no return]
This is the point of no return (short of a revert).
:::

```text
You are going to replace Root Certificate with custom certificate and regenerate all other certificates
Continue operation : Option[Y/N] ? : Y
```

Answer: **`Y`**.

## 6.3 Expected progress output

:::tip[Expected output]
The status line updates in place. Captured as a transcript it reads:

```text
Status : 0% Completed [Replacing Root Cert...]
Status : 35% Completed [Replaced Root Cert...]
Status : 35% Completed [Replacing Machine SSL Cert...]
Status : 45% Completed [Replace machine Cert...]
Status : 50% Completed [Replace vsphere-webclient Cert...]
Status : 55% Completed [Replace vpxd Cert...]
Status : 60% Completed [Replace vpxd-extension Cert...]

Updating new vpxd-extension certificate for VC extended solutions

Updating the certificate for VC extension com.vmware.vim.eam

Updating the certificate for VC extension com.vmware.rbd

Updating the certificate for VC extension com.vmware.imagebuilder
Status : 65% Completed [Replace hvc Cert...]
Status : 70% Completed [Replace wcp Cert...]
Status : 70% Completed [stopping services...]
Status : 85% Completed [starting services...]
Status : 100% Completed [All tasks completed successfully]
```

The list of `VC extension` lines depends on which solutions are registered with your vCenter.

:::

In the tested run, the `Y` was entered at 18:17:35 UTC and `100% Completed [All tasks completed successfully]` appeared at 18:21:05 UTC: **about 3.5 minutes**. The exit status was 0.

:::warning[Import rejected]
If you see this instead, the chain or key was rejected:

```text
Status : 0% Completed [Operation failed, performing automatic rollback]
```

The tool restores the original certificates itself. Read `/var/log/vmware/vmcad/certificate-manager.log`, fix the cause (see [stage 11](./troubleshooting.md)), and start again from [stage 6](./import.md). The usual cause is an ECDSA signature somewhere in the chain, a chain in the wrong order, or a certificate that does not match the key.
:::

## 6.4 What the outage looks like

- From about 70% (`stopping services...`) until shortly after 100%, vCenter is unavailable: about **2.5 minutes** in the tested run.
- The vSphere Client shows errors or a blank page, then logs every user out. Log in again once `/ui` loads.
- `govc` calls fail with connection errors, then work again (with `GOVC_INSECURE=1`).
- Port 443 briefly refuses connections, then presents the **new** certificate chain.
- If you exit the Bash shell back to the appliance shell while services are starting, you may see `[ERROR]: Failed to connect to service.` That is the appliance shell losing its API connection during the restart. It is harmless.
- Virtual machines keep running. ESXi hosts keep running their workloads.

Watch from the workstation:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
while ! curl -sk -o /dev/null -w '%{http_code}\n' https://vcenter.example.org/ui/ | grep -q 200; do sleep 5; done; date -u
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
while ((curl.exe -sk -o NUL -w '%{http_code}' https://vcenter.example.org/ui/) -ne '200') { Start-Sleep -Seconds 5 }; [DateTime]::UtcNow.ToString('u')
```

</TabItem>
</Tabs>

## Verify before continuing

On the VCSA:

```sh
service-control --status --all
```

The **Running** list must match the census from [1.2](./safety-gate.md#12-pre-flight-census) exactly. If a service that was running is now stopped, start it with `service-control --start <name>` and look at its log before going further.

On the workstation:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | grep -E '^ *[0-9] s:|^ *i:'
govc about | head -1
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
'' | openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts 2>$null |
  Select-String -Pattern '^ *[0-9] s:|^ *i:'
govc about | Select-Object -First 1
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
 0 s:CN = vcenter.example.org, ...
   i:CN = Example vSphere CA, C = US, ST = Example State, L = Example City, O = Example Organization, OU = IT Infrastructure
 1 s:CN = Example vSphere CA, ...
   i:CN = Example Intermediate CA G1, ...
 2 s:CN = Example Intermediate CA G1, ...
   i:CN = Example Root CA G1, ...
FullName:     VMware vCenter Server 8.0.3 build-...
```

:::

- [ ] `certificate-manager` reached `100% Completed [All tasks completed successfully]`.
- [ ] The same services are running as before.
- [ ] Port 443 presents three certificates: machine SSL, VMCA, Intermediate.
- [ ] The vSphere Client loads and you can log in. `govc about` works.
