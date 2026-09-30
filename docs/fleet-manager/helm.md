---
title: "☸️ Deploy with Helm"
---

# ☸️ Deploy with Helm

:::info[Planned]
A Helm install of the Fleet Manager does not work yet. The chart in the [`helm`](https://github.com/CryptOS-PKI/helm) repo lints and renders, but on `main` it does not give the manager the config file it reads, so the pod exits at startup. No container image or packaged chart has been published either. To run the Fleet Manager today, use Docker Compose or a plain Linux host (see [What to use today](#what-to-use-today)).
:::

This page describes the chart as it is on `main`: what it deploys, what you have to supply, and what is missing before it can run a real Fleet Manager. If you are new to the Fleet Manager, read the [Fleet Manager overview](./overview.md) first.

## What the chart deploys

The chart lives at `charts/manager` in the [`helm`](https://github.com/CryptOS-PKI/helm) repo. Chart version `0.1.0`, app version `0.1.0`, and it needs Kubernetes 1.27 or newer (`kubeVersion: ">=1.27.0-0"`).

It renders five objects:

| Object | What it is for |
|---|---|
| Deployment | One container named `manager`, running `ghcr.io/cryptos-pki/manager`. |
| Service | Port `443` in the cluster, forwarded to port `8443` in the container. Type `ClusterIP` by default. |
| ServiceAccount | A dedicated account for the pod, with `automountServiceAccountToken: false`. |
| ConfigMap | Release metadata only (`chart-version`, `app-version`, `release-name`). Nothing mounts it. |
| Ingress | Only when `ingress.enabled=true`. Uses `networking.k8s.io/v1`. |

The container runs as user `65532` with a read-only root filesystem, no privilege escalation and every Linux capability dropped. It gets two mounts: the TLS Secret at `/etc/cryptos/fm/tls` (read-only), and an `emptyDir` at `/tmp`.

## What you supply

The chart creates no secrets. Before an install you need:

- **A TLS Secret** of type `kubernetes.io/tls` with `tls.crt` and `tls.key`, named in `fm.tlsSecretName`.
- **A Postgres database** the cluster can reach, and a Secret holding its connection string under the key `dsn` (or the key you set in `postgres.dsnSecretKey`), named in `postgres.dsnSecretName`.
- **The manager image.** `image.repository` defaults to `ghcr.io/cryptos-pki/manager` and the tag to the chart's app version (`0.1.0`). That image has not been published, so you would have to build it and push it to a registry your cluster can pull from. The manager README covers [building the image yourself](https://github.com/CryptOS-PKI/manager#building-the-image-yourself).

## The values that matter

The full list is in [`charts/manager/values.yaml`](https://github.com/CryptOS-PKI/helm/blob/main/charts/manager/values.yaml).

| Key | Default | What it does |
|---|---|---|
| `replicaCount` | `1` | Number of manager pods. |
| `image.repository` | `ghcr.io/cryptos-pki/manager` | The manager image. |
| `image.tag` | `""` | Empty means the chart's app version. |
| `imagePullSecrets` | `[]` | For a private registry. |
| `service.type` | `ClusterIP` | Change it, or use the Ingress, to reach the manager from outside the cluster. |
| `service.port` / `service.targetPort` | `443` / `8443` | The in-cluster port and the container port. |
| `ingress.enabled` | `false` | Off, so exposing the UI is a choice you make. |
| `ingress.hosts` | `fm.example.org` | Host and path rules when the Ingress is on. |
| `fm.tlsSecretName` | `""` | The TLS Secret. If you leave it empty, the Deployment mounts a Secret named after the release (`fm-manager-tls` for a release called `fm`), which the chart does not create. |
| `fm.tlsMountPath` | `/etc/cryptos/fm/tls` | Where the TLS Secret is mounted. |
| `postgres.dsnSecretName` | `""` | The Secret with the Postgres connection string. |
| `postgres.dsnSecretKey` | `dsn` | The key inside that Secret. |
| `extraEnv` | `[]` | Extra environment variables for the container. |
| `resources` | requests `100m` / `128Mi`, limits `1` / `512Mi` | CPU and memory. |

The chart has no values for the MCP endpoint, the operator CA or the node inventory yet.

## Render the chart and look at it

You can render the chart without a cluster and read what it would create. `git` and `helm` work the same on Linux, macOS and Windows, so these commands are the same everywhere.

1. Clone the chart repo:

   ```bash
   git clone https://github.com/CryptOS-PKI/helm.git
   ```

2. Lint it:

   ```bash
   helm lint helm/charts/manager
   ```

   :::tip[Expected output]
   The chart passes. The only note is that it has no icon.

   ```text
   ==> Linting helm/charts/manager
   [INFO] Chart.yaml: icon is recommended

   1 chart(s) linted, 0 chart(s) failed
   ```
   :::

3. Render the Deployment with the two Secret names filled in:

   ```bash
   helm template fm helm/charts/manager --set fm.tlsSecretName=fm-tls --set postgres.dsnSecretName=fm-postgres --show-only templates/deployment.yaml
   ```

   :::tip[Expected output]
   The container section shows the image, the port and four environment variables. This is the part that matters for the next section.

   ```text
   env:
     - name: FM_TLS_CERT_FILE
       value: "/etc/cryptos/fm/tls/tls.crt"
     - name: FM_TLS_KEY_FILE
       value: "/etc/cryptos/fm/tls/tls.key"
     - name: FM_LISTEN_ADDR
       value: ":8443"
     - name: FM_POSTGRES_DSN
       valueFrom:
         secretKeyRef:
           name: fm-postgres
           key: dsn
   ```
   :::

## Why it does not run the manager yet

The manager reads all of its settings from one YAML file, `/etc/cryptos/fleet/config.yaml`, given by the image's default `-config` argument. It reads no `FM_*` environment variables. The only environment variable it reads is `MANAGER_NODE_CREDS_DIR` (see below).

The chart sets the four `FM_*` variables and never creates or mounts `config.yaml`, so the manager stops as soon as it starts.

:::warning[The pod crash-loops on main]
If you install this chart as it is, the `manager` container exits straight away and Kubernetes keeps restarting it. Its log shows:

```text
manager: config: read /etc/cryptos/fleet/config.yaml: open /etc/cryptos/fleet/config.yaml: no such file or directory
```

Don't use this chart for a real deployment until it renders the config file. Use one of the paths in [What to use today](#what-to-use-today) instead.
:::

Three more gaps sit behind that one:

- **Adoption needs a writable, lasting folder.** When the manager adopts a node it writes that node's admin certificate and key to `MANAGER_NODE_CREDS_DIR`, which defaults to `/var/lib/cryptos-manager/node-creds`. The chart's root filesystem is read-only and it mounts no volume there, so the write would fail. A folder on `/tmp` would work but is emptied whenever the pod is replaced.
- **The health probes do not test health.** The liveness and readiness probes call `/healthz`. The manager has no such route: the web UI answers every unknown path with its start page, so the probe passes whenever the process is up. The build details are served, without a login, at `/version`.
- **No MCP or operator CA values.** There is no way to set `mcp.enabled`, `operator_ca_node` or `operatorCAPath` through this chart.

:::caution[Keep the node credentials]
Once a node is adopted it trusts only the admin credential the manager stored for it. If that folder is lost, the manager can no longer manage the node and a new adoption is refused. The fix is a reset from the node's console, which erases the node's key material. Whatever you deploy, keep `MANAGER_NODE_CREDS_DIR` on storage that outlives the pod. See [Re-adopting a node](./overview.md#re-adopting-a-node).
:::

## The manager repo's own chart

The [`manager`](https://github.com/CryptOS-PKI/manager) repo carries a second chart, `chart/fleet-manager`. It is closer to what the manager needs: it renders `config.yaml` into a ConfigMap and mounts it at `/etc/cryptos/fleet/config.yaml`, and it has values for the operator CA (`operatorCA.configMap`, `operatorCANode`) and the MCP endpoint (`mcp.enabled`, `mcp.publicURL`). It is not a finished path either: it has no value for `database_url`, so the manager falls back to its in-memory store (seeded with a demo catalog, and emptied on every restart), and it mounts no volume for the node credentials.

Which of the two charts becomes the supported one is not settled yet. Until it is, and until a release publishes the image, treat both as templates to read, not as an install.

## What to use today

The manager's own docs cover the two deployments that run today:

- **Docker Compose on one host**, with the manager and its own Postgres: [Single host with `docker compose`](https://github.com/CryptOS-PKI/manager#single-host-with-docker-compose).
- **A plain Linux host with systemd** and a local Postgres: [Deploying the Fleet Manager standalone](https://github.com/CryptOS-PKI/manager/blob/main/docs/deploying-standalone.md).

Both need an operator certificate before anyone can log in. The manager's [Operator PKI guide](https://github.com/CryptOS-PKI/manager/blob/main/docs/operator-pki.md) shows how to mint one.

## Where to go next

- [Fleet Manager overview](./overview.md): what the Fleet Manager holds and how nodes join it.
- [The web UI](./web-ui.md): what you can do once you are logged in.
