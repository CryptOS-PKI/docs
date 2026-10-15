---
title: "🕰️ Keep the clock in sync"
---

# 🕰️ Keep the clock in sync

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Point a node at its time servers and read how its clock is doing.

A CA's clock sets the `notBefore` and `notAfter` of every certificate it signs, the `thisUpdate` and `nextUpdate` of its CRL, its OCSP response times and its audit times. A node keeps its clock in sync with a small SNTPv4 client (RFC 4330, and RFC 5905 section 14) built into the OS. It only asks for time; it never serves it. For what the node does to protect a CA from a wrong or hostile clock, see [How the clock protects signing](../deep-dives/clock-safety.md).

:::info[Before you start]
- `cryptosctl` set up to reach the node: [Setup](./setup.md).
- One to three time servers the node can reach on UDP port 123.
:::

## Where the time comes from

The node picks one source at boot:

1. **The machine config.** The servers in `network.ntp_servers`, at most 3, each an IPv4 address or a hostname.
2. **The DHCP lease.** With `network.ntp_servers` empty, the NTP servers the kernel's DHCP lease handed out (DHCP option 42), if it got any.
3. **None.** With neither, the node runs on its hardware clock and adjusts nothing. That is the expected setup for an offline Root.

```yaml
network:
  interface: eth0
  address: 192.0.2.10/24
  gateway: 192.0.2.1
  nameservers: [192.0.2.53]
  ntp_servers: [192.0.2.123, pool.example.org]
```

A hostname is looked up through the node's DNS servers at every poll, so a DNS change is picked up without a reboot. A change to the list itself takes effect at the next reboot. See [network](../reference/machine-config.md#-network) for the validation rules.

:::caution[A hostname needs a DNS server]
If `ntp_servers` names a host and `network.nameservers` is empty, the node can look the name up only if its DHCP lease gave it DNS servers. If it can't, that server is never asked, and with no other server answering the node refuses to sign (see [the signing gate](../deep-dives/clock-safety.md#the-signing-gate)). `cryptosctl config apply` prints a `WARNING:` for this. Set `network.nameservers`, or name the server by IPv4 address.
:::

`cryptosctl config apply` also prints a `WARNING:` whenever `ntp_servers` is empty, because the node then depends on its DHCP lease for time, or on its hardware clock. On an offline Root that warning is expected.

## Check the clock

```bash
cryptosctl --endpoint 192.0.2.10:443 status
```

:::tip[Expected output]
Among the other lines, a node synced to its configured servers shows:

```text
Clock:           SYNCED MACHINE_CONFIG 192.0.2.123, pool.example.org (via 192.0.2.123, offset -12.5ms, stratum 2, synced 2026-09-30T12:00:00Z, stepped at boot)
```
:::

The line holds the state, the source and the servers, then the server, offset, stratum and time (UTC) of the latest good sync, and `stepped at boot` when the boot step moved the clock. When the latest attempt didn't adjust the clock, the line ends with the reason.

| State | Meaning |
|---|---|
| `NOT_CONFIGURED` | no time source: `ntp_servers` is empty and the DHCP lease had no NTP servers. The node runs on its hardware clock and signing is never gated |
| `PENDING` | a source is configured and no sync attempt has finished yet |
| `SYNCED` | the latest attempt adjusted the clock |
| `UNSYNCED` | the latest attempt didn't adjust the clock; the line ends with why |

| Source | Meaning |
|---|---|
| `MACHINE_CONFIG` | the servers in `network.ntp_servers` |
| `DHCP_LEASE` | the DHCP option 42 servers, because `network.ntp_servers` is empty |

Some lines you may see:

```text
Clock:           NOT_CONFIGURED (no time source; running on the hardware clock)
Clock:           UNSYNCED MACHINE_CONFIG 192.0.2.99: timesync: 192.0.2.99: no reply: ... i/o timeout
Clock:           UNSYNCED DHCP_LEASE 192.0.2.123, 192.0.2.124: timesync: sources disagree: offsets spread 4.9s across 2 servers (more than 1s)
```

An `UNSYNCED` line that has never shown a `synced` time means the gate is still closed (see [the signing gate](../deep-dives/clock-safety.md#the-signing-gate)). One that shows a `synced` time means the node synced once this boot and still signs; fix what the reason names all the same, because the clock now drifts at the hardware rate.

In `-o json` and `-o yaml`, the same fields are in `time_sync`. See [Check status](./status.md) for the other lines.

## Next step

[Apply a config](./config-apply.md) to set `network.ntp_servers`.
