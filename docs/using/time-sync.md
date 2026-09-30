---
title: "🕰️ Keep the clock in sync"
---

# 🕰️ Keep the clock in sync

:::tip[Works today]
This describes CryptOS as it works right now.
:::

Point a node at its time servers and read how its clock is doing.

A CA's clock sets the `notBefore` and `notAfter` of every certificate it signs, the `thisUpdate` and `nextUpdate` of its CRL, its OCSP response times and its audit times. A node keeps its clock in sync with a small SNTPv4 client (RFC 4330, and RFC 5905 section 14) built into the OS. It only asks for time; it never serves it.

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
If `ntp_servers` names a host and `network.nameservers` is empty, the node can look the name up only if its DHCP lease gave it DNS servers. If it can't, that server is never asked, and with no other server answering the node refuses to sign (see [the signing gate](#the-signing-gate)). `cryptosctl config apply` prints a `WARNING:` for this. Set `network.nameservers`, or name the server by IPv4 address.
:::

`cryptosctl config apply` also prints a `WARNING:` whenever `ntp_servers` is empty, because the node then depends on its DHCP lease for time, or on its hardware clock. On an offline Root that warning is expected.

## At boot

Time sync is its own boot step, after the network and DNS come up and before the internal database (etcd), the listeners and signing start. The boot log shows it as `clock`, between the resolver and `embedded etcd`. Leases, TLS validity and issued dates then all start on corrected time.

- The node asks every server, and retries an unanswered one up to three times, 2 seconds apart.
- It gives up after about 10 seconds and boots anyway. A time server that is down never keeps the node from coming up and being managed.
- An offset larger than 128 ms is stepped: the clock jumps to the right time, forwards or backwards, as long as it stays above the [clock floor](#the-clock-floor). A smaller offset is slewed.

## While the node runs

After boot the node asks each server every 64 seconds. A server that doesn't answer is asked less often, doubling the wait each time up to 1024 seconds, and goes back to 64 seconds once it answers.

- **Small offsets (128 ms or less)** are slewed: the kernel speeds up or slows down the clock a little until it catches up, so time never jumps.
- **A forward offset above 128 ms** is stepped forward.
- **A backward offset above 128 ms** is refused and logged as an error, `refused a backwards clock step on a running node`. Stepping a running CA backwards would put later audit entries and certificates before earlier ones. The clock stays where it is, and the `Clock:` status line turns `UNSYNCED` with the reason. Find out why the server moved back; a reboot lets the node step back at boot, down to the clock floor.

With more than one server, the node takes the median offset. If two or more servers answered and their offsets are more than 1 second apart, it adjusts nothing and reports `sources disagree`. The 3-server limit and the 1-second window are fixed.

Every reply is checked before it's used. The request carries a random transmit timestamp that the reply must echo, the node only takes replies from the server it asked, and it ignores a server that says it is unsynchronised (leap indicator 3, stratum above 15, or a root distance above 1 second).

:::info[The time is not authenticated]
The node doesn't use NTS, so a reply can't be proven to come from the server. The random nonce, the median and the 1-second agreement rule, the clock floor and the no-backwards rule on a running node limit what one bad or spoofed server can do. Use time servers on a network you trust, and list more than one.
:::

## The clock floor

The node never steps its clock behind the latest of:

- the build time of the image it's running,
- the last good sync,
- the latest `notBefore` of any certificate it has issued,
- the time at its last clean shutdown, if the clock had synced that boot.

The floor is kept on the node's encrypted state partition, so it survives reboots. A server whose time is behind the floor is refused, at boot too, with an error such as:

```text
clock step refused: server time 2026-09-29T15:12:07.660643695Z is behind already-issued certificates or the last good sync (floor 2026-09-30T15:11:47.520824068Z)
```

The clock isn't moved, and on a node with a time source the refusal keeps [the signing gate](#the-signing-gate) closed. Once the server's time is right again, the next poll steps the clock forward and the gate opens. If the floor can't be read, the node logs an error and holds the floor at the image build time.

## The signing gate

While a time source is configured or leased but the clock hasn't synced yet this boot, the node refuses to sign certificates. That covers subordinate CA signing and every leaf path, ACME and EST included. The call fails before the CA key is loaded:

```text
rpc error: code = FailedPrecondition desc = node: the clock has not synced with its configured time source yet; signing is refused (set pki.allow_unsynced_clock to override)
```

- The gate opens at the first good sync and stays open for the rest of the boot, even if a later poll fails or a backwards step is refused. The clock was corrected once, and the `Clock:` line still reports the later problem.
- A node with **no time source** is never gated.
- **CRL and OCSP** keep being served and signed while the gate is closed. A CRL on a clock that may be off is better than no CRL.

To get a gated node signing, fix the time source: check the `Clock:` line for the reason, make sure the node can reach a server on UDP port 123, and wait for the next poll.

:::danger[allow_unsynced_clock signs certificates with dates you can't trust]
`pki.allow_unsynced_clock: true` lifts the gate. A node whose time source never answered may be minutes, days or years off, and every certificate it signs meanwhile carries dates from that clock for its whole life: one that isn't valid yet, one that expires early, or one that looks valid long after it should have expired. On a Root or an intermediate that includes the subordinate CAs it signs. Each certificate signed this way is logged as a warning, `signed on an unsynced clock`, but the certificate itself can't be fixed afterwards. Leave it off in production and fix the time source instead. Use it only in an isolated lab.
:::

```yaml
pki:
  allow_unsynced_clock: true   # isolated lab only
```

The node reads `allow_unsynced_clock` on every signing request, so an apply takes effect straight away and the apply reply says `requires_reboot=false`.

## Kiss-o'-Death

A server can tell a client to back off by answering with a Kiss-o'-Death code instead of the time:

| Code | What the node does |
|---|---|
| `RATE` | doubles how long it waits before asking that server again, up to 1024 seconds, and logs `time server sent kiss-o'-death RATE; reducing the poll rate` with the new interval |
| `DENY` or `RSTR` | stops asking that server until the next reboot, and logs `not querying it again until reboot` |
| any other code | treats it as no answer and backs off as for a server that is down |

Whatever the server says, the node never asks the same server more often than once every 15 seconds.

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

An `UNSYNCED` line that has never shown a `synced` time means the gate is still closed. One that shows a `synced` time means the node synced once this boot and still signs; fix what the reason names all the same, because the clock now drifts at the hardware rate.

In `-o json` and `-o yaml`, the same fields are in `time_sync`. See [Check status](./status.md) for the other lines.

## Next step

[Apply a config](./config-apply.md) to set `network.ntp_servers`.
