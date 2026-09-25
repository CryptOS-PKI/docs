---
title: "🖥️ vSphere: subordinate VMCA to a CryptOS Intermediate"
---

# 🖥️ vSphere: subordinate VMCA to a CryptOS Intermediate

:::tip[✅ Tested]
This procedure was carried out end to end on vCenter Server 8.0.3 with four ESXi 8 hosts. The timings and outputs below come from that run, with names and numbers replaced by documentation examples.
:::

This page walks through making vCenter's built-in certificate authority (VMCA) a **subordinate CA** of a CryptOS Intermediate CA, and then bringing vCenter and every ESXi host to a verified working state under the new chain. It is written so that one person can do every step by hand. Where a step has both a vSphere Client click-path and a `govc` command, both are given. Use whichever you prefer.

Every stage ends with a **Verify before continuing** block. Do not move to the next stage until every item in it holds.

## 0. Overview

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
| Preparation (stages 1 to 4): backup, CSR, sign, verify | 30 to 60 min, no outage | 1 h |
| Cluster settings and VCSA memory snapshot (stage 5, 1.3) | about 2 min (a 20 GB memory snapshot took under a minute) | 10 min |
| `certificate-manager` import (stage 6) | **about 3.5 min** from the final `Y` to `100% Completed` | 40 min |
| vCenter unavailable (inside stage 6) | **about 2.5 min** while all services stop and start | 40 min |
| ESXi refresh and renew (stage 7) | about 5 s per host | 15 min |
| Restore and verify (stages 8 and 9) | 15 to 20 min | 30 min |

Running virtual machines are not affected. This is a management-plane outage only: the vSphere Client, the API, and anything that talks to vCenter are unavailable while services restart. Plan the window for the budget column, not the measured one.

### Prerequisites

Work through this list before scheduling the window.

1. **The whole CryptOS chain is RSA.** vSphere accepts only SHA-2 RSA signatures (`sha256WithRSAEncryption`, `sha384WithRSAEncryption`, and so on). It rejects any `ecdsa-with-SHA*` signature anywhere in the imported chain. A certificate's signature algorithm comes from its **issuer's** key, so the Root and the Intermediate must both hold RSA keys (`pki.root_key_alg: RSA-3072` or `RSA-4096`). An RSA intermediate under an ECDSA root does not work.
2. **The CryptOS Intermediate has a working revocation endpoint.** `pki.revocation_base_url` is set on the Intermediate, the node has a resolver that can resolve that name, and `cryptosctl status` shows `Revocation: OK`. See stage 2.
3. **The Intermediate's own certificate carries CDP and AIA pointers.** If the Root's `revocation_base_url` was set after the Intermediate enrolled, re-certify the Intermediate first (same key, new certificate with pointers), using `cryptosctl ca get-renewal-csr`, `ca sign-subordinate` on the Root, and `ca submit-renewed-cert --chain`. Doing it after the import also works, because the key and subject key identifier do not change, but the chain inside vCenter would keep the older intermediate copy.
4. **An operator workstation** with `cryptosctl`, `openssl` (1.1.1 or later), `govc`, `jq`, `curl`, and the Intermediate's bootstrap admin client credential (`admin.crt`, `admin.key`).
5. **vCenter access:** the SSO administrator password, the VCSA `root` password, SSH enabled on the VCSA. Turn it on in the appliance management interface: `https://vcenter.example.org:5480` > **Access** > **SSH Login** > **Edit** > enable.
6. **ESXi access:** the `root` password of every host, in case you need the ESXi Host Client for a snapshot revert while vCenter is down.
7. **DNS:** forward and reverse records for `vcenter.example.org` match the vCenter PNID (stage 3.1 shows how to read it).
8. **Time:** vCenter and every ESXi host are in sync (NTP).
9. **Cluster health:** every host is Connected, none is in maintenance mode, no vMotion or other task is running, and there are no unacknowledged alarms you cannot explain.

### Set up govc once

Every `govc` command on this page assumes these variables on the operator workstation:

```sh
export GOVC_URL='https://vcenter.example.org/sdk'
export GOVC_USERNAME='administrator@vsphere.local'
export GOVC_PASSWORD='...'            # or leave unset and let govc prompt
export GOVC_DATACENTER='DC-01'
export GOVC_INSECURE=1                # the vCenter certificate changes during this procedure
```

`GOVC_INSECURE=1` is deliberate for the duration of the window. Anything that pins the old vCenter certificate or thumbprint stops working at the import, and `govc` should not be one of those things mid-change. Turn it off again in stage 9.4.

```sh
govc about
```

Expected output (abridged):

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

## 1. Safety gate

The import restarts every vCenter service and replaces every certificate vCenter issued. If vCenter manages the VMs that run your DNS or your CAs, losing vCenter means losing management of the machines you need to recover it. Do not skip any step in this stage.

### 1.1 File-based backup of the VCSA

A file-based backup is the only backup VMware supports for restoring a VCSA. A snapshot is not a substitute.

**vSphere UI (appliance management):**

1. Browse to `https://vcenter.example.org:5480` and log in as `root`.
2. **Backup** > **Backup Now**.
3. Backup location: an SFTP, FTPS, HTTPS, NFS or SMB target, with its credentials.
4. Set an **encryption password** and store it with your other recovery secrets.
5. Leave **Stats, Events, and Tasks** selected if you want history preserved.
6. **Start**, and wait for the job to show **Complete**.

Expected result: a new row in **Activity** with status `Complete`, and a folder on the target named after the appliance version and a timestamp, for example `M_8.0.3.00000_YYYYMMDD-HHMMSS_`.

There is no `govc` equivalent for the appliance backup.

### 1.2 Pre-flight census

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

**Service census.**

```sh
service-control --status --all
```

Expected output (the exact list depends on the features you use):

```text
Running:
 applmgmt lookupsvc lwsmd observability observability-vapi pschealth vc-ws1a-broker vlcm vmafdd vmcad vmdird vmware-analytics vmware-certificateauthority vmware-certificatemanagement vmware-cis-license vmware-content-library vmware-eam vmware-envoy vmware-envoy-hgw vmware-envoy-sidecar vmware-hvc vmware-infraprofile vmware-perfcharts vmware-pod vmware-postgres-archiver vmware-rhttpproxy vmware-sca vmware-sps vmware-stsd vmware-topologysvc vmware-trustmanagement vmware-updatemgr vmware-vapi-endpoint vmware-vdtc vmware-vmon vmware-vpostgres vmware-vpxd vmware-vpxd-svcs vmware-vsan-health vmware-vsm vsphere-ui vstats vtsdb wcp
Stopped:
 vmcam vmonapi vmware-imagebuilder vmware-netdumper vmware-rbd-watchdog vmware-vcha
```

Save this output. In the tested run, 44 services were running and the six above were stopped, and that is normal for a default deployment. After the import you must see the **same** services running.

**Current certificates.** Still on the VCSA:

```sh
/usr/lib/vmware-vmafd/bin/vecs-cli store list
```

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

```sh
/usr/lib/vmware-vmafd/bin/vecs-cli entry list --store TRUSTED_ROOTS --text | grep -E 'Alias|Subject:|Serial' -A1
/usr/lib/vmware-vmafd/bin/vecs-cli entry getcert --store MACHINE_SSL_CERT --alias __MACHINE_CERT \
  | openssl x509 -noout -subject -issuer -serial -enddate -fingerprint -sha256 -ext subjectAltName
```

Expected: one entry in `TRUSTED_ROOTS` (the self-signed VMCA root, `CN=CA, DC=vsphere, DC=local, ...`), and a machine SSL certificate issued by it:

