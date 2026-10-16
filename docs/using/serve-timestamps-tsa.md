---
title: "⏱️ Serve RFC 3161 timestamps"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# ⏱️ Serve RFC 3161 timestamps

Switch on the RFC 3161 time-stamp authority (TSA) on an intermediate or issuing node, so code signed with a CryptOS certificate keeps verifying after the certificate expires.

A signing tool sends the TSA a hash of the signature, and gets back a signed token saying when it saw it. The token is stored in the signature. Later, a verifier checks the token instead of today's date against the signing certificate.

The CA key never signs a token. The node issues a separate **TSA certificate** from its CA, with the extended key usage `id-kp-timeStamping` marked critical, and signs tokens with that. Its key lives where the CA key does: in the TPM on a TPM node.

:::info[Before you start]
- An intermediate or issuing node, installed and running. A Root never serves a TSA.
- `cryptosctl` set up to reach the node: [Setup](./setup.md).
- The node's time in sync, with `network.ntp_servers` or a DHCP lease that carries NTP servers: [Keep the clock in sync](./time-sync.md).
- A policy OID of your own: [Get a TSA policy OID](./tsa-policy-oid.md).
- The node's CA common name, for the reboot.
:::

## 1. Add the pki.tsa block

Fetch the config as in [Apply config](./config-apply.md), then add a `pki.tsa` block with your policy OID:

```yaml
pki:
  tsa:
    policy_oid: "1.3.6.1.4.1.32473.1.1"
    allowed_networks: [10.20.0.0/16]
```

- `policy_oid` is required. Every token names it. Replace the example number `32473` with your own PEN.
- `allowed_networks` limits which clients may ask. Leave it out to answer anyone. A bare address means one host.
- The listener uses port 318 unless `http_port` sets another.
- Every field, with its default and limits, is in [Machine config: TSA](../reference/machine-config-tsa.md).

:::caution[No policy, no TSA]
A `pki.tsa` block without `policy_oid` is refused with `config: pki.tsa.policy_oid: required`, and nothing is saved. There is no default policy.
:::

:::caution[A Root refuses pki.tsa]
A Root's config with an enabled `pki.tsa` is refused with `config: pki.tsa: must not be enabled on a root node`, and nothing is saved. Serve timestamps from an intermediate or issuing node.
:::

## 2. Apply it and reboot

:::warning[Switching the TSA on needs a reboot in a maintenance window]
Every change to `pki.tsa`, switching it on or off included, reports `requires_reboot=true`. The TSA starts only at boot, and every listener on the node, including issuance, is down while it restarts. Plan the reboot for a maintenance window.
:::

```bash
cryptosctl --endpoint 192.0.2.10:443 config apply -f node.yaml
cryptosctl --endpoint 192.0.2.10:443 reboot --confirm "Example Issuing CA G1"
```

:::tip[Expected output]
After the reboot, `cryptosctl status -o json` lists the TSA under `protocols`, switched on and running:

```json
{ "protocol": "SERVICE_PROTOCOL_TSA", "configured": true, "running": true }
```

`cryptosctl tsa certificates` shows the TSA certificate the node issued, marked current:

```text
SERIAL                                    CURRENT  NOT_BEFORE            NOT_AFTER             SHA256
5cabd044dfe7244b38791e6274c3b0eb5c712079  yes      2026-10-06T19:59:21Z  2027-10-06T20:04:21Z  9f2c...
```
:::

If the TSA is `configured` but not `running` after the reboot, the node could not set it up. The node log says why.

## 3. Ask for a timestamp

On any machine with OpenSSL 3, build a request for a file. `-cert` asks for the TSA certificate in the token, which makes it verifiable on its own:

```bash
openssl ts -query -data artifact.bin -sha256 -cert -out req.tsq
```

Send it to the node:

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
curl -sS -H 'Content-Type: application/timestamp-query' --data-binary @req.tsq -o resp.tsr http://192.0.2.10:318/
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
Invoke-WebRequest -Uri http://192.0.2.10:318/ -Method Post -ContentType 'application/timestamp-query' -InFile req.tsq -OutFile resp.tsr
```

</TabItem>
</Tabs>

## 4. Verify the token

Put your root certificate and the node's CA certificate in `chain.pem` (`cryptosctl identity show -o pem` prints the node's chain), then:

```bash
openssl ts -reply -in resp.tsr -text
openssl ts -verify -in resp.tsr -queryfile req.tsq -CAfile chain.pem
```

:::tip[Expected output]
The first command shows `Status: Granted.`, your policy OID and the accuracy:

```text
Policy OID: 1.3.6.1.4.1.32473.1.1
Accuracy: 0x01 seconds, unspecified millis, unspecified micros
Ordering: no
```

The second prints `Verification: OK`.
:::

Point your signing tool at the same URL, for example `signtool sign /tr http://192.0.2.10:318/ /td sha256 ...`, and add `chain.pem` to the trust of every machine that verifies the signatures.

## What the TSA accepts

- **Hashes.** SHA-256, SHA-384 and SHA-512. A request with SHA-1 or MD5 is refused with `badAlg`.
- **Policy.** A request that asks for another policy is refused with `unacceptedPolicy`.
- **Extensions.** None. A request that carries one is refused with `unacceptedExtension`.

## When it refuses

- **`timeNotAvailable` for every request.** The clock is not trusted: no time sync has succeeded this boot, the servers answered but the clock was not adjusted, the last good sync is older than `max_sync_age_seconds`, or the estimated clock error is above `max_clock_error_ms`. The status string names the limit, `cryptosctl status` shows the `Clock:` line, and the node log has the details: [The clock grace window](../reference/machine-config-tsa.md#-the-clock-grace-window). The TSA has no override for this, unlike certificate signing.
- **HTTP 403.** The client is outside `allowed_networks`.
- **HTTP 429.** The client went over its rate limit (60 a minute by default, per IPv4 address or IPv6 /64). Wait for the `Retry-After` seconds.

:::caution[No time source means no timestamps]
A node with no NTP servers, configured or leased, never syncs, so its TSA refuses every request. Set `network.ntp_servers` before you switch the TSA on.
:::

## Rotation and old tokens

The TSA certificate is valid for a year. Thirty days before it expires, the node issues a successor with a new key and signs new tokens with it. It does the same within the hour if the TSA certificate is revoked or the CA key is rotated. No reboot is needed.

Every TSA certificate the node has signed with stays listed, so tokens signed before a rotation still verify:

```bash
cryptosctl --endpoint 192.0.2.10:443 tsa certificates --pem > tsa-certificates.pem
```

The TSA certificate also appears in `cryptosctl ca list-issued` under the profile `tsa`, and with `pki.revocation_base_url` set it carries the node's CRL and OCSP pointers. If its key may have leaked, revoke it with `cryptosctl ca revoke`: the node moves to a new TSA certificate within the hour.

## Switching it off

Set `enabled: false` in the block, apply and reboot. The settings are kept for later, and `cryptosctl tsa certificates` still lists the old certificates.
