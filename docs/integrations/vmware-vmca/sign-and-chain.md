import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 4. Sign with cryptosctl and build the full chain

:::info[Before you start]
`vmca.csr` on the workstation, with the same SHA-256 as the VCSA copy ([3.3](./generate-csr.md#33-check-the-csr)). A fresh `node-trust.pem` and the `INTER` variable ([2.4](./profile.md#24-apply-and-verify)). The Root certificate you already distribute, or the Root fingerprint recorded at the root ceremony.
:::

## 4.1 Sign

On the workstation, with a fresh `node-trust.pem` ([2.4](./profile.md#24-apply-and-verify)):

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
- There is no `--node` flag. `--trust root.pem` works in place of `node-trust.pem`: the Intermediate has its CA, so its management certificate chains to your Root.

The command prints nothing on stderr on success. `vmca-chain.pem` is **leaf-first** and contains exactly two certificates: the new VMCA certificate, then the Intermediate. **The Root is not included.**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
grep -c 'BEGIN CERTIFICATE' vmca-chain.pem
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
(Select-String -Path vmca-chain.pem -Pattern 'BEGIN CERTIFICATE').Count
```

</TabItem>
</Tabs>

:::tip[Expected output]
The command prints `2`: the new VMCA certificate, then the Intermediate. Any other number means the chain is wrong; don't continue.
:::

If the call fails:

| Error | Cause | Fix |
| --- | --- | --- |
| `x509: certificate signed by unknown authority` | The node rebooted since you fetched `node-trust.pem` | Fetch it again, or use `--trust root.pem` ([2.4](./profile.md#24-apply-and-verify)) |
| `FailedPrecondition ... revocation preflight failing for configured revocation_base_url; issuance blocked` | The Intermediate cannot resolve or reach its own `revocation_base_url` | Fix `network.nameservers` or DNS, reboot, confirm `Revocation: OK` |
| An error naming the key size | The CSR key is below RSA-3072 | Regenerate the CSR ([stage 3](./generate-csr.md)) with a larger key |
| An error naming the profile | The profile name is wrong or it is not a CA profile | Check `config get` |

## 4.2 Get the Root certificate

Use the copy of `Example Root CA G1` you already distribute and trust. If you need to fetch it, take it from the Root node and compare its fingerprint with the one recorded at the root ceremony:

```sh
openssl s_client -connect 192.0.2.20:443 -servername 192.0.2.20 </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > root-node-trust.pem
cryptosctl --endpoint 192.0.2.20:443 --identity root-admin.crt --identity-key root-admin.key \
  --trust root-node-trust.pem identity show -o pem > root.pem
openssl x509 -in root.pem -noout -subject -issuer -fingerprint -sha256
```

:::tip[Expected output]

```text
subject=CN = Example Root CA G1, ...
issuer=CN = Example Root CA G1, ...
sha256 Fingerprint=4D:...:E2
```

The fingerprint must equal the one recorded at the root ceremony. If it does not, stop.

:::

Or, without an admin credential for the Root, fetch it from the Root's revocation endpoint (`http://pki-root.example.org/ca.cer`, DER) and convert it:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
curl -s http://pki-root.example.org/ca.cer | openssl x509 -inform DER -outform PEM > root.pem
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
curl.exe -s -o ca.cer http://pki-root.example.org/ca.cer
openssl x509 -inform DER -in ca.cer -outform PEM -out root.pem
```

</TabItem>
</Tabs>

:::danger[Check the Root fingerprint]
The fingerprint check is what makes either method safe. Do not skip it.
:::

## 4.3 Build the full chain in the right order

`certificate-manager` needs the whole chain in one file, **most specific first**: VMCA, then the Intermediate, then the Root.

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
cat vmca-chain.pem root.pem > vmca-fullchain.pem
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
# LF line endings, so the SHA-256 matches the copy you paste onto the VCSA in 4.5
$chain = (Get-Content -Raw vmca-chain.pem) + (Get-Content -Raw root.pem)
[IO.File]::WriteAllText("$PWD\vmca-fullchain.pem", ($chain -replace "`r`n", "`n"))
```

</TabItem>
</Tabs>

Split it into single files for the checks below:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
awk '/-----BEGIN CERTIFICATE-----/{n++; f=1} f{print > ("chain-" n ".pem")} /-----END CERTIFICATE-----/{f=0}' vmca-fullchain.pem
for f in chain-1.pem chain-2.pem chain-3.pem; do
  echo "== $f"; openssl x509 -in $f -noout -subject -issuer
done
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
$n = 0
[regex]::Matches((Get-Content -Raw vmca-fullchain.pem), '(?s)-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----') |
  ForEach-Object { $n++; [IO.File]::WriteAllText("$PWD\chain-$n.pem", $_.Value + "`n") }
foreach ($f in 'chain-1.pem','chain-2.pem','chain-3.pem') {
  "== $f"; openssl x509 -in $f -noout -subject -issuer
}
```

</TabItem>
</Tabs>

:::tip[Expected output]
In exactly this order:

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

Each certificate's issuer is the next certificate's subject, and the last one is self-signed. Any other order means the chain is wrong; don't continue.

:::

If your hierarchy is deeper (a Root, a policy CA, then an issuing CA), append every missing CA certificate between the Intermediate and the Root, in order.

## 4.4 Verify with openssl

**Signature algorithm of every certificate:**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl crl2pkcs7 -nocrl -certfile vmca-fullchain.pem | openssl pkcs7 -print_certs -text -noout \
  | grep 'Signature Algorithm' | sort | uniq -c
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
openssl crl2pkcs7 -nocrl -certfile vmca-fullchain.pem | openssl pkcs7 -print_certs -text -noout |
  Select-String -Pattern 'Signature Algorithm' | Group-Object Line | Sort-Object Name |
  ForEach-Object { '{0,7} {1}' -f $_.Count, $_.Name }
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
      6     Signature Algorithm: sha384WithRSAEncryption
```

Every line must end in `WithRSAEncryption`.

:::

:::warning[Stop on any ECDSA signature]
Any `ecdsa-with-SHA256` or `ecdsa-with-SHA384` means the hierarchy is not RSA end to end. **Stop.** vCenter would reject the import.
:::

**The VMCA certificate's extensions:**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl x509 -in chain-1.pem -noout -serial -dates \
  -ext basicConstraints,keyUsage,extendedKeyUsage,subjectAltName,crlDistributionPoints,authorityInfoAccess
openssl x509 -in chain-1.pem -noout -text | grep 'Public-Key'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
openssl x509 -in chain-1.pem -noout -serial -dates `
  -ext 'basicConstraints,keyUsage,extendedKeyUsage,subjectAltName,crlDistributionPoints,authorityInfoAccess'
openssl x509 -in chain-1.pem -noout -text | Select-String -Pattern 'Public-Key'
```

</TabItem>
</Tabs>

:::tip[Expected output]

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

:::

Check each line:

- `CA:TRUE, pathlen:0`
- Key usage includes both `Certificate Sign` and `CRL Sign`
- No extended key usage, no subject alternative name
- CDP, OCSP and CA Issuers under your `revocation_base_url`
- `notAfter` is earlier than the Intermediate's `notAfter` (`openssl x509 -in chain-2.pem -noout -enddate`)

**The certificate matches the key on the VCSA.** On the workstation:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl x509 -in chain-1.pem -noout -modulus | openssl sha256
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
# write the modulus line with an LF ending, as the VCSA pipes it, so the digests are comparable
$modulus = openssl x509 -in chain-1.pem -noout -modulus
[IO.File]::WriteAllText("$PWD\chain-1.modulus", "$modulus`n")
openssl sha256 chain-1.modulus
```

</TabItem>
</Tabs>

On the VCSA:

```sh
openssl rsa -in /root/vmca/vmca.key -noout -modulus | openssl sha256
```

:::tip[Expected output]
Both must print the same digest, for example `SHA2-256(stdin)= 3a41...c09f`. The Windows tab prints `SHA2-256(chain-1.modulus)=` before the same digest.
:::

:::caution[Do not import a certificate that does not match the key]
A mismatch means the certificate was issued for a different CSR. Do not import it.
:::

**The chain verifies to the Root:**

```sh
openssl verify -CAfile root.pem -untrusted chain-2.pem chain-1.pem
openssl verify -CAfile root.pem chain-2.pem
```

:::tip[Expected output]

```text
chain-1.pem: OK
chain-2.pem: OK
```

:::

**Optional: the VMCA certificate is not revoked.**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl ocsp -issuer chain-2.pem -cert chain-1.pem -url http://pki-inter.example.org/ocsp \
  -CAfile root.pem -verify_other chain-2.pem -resp_text \
  | grep -E 'Cert Status|Response verify'
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
openssl ocsp -issuer chain-2.pem -cert chain-1.pem -url http://pki-inter.example.org/ocsp `
  -CAfile root.pem -verify_other chain-2.pem -resp_text |
  Select-String -Pattern 'Cert Status|Response verify'
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
Response verify OK
    Cert Status: good
```

:::

## 4.5 Copy the full chain to the VCSA

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

:::tip[Expected output]

```text
3
chain-1.pem: OK
SHA2-256(stdin)= 3a41...c09f
SHA2-256(stdin)= 3a41...c09f
```

If the two digests differ, the certificate does not match the key; don't import it.

:::

## Verify before continuing

- [ ] `vmca-fullchain.pem` has 3 certificates, in the order VMCA, Intermediate, Root.
- [ ] Every signature is `...WithRSAEncryption`.
- [ ] VMCA: `CA:TRUE, pathlen:0`, `Certificate Sign` and `CRL Sign`, no EKU, no SAN, RSA-3072 or larger.
- [ ] VMCA `notAfter` is before the Intermediate's `notAfter`.
- [ ] The certificate modulus matches `vmca.key`, checked on the VCSA.
- [ ] `openssl verify` prints `OK` on the workstation and on the VCSA.