```text
subject=CN = vcenter.example.org, C = US
issuer=CN = CA, DC = vsphere, DC = local, C = US, ST = California, O = vcenter.example.org, OU = VMware Engineering
serial=5B...A1
notAfter=Sep 16 12:00:00 2028 GMT
sha256 Fingerprint=3A:...:9F
X509v3 Subject Alternative Name:
    DNS:vcenter.example.org
```

Write down the machine SSL **SHA-256 fingerprint**. Anything that pins it must be re-pinned after the change (see 11.4).

From the operator workstation, confirm what port 443 sends today:

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | grep -c 'BEGIN CERTIFICATE'
```

Expected: `1`. A self-signed VMCA sends only the leaf.

**Host state.** List the hosts, their connection state, maintenance mode, and current certificate status:

```sh
govc ls /DC-01/host/Cluster-01
for h in esxi-01 esxi-02 esxi-03 esxi-04; do
  echo "== $h"
  govc object.collect -s /DC-01/host/Cluster-01/$h.example.org runtime.connectionState runtime.inMaintenanceMode
  govc host.cert.info -host /DC-01/host/Cluster-01/$h.example.org | grep -E 'Status|Issuer|Not After|Expiration'
done
```

Expected, for each host:

```text
== esxi-01
connected
false
Certificate Status:          good
Issuer:                      CN=CA,DC=vsphere,DC=local,C=US,ST=California,O=vcenter.example.org,OU=VMware Engineering
...
```

vSphere UI: **Hosts and Clusters** > `Cluster-01` > **Hosts** tab. Every host shows **State: Connected** and **Status: Normal** (or only alarms you have already acknowledged).

**Where is the VCSA running?** You need this for the snapshot revert, because if vCenter is down you drive the revert from that host's Host Client:

```sh
govc vm.info /DC-01/vm/vcenter | grep -E 'Name|Host|Power state'
```

```text
Name:           vcenter
  Power state:  poweredOn
  Host:         esxi-04.example.org
```

vSphere UI: select the `vcenter` VM > **Summary** > **Host**.

:::warning
Do not assume the VCSA is on the host it was deployed to. DRS moves it. In the tested run it had moved to the fourth host, not the one the runbook named. Check it on the day, and check it again right before the snapshot.
:::

**Running tasks and alarms:**

```sh
govc tasks -n 15
govc object.collect -s /DC-01 triggeredAlarmState
```

vSphere UI: **Recent Tasks** pane at the bottom (nothing running), and `DC-01` > **Monitor** > **Issues and Alarms** > **Triggered Alarms**.

### 1.3 Memory snapshot of the VCSA

Take the snapshot **as late as possible**: at the end of stage 5, right before stage 6. It is described here because it belongs to the safety gate. A snapshot that includes memory lets a revert return vCenter to its exact running state.

**govc:**

```sh
govc snapshot.create -vm /DC-01/vm/vcenter -m=true -q=false \
  -d "Before VMCA root replacement (certificate-manager option 2). Remove within 24-48 h once verified." \
  pre-vmca-import
govc snapshot.tree -vm /DC-01/vm/vcenter -D -i -s
```

Expected output of `snapshot.tree` (the ID is your vCenter's snapshot MoRef):

```text
[snapshot-NN]  pre-vmca-import  21.2GB  Sep 25 18:16
```

`-m=true` includes memory. `-q=false` skips guest quiescing. The tested run did not quiesce; a memory snapshot does not need it.

**vSphere UI:** right-click the `vcenter` VM > **Snapshots** > **Take Snapshot**. Name `pre-vmca-import`, description as above, tick **Include virtual machine's memory**, leave **Quiesce guest file system** unticked, **Create**. Then right-click > **Snapshots** > **Manage Snapshots** and confirm it is listed.

### 1.4 The rollback plan

Decide this before you start, and write it in the change ticket. In increasing order of severity:

| Situation | Action | Where |
| --- | --- | --- |
| `certificate-manager` rejects the chain or key | It prints `Operation failed, performing automatic rollback` and restores the old certificates by itself. Nothing else to do. | VCSA shell |
| Import succeeds but services do not start, or vCenter misbehaves | `certificate-manager`, option **Revert last performed operation by re-publishing old certificates**, then `service-control --start --all`. See stage 10.1. | VCSA shell |
| Revert fails, or vCenter is unreachable | Revert the memory snapshot `pre-vmca-import` from the **ESXi Host Client** of the host running the VCSA. See stage 10.2. | `https://esxi-04.example.org/ui` |
| Snapshot revert fails | Deploy a new VCSA and restore the file-based backup from 1.1. | New VCSA installer |

### Verify before continuing

- [ ] File-based backup job shows **Complete**, and you know its location and encryption password.
- [ ] Service census saved.
- [ ] Old machine SSL fingerprint and the old VMCA root recorded.
- [ ] All hosts Connected, none in maintenance mode, no running tasks.
- [ ] You know which host runs the VCSA, and you can log in to that host's Host Client as `root`.
- [ ] The rollback plan is in the change ticket.

## 2. The CryptOS profile for the VMCA subordinate

The Intermediate signs the VMCA request under a **CA profile**. The profile decides every extension on the VMCA certificate. Only the subject comes from VMCA's request.

### 2.1 What vSphere requires of the VMCA signing certificate

| Requirement | Profile setting |
| --- | --- |
| RSA key 2048 to 8192 bits. CryptOS refuses any RSA subject key below 3072, so the usable range is 3072 to 8192. | The CSR from stage 3 is RSA-3072. |
| Signature SHA-2 RSA on every certificate in the chain | the Intermediate and Root hold RSA keys |
| `basicConstraints = critical, CA:TRUE` | `is_ca: true` |
| No sub-CAs under VMCA | `path_len: 0` |
| Certificate signing and CRL signing | `key_usage: [digital_signature, cert_sign, crl_sign]` |
| Extended key usage empty, or `serverAuth` only | leave `ext_key_usage` unset |
| At most one DNS name, no wildcards | leave `sans` unset |
| Valid for the life you want, inside the Intermediate's validity | `validity_days` (see 2.2) |
| Revocation pointers (optional for vSphere, wanted for your PKI) | `pki.revocation_base_url` on the Intermediate |

### 2.2 Choose the validity

CryptOS computes the VMCA certificate's expiry as *signing time + `validity_days`*. It does **not** shorten it to fit inside the Intermediate's own validity, so you must pick a value that ends before the Intermediate does. Check the Intermediate's expiry:

```sh
cryptosctl --endpoint 192.0.2.21:443 --identity admin.crt --identity-key admin.key --trust node-trust.pem \
  identity show -o pem > inter-chain.pem
openssl x509 -in inter-chain.pem -noout -subject -enddate
```

```text
subject=CN = Example Intermediate CA G1, ...
notAfter=Sep 21 12:00:00 2041 GMT
```

With 15 years left on the Intermediate, the tested run used `validity_days: 3650` (10 years). The VMCA certificate expired in 2036, well inside the Intermediate's 2041. VMCA's own leaf certificates are much shorter (2 years for the machine SSL certificate and 5 years for ESXi hosts by default) and VMCA renews those itself.

