---
title: "🛰️ Enrol devices with SCEP"
---

# 🛰️ Enrol devices with SCEP

:::info[Arrives with cryptos#288]
This page describes SCEP as [CryptOS-PKI/cryptos-node#288](https://github.com/CryptOS-PKI/cryptos-node/pull/288) adds it. It is true once that change is in the image you run.
:::

Get a certificate onto a network device that cannot run ACME, such as a Cisco IOS or IOS-XE switch, over SCEP (RFC 8894).

The device enrols once with a **one-time challenge** that you mint for it. After that it renews on its own with the certificate it already holds. There is no shared password configured on every device.

:::info[Before you start]
- An intermediate or issuing node, installed and running. A Root never serves SCEP.
- `cryptosctl` set up to reach the node: [Setup](./setup.md).
- The node's CA common name, for the reboot.
- The device's DNS name, inside a domain you are willing to issue for.
:::

## 1. Add a SCEP profile and switch SCEP on

Fetch the config as in [Apply config](./config-apply.md), then add a certificate profile for the devices and a `pki.scep` block that uses it:

```yaml
pki:
  profiles:
    - name: cisco-device
      key_alg: ECDSA-P384
      validity_days: 365
      key_usage: [digital_signature, key_encipherment]
      ext_key_usage: [client_auth, server_auth]
  scep:
    profiles:
      - profile: cisco-device
        min_rsa_key_bits: 2048
    allowed_identifier_suffixes: [example.com]
```

- `min_rsa_key_bits: 2048` is needed for Cisco: IOS and IOS-XE SCEP trustpoints cannot hold a larger RSA key. 2048 is the lowest any profile may allow. Leave it out and the profile requires RSA 3072, which suits devices that can do more. Stronger RSA keys are always accepted.
- Devices must enrol with an **RSA** key. The node encrypts its SCEP reply to the device's key, which needs RSA, so a request signed with an ECDSA key is refused with the SCEP failure `badAlg`.
- `allowed_identifier_suffixes` is required. Every name a device asks for, its subject common name included, must be one of these domains or a name under one.
- `key_alg` in the profile has no effect on SCEP: the certificate is for the key the device generates.

:::caution[A Root refuses pki.scep]
A Root's config with `pki.scep` is refused with `config: pki.scep: must not be set on a root node; a root serves no enrolment protocol, so serve SCEP from an intermediate or issuing node`, and nothing is saved. Serve SCEP from an intermediate or issuing node.
:::

:::warning[Switching SCEP on needs a reboot in a maintenance window]
Every change to `pki.scep`, switching it on or off included, reports `requires_reboot=true`. The SCEP listener starts only at boot, and the node stops issuing while it restarts. Plan the reboot for a maintenance window.
:::

Apply the file and reboot the node:

```bash
cryptosctl --endpoint 192.0.2.10:443 config apply -f node.yaml
cryptosctl --endpoint 192.0.2.10:443 reboot --confirm "Example Issuing CA G1"
```

SCEP answers at `http://<node>/cgi-bin/pkiclient.exe`. By default it shares the port of the node's CRL and OCSP listener (80 unless `pki.revocation_http_port` moves it); `pki.scep.http_port` gives it a port of its own.

:::tip[Expected output]
After the reboot, `cryptosctl status -o json` lists SCEP under `protocols`, switched on and running:

```json
{ "protocol": "SERVICE_PROTOCOL_SCEP", "configured": true, "running": true }
```
:::

## 2. Mint a challenge for the device

```bash
cryptosctl --endpoint 192.0.2.10:443 scep challenge mint --profile cisco-device --ttl 30m --name switch01.example.com
```

:::tip[Expected output]
```text
Challenge:   Q7ZK2M4RXW3T6YBN5PVC2HJ4DLGF7SAE
ID:          6f1c0e9a2b7d4c58a1e3f0b9d2c4a6e8
Profile:     cisco-device
Expires:     2026-10-01T12:30:00Z
Bound names: switch01.example.com
The challenge is shown once and works for one enrolment. The node cannot show it again.
```
:::

- The challenge works for one enrolment and is used up by the first request that presents it, even one that is refused.
- `--ttl` sets how long it stays usable: one hour if you leave it out, seven days at most.
- `--name` binds it: the request may then carry only those names. Leave it out and any name inside `allowed_identifier_suffixes` is accepted.

:::danger[Treat the challenge like a password]
Whoever holds an unused challenge can enrol a device of their own with it, within its names and profile. Give it to the device and nobody else. If it leaks or you lose it, withdraw it with `cryptosctl scep challenge revoke --id <id>` and mint a new one.
:::

`cryptosctl scep challenge list` shows the challenges that are still usable, never the challenge itself.

## 3. Check the CA fingerprint

The device asks you to accept the CA certificate the first time it talks to the node. Get the fingerprint to compare it with now:

```bash
cryptosctl --endpoint 192.0.2.10:443 identity show -o pem > ca-chain.pem
openssl x509 -in ca-chain.pem -noout -fingerprint -sha1
```

`openssl x509` reads the first certificate in the file, which is the node's own CA certificate.

## 4. Configure the trustpoint on the switch

These commands run on the Cisco switch, in configuration mode. Replace the names with your own.

```text
crypto key generate rsa general-keys label CRYPTOS-SCEP modulus 2048
crypto pki trustpoint CRYPTOS
 enrollment url http://ca.example.com/cgi-bin/pkiclient.exe
 enrollment mode ra
 subject-name CN=switch01.example.com
 subject-alt-name switch01.example.com
 serial-number none
 ip-address none
 rsakeypair CRYPTOS-SCEP
 hash sha256
 exit
```

- `modulus 2048` is the largest key the trustpoint takes, and it matches the profile's `min_rsa_key_bits: 2048`.
- `enrollment mode ra` is required. The node answers with its CA certificate and an RA certificate, and the device encrypts its request to the RA.
- `serial-number none` and `ip-address none` stop the switch from putting its serial number and an IP address into the subject. SCEP here issues DNS names only, and a request with an IP address in its subject alternative names is refused.

## 5. Authenticate the CA and enrol

```text
crypto pki authenticate CRYPTOS
```

The switch prints the fingerprint of the CA certificate and asks whether to accept it.

:::caution[Compare the fingerprint before you answer yes]
Accept only if the SHA1 fingerprint matches the one from step 3. A different fingerprint means the switch is not talking to your node; answer `no`.
:::

```text
crypto pki enroll CRYPTOS
```

When the switch asks for a challenge password, enter the challenge from step 2. Answer `yes` to request the certificate.

:::tip[Expected output]
The switch logs that the certificate arrived, and the trustpoint shows it:

```text
show crypto pki certificates CRYPTOS
```

The certificate's subject carries `CN=switch01.example.com`, its issuer is your node's CA, and its key is RSA 2048.
:::

## 6. Renewal

Renewal needs no challenge. The switch signs its renewal with the certificate it holds, which must still be current and not revoked, and the new certificate keeps the same names and profile. To have the switch renew by itself, add `auto-enroll` to the trustpoint, for example `auto-enroll 70 regenerate` to renew at 70% of the lifetime with a fresh key.

A revoked or expired certificate cannot renew. Enrol the device again from step 2.

## Holding enrolments for approval

Add `require_approval: true` to a profile in `pki.scep.profiles` (a reboot, as in step 1) and every new enrolment from it waits for you. The switch is told its request is pending and keeps polling.

```bash
cryptosctl --endpoint 192.0.2.10:443 scep enrollments list
cryptosctl --endpoint 192.0.2.10:443 scep enrollments approve --id <id>
cryptosctl --endpoint 192.0.2.10:443 scep enrollments reject --id <id> --reason "not one of ours"
```

After `approve`, the switch picks the certificate up at its next poll. Renewals are never held.

## When enrolment fails

The switch only learns that the request failed and a short reason code. The node's audit log records why, with the transaction, the profile and the ID of the challenge, never the challenge itself. The usual causes:

- **The challenge was already used, revoked or expired.** Mint a new one.
- **A name is outside `allowed_identifier_suffixes`, or outside the challenge's bound names.** Fix the trustpoint's `subject-name`, or mint a challenge for the right name.
- **The key is too small.** The profile's `min_rsa_key_bits` is above the device's key size.
- **The request carries an IP address.** Set `ip-address none` on the trustpoint.

More detail, including the RA certificate and its rotation, is in [`docs/scep.md`](https://github.com/CryptOS-PKI/cryptos-node/blob/main/docs/scep.md) in the `cryptos-node` repository.
