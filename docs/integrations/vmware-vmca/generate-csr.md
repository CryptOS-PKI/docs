import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 3. Generate the VMCA CSR on the VCSA (non-destructive)

:::info[Before you start]
A Bash shell on the VCSA ([1.2](./safety-gate.md#12-pre-flight-census)). The `platform-sub-ca` profile applied and verified on the Intermediate ([stage 2](./profile.md)).
:::

This stage creates a new RSA key pair and a certificate signing request on the VCSA. It writes local files only: it does not touch VECS, does not restart anything, and vCenter keeps running on its old certificates.

The tested method uses `certool` directly ([3.2](#32-generate-the-key-and-csr-with-certool)). An alternative using `certificate-manager` is in [3.4](#34-alternative-generate-the-csr-with-certificate-manager).

## 3.1 Find the PNID

The PNID (primary network identifier) is the name vCenter was deployed with. The machine SSL certificate must carry it as a DNS SAN, or clients get a name mismatch.

On the VCSA Bash shell:

```sh
/usr/lib/vmware-vmafd/bin/vmafd-cli get-pnid --server-name localhost
```

:::tip[Expected output]

```text
vcenter.example.org
```

:::

Confirm that forward and reverse DNS agree with it, from the workstation:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
dig +short vcenter.example.org
dig +short -x 192.0.2.10
```

:::tip[Expected output]

```text
192.0.2.10
vcenter.example.org.
```

:::

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
(Resolve-DnsName -Name vcenter.example.org -Type A).IPAddress
(Resolve-DnsName -Name 192.0.2.10 -Type PTR).NameHost
```

:::tip[Expected output]

```text
192.0.2.10
vcenter.example.org
```

:::

</TabItem>
</Tabs>

## 3.2 Generate the key and CSR with certool

On the VCSA Bash shell (see [1.2](./safety-gate.md#12-pre-flight-census) for how to get there):

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

:::tip[Expected output]

```text
Using config file : /root/vmca/vmca.cfg
Status : Success
```

:::

Generate the CSR from it:

```sh
/usr/lib/vmware-vmca/bin/certool --gencsrfromcert \
  --cert=/root/vmca/vmca-self.crt \
  --privkey=/root/vmca/vmca.key \
  --csrfile=/root/vmca/vmca.csr
```

:::tip[Expected output]

```text
Status : Success
```

:::

`certool` creates the files owned by `vmcad-user:lwis`. Make them root-only:

```sh
chown root:root /root/vmca/*
chmod 600 /root/vmca/*
ls -la /root/vmca
```

:::tip[Expected output]

```text
drwx------ 2 root root 4096 Sep 25 16:30 .
drwxr-x--- 6 root root 4096 Sep 25 16:30 ..
-rw------- 1 root root  245 Sep 25 16:30 vmca.cfg
-rw------- 1 root root 1602 Sep 25 16:30 vmca.csr
-rw------- 1 root root 2483 Sep 25 16:30 vmca.key
-rw------- 1 root root 1927 Sep 25 16:30 vmca-self.crt
```

:::

:::danger[The VMCA private key is unencrypted]
The private key is **unencrypted** PKCS#8. That is required: vCenter services cannot start automatically with a passphrase-protected CA key. It never leaves the VCSA.
:::

## 3.3 Check the CSR

On the VCSA Bash shell:

```sh
openssl req -in /root/vmca/vmca.csr -noout -text | grep -E 'Subject:|Public-Key|Signature Algorithm'
openssl req -in /root/vmca/vmca.csr -noout -verify
openssl rsa -in /root/vmca/vmca.key -noout -check
openssl req -in /root/vmca/vmca.csr -noout -pubkey | openssl sha256
openssl rsa -in /root/vmca/vmca.key -pubout 2>/dev/null | openssl sha256
```

:::tip[Expected output]

```text
        Subject: CN = Example vSphere CA, C = US, ST = Example State, L = Example City, O = Example Organization, OU = IT Infrastructure
                Public-Key: (3072 bit)
    Signature Algorithm: sha256WithRSAEncryption
Certificate request self-signature verify OK
RSA key ok
SHA2-256(stdin)= 3a41...c09f
SHA2-256(stdin)= 3a41...c09f
```

The two SHA-256 lines must be identical: the CSR carries the key you just made. If they differ, stop.

:::

:::caution[Stop if the key is below RSA-3072]
**Stop if `Public-Key` is below `(3072 bit)`.** CryptOS refuses to certify an RSA key smaller than 3072 bits. In the tested run, `certool --genselfcacert` produced RSA-3072.
:::

**Copy the CSR to the workstation.** The CSR is public. The simplest way that needs no change to the VCSA's login shell is to print it and paste it. On the VCSA:

```sh
cat /root/vmca/vmca.csr
```

On the workstation, paste it into `vmca.csr`:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
cat > vmca.csr <<'EOF'
-----BEGIN CERTIFICATE REQUEST-----
...paste...
-----END CERTIFICATE REQUEST-----
EOF
openssl sha256 vmca.csr
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$csr = @'
-----BEGIN CERTIFICATE REQUEST-----
...paste...
-----END CERTIFICATE REQUEST-----
'@
# LF line endings, as on the VCSA, so the two SHA-256 digests can match
[IO.File]::WriteAllText("$PWD\vmca.csr", ($csr -replace "`r`n", "`n") + "`n")
openssl sha256 vmca.csr
```

</TabItem>
</Tabs>

Compare with `openssl sha256 /root/vmca/vmca.csr` on the VCSA. They must match.

If you prefer `scp`: the VCSA's `root` login shell is the appliance shell, which `scp` cannot use. Switch it with `chsh -s /bin/bash root` on the VCSA, copy, then switch it back with `chsh -s /bin/appliancesh root`.

## 3.4 Alternative: generate the CSR with certificate-manager

`certificate-manager` option 2 has a sub-option that only generates a CSR and key, and exits without changing anything. It asks the same SSO and certool questions as the import in [stage 6](./import.md), so read [stage 6.2](./import.md#62-prompt-and-answer-transcript) for the full list. The sequence is:

1. `/usr/lib/vmware-vmca/bin/certificate-manager`
2. `Option[1 to 8]:` answer `2`
3. `Do you wish to generate all certificates using configuration file : Option[Y/N] ? :` answer `Y`
4. SSO username and password
5. The certool values (Country, Name, Organization, OrgUnit, State, Locality, IPAddress, Email, Hostname, VMCA Name) as in [6.2](./import.md#62-prompt-and-answer-transcript)
6. `Option [1 or 2]:` answer **`1`** (Generate Certificate Signing Request(s) and Key(s) for VMCA Root Signing certificate)
7. `Output directory path:` answer `/root/vmca` (prompt wording may vary by build)

It writes `vmca_issued_csr.csr` and `vmca_issued_key.key` to that directory. If you use this path, run every check in [3.3](#33-check-the-csr) on those files, **especially the key size**, and use `vmca_issued_key.key` wherever this procedure says `vmca.key`. This variant was not used in the tested run.

## Verify before continuing

- [ ] `/root/vmca/vmca.key` and `/root/vmca/vmca.csr` exist, owned by root, mode 600, directory mode 700.
- [ ] CSR subject has `CN = Example vSphere CA`.
- [ ] `Public-Key: (3072 bit)` or larger.
- [ ] CSR self-signature verifies, and the CSR and key public-key digests match.
- [ ] The workstation copy of `vmca.csr` has the same SHA-256 as the VCSA copy.
- [ ] vCenter is untouched: `service-control --status --all` is unchanged and port 443 still sends one certificate.