(`node-trust.pem` is the Intermediate's pinned management certificate. See 2.4.)

### 2.3 The profile snippet

Add this to the `pki.profiles` list in the Intermediate's machine configuration. The surrounding keys are shown for context; keep your existing values for them.

```yaml
pki:
  root_key_alg: RSA-4096                  # the Intermediate's own CA key; RSA-3072 also works
  revocation_base_url: http://pki-inter.example.org
  profiles:
    # ... your existing profiles ...
    - name: platform-sub-ca
      key_alg: RSA-3072                   # required by validation; governs keys this node
                                          # generates, not the VMCA key it certifies
      validity_days: 3650                 # must end before the Intermediate's notAfter
      basic_constraints:
        is_ca: true
        path_len: 0                       # VMCA may not create sub-CAs
      key_usage: [digital_signature, cert_sign, crl_sign]
      # ext_key_usage: leave unset (vSphere allows empty or server_auth only)
      # sans: leave unset (vSphere allows at most one DNS name on the VMCA certificate)

network:
  # ... your existing interface, address and gateway ...
  nameservers: [192.0.2.53, 192.0.2.54]   # must resolve pki-inter.example.org
  search: [example.org]
```

Notes on the fields:

- `key_usage` accepts `digital_signature`, `cert_sign`, `crl_sign`, `key_encipherment` and `key_agreement`. Any other name fails validation.
- `path_len: 0` is the requested value. If the Intermediate's certificate is `pathlen:1`, the node's budget for a child is 0 anyway, so the result is `pathlen:0` either way.
- `revocation_base_url` stamps three pointers on every certificate the Intermediate signs: CRL distribution point `http://pki-inter.example.org/crl`, AIA OCSP `http://pki-inter.example.org/ocsp`, and AIA caIssuers `http://pki-inter.example.org/ca.cer`. A certificate signed without them cannot gain them later without being re-signed.
- With `revocation_base_url` set, signing **fails closed** if the node's revocation preflight is not passing (the host does not resolve, or `/crl`, `/ocsp` or `/ca.cer` does not answer). Do not set `allow_unverified_revocation_url` to get past this. Fix DNS instead.

### 2.4 Apply and verify

**Pin the Intermediate's current management certificate.** The management listener presents a self-signed certificate that is regenerated on every boot. Fetch it after the node's most recent boot:

```sh
openssl s_client -connect 192.0.2.21:443 -servername 192.0.2.21 </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > node-trust.pem
openssl x509 -in node-trust.pem -noout -subject -issuer -ext subjectAltName
```

Expected: subject and issuer are identical (self-signed), and the SANs are the node's IP and `localhost`:

```text
subject=...
issuer=...
X509v3 Subject Alternative Name:
    DNS:localhost, IP Address:192.0.2.21
```

Address the node by IP. Its management certificate has no DNS names.

For readability, the rest of this page shortens the connection flags with a shell variable:

```sh
INTER='--endpoint 192.0.2.21:443 --identity admin.crt --identity-key admin.key --trust node-trust.pem'
```

**Read, edit, apply.** `config apply` replaces the whole configuration, so always start from what the node has:

```sh
cryptosctl $INTER config get > inter-config.yaml
cp inter-config.yaml inter-config.yaml.bak
# edit inter-config.yaml: add the platform-sub-ca profile (and revocation_base_url / nameservers if missing)
diff -u inter-config.yaml.bak inter-config.yaml
cryptosctl $INTER config apply -f inter-config.yaml
```

The `diff` must show only the lines you meant to add. Expected output of the apply when only a profile changed:

```text
applied: generation=4 requires_reboot=false digest=5d2e...b7
```

Profiles are hot: `requires_reboot=false`. If the diff also added or changed `revocation_base_url` or `network.nameservers`, the apply reports `requires_reboot=true`. Those take effect at boot. Reboot the node gracefully, echoing its CA common name:

```sh
cryptosctl $INTER reboot --confirm "Example Intermediate CA G1"
```

```text
reboot accepted: the node is shutting down cleanly and rebooting
```

The node is back in about 10 seconds. **Re-pin** `node-trust.pem` after every reboot (repeat the `openssl s_client` fetch above), or every later call fails with `x509: certificate signed by unknown authority`.

If `config apply` prints `WARNING:` about `revocation_base_url` naming a host with no `nameservers`, add `network.nameservers` before going further.

**Verify the node:**

```sh
cryptosctl $INTER status
cryptosctl $INTER config get | grep -A12 'name: platform-sub-ca'
```

Expected `status`:

```text
Role:            INTERMEDIATE
Identity:        ESTABLISHED
TPM:             ...
etcd:            OK
Boot count:      3
Version:         ...
Revocation:      OK http://pki-inter.example.org (checked 2026-09-25T16:47:50Z)
DNS:             MACHINE_CONFIG 192.0.2.53, 192.0.2.54 (search example.org)
```

**Verify the revocation endpoints from the workstation:**

```sh
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://pki-inter.example.org/crl
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://pki-inter.example.org/ca.cer
```

```text
200 application/pkix-crl
200 application/pkix-cert
```

### Verify before continuing

- [ ] `config get` shows `platform-sub-ca` exactly as in 2.3.
- [ ] `validity_days` ends before the Intermediate's `notAfter`.
- [ ] `status` shows `Revocation: OK` with your base URL.
- [ ] `/crl` and `/ca.cer` answer `200` from the workstation.
- [ ] `node-trust.pem` was fetched after the node's latest boot.

## 3. Generate the VMCA CSR on the VCSA (non-destructive)

This stage creates a new RSA key pair and a certificate signing request on the VCSA. It writes local files only: it does not touch VECS, does not restart anything, and vCenter keeps running on its old certificates.

The tested method uses `certool` directly (3.2). An alternative using `certificate-manager` is in 3.4.

### 3.1 Find the PNID

The PNID (primary network identifier) is the name vCenter was deployed with. The machine SSL certificate must carry it as a DNS SAN, or clients get a name mismatch.

```sh
/usr/lib/vmware-vmafd/bin/vmafd-cli get-pnid --server-name localhost
```

```text
vcenter.example.org
```

Confirm that forward and reverse DNS agree with it, from the workstation:

```sh
dig +short vcenter.example.org
dig +short -x 192.0.2.10
```

```text
192.0.2.10
vcenter.example.org.
```

### 3.2 Generate the key and CSR with certool

On the VCSA Bash shell (see 1.2 for how to get there):

```sh
umask 077
mkdir -p /root/vmca
chmod 700 /root/vmca
cd /root/vmca
```

Write the certool configuration. These values become the **VMCA CA certificate's subject**. `Name` becomes the CN.

```sh
cat > /root/vmca/vmca.cfg <<'CFG'
Country = US
Name = Example vSphere CA
Organization = Example Organization
OrgUnit = IT Infrastructure
State = Example State
Locality = Example City
Hostname = vcenter.example.org
Email = ca-admin@example.org
CFG
```

Generate a self-signed CA certificate and key. The self-signed certificate is only a vehicle for the key and subject; it is never installed.

```sh
/usr/lib/vmware-vmca/bin/certool --genselfcacert \
  --outcert=/root/vmca/vmca-self.crt \
  --outprivkey=/root/vmca/vmca.key \
  --config=/root/vmca/vmca.cfg
```

```text
Using config file : /root/vmca/vmca.cfg
Status : Success
```

Generate the CSR from it:

```sh
/usr/lib/vmware-vmca/bin/certool --gencsrfromcert \
  --cert=/root/vmca/vmca-self.crt \
  --privkey=/root/vmca/vmca.key \
  --csrfile=/root/vmca/vmca.csr
```

```text
Status : Success
```

`certool` creates the files owned by `vmcad-user:lwis`. Make them root-only:

```sh
chown root:root /root/vmca/*
chmod 600 /root/vmca/*
ls -la /root/vmca
```

```text
drwx------ 2 root root 4096 Sep 25 16:30 .
drwxr-x--- 6 root root 4096 Sep 25 16:30 ..
-rw------- 1 root root  245 Sep 25 16:30 vmca.cfg
-rw------- 1 root root 1602 Sep 25 16:30 vmca.csr
-rw------- 1 root root 2483 Sep 25 16:30 vmca.key
-rw------- 1 root root 1927 Sep 25 16:30 vmca-self.crt
```

The private key is **unencrypted** PKCS#8. That is required: vCenter services cannot start automatically with a passphrase-protected CA key. It never leaves the VCSA.

### 3.3 Check the CSR

```sh
openssl req -in /root/vmca/vmca.csr -noout -text | grep -E 'Subject:|Public-Key|Signature Algorithm'
openssl req -in /root/vmca/vmca.csr -noout -verify
openssl rsa -in /root/vmca/vmca.key -noout -check
openssl req -in /root/vmca/vmca.csr -noout -pubkey | openssl sha256
openssl rsa -in /root/vmca/vmca.key -pubout 2>/dev/null | openssl sha256
```

Expected:

```text
        Subject: CN = Example vSphere CA, C = US, ST = Example State, L = Example City, O = Example Organization, OU = IT Infrastructure
                Public-Key: (3072 bit)
    Signature Algorithm: sha256WithRSAEncryption
Certificate request self-signature verify OK
RSA key ok
SHA2-256(stdin)= 3a41...c09f
SHA2-256(stdin)= 3a41...c09f
```

The two SHA-256 lines must be identical: the CSR carries the key you just made. **Stop if `Public-Key` is below `(3072 bit)`.** CryptOS refuses to certify an RSA key smaller than 3072 bits. In the tested run, `certool --genselfcacert` produced RSA-3072.

**Copy the CSR to the workstation.** The CSR is public. The simplest way that needs no change to the VCSA's login shell is to print it and paste it:

```sh
cat /root/vmca/vmca.csr
```

On the workstation, paste it into `vmca.csr`:

```sh
cat > vmca.csr <<'EOF'
-----BEGIN CERTIFICATE REQUEST-----
...paste...
-----END CERTIFICATE REQUEST-----
EOF
openssl sha256 vmca.csr
```

Compare with `openssl sha256 /root/vmca/vmca.csr` on the VCSA. They must match.

If you prefer `scp`: the VCSA's `root` login shell is the appliance shell, which `scp` cannot use. Switch it with `chsh -s /bin/bash root` on the VCSA, copy, then switch it back with `chsh -s /bin/appliancesh root`.

### 3.4 Alternative: generate the CSR with certificate-manager

`certificate-manager` option 2 has a sub-option that only generates a CSR and key, and exits without changing anything. It asks the same SSO and certool questions as the import in stage 6, so read stage 6.2 for the full list. The sequence is:

1. `/usr/lib/vmware-vmca/bin/certificate-manager`
2. `Option[1 to 8]:` answer `2`
3. `Do you wish to generate all certificates using configuration file : Option[Y/N] ? :` answer `Y`
4. SSO username and password
5. The certool values (Country, Name, Organization, OrgUnit, State, Locality, IPAddress, Email, Hostname, VMCA Name) as in 6.2
6. `Option [1 or 2]:` answer **`1`** (Generate Certificate Signing Request(s) and Key(s) for VMCA Root Signing certificate)
7. `Output directory path:` answer `/root/vmca` (prompt wording may vary by build)

It writes `vmca_issued_csr.csr` and `vmca_issued_key.key` to that directory. If you use this path, run every check in 3.3 on those files, **especially the key size**, and use `vmca_issued_key.key` wherever this page says `vmca.key`. This variant was not used in the tested run.

### Verify before continuing

- [ ] `/root/vmca/vmca.key` and `/root/vmca/vmca.csr` exist, owned by root, mode 600, directory mode 700.
- [ ] CSR subject has `CN = Example vSphere CA`.
- [ ] `Public-Key: (3072 bit)` or larger.
- [ ] CSR self-signature verifies, and the CSR and key public-key digests match.
- [ ] The workstation copy of `vmca.csr` has the same SHA-256 as the VCSA copy.
- [ ] vCenter is untouched: `service-control --status --all` is unchanged and port 443 still sends one certificate.

## 4. Sign with cryptosctl and build the full chain

### 4.1 Sign

On the workstation, with a fresh `node-trust.pem` (2.4):

```sh
cryptosctl $INTER ca sign-subordinate --csr vmca.csr --profile platform-sub-ca > vmca-chain.pem
```

Spelled out without the variable:

```sh
cryptosctl ca sign-subordinate \
  --endpoint 192.0.2.21:443 \
  --identity admin.crt --identity-key admin.key \
  --trust node-trust.pem \
  --csr vmca.csr \
  --profile platform-sub-ca > vmca-chain.pem
```

- `sign-subordinate` is a subcommand of `ca`. `--csr` (PEM or DER) and `--profile` are both required, and the profile must be a CA profile defined on the node.
- `--endpoint`, `--identity`, `--identity-key` and `--trust` are the global connection flags. If you connect through a DNS name instead of the IP, add `--server-name 192.0.2.21`.
- There is no `--node` flag, and `--trust root.pem` does not work (the management certificate is self-signed and pinned, not issued by your Root).

The command prints nothing on stderr on success. `vmca-chain.pem` is **leaf-first** and contains exactly two certificates: the new VMCA certificate, then the Intermediate. **The Root is not included.**

```sh
grep -c 'BEGIN CERTIFICATE' vmca-chain.pem
```

```text
2
```

If the call fails:

| Error | Cause | Fix |
| --- | --- | --- |
| `x509: certificate signed by unknown authority` | The node rebooted since you fetched `node-trust.pem` | Fetch it again (2.4) |
| `FailedPrecondition ... revocation preflight failing for configured revocation_base_url; issuance blocked` | The Intermediate cannot resolve or reach its own `revocation_base_url` | Fix `network.nameservers` or DNS, reboot, confirm `Revocation: OK` |
| An error naming the key size | The CSR key is below RSA-3072 | Regenerate the CSR (stage 3) with a larger key |
| An error naming the profile | The profile name is wrong or it is not a CA profile | Check `config get` |

### 4.2 Get the Root certificate

Use the copy of `Example Root CA G1` you already distribute and trust. If you need to fetch it, take it from the Root node and compare its fingerprint with the one recorded at the root ceremony:

```sh
openssl s_client -connect 192.0.2.20:443 -servername 192.0.2.20 </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > root-node-trust.pem
cryptosctl --endpoint 192.0.2.20:443 --identity root-admin.crt --identity-key root-admin.key \
  --trust root-node-trust.pem identity show -o pem > root.pem
openssl x509 -in root.pem -noout -subject -issuer -fingerprint -sha256
```

```text
subject=CN = Example Root CA G1, ...
issuer=CN = Example Root CA G1, ...
sha256 Fingerprint=4D:...:E2
```

Or, without an admin credential for the Root, fetch it from the Root's revocation endpoint (`http://pki-root.example.org/ca.cer`, DER) and convert it:

```sh
curl -s http://pki-root.example.org/ca.cer | openssl x509 -inform DER -outform PEM > root.pem
```

The fingerprint check is what makes either method safe. Do not skip it.

### 4.3 Build the full chain in the right order

`certificate-manager` needs the whole chain in one file, **most specific first**: VMCA, then the Intermediate, then the Root.

```sh
cat vmca-chain.pem root.pem > vmca-fullchain.pem
```

Split it into single files for the checks below:

```sh
awk '/-----BEGIN CERTIFICATE-----/{n++; f=1} f{print > ("chain-" n ".pem")} /-----END CERTIFICATE-----/{f=0}' vmca-fullchain.pem
for f in chain-1.pem chain-2.pem chain-3.pem; do
  echo "== $f"; openssl x509 -in $f -noout -subject -issuer
done
```

Expected, in exactly this order:

```text
== chain-1.pem
subject=CN = Example vSphere CA, C = US, ST = Example State, L = Example City, O = Example Organization, OU = IT Infrastructure
issuer=CN = Example Intermediate CA G1, ...
== chain-2.pem
subject=CN = Example Intermediate CA G1, ...
issuer=CN = Example Root CA G1, ...
== chain-3.pem
subject=CN = Example Root CA G1, ...
issuer=CN = Example Root CA G1, ...
```

Each certificate's issuer is the next certificate's subject, and the last one is self-signed.

If your hierarchy is deeper (a Root, a policy CA, then an issuing CA), append every missing CA certificate between the Intermediate and the Root, in order.

### 4.4 Verify with openssl

**Signature algorithm of every certificate:**

```sh
openssl crl2pkcs7 -nocrl -certfile vmca-fullchain.pem | openssl pkcs7 -print_certs -text -noout \
  | grep 'Signature Algorithm' | sort | uniq -c
```

```text
      6     Signature Algorithm: sha384WithRSAEncryption
```

Every line must end in `WithRSAEncryption`. Any `ecdsa-with-SHA256` or `ecdsa-with-SHA384` means the hierarchy is not RSA end to end. **Stop.** vCenter would reject the import.

**The VMCA certificate's extensions:**

```sh
openssl x509 -in chain-1.pem -noout -serial -dates \
  -ext basicConstraints,keyUsage,extendedKeyUsage,subjectAltName,crlDistributionPoints,authorityInfoAccess
openssl x509 -in chain-1.pem -noout -text | grep 'Public-Key'
```

Expected:

```text
serial=3A...9F
notBefore=Sep 25 16:52:00 2026 GMT
notAfter=Sep 22 16:52:00 2036 GMT
X509v3 Basic Constraints: critical
    CA:TRUE, pathlen:0
X509v3 Key Usage: critical
    Digital Signature, Certificate Sign, CRL Sign
No extensions in certificate with name extendedKeyUsage
No extensions in certificate with name subjectAltName
X509v3 CRL Distribution Points:
    Full Name:
      URI:http://pki-inter.example.org/crl
Authority Information Access:
    OCSP - URI:http://pki-inter.example.org/ocsp
    CA Issuers - URI:http://pki-inter.example.org/ca.cer
                Public-Key: (3072 bit)
```

Check each line:

- `CA:TRUE, pathlen:0`
- Key usage includes both `Certificate Sign` and `CRL Sign`
- No extended key usage, no subject alternative name
- CDP, OCSP and CA Issuers under your `revocation_base_url`
- `notAfter` is earlier than the Intermediate's `notAfter` (`openssl x509 -in chain-2.pem -noout -enddate`)

**The certificate matches the key on the VCSA.** On the workstation:

```sh
openssl x509 -in chain-1.pem -noout -modulus | openssl sha256
```

On the VCSA:

```sh
openssl rsa -in /root/vmca/vmca.key -noout -modulus | openssl sha256
```

Both must print the same digest, for example `SHA2-256(stdin)= 3a41...c09f`. A mismatch means the certificate was issued for a different CSR. Do not import it.

**The chain verifies to the Root:**

```sh
openssl verify -CAfile root.pem -untrusted chain-2.pem chain-1.pem
openssl verify -CAfile root.pem chain-2.pem
```

```text
chain-1.pem: OK
chain-2.pem: OK
```

**Optional: the VMCA certificate is not revoked.**

```sh
openssl ocsp -issuer chain-2.pem -cert chain-1.pem -url http://pki-inter.example.org/ocsp \
  -CAfile root.pem -verify_other chain-2.pem -resp_text \
  | grep -E 'Cert Status|Response verify'
```

```text
Response verify OK
    Cert Status: good
```

### 4.5 Copy the full chain to the VCSA

The chain is public. Paste it the same way as the CSR, in reverse:

```sh
# on the VCSA
cat > /root/vmca/vmca-fullchain.pem <<'EOF'
-----BEGIN CERTIFICATE-----
...VMCA...
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
...Intermediate...
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
...Root...
-----END CERTIFICATE-----
EOF
chmod 600 /root/vmca/vmca-fullchain.pem
```

Then **re-run the checks on the VCSA**, where the import will read the files:

```sh
cd /root/vmca
openssl sha256 vmca-fullchain.pem                       # must match the workstation copy
grep -c 'BEGIN CERTIFICATE' vmca-fullchain.pem          # 3
awk '/-----BEGIN CERTIFICATE-----/{n++; f=1} f{print > ("chain-" n ".pem")} /-----END CERTIFICATE-----/{f=0}' vmca-fullchain.pem
openssl verify -CAfile chain-3.pem -untrusted chain-2.pem chain-1.pem
openssl x509 -in chain-1.pem -noout -modulus | openssl sha256
openssl rsa  -in vmca.key    -noout -modulus | openssl sha256
```

```text
3
chain-1.pem: OK
SHA2-256(stdin)= 3a41...c09f
SHA2-256(stdin)= 3a41...c09f
```

### Verify before continuing

- [ ] `vmca-fullchain.pem` has 3 certificates, in the order VMCA, Intermediate, Root.
- [ ] Every signature is `...WithRSAEncryption`.
- [ ] VMCA: `CA:TRUE, pathlen:0`, `Certificate Sign` and `CRL Sign`, no EKU, no SAN, RSA-3072 or larger.
- [ ] VMCA `notAfter` is before the Intermediate's `notAfter`.
- [ ] The certificate modulus matches `vmca.key`, checked on the VCSA.
- [ ] `openssl verify` prints `OK` on the workstation and on the VCSA.

## 5. Pre-change cluster settings

These changes reduce noise and risk while vCenter restarts. **Record the original values first**: you restore them exactly in stage 8.

### 5.1 Record the originals

**Certificate management settings:**

```sh
govc option.ls vpxd.certmgmt
```

Expected (defaults on a fresh vCenter 8):

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

**DRS and HA:**

```sh
govc object.collect -json /DC-01/host/Cluster-01 configurationEx | jq '.[0].val | {
  drs: .drsConfig,
  das: (.dasConfig | {enabled, hostMonitoring, vmMonitoring, admissionControlEnabled, admissionControlPolicy})
}'
```

Expected (your values may differ; write down what **you** see):

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

Save this JSON in the change ticket.

vSphere UI: `Cluster-01` > **Configure** > **Services** > **vSphere DRS** (automation level and migration threshold), and **vSphere Availability** (host monitoring, admission control: policy, host failures to tolerate, reserved CPU and memory percentages).

### 5.2 minutesBefore: 1440 to 5

`vpxd.certmgmt.certs.minutesBefore` back-dates the `notBefore` of certificates VMCA issues to ESXi hosts. The default of 1440 minutes (24 hours) can make a freshly issued host certificate start *before* the new VMCA certificate itself does, which a host rejects. Setting it to 5 minutes for the window avoids that (VMware KB 2123386).

**govc:**

```sh
govc option.set vpxd.certmgmt.certs.minutesBefore 5
govc option.ls vpxd.certmgmt.certs.minutesBefore
```

```text
vpxd.certmgmt.certs.minutesBefore:  5
```

**vSphere UI:** select `vcenter.example.org` in the inventory > **Configure** > **Settings** > **Advanced Settings** > **Edit Settings**. Filter on `minutesBefore`, change the value from `1440` to `5`, **Save**.

### 5.3 DRS: fullyAutomated to partiallyAutomated

This stops DRS from migrating VMs, including the VCSA itself, while vCenter restarts. **Do not disable DRS.** Disabling DRS deletes every resource pool in the cluster.

**govc:**

```sh
govc cluster.change -drs-mode partiallyAutomated /DC-01/host/Cluster-01
```

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere DRS** > **Edit** > **Automation Level: Partially Automated** > **OK**. Leave the vSphere DRS toggle on.

### 5.4 HA: off

This avoids HA elections and host isolation responses while the hosts' trust changes.

**govc:**

```sh
govc cluster.change -ha-enabled=false /DC-01/host/Cluster-01
```

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere Availability** > **Edit** > turn **vSphere HA** off > **OK**.

Turning HA off keeps the admission control policy stored in the cluster configuration, so turning it back on in stage 8 restores the same percentages. You verify that in stage 8.

### 5.5 Take the snapshot now

Run 1.3 now. Re-check the VCSA's host first (`govc vm.info /DC-01/vm/vcenter | grep Host`), since it is the host you would revert from.

### Verify before continuing

```sh
govc option.ls vpxd.certmgmt.certs.minutesBefore
govc object.collect -json /DC-01/host/Cluster-01 configurationEx \
  | jq -c '.[0].val | {drs: .drsConfig.defaultVmBehavior, rate: .drsConfig.vmotionRate, ha: .dasConfig.enabled}'
govc snapshot.tree -vm /DC-01/vm/vcenter
```

```text
vpxd.certmgmt.certs.minutesBefore:  5
{"drs":"partiallyAutomated","rate":3,"ha":false}
pre-vmca-import
```

- [ ] `minutesBefore` is `5`.
- [ ] DRS is enabled and `partiallyAutomated`. HA is `false`.
- [ ] Snapshot `pre-vmca-import` exists, with memory.
- [ ] Original values saved in the ticket.

## 6. The import

This is the disruptive step. From the final `Y` onward, `certificate-manager` replaces the VMCA root, regenerates every certificate vCenter issued, and restarts every service.

### 6.1 Before you start

- Run it from an SSH session that will not drop. `sshd` is not restarted, but if your client disconnects mid-run the process can be killed. The VM console in the vSphere Client is a fallback, but it becomes unavailable as soon as vCenter's services stop, so the ESXi Host Client console is the better fallback.
- Have ready: the SSO administrator password, `/root/vmca/vmca-fullchain.pem`, `/root/vmca/vmca.key`, and the answers in the table in 6.2.
- Keep a second terminal open on the workstation for watching port 443.

### 6.2 Prompt-and-answer transcript

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
| **`Hostname`** | **`vcenter.example.org`** | **the DNS SAN on the machine SSL certificate. Must equal the PNID from 3.1.** |
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

Answers: `/root/vmca/vmca-fullchain.pem` (the **full chain** from stage 4, not the VMCA certificate alone), then `/root/vmca/vmca.key`.

**Final confirmation.** This is the point of no return (short of a revert):

```text
You are going to replace Root Certificate with custom certificate and regenerate all other certificates
Continue operation : Option[Y/N] ? : Y
```

Answer: **`Y`**.

### 6.3 Expected progress output

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

In the tested run, the `Y` was entered at 18:17:35 UTC and `100% Completed [All tasks completed successfully]` appeared at 18:21:05 UTC: **about 3.5 minutes**. The exit status was 0.

If you see this instead, the chain or key was rejected:

```text
Status : 0% Completed [Operation failed, performing automatic rollback]
```

The tool restores the original certificates itself. Read `/var/log/vmware/vmcad/certificate-manager.log`, fix the cause (see stage 11), and start again from stage 6. The usual cause is an ECDSA signature somewhere in the chain, a chain in the wrong order, or a certificate that does not match the key.

### 6.4 What the outage looks like

- From about 70% (`stopping services...`) until shortly after 100%, vCenter is unavailable: about **2.5 minutes** in the tested run.
- The vSphere Client shows errors or a blank page, then logs every user out. Log in again once `/ui` loads.
- `govc` calls fail with connection errors, then work again (with `GOVC_INSECURE=1`).
- Port 443 briefly refuses connections, then presents the **new** certificate chain.
- If you exit the Bash shell back to the appliance shell while services are starting, you may see `[ERROR]: Failed to connect to service.` That is the appliance shell losing its API connection during the restart. It is harmless.
- Virtual machines keep running. ESXi hosts keep running their workloads.

Watch from the workstation:

```sh
while ! curl -sk -o /dev/null -w '%{http_code}\n' https://vcenter.example.org/ui/ | grep -q 200; do sleep 5; done; date -u
```

### Verify before continuing

On the VCSA:

```sh
service-control --status --all
```

The **Running** list must match the census from 1.2 exactly. If a service that was running is now stopped, start it with `service-control --start <name>` and look at its log before going further.

On the workstation:

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | grep -E '^ *[0-9] s:|^ *i:'
govc about | head -1
```

Expected:

```text
 0 s:CN = vcenter.example.org, ...
   i:CN = Example vSphere CA, C = US, ST = Example State, L = Example City, O = Example Organization, OU = IT Infrastructure
 1 s:CN = Example vSphere CA, ...
   i:CN = Example Intermediate CA G1, ...
 2 s:CN = Example Intermediate CA G1, ...
   i:CN = Example Root CA G1, ...
FullName:     VMware vCenter Server 8.0.3 build-...
```

- [ ] `certificate-manager` reached `100% Completed [All tasks completed successfully]`.
- [ ] The same services are running as before.
- [ ] Port 443 presents three certificates: machine SSL, VMCA, Intermediate.
- [ ] The vSphere Client loads and you can log in. `govc about` works.

## 7. ESXi hosts: refresh CA certificates, then renew

Each host must first learn the new trust chain (**Refresh CA Certificates**, which also pushes CRLs), and then get a new certificate from the new VMCA (**Renew**). Do the two steps in that order, one host at a time, and check that the host stays **Connected** before moving to the next.

In the tested run each step took about 5 seconds per host, and no host went Not Responding.

### 7.1 vSphere UI, per host

1. **Hosts and Clusters** > `Cluster-01` > `esxi-01.example.org`.
2. **Configure** > **System** > **Certificate**.
3. **Refresh CA Certificates** (in some builds it sits under a **Manage with VMCA** menu). Wait for the task in **Recent Tasks** to show **Completed**.
4. **Renew**, and confirm. Wait for the task to complete.
5. Refresh the Certificate page. **Issuer** now shows `CN=Example vSphere CA, ...`, **Valid From** is a few minutes ago, **Valid To** is five years out, and **Status** is **Good**.
6. Check the host **Summary**: state **Connected**.
7. Repeat for `esxi-02`, `esxi-03`, `esxi-04`.

### 7.2 API equivalents

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

Expected, per host:

```text
Name                  ConnectionState
----                  ---------------
esxi-01.example.org   Connected
```

Any vSphere SDK works the same way (pyVmomi, the Go `govmomi` library): call the two tasks in order and wait for each to finish.

### 7.3 If a host goes Not Responding

This did not happen in the tested run, but it is the documented failure mode when a host still trusts only the old VMCA root:

1. Run **Refresh CA Certificates** on that host again.
2. Right-click the host > **Connection** > **Connect**, and accept the new certificate thumbprint if asked.
3. Then **Renew**.

### Verify before continuing

**govc, per host:**

```sh
for h in esxi-01 esxi-02 esxi-03 esxi-04; do
  echo "== $h"
  govc object.collect -s /DC-01/host/Cluster-01/$h.example.org runtime.connectionState
  govc host.cert.info -host /DC-01/host/Cluster-01/$h.example.org | grep -E 'Status|Issuer|Not Before|Not After|Expiration'
done
```

Expected, for each host:

```text
== esxi-01
connected
Certificate Status:          good
Issuer:                      CN=Example vSphere CA,C=US,ST=Example State,L=Example City,O=Example Organization,OU=IT Infrastructure
...
```

**openssl, per host, from the workstation:**

```sh
for h in esxi-01 esxi-02 esxi-03 esxi-04; do
  echo "== $h"
  openssl s_client -connect $h.example.org:443 -servername $h.example.org -CAfile root.pem \
    -verify_hostname $h.example.org </dev/null 2>/dev/null \
    | grep -E '^ *[0-9] s:|Verify return code'
done
```

Expected, for each host:

```text
== esxi-01
 0 s:... CN = esxi-01.example.org
 1 s:CN = Example vSphere CA, ...
 2 s:CN = Example Intermediate CA G1, ...
Verify return code: 0 (ok)
```

- [ ] Every host is **Connected**.
- [ ] Every host certificate is issued by `Example vSphere CA`, status good.
- [ ] Every host presents leaf, VMCA, Intermediate on port 443, and verifies to `root.pem` with its hostname.

## 8. Restore settings

Put back exactly what you recorded in 5.1.

### 8.1 minutesBefore back to 1440

**govc:**

```sh
govc option.set vpxd.certmgmt.certs.minutesBefore 1440
```

**vSphere UI:** `vcenter.example.org` > **Configure** > **Settings** > **Advanced Settings** > **Edit Settings** > `vpxd.certmgmt.certs.minutesBefore` = `1440` > **Save**.

### 8.2 DRS back to fullyAutomated, with the original threshold

**govc:**

```sh
govc cluster.change -drs-enabled=true -drs-mode fullyAutomated -drs-vmotion-rate 3 /DC-01/host/Cluster-01
```

Use your own recorded `vmotionRate` for `-drs-vmotion-rate`.

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere DRS** > **Edit** > **Automation Level: Fully Automated**, **Migration Threshold** back to the recorded position > **OK**.

### 8.3 HA back on, with the original admission control

**govc:**

```sh
govc cluster.change -ha-enabled=true -ha-admission-control-enabled=true /DC-01/host/Cluster-01
```

**vSphere UI:** `Cluster-01` > **Configure** > **Services** > **vSphere Availability** > **Edit** > turn **vSphere HA** on. Check **Failures and responses** > **Host Monitoring** is on, and **Admission Control** matches the recorded policy (for example *Cluster resource percentage*, *Host failures cluster tolerates: 1*, *Override calculated failover capacity* unticked, which gives the auto-computed 25 % CPU and 25 % memory on a four-host cluster) > **OK**.

HA reconfigures each host and elects a new primary. Wait until every host shows the HA state **Running (Primary)** or **Connected (Secondary)** in `Cluster-01` > **Monitor** > **vSphere HA** > **Summary**.

### Verify before continuing

```sh
govc option.ls vpxd.certmgmt.certs.minutesBefore
govc object.collect -json /DC-01/host/Cluster-01 configurationEx | jq '.[0].val | {
  drs: .drsConfig,
  das: (.dasConfig | {enabled, hostMonitoring, vmMonitoring, admissionControlEnabled, admissionControlPolicy})
}'
```

- [ ] `minutesBefore` is `1440`.
- [ ] The JSON matches the JSON you saved in 5.1, field for field.
- [ ] HA shows a primary and no configuration errors on any host.

## 9. Verification

### 9.1 vCenter port 443, with hostname verification

This is the check a browser does. On the workstation, with only the Root as the trust anchor:

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org \
  -CAfile root.pem -verify_hostname vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | grep -E '^ *[0-9] s:|^ *i:|Verify return code'
```

