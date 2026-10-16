---
title: "📄 Machine config: TSA"
---

# 📄 Machine config: TSA

The `pki.tsa` block of the [machine config](./machine-config.md): the node's RFC 3161 time-stamp authority. The how-to is [Serve RFC 3161 timestamps](../using/serve-timestamps-tsa.md).

The TSA is off unless the block is present, and it follows the same switching rules as ACME and EST: [Switching a protocol on or off](./machine-config-enrollment.md#-switching-a-protocol-on-or-off). `enabled: false` switches it off and keeps the settings, an `ApplyConfig` that leaves the block out keeps what the node has, and every change takes effect at the next reboot.

:::caution[A Root never serves a TSA]
A config that switches `pki.tsa` on at a Root is refused, and nothing is stored. A block with `enabled: false` is accepted and never served.
:::

```yaml
pki:
  tsa:
    http_port: 318
    policy_oid: "1.3.6.1.4.1.32473.1.1"
    accuracy_ms: 1000
    rate_limit:
      requests_per_minute: 60
      burst: 60
    allowed_networks: [10.20.0.0/16, "2001:db8:20::/48", 192.0.2.44]
    certificate:
      validity_days: 365
      rotation_overlap_days: 30
    max_sync_age_seconds: 3600
    max_drift_ppm: 100
    max_clock_error_ms: 1000
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `true` when the block is present | `false` switches the TSA off and keeps the other settings. |
| `http_port` | int | `318` (`0` means the default) | TCP port of the plain-HTTP listener. Requests are POSTed to its root path. |
| `policy_oid` | string | none, required | The TSA policy every token names, in dotted form, under your own enterprise number: [Get a TSA policy OID](../using/tsa-policy-oid.md). At least two decimal arcs without leading zeros, a first arc of 0, 1 or 2, and a second arc below 40 when the first is 0 or 1. A request for another policy is refused with `unacceptedPolicy`. |
| `accuracy_ms` | int | `1000` (`0` means the default) | The accuracy every token claims, in milliseconds either side of its time. At most `60000`. It is also the ceiling for `max_clock_error_ms`: see [The clock grace window](#-the-clock-grace-window). |
| `rate_limit.requests_per_minute` | int | `60` (`0` means the default) | The steady rate one client may sustain. A client is its IPv4 address, or its IPv6 /64. The limit cannot be switched off. |
| `rate_limit.burst` | int | `requests_per_minute` | How many requests a client may make at once before the rate applies. Over the limit a client gets HTTP 429 with `Retry-After`. |
| `allowed_networks` | list | empty: anyone | IPv4 or IPv6 CIDR prefixes, or bare addresses for one host. Anyone else gets HTTP 403 before the request is read. |
| `certificate.validity_days` | int | `365` (`0` means the default) | Lifetime of the TSA certificate, at most `365`, and never past the CA certificate's own expiry. |
| `certificate.rotation_overlap_days` | int | `30` (`0` means the default) | How long before the TSA certificate expires the node issues its successor and signs with it. Must be shorter than `validity_days`. |
| `max_sync_age_seconds` | int | `3600` (`0` means the default) | How long after the last good time sync the TSA keeps stamping while later polls fail. At most `86400`. |
| `max_drift_ppm` | int | `100` (`0` means the default) | The clock drift rate, in parts per million, assumed since the last good sync when estimating the clock error. At most `500`, the NTP frequency tolerance. |
| `max_clock_error_ms` | int | `accuracy_ms` (`0` means the default) | The largest estimated clock error the TSA accepts, in milliseconds. Never larger than `accuracy_ms`. |

Errors you may see from `cryptosctl config apply`:

| Message starts with | Cause |
|---|---|
| `config: pki.tsa.policy_oid: required` | The block is enabled without a policy OID. |
| `config: pki.tsa.policy_oid: "..."` | The OID breaks one of the rules above. |
| `config: pki.tsa: must not be enabled on a root node` | The node is a Root. |
| `config: pki.tsa.accuracy_ms` | More than `60000`. |
| `config: pki.tsa.max_sync_age_seconds` | More than `86400`. |
| `config: pki.tsa.max_drift_ppm` | More than `500`. |
| `config: pki.tsa.max_clock_error_ms` | Larger than the effective `accuracy_ms` (`1000` when `accuracy_ms` is `0`). |
| `config: pki.tsa.allowed_networks[N]` | Entry `N` is not an address or a CIDR prefix. |
| `config: pki.tsa.certificate.validity_days` | More than `365`. |
| `config: pki.tsa.certificate.rotation_overlap_days` | The overlap is not shorter than the validity. With the default overlap of 30 days, that includes any `validity_days` of 30 or less. |

## 🕑 The clock grace window

A timestamp is only a claim about the time, so the TSA fails closed on its clock. It trusts the clock for a grace window after the last good time sync, so one unanswered NTP poll does not stop it. Every request is refused with `timeNotAvailable` while any of these limits is hit:

| Limit | Refused when | Default |
|---|---|---|
| `no_good_sync` | No time sync has succeeded this boot. A node with no time source never syncs, so its TSA refuses every request. | |
| `adjustment_refused` | The servers answered the latest round but the clock was not adjusted: they disagreed, or a step was refused. The next good sync clears it. | |
| `max_sync_age` | The last good sync is older than `max_sync_age_seconds`. | 1 hour |
| `max_clock_error` | The estimated clock error is larger than `max_clock_error_ms`. | `accuracy_ms` (1 second) |

The estimated clock error is the offset measured at the last good sync plus `max_drift_ppm` parts per million of the time since. At the defaults, a sync that measured 20 ms gives 20 ms + 360 ms = 380 ms an hour later, inside the 1 second bound; a sync that measured 700 ms crosses it after 50 minutes.

:::warning[The accuracy rule]
`max_clock_error_ms` may not be larger than `accuracy_ms`, and `config apply` refuses a config that sets it so. A token must never claim more accuracy than the clock is trusted to have. Set it lower to stop stamping before the clock reaches the claimed accuracy.
:::

The refusal's status string names the limit and its value, for example:

```text
the TSA time source is not available: max_sync_age=1h0m0s exceeded (1h12m3s)
the TSA time source is not available: max_clock_error=1s exceeded (1.02s)
the TSA time source is not available: no_good_sync
```

The full reason, with the server and the time-sync error, is in the node log. `NodeStatus.time_sync.adjustment_refused` shows a refused round, and `cryptosctl status` shows the `Clock:` line.

## 🔌 API

In the API's `MachineConfig` the block is `Pki.tsa` (`Tsa`, `TsaRateLimit`, `TsaCertificateSettings`). `NodeService.ListTsaCertificates` returns every TSA certificate the node has signed with, and `NodeStatus.protocols` reports `SERVICE_PROTOCOL_TSA`.
