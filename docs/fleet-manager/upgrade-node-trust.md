---
title: "⬆️ Check node trust before you upgrade"
---

# ⬆️ Check node trust before you upgrade

:::warning[Unpinned nodes are refused after the upgrade]
Before upgrading to this version, make sure every node is either pinned (`server.crt`, or the fingerprint recorded at adoption) or has a recorded CA chain. Unpinned nodes are refused after the upgrade: nothing can be read from them and every operation on them fails until you pin them.
:::

A recorded CA chain only verifies a node that signs its management certificate with its CA. A node on a CryptOS release that still makes a self-signed management certificate every boot needs a pin, even when its `caCertPath` is set. See [Verifying a node's certificate](./node-trust.md) for how pinning and the recorded chain work day to day.

## List the nodes that would be refused

The new manager's `-check-node-trust` connects to each node, presenting its admin certificate, and runs the same verification as every connection on the certificate the node presents. It prints one line per node, `verified` with how or `REFUSED` with the reason, and exits `1` if any node is refused. A node it can't reach counts as refused, because the check can't vouch for it. Nodes with `insecureSkipNodeVerify` aren't contacted and get a warning. It reads the config file and opens the database the way a start does, applying the schema, but it doesn't serve. On a standalone install, run it with the new binary on the manager host, with the same config file and `MANAGER_DATABASE_URL` the manager uses, before you switch over:

```bash
./manager -config /etc/cryptos/fleet/config.yaml -check-node-trust
```

```text
node trust: pki-root (192.0.2.10:443): verified (ca-chain)
node trust: pki-inter (192.0.2.12:443): REFUSED: nodeclient: node pki-inter refused: its server certificate (sha256 4f1c...) does not verify against the recorded CA chain /var/lib/cryptos-manager/node-creds/pki-inter/ca.crt for host 192.0.2.12: x509: certificate signed by unknown authority; ...
node trust: pki-issuing (192.0.2.11:443): REFUSED: nodeclient: node pki-issuing refused: no CA chain is recorded and no server certificate is pinned; pin it at /var/lib/cryptos-manager/node-creds/pki-issuing/server.crt or with -pin-node
```

:::caution[Files on disk are not enough]
A stale `ca.crt` (an old CA) or a stale `server.crt` (a certificate from before a reboot) is still refused on every connection, although the files are there. Go by the check's `verified` line, not by whether the files exist.
:::

Without the new binary, check by hand. Each node needs a recorded CA chain (`ca.crt` for an adopted node; the node's `caCertPath`, or the `ca.pem` key of its `adminCredsSecret`, for a node in the config file) or a `server.crt` in the folder of its admin certificate, and the certificate the node presents has to verify against one of them. These commands run on the manager host. To check a node's CA chain against what it presents, look for `Verify return code: 0 (ok)`:

```bash
openssl s_client -connect 192.0.2.10:443 -verify_ip 192.0.2.10 -CAfile /var/lib/cryptos-manager/node-creds/pki-root/ca.crt </dev/null 2>/dev/null | grep "Verify return code"
```

A pinned node verifies when its `server.crt` is the certificate the node presents. The two fingerprints must match:

```bash
openssl s_client -connect 192.0.2.10:443 </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256
openssl x509 -in /var/lib/cryptos-manager/node-creds/pki-root/server.crt -noout -fingerprint -sha256
```

To find the nodes with neither file:

- **An adopted node:** `<node credentials folder>/<node name>/`. The folder is `MANAGER_NODE_CREDS_DIR`, `/var/lib/cryptos-manager/node-creds` by default. Managers before this version never wrote a pin at adoption, so an adopted node is unpinned unless you pinned it yourself. On the manager host, this lists the ones with neither:

  ```bash
  for d in /var/lib/cryptos-manager/node-creds/*/; do [ -f "$d/server.crt" ] || [ -f "$d/ca.crt" ] || echo "no chain or pin: $(basename "$d")"; done
  ```

- **A node listed in the config file:** the folder of its `adminCertPath`, and its `caCertPath`. With the chart's `adminCredsSecret`, the pin is the Secret's `server.crt` key and the chain its `ca.pem` key; two empty results mean the node has neither. `kubectl` works the same on Linux, macOS and Windows:

  ```bash
  kubectl -n fleet get secret pki-root-admin -o jsonpath='{.data.server\.crt}'
  kubectl -n fleet get secret pki-root-admin -o jsonpath='{.data.ca\.pem}'
  ```

On Kubernetes the manager's image has no shell, so you can't list the files on the node credentials claim from the pod. Once the new version runs, use the manager binary itself:

```bash
kubectl -n fleet exec deploy/fleet-manager -- /manager -config /etc/cryptos/fleet/config.yaml -check-node-trust
```

After the upgrade the manager also logs one `node trust:` line per node at startup, with `REFUSED` on each node that has no recorded CA chain and no pin. That startup line only looks at the files and doesn't contact the node; run `-check-node-trust` to find stale ones.

## Pin each node

Pin every node the check lists, with [Pin a node](./node-trust.md#pin-a-node). A node listed in the config file can be pinned before the upgrade: older managers ignore `server.crt`, so the file waits until the new version reads it.

:::caution[Adopted nodes on Kubernetes are refused until you pin them]
An adopted node's pin lives on the node credentials claim, which you can only reach through the new manager's `-pin-node`. From the upgrade until you run it, the manager refuses the node. Plan that window, and have each node's console fingerprint ready.
:::