```text
 0 s:CN = vcenter.example.org, ...
   i:CN = Example vSphere CA, ...
 1 s:CN = Example vSphere CA, ...
   i:CN = Example Intermediate CA G1, ...
 2 s:CN = Example Intermediate CA G1, ...
   i:CN = Example Root CA G1, ...
Verify return code: 0 (ok)
```

The same check with `openssl verify` on saved files:

```sh
openssl s_client -connect vcenter.example.org:443 -servername vcenter.example.org -showcerts </dev/null 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/{n++; f=1} f{print > ("vc-" n ".pem")} /-----END CERTIFICATE-----/{f=0}'
cat vc-2.pem vc-3.pem > vc-intermediates.pem
openssl verify -CAfile root.pem -untrusted vc-intermediates.pem -verify_hostname vcenter.example.org vc-1.pem
openssl x509 -in vc-1.pem -noout -serial -dates -fingerprint -sha256 -ext subjectAltName
```

```text
vc-1.pem: OK
serial=6E...0C
notBefore=Sep 25 18:15:00 2026 GMT
notAfter=Sep 24 18:15:00 2028 GMT
sha256 Fingerprint=7C:...:1B
X509v3 Subject Alternative Name:
    DNS:vcenter.example.org, IP Address:192.0.2.10, email:ca-admin@example.org
```

