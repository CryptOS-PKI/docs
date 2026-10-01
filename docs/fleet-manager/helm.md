---
title: "☸️ Deploy with Helm"
---

import Pre10Notice from '@site/docs/_partials/pre-1-0-notice.mdx';

# ☸️ Deploy with Helm

:::info[No published chart or image]
No chart or container image is published. Render the chart from the [`cryptos-manager`](https://github.com/CryptOS-PKI/cryptos-manager) repo and install it with an image you built yourself, or use one of the paths in [What to use today](#what-to-use-today).
:::

<Pre10Notice />

The supported chart is `chart/fleet-manager` in the [`cryptos-manager`](https://github.com/CryptOS-PKI/cryptos-manager) repo. It ships from the same repo and the same release as the manager, so the chart and the config file it renders always match the manager they run. If you are new to the Fleet Manager, read the [Fleet Manager overview](./overview.md) first.

## What the chart deploys

Chart version `0.1.0`, app version `0.1.0`. The release sets both to the tag it publishes.

:::info[Alpha: 0.x]
Every CryptOS release before `1.0.0` is a `0.x` alpha. `1.0.0` will be the first GA release, once the whole system lands. It isn't out yet.
:::

The chart renders four objects:

| Object | What it is for |
|---|---|
| ConfigMap `fleet-manager-config` | The manager's `config.yaml`, mounted at `/etc/cryptos/fleet/config.yaml`. It holds no secrets. |
| Deployment `fleet-manager` | One container named `manager`, running `ghcr.io/cryptos-pki/cryptos-manager`. |
| Service `fleet-manager` | Port `443` forwarded to `8443` in the container, and port `80` to `8080` for the redirect to HTTPS. |
| PersistentVolumeClaim `fleet-manager-node-creds` | The node credentials folder. Not created when you name your own claim in `nodeCreds.existingClaim`. |

The pod runs as user `65532` with a read-only root filesystem, no privilege escalation and every Linux capability dropped. Its one writable mount is the node credentials claim, at `/var/lib/cryptos-manager/node-creds`.

The probes:

- **Readiness** calls `/healthz`, which the manager answers itself: `200` when it is serving and its Postgres answers, `503` when the database does not. A pod whose database is down leaves the Service.
- **Startup and liveness** only check that the HTTPS listener accepts connections. A database outage doesn't restart the pod, and the startup probe allows two minutes, which covers the 90 seconds the manager waits for Postgres before it listens.

## What you supply

The chart creates no secrets. Before an install you need these in the release namespace:

- **A TLS Secret** with `tls.crt` and `tls.key`, the manager's server certificate. Name it in `tls.certSecret`.
- **A ConfigMap with `operator-ca.pem`**, the CA that operator certificates chain to. Name it in `operatorCA.configMap`. The manager's [Operator PKI guide](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/operator-pki.md) shows how to make one.
- **A Postgres database** the cluster can reach, and a Secret holding its connection string, such as `postgres://manager:<password>@db:5432/manager`, under the key `database-url` (or the key you set in `database.secretKey`). Name it in `database.existingSecret`. The chart passes it to the manager as the `MANAGER_DATABASE_URL` environment variable, so the password never appears in the ConfigMap.
- **Storage for the node credentials.** The default claim asks the cluster's default storage class for `1Gi`, `ReadWriteOnce`.
- **The manager image.** Until a release publishes it, build it and push it to a registry your cluster can pull from, then set `image.repository` and `image.tag`. The manager README covers [building the image yourself](https://github.com/CryptOS-PKI/cryptos-manager#building-the-image-yourself).

With `authBypass: false`, the default, the chart refuses to render without `tls.certSecret`, `operatorCA.configMap` and `database.existingSecret`.

:::danger[The node credentials claim is not replaceable]
When the manager adopts a node, it writes that node's admin key to the claim, and the installed node trusts only that key. If the claim is deleted, the manager can no longer manage any node it adopted. The only way back is a reset from each node's console, which erases the node's key material. `helm uninstall` leaves the claim in place on purpose (`helm.sh/resource-policy: keep`). Back it up along with the database, and don't delete it by hand. See [Re-adopting a node](./overview.md#re-adopting-a-node).
:::

## Before you upgrade

:::warning[Unpinned nodes are refused after the upgrade]
Before upgrading to this version, make sure every node is either pinned (`server.crt`, or the fingerprint recorded at adoption) or has a recorded CA chain. Unpinned nodes are refused after the upgrade. [Before you upgrade](./node-trust.md#before-you-upgrade) lists the nodes that would be refused and how to pin each one.
:::

A `helm upgrade` that only changes values in the config still restarts the manager: the pod carries a checksum of its ConfigMap, so the new config is read straight away.

After an install or upgrade, the chart's notes print the command that lists how each node is verified, and a warning for every node with `insecureSkipNodeVerify`.

## The values that matter

The full list is in [`chart/fleet-manager/values.yaml`](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/chart/fleet-manager/values.yaml).

| Key | Default | What it does |
|---|---|---|
| `replicaCount` | `1` | Number of manager pods. See the caution below before raising it. |
| `image.repository` | `ghcr.io/cryptos-pki/cryptos-manager` | The manager image. |
| `image.tag` | `""` | Empty means the chart's app version. |
| `service.port` / `service.targetPort` | `443` / `8443` | The Service port and the container's HTTPS listener. |
| `service.httpPort` / `service.httpTargetPort` | `80` / `8080` | The redirect-to-HTTPS port and its listener. |
| `httpRedirectListen` | `0.0.0.0:8080` | The redirect listener. Empty turns it off. |
| `authBypass` | `false` | Development only. Turns off client-certificate login and TLS. |
| `tls.certSecret` | `""` | The TLS Secret. |
| `operatorCA.configMap` | `""` | The ConfigMap with `operator-ca.pem`. |
| `operatorCRL.urls` | `[]` | http or https URLs of the operator CA's CRLs. |
| `operatorCRL.configMap` / `operatorCRL.files` | `""` / `[]` | A ConfigMap of CRL files (DER or PEM) and the keys in it to load. The chart mounts it read-only at `/etc/cryptos/fleet/operator-crl`, and the manager re-reads the files on every refresh. Set both or neither. |
| `operatorRevocationPolicy` | `""` | `soft` (the default when empty) or `hard`: what the web API does when no fresh revocation data is available. |
| `operatorOCSP.mode` / `operatorOCSP.url` | `""` / `""` | `off`, `aia` (the default when empty) or `url`, with `url` required for mode `url` and refused otherwise. |
| `operatorCANode` | `""` | Removed. A CryptOS node can't be the operator CA; setting it fails the render. See [Migrating from operator_ca_node](./migrating-from-operator-ca-node.md). |
| `mcp.enabled` / `mcp.publicURL` | `false` / `""` | The MCP endpoint for AI agents. See the manager's [MCP guide](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/mcp.md#with-the-helm-chart). |
| `database.existingSecret` | `""` | The Secret with the Postgres connection string. |
| `database.secretKey` | `database-url` | The key inside that Secret. |
| `nodeCreds.existingClaim` | `""` | Use this claim instead of creating one. |
| `nodeCreds.storageClass` | `""` | Empty uses the cluster default. |
| `nodeCreds.accessModes` | `["ReadWriteOnce"]` | Access modes for the created claim. |
| `nodeCreds.size` | `1Gi` | Size of the created claim. |
| `nodes` | `[]` | Nodes to load into an empty database on first start. |
| `nodes[].adminCredsSecret` | unset | A Secret with the node's admin credentials. See [Node admin credentials from a Secret](#node-admin-credentials-from-a-secret). |
| `nodes[].insecureSkipNodeVerify` | unset | `true` turns off the check of the node's server certificate. Lab testing only; see [Skipping verification in a lab](./node-trust.md#skipping-verification-in-a-lab). |

:::caution[The revocation values need an operator CA]
`operatorCRL`, `operatorRevocationPolicy` and `operatorOCSP` apply to the operator CA in `operatorCA.configMap`. The chart refuses to render any of them with `authBypass: true`, and refuses a bad value (a policy other than `soft` or `hard`, an unknown OCSP mode, a CRL URL that isn't http or https) instead of letting the manager fail at start.
:::

:::caution[More than one pod needs shared storage]
Every pod must hold the admin key of every adopted node, so a `ReadWriteOnce` claim supports one pod only. The chart refuses to render with `replicaCount` above `1` unless `nodeCreds.accessModes` includes `ReadWriteMany`. With a `ReadWriteOnce` claim the Deployment uses the `Recreate` strategy, so an upgrade stops the old pod before it starts the new one and the UI is briefly unavailable.
:::

## Node admin credentials from a Secret

A node you list in `nodes` needs the admin certificate and key the manager presents to it, and what the manager verifies the node against: the node's CA chain, its pinned server certificate, or both. Put them in a Secret, one per node, and name it in the node's `adminCredsSecret`. The chart mounts the Secret read-only at `/etc/cryptos/fleet/node-admin/<name>` and points the node's `adminCertPath`, `adminKeyPath` and `caCertPath` at it, so no key material goes in your values or the ConfigMap.

1. Create the Secret in the release namespace, with the keys `admin.crt` and `admin.key`, plus `ca.pem` (the node's CA chain) once the node has its CA, and `server.crt` (its [pinned certificate](./node-trust.md#pin-a-node)) before that. `kubectl` works the same on Linux, macOS and Windows:

   ```bash
   kubectl create secret generic pki-root-admin --from-file=admin.crt --from-file=admin.key --from-file=ca.pem --from-file=server.crt
   ```

   The manager reads `ca.pem` and `server.crt` on every connection, so an updated Secret takes effect once Kubernetes refreshes the mount, without a restart.

2. Name it in the node's entry:

   ```yaml
   nodes:
     - name: pki-root
       endpoint: "pki-root.example.org:443"
       role: root
       adminCredsSecret: pki-root-admin
   ```

:::caution[Use the Secret or the paths, not both]
The chart fails the render if a node sets `adminCredsSecret` together with `adminCertPath`, `adminKeyPath` or `caCertPath`, or has no `name`. A node without `adminCredsSecret` keeps the paths you give it.
:::

:::caution[The list only reaches an empty database]
With Postgres, the manager copies `nodes` into the database on its first start only. A node you add to the list later does not appear. See [Listed in the config file](./overview.md#listed-in-the-config-file).
:::

This is for nodes you list yourself. Nodes the manager adopts keep the admin key it makes for them on the node credentials claim.

## Render the chart and check it

You can render the chart without a cluster and read what it would create. `git` and `helm` work the same on Linux, macOS and Windows, so these commands are the same everywhere.

1. Clone the cryptos-manager repo:

   ```bash
   git clone https://github.com/CryptOS-PKI/cryptos-manager.git manager
   ```

2. Lint the chart:

   ```bash
   helm lint manager/chart/fleet-manager
   ```

   :::tip[Expected output]
   The chart passes. Lint renders it with the default values, so it warns about the three values you supply at install, and notes that it has no icon.

   ```text
   level=WARN msg="missing required values" message="database.existingSecret is required when authBypass is false (without it the manager runs its in-memory demo store)"
   level=WARN msg="missing required values" message="tls.certSecret is required when authBypass is false"
   level=WARN msg="missing required values" message="operatorCA.configMap is required when authBypass is false"
   ==> Linting manager/chart/fleet-manager
   [INFO] Chart.yaml: icon is recommended

   1 chart(s) linted, 0 chart(s) failed
   ```
   :::

3. Render the Deployment with the three names filled in:

   ```bash
   helm template fm manager/chart/fleet-manager --set tls.certSecret=fm-tls --set operatorCA.configMap=fm-operator-ca --set database.existingSecret=fm-postgres --show-only templates/deployment.yaml
   ```

   :::tip[Expected output]
   The container gets the connection string from your Secret, not from the ConfigMap:

   ```text
             env:
               - name: MANAGER_DATABASE_URL
                 valueFrom:
                   secretKeyRef:
                     name: "fm-postgres"
                     key: "database-url"
   ```
   :::

   :::caution[A missing value stops the render]
   Leave out `database.existingSecret` and the render fails instead of deploying a manager with no durable state:

   ```text
   Error: execution error at (fleet-manager/templates/deployment.yaml:11:10): database.existingSecret is required when authBypass is false (without it the manager runs its in-memory demo store)
   ```
   :::

## The `cryptos-release` repo's chart is not supported

The [`cryptos-release`](https://github.com/CryptOS-PKI/cryptos-release) repo also carries a chart, `charts/manager`. It is not a supported install. It sets environment variables the manager doesn't read and never gives it the `config.yaml` it needs, so its pod exits at startup. Use `chart/fleet-manager` from the `cryptos-manager` repo instead.

## What to use today

No image or chart is published, so the manager's own docs cover the two deployments that run without a registry:

- **Docker Compose on one host**, with the manager and its own Postgres: [Single host with `docker compose`](https://github.com/CryptOS-PKI/cryptos-manager#single-host-with-docker-compose).
- **A plain Linux host with systemd** and a local Postgres: [Deploying the Fleet Manager standalone](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/deploying-standalone.md).

Every deployment needs an operator certificate before anyone can log in. The manager's [Operator PKI guide](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/operator-pki.md) shows how to mint one.

## Where to go next

- [Fleet Manager overview](./overview.md): what the Fleet Manager holds and how nodes join it.
- [The web UI](./web-ui.md): what you can do once you are logged in.
