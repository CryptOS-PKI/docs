---
title: "🔁 Migrating from operator_ca_node"
---

# 🔁 Migrating from operator_ca_node

`operator_ca_node` named a CryptOS node as the operator CA: the manager had that node issue and revoke operator certificates. A CryptOS node can't be the operator CA any more. The manager now refuses to start when its config sets `operator_ca_node`, and the Helm chart refuses to render when `operatorCANode` is set. Both errors point here.

This page moves a manager to an external operator CA. How the manager uses that CA is in [The operator CA and revocation](./operator-ca.md).

:::caution[Before you start]
You need a machine to run the new operator CA on, ideally offline, with OpenSSL. Plan a short window: the certificates the node issued stop working when the manager restarts with the new settings, so every operator needs a certificate from the new CA before that.
:::

## Steps

1. **Create the operator CA.** Make an OpenSSL CA with the operator certificate profile, as in the manager's [standalone deployment guide, section 3](https://github.com/CryptOS-PKI/manager/blob/main/docs/deploying-standalone.md#3-the-operator-ca-is-an-external-ca). Give it `keyCertSign` and `cRLSign`, so the manager can check its CRL.

   :::danger[Keep the CA key offline]
   Whoever holds the operator CA key can sign themselves an admin certificate for the Fleet Manager. Keep it on an offline or tightly controlled machine, never on the manager host.
   :::

2. **Issue new operator certificates** from it, one per operator, with the level extension non-critical. Install your own in your browser.

3. **Point the manager at it.** Set `operatorCAPath` to the new CA's certificate. If the CA publishes a CRL, add it:

   ```yaml
   operatorCAPath: /etc/cryptos/fleet/operator-ca/operator-ca.pem
   operatorCRL:
     - url: http://pki.example.org/fleetos-operator.crl
   ```

   With the Helm chart, put the certificate in the ConfigMap named by `operatorCA.configMap`.

4. **Remove `operator_ca_node`** from the config, or `operatorCANode` from your Helm values.

   :::warning[The old certificates stop working here]
   After the next step, certificates the node issued are refused: the node's CA can't be an operator CA. Make sure your new certificate is installed first.
   :::

5. **Restart the manager** (or `helm upgrade`) and reload the page. Choose the new certificate when the browser asks.

6. **Remove the `operator-*` profiles** (`operator-viewer`, `operator-operator`, `operator-admin`) from the node that used to issue operator certificates.

## What changes after the move

- **Revoking an operator** in the Fleet Manager puts the certificate on the manager's own denylist. It no longer revokes at a node, and it can't revoke at your CA. Revoke there too and publish a new CRL.
- **Issuing an operator certificate** in the Fleet Manager is gone: your CA signs them.
- **Operator records** the manager kept from before stay listed, marked `legacy_node`. They can't log in.
- **MCP keys** need the operator CA to have a CRL that isn't out of date. See [MCP needs a current CRL](./operator-ca.md#mcp-needs-a-current-crl).