- The server sends the leaf **and** the intermediates. A server that sends only the leaf fails on clients that hold only the Root.
- The SAN includes the PNID.
- Every certificate is RSA-signed (`openssl x509 -in vc-N.pem -noout -text | grep 'Signature Algorithm'`).

### 9.2 VECS stores on the VCSA

```sh
V=/usr/lib/vmware-vmafd/bin/vecs-cli
$V store list
for s in MACHINE_SSL_CERT machine vsphere-webclient vpxd vpxd-extension hvc wcp data-encipherment SMS; do
  echo "== $s"
  $V entry list --store "$s" --text | grep -E 'Alias :|Issuer:' | head -4
done
```

Expected:

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

```sh
$V entry list --store TRUSTED_ROOTS --text | grep -E 'Alias :|Subject:'
```

Expected: four entries. The new `Example vSphere CA`, `Example Intermediate CA G1`, `Example Root CA G1`, and the **old** self-signed VMCA root (`CN=CA, DC=vsphere, DC=local, ...`). Leave the old root in place; `data-encipherment` and `SMS` still chain to it.

```sh
$V entry list --store BACKUP_STORE --text | grep 'Alias :'
```

Expected: a new `BACKUP_STORE` with `bkp_*` entries (seven in the tested run: `bkp___MACHINE_CERT`, `bkp_machine`, `bkp_vsphere-webclient`, `bkp_vpxd`, `bkp_vpxd-extension`, `bkp_hvc`, `bkp_wcp`). These are what the revert option in 10.1 republishes.

