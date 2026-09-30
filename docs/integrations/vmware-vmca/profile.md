import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 2. The CryptOS profile for the VMCA subordinate

:::info[Before you start]
The safety gate from [stage 1](./safety-gate.md) done. On the workstation: `cryptosctl`, `openssl`, and the Intermediate's bootstrap admin client credential (`admin.crt`, `admin.key`), as listed in the [prerequisites](./index.md#prerequisites).
:::

The Intermediate signs the VMCA request under a **CA profile**. The profile decides every extension on the VMCA certificate. Only the subject comes from VMCA's request.

## 2.1 What vSphere requires of the VMCA signing certificate

| Requirement | Profile setting |
| --- | --- |
| RSA key 2048 to 8192 bits. CryptOS refuses any RSA subject key below 3072, so the usable range is 3072 to 8192. | The CSR from [stage 3](./generate-csr.md) is RSA-3072. |
| Signature SHA-2 RSA on every certificate in the chain | the Intermediate and Root hold RSA keys |
| `basicConstraints = critical, CA:TRUE` | `is_ca: true` |
| No sub-CAs under VMCA | `path_len: 0` |
| Certificate signing and CRL signing | `key_usage: [digital_signature, cert_sign, crl_sign]` |
| Extended key usage empty, or `serverAuth` only | leave `ext_key_usage` unset |
| At most one DNS name, no wildcards | leave `sans` unset |
| Valid for the life you want, inside the Intermediate's validity | `validity_days` (see [2.2](#22-choose-the-validity)) |
| Revocation pointers (optional for vSphere, wanted for your PKI) | `pki.revocation_base_url` on the Intermediate |

## 2.2 Choose the validity

CryptOS computes the VMCA certificate's expiry as *signing time + `validity_days`*. It does **not** shorten it to fit inside the Intermediate's own validity, so you must pick a value that ends before the Intermediate does. Check the Intermediate's expiry:

```sh
cryptosctl --endpoint 192.0.2.21:443 --identity admin.crt --identity-key admin.key --trust node-trust.pem \
  identity show -o pem > inter-chain.pem
openssl x509 -in inter-chain.pem -noout -subject -enddate
```

:::tip[Expected output]

```text
subject=CN = Example Intermediate CA G1, ...
notAfter=Sep 21 12:00:00 2041 GMT
```

:::

With 15 years left on the Intermediate, the tested run used `validity_days: 3650` (10 years). The VMCA certificate expired in 2036, well inside the Intermediate's 2041. VMCA's own leaf certificates are much shorter (2 years for the machine SSL certificate and 5 years for ESXi hosts by default) and VMCA renews those itself.

(`node-trust.pem` is the Intermediate's pinned management certificate, or use `root.pem`. See [2.4](#24-apply-and-verify).)

## 2.3 The profile snippet

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
- With `revocation_base_url` set, signing **fails closed** if the node's revocation preflight is not passing (the host does not resolve, or `/crl`, `/ocsp` or `/ca.cer` does not answer).

:::warning[Do not bypass the revocation preflight]
Do not set `allow_unverified_revocation_url` to get past this. Fix DNS instead.
:::

## 2.4 Apply and verify

**Trust the Intermediate's management certificate.** The Intermediate already has its CA, so its management listener presents a certificate signed by that CA, followed by the chain up to your Root. The key is new on every boot, but the chain is not.

:::tip[Trust the Root instead of a pin]
If you already have the Root certificate you distribute as `root.pem` ([4.2](./sign-and-chain.md#42-get-the-root-certificate)), use `--trust root.pem` wherever this procedure says `--trust node-trust.pem`. It keeps working across reboots, so you can skip every re-pin below.
:::

Otherwise pin the certificate itself. Fetch it after the node's most recent boot:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
openssl s_client -connect 192.0.2.21:443 -servername 192.0.2.21 </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > node-trust.pem
openssl x509 -in node-trust.pem -noout -subject -issuer -ext subjectAltName
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
'' | openssl s_client -connect 192.0.2.21:443 -servername 192.0.2.21 2>$null |
  openssl x509 -outform PEM -out node-trust.pem
openssl x509 -in node-trust.pem -noout -subject -issuer -ext subjectAltName
```

</TabItem>
</Tabs>

:::tip[Expected output]
The issuer is the Intermediate CA, and the SANs are the node's IP, plus any names in `pki.est.hostnames`:

```text
subject=CN = 192.0.2.21
issuer=CN = Example Intermediate CA G1, ...
X509v3 Subject Alternative Name:
    IP Address:192.0.2.21
```

:::

Address the node by IP, or by a name in `pki.est.hostnames`. For any other name, add `--server-name 192.0.2.21`.

For readability, the rest of this procedure shortens the connection flags with a shell variable:

```sh
INTER='--endpoint 192.0.2.21:443 --identity admin.crt --identity-key admin.key --trust node-trust.pem'
```

**Read, edit, apply.**

:::warning[config apply replaces the whole configuration]
`config apply` replaces the whole configuration, so always start from what the node has:
:::

```sh
cryptosctl $INTER config get > inter-config.yaml
cp inter-config.yaml inter-config.yaml.bak
# edit inter-config.yaml: add the platform-sub-ca profile (and revocation_base_url / nameservers if missing)
diff -u inter-config.yaml.bak inter-config.yaml
cryptosctl $INTER config apply -f inter-config.yaml
```

The `diff` must show only the lines you meant to add.

:::tip[Expected output]
Output of the apply when only a profile changed:

```text
applied: generation=4 requires_reboot=false digest=5d2e...b7
```

:::

Profiles are hot: `requires_reboot=false`. If the diff also added or changed `revocation_base_url` or `network.nameservers`, the apply reports `requires_reboot=true`. Those take effect at boot. Reboot the node gracefully, echoing its CA common name:

```sh
cryptosctl $INTER reboot --confirm "Example Intermediate CA G1"
```

:::tip[Expected output]

```text
reboot accepted: the node is shutting down cleanly and rebooting
```

:::

The node is back in about 10 seconds.

:::caution[Re-pin node-trust.pem after every reboot]
With a pinned `node-trust.pem`, **re-pin** after every reboot (repeat the `openssl s_client` fetch above), or every later call fails with `x509: certificate signed by unknown authority`. With `--trust root.pem` there is nothing to do.
:::

If `config apply` prints `WARNING:` about `revocation_base_url` naming a host with no `nameservers`, add `network.nameservers` before going further.

**Verify the node:**

```sh
cryptosctl $INTER status
cryptosctl $INTER config get | grep -A12 'name: platform-sub-ca'
```

:::tip[Expected output]
Output of `status`:

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

:::

**Verify the revocation endpoints from the workstation:**

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```sh
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://pki-inter.example.org/crl
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://pki-inter.example.org/ca.cer
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
curl.exe -s -o NUL -w '%{http_code} %{content_type}\n' http://pki-inter.example.org/crl
curl.exe -s -o NUL -w '%{http_code} %{content_type}\n' http://pki-inter.example.org/ca.cer
```

</TabItem>
</Tabs>

:::tip[Expected output]

```text
200 application/pkix-crl
200 application/pkix-cert
```

:::

## Verify before continuing

- [ ] `config get` shows `platform-sub-ca` exactly as in [2.3](#23-the-profile-snippet).
- [ ] `validity_days` ends before the Intermediate's `notAfter`.
- [ ] `status` shows `Revocation: OK` with your base URL.
- [ ] `/crl` and `/ca.cer` answer `200` from the workstation.
- [ ] `--trust` is `root.pem`, or a `node-trust.pem` fetched after the node's latest boot.
