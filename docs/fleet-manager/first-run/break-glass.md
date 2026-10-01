---
title: "🧯 Break-glass: reopen first run"
---

# 🧯 Break-glass: reopen first run

This page covers one task: reopening [first run](./index.md) after it has closed, when no one can sign in as an admin any more. Every admin certificate is lost, expired or revoked, and there is no other way back in.

`manager -config <config> -reset-first-run` is an offline command. Shell access to a host that can reach the manager's Postgres is the authority; it asks for nothing else. It runs once and exits.

:::info[Before you start]
You need the manager's config file (or the Kubernetes ConfigMap), its database connection string, and the right to stop the manager. First run must use Postgres: with no `database_url` there is nothing to reset.
:::

## What the reset does

In one database transaction it:

1. clears the first-run latch and deletes every bootstrap session and token;
2. marks **every** registered operator CA `retired`, with the reason `reset`. The rows are kept for the record. After the next start no certificate from any of those CAs signs in, admins and operators alike;
3. keeps the operator denylist and the stored CRLs. If you register the same CA again, its earlier revocations still apply.

It then writes a `bootstrap-reset` row to the audit log (actor kind `host`, via `cli`, with the host's name) and prints what it changed.

:::danger[Every operator loses access]
The reset retires every registered operator CA, not only the one whose admins were lost. Until someone completes first run again, no one can use the web UI or the API, and MCP keys bound to the old certificates stop working. Only run it when no admin can sign in.
:::

There is no option to revoke issued credentials. The Fleet Manager never held your operator CA's key and can't revoke at it; that is done at the CA.

## 1. Stop every replica

:::warning[The reset refuses while a manager runs]
It refuses while a replica holds the `fleetos.bootstrap_token` lock in Postgres, or while anything answers `/healthz` on the `listen` address in the config. The health check only sees the machine the command runs on, so stopping every replica is your job: on Kubernetes, scale the Deployment to zero first.
:::

## 2. Run the reset

### Docker Compose

On the manager's host, from the folder that holds `deploy/compose.yaml`:

```bash
docker compose -f deploy/compose.yaml stop manager
docker compose -f deploy/compose.yaml run --rm --no-deps manager \
  -config /etc/cryptos/fleet/config.yaml -reset-first-run
```

`run` starts a one-off container from the same image, config and network, with no published ports. Postgres stays up.

### Kubernetes

Scale the manager to zero, replacing the namespace with yours:

```bash
kubectl -n fleet scale deployment/fleet-manager --replicas=0
kubectl -n fleet wait --for=delete pod -l app.kubernetes.io/name=fleet-manager --timeout=120s
```

Save this Pod as `fleet-manager-reset.yaml`. Set `image` to the image the Deployment runs, and the Secret name and key to your `database.existingSecret` and `database.secretKey`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: fleet-manager-reset
spec:
  restartPolicy: Never
  securityContext:
    runAsNonRoot: true
    runAsUser: 65532
    runAsGroup: 65532
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: reset
      image: ghcr.io/cryptos-pki/manager:0.1.0
      args: ["-config", "/etc/cryptos/fleet/config.yaml", "-reset-first-run"]
      securityContext:
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
      env:
        - name: MANAGER_DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: fleet-manager-db
              key: database-url
      volumeMounts:
        - name: config
          mountPath: /etc/cryptos/fleet/config.yaml
          subPath: config.yaml
  volumes:
    - name: config
      configMap:
        name: fleet-manager-config
```

Run it, and check it until its status is `Completed` (or `Error`):

```bash
kubectl -n fleet apply -f fleet-manager-reset.yaml
kubectl -n fleet get pod fleet-manager-reset
```

Then read its output and remove it:

```bash
kubectl -n fleet logs pod/fleet-manager-reset
kubectl -n fleet delete pod/fleet-manager-reset
```

With `Error`, the output says why; a refusal names the lock or the health check.

## 3. Read the output

A successful reset prints what it changed and this guidance:

```text
First run reset. The next start opens a fresh first run and prints a new bootstrap token.
  first run was closed by admin@example.org (serial 1f, operator CA 3a7c...e9) at 2026-09-30T15:04:05Z.
  0 bootstrap session(s) and 0 token(s) deleted, 1 operator CA(s) retired (rows kept).
  The operator denylist and stored CRLs are kept, so an operator CA registered again keeps its earlier revocations.

The FM never held your operator CA key. If you believe the CA itself is compromised, create a new operator CA before registering again. Otherwise you may register the same CA again.
Revoke at your CA any credential you no longer trust, and publish a new CRL.
```

:::caution[First run can still stay shut]
With `operatorCAPath` set, the reset prints a warning: first run stays `NOT_APPLICABLE` while the file source is configured. With `firstRun: disabled` it stays unavailable. Remove `operatorCAPath` (on Helm, `operatorCA.configMap`) or set `firstRun: auto` before you start the manager again.
:::

## 4. Start the manager and run first run again

Start the manager (`docker compose -f deploy/compose.yaml up -d`, or scale the Deployment back up). It logs a new bootstrap token, as on day zero. Then work through [Start first run](./start-first-run.md), [Register the operator CA](./register-operator-ca.md) and [Get the first admin certificate](./first-admin-certificate.md).

Before you register:

- If you think the CA itself is compromised, [create a new operator CA](./create-operator-ca.md). Otherwise you can register the same one again.
- Revoke at the CA every credential you no longer trust and publish a new CRL. The manager's denylist entries for that CA still apply.
- Registering the **same** CA again makes its row active again, so certificates it issued earlier sign in again unless they are denied or revoked. With a **new** CA, every operator other than the new first admin needs a new credential; see [Operator credentials after day zero](../operator-credentials.md).