### 9.3 ESXi hosts

Repeat the openssl loop from the stage 7 verify block. Each host must present leaf, VMCA, Intermediate, and verify to the Root with its own hostname. Also browse to `https://esxi-01.example.org/ui` from a client that trusts only the Root and confirm there is no certificate warning.

### 9.4 Clients and automation

- **Browsers and operating systems** need only `Example Root CA G1` in their trust store. Do not distribute the VMCA or Intermediate certificates as trust anchors. If a browser still warns after the Root is installed, clear its cache or HSTS state for the site, or restart it, and re-check with 9.1.
- **govc:** turn verification back on. Unset `GOVC_INSECURE` and point govc at the Root:

  ```sh
  unset GOVC_INSECURE
  export GOVC_TLS_CA_CERTS=/path/to/root.pem
  govc about | head -1
  ```

  If you use `GOVC_TLS_KNOWN_HOSTS`, remove the old vCenter entry first.

- **Anything that pinned the old vCenter thumbprint** (backup software, monitoring, PowerCLI with a saved thumbprint, Kubernetes CSI or CPI secrets, telemetry collectors) must be re-pinned to the new fingerprint from 9.1, or better, switched to trusting the Root.

- **Alarms and tasks:** `DC-01` > **Monitor** > **Issues and Alarms** shows nothing new, and **Recent Tasks** shows the refresh and renew tasks as completed.

### Verify before continuing

- [ ] vCenter and every host verify to the Root with hostname checking, from a machine that trusts only the Root.
- [ ] VECS stores as in the table; `data-encipherment` and `SMS` on the old root is expected.
- [ ] `BACKUP_STORE` exists.
- [ ] No new alarms.
- [ ] govc works with verification on.

## 10. Rollback and cleanup

### 10.1 Revert with certificate-manager

Use this if the import completed but vCenter misbehaves. It republishes the certificates saved in `BACKUP_STORE`.

```sh
/usr/lib/vmware-vmca/bin/certificate-manager
```

At `Option[1 to 8]:`, choose the option labelled **Revert last performed operation by re-publishing old certificates**. On the vCenter 8.0 menu in 6.2 that is option **7**. Go by the label, not the number: option **8**, *Reset all Certificates*, is a different operation that generates a brand-new self-signed VMCA root and replaces everything.

It asks for the SSO credentials and a `Y` confirmation, restarts services, and ends with `100% Completed`. Then:

```sh
service-control --start --all
service-control --status --all
```

Afterwards, every host you already renewed holds a certificate from the new VMCA that vCenter no longer trusts. Run **Refresh CA Certificates** and **Renew** on each host again (stage 7), so they get certificates from the restored VMCA root.

### 10.2 Revert the snapshot

Use this if the revert fails or vCenter is unreachable. **vCenter cannot revert its own snapshot while it is down**, so do it on the host that runs the VCSA (from 1.2).

**ESXi Host Client:**

1. Browse to `https://esxi-04.example.org/ui` and log in as `root`.
2. **Virtual Machines** > `vcenter` > **Actions** > **Snapshots** > **Manage snapshots**.
3. Select `pre-vmca-import` > **Restore snapshot** > confirm.

Because the snapshot holds memory, the VCSA comes back running, in its state from before the import.

**govc against the host directly:**

```sh
GOVC_URL='https://esxi-04.example.org/sdk' GOVC_USERNAME=root GOVC_PASSWORD='...' GOVC_INSECURE=1 GOVC_DATACENTER=ha-datacenter \
  govc snapshot.revert -vm vcenter pre-vmca-import
```

After a snapshot revert, re-check the cluster settings: they revert with vCenter's database, so DRS is back to what it was when the snapshot was taken (partially automated, HA off). Restore them with stage 8. Hosts you renewed after the snapshot need Refresh CA Certificates and Renew again, as in 10.1.

### 10.3 Cleanup

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

   Treat the archive like any CA private key: it can issue certificates your whole estate trusts.

3. **Close the shell access you opened.** In the appliance shell: `shell.set --enabled false`. Disable SSH if it was off before the change: `https://vcenter.example.org:5480` > **Access** > **SSH Login** > **Edit** > disable. If you changed root's login shell for `scp`, confirm it is back to `/bin/appliancesh`.

4. **Workstation:** delete `node-trust.pem` (it goes stale at the next node reboot anyway), keep `vmca-fullchain.pem` and the change ticket records.

5. **Schedule recurring file-based backups** of the VCSA if they were not already scheduled: `https://vcenter.example.org:5480` > **Backup** > **Backup Schedule** > **Configure**.

### Verify before continuing

- [ ] No snapshot remains on the VCSA.
- [ ] `/root/vmca` is gone from the VCSA, and the archive is in escrow with a verified digest.
- [ ] The Bash shell is disabled and SSH is in its pre-change state.

## 11. Troubleshooting and gotchas

### 11.1 DRS moved the VCSA

The VCSA's host is whatever DRS last chose, not where it was deployed. Before the snapshot, and again before any revert, check `govc vm.info /DC-01/vm/vcenter | grep Host` (or the VM's **Summary**). Setting DRS to partially automated in 5.3 keeps it where it is for the window.

### 11.2 A vLCM depot sync task fails during the window

You may see a failed task **Sync depots** (`SyncDepotsTask`) with *Merged depot content is invalid* around the time services restart. Check the task history for the days before the change. In the tested run the same error appeared daily at the same time for more than a week before the change, so it was unrelated. Fix it separately (usually a stale or unreachable online depot URL in Lifecycle Manager settings).

Similarly, the appliance management API's database health endpoint may return an error about `dbcc` not being found. That is an API-side issue in the appliance management service, not a failed vCenter service; `service-control --status --all` is the authority.

### 11.3 ESXi certificates carry VMware's default subject

The renewed host certificates chain correctly, but their subject still reads `O=VMware, OU=VMware Engineering, L=Palo Alto, ST=California`. Those fields come from the `vpxd.certmgmt.certs.cn.*` advanced settings, not from the certool values in 6.2. To use your own, set them and renew each host again:

```sh
govc option.set vpxd.certmgmt.certs.cn.country US
govc option.set vpxd.certmgmt.certs.cn.organizationName 'Example Organization'
govc option.set vpxd.certmgmt.certs.cn.organizationalUnitName 'IT Infrastructure'
govc option.set vpxd.certmgmt.certs.cn.state 'Example State'
govc option.set vpxd.certmgmt.certs.cn.localityName 'Example City'
govc option.set vpxd.certmgmt.certs.cn.email ca-admin@example.org
govc option.ls vpxd.certmgmt.certs.cn
```

vSphere UI: `vcenter.example.org` > **Configure** > **Settings** > **Advanced Settings** > **Edit Settings**, filter on `certmgmt.certs.cn`.

Then **Renew** each host (7.1 step 4, or the second call in 7.2). A refresh of CA certificates is not needed for this.

### 11.4 Re-pinning thumbprints

Every certificate vCenter serves changed. Anything that stored the old machine SSL fingerprint fails with a thumbprint or verification error until updated. vCenter itself updates the ESXi host thumbprints it stores when it renews host certificates, so hosts do not need to be removed and re-added. External tools do need attention: see 9.4.

### 11.5 Common import failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Certificate uses an unsupported signature algorithm - ecdsa-with-SHA256` (or a SHA-384 ECDSA name), then automatic rollback | A CA in the chain has an ECDSA key | The whole hierarchy must be RSA (prerequisite 1) |
| Automatic rollback with a chain or validation error | Chain file in the wrong order, missing the Root, or containing only the VMCA certificate | Rebuild `vmca-fullchain.pem` as VMCA, Intermediate, Root (4.3) |
| Automatic rollback with a key error | The certificate does not match the key, or the key is encrypted | Re-run the modulus check (4.4); regenerate without a passphrase |
| A prompt repeats after you answer it | The value failed validation (for example a hostname that is not an FQDN) | Enter a valid value; press Ctrl-D to leave without changes if unsure |
| Browsers show a name mismatch although the chain verifies | `Hostname` in 6.2 was not the PNID | Regenerate the machine SSL certificate with the right name (option 3, *Replace Machine SSL certificate with VMCA Certificate*) |
| Clients that hold only the Root fail, others work | The server sends only the leaf | Check 9.1 counts three certificates. If not, republish the full chain into `MACHINE_SSL_CERT` and restart `vmware-envoy` |

### 11.6 CryptOS-side issues

| Symptom | Cause | Fix |
| --- | --- | --- |
| `x509: certificate signed by unknown authority` from `cryptosctl` | Stale `node-trust.pem` after a node reboot | Re-fetch it (2.4) |
| `FailedPrecondition` mentioning the revocation preflight | The node cannot resolve or reach its own `revocation_base_url` | Set `network.nameservers`, reboot the node, confirm `Revocation: OK` |
| VMCA certificate has no CDP or AIA | It was signed before `revocation_base_url` was set | Sign the same CSR again after setting it, rebuild the chain, import again |
| The Intermediate in the chain has no CDP or AIA | The Intermediate enrolled before the Root had `revocation_base_url` | Re-certify the Intermediate (same key), rebuild `vmca-fullchain.pem` with the new Intermediate copy. The VMCA certificate still verifies, because the key and SKI are unchanged. |
| VMCA certificate outlives the Intermediate | `validity_days` too large; CryptOS does not cap it | Lower `validity_days`, sign again |
