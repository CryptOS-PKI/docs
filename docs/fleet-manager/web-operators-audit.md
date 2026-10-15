---
title: "🔑 Operators, agent keys and audit"
---

# 🔑 Operators, agent keys and audit

:::tip[Works today]
The web UI is part of the alpha. A few screens still read demo data in places; see [Known gaps in the alpha](./web-ui.md#known-gaps-in-the-alpha).
:::

Who can reach the Fleet Manager, how an AI agent signs in, and the read-only record of what happened. Operator CAs are their own task: see [Managing operator CAs in the web UI](./web-operator-cas.md).

## Operators

The operator certificates the manager knows about: recorded ones and ones it has only seen logging in, with their holder, level, kind, operator CA, serial, expiry, whether they are denylisted or CRL-revoked, and when they were last seen. A **Pending requests** tab lists the credential requests waiting for a signed certificate. The page needs an operator CA (see [The operator CA and revocation](./operator-ca.md)). Without one it says no operator CA is configured.

`admin` gets **Request credential…**, **Record certificate…**, **Complete…** and **Cancel** on a request, and **Deny…** on a credential. Each is a step in [Adding operators](./web-operator-credentials.md). **Deny…** puts a certificate on the manager's denylist: the manager refuses it from its next request. It needs `database_url`.

:::warning[Denying here doesn't revoke at your CA]
The denylist stops the certificate at the Fleet Manager only. Revoke it at your operator CA as well and publish a new CRL.
:::

The manager doesn't issue operator certificates: your operator CA signs them. To add an operator, see [Operator credentials after day zero](./operator-credentials.md). Certificates the manager recorded before operator CAs became external are listed as `legacy_node` and can't log in.

{/* screenshot: fleet-manager/operators-not-configured.png: the Operators page with no operator CA configured */}

Someone with no operator certificate yet can make their own key and CSR from the start page: **No operator certificate yet? Make a credential request** opens [Make a credential request](./make-a-credential-request.md), which runs entirely in the browser.

## Agent keys and MCP sign-in

When the manager's MCP endpoint is on, AI agents use **agent keys**. Each key is bound to the operator certificate that made it, and does no more than that certificate's level or its own ceiling, whichever is lower. It stops working when the certificate is revoked or renewed.

- **Create key…** makes a key for a client that can't open the browser sign-in. It is shown once; the manager keeps only a hash.
- **Revoke…** ends a key on the agent's next request.
- An MCP client's sign-in opens **Authorize an MCP client** in your browser, where you choose a level ceiling and **Approve** or **Deny**.
- **Approvals** lists the requests agents raise before a tool that changes the fleet runs, with a count of pending ones in the bar. Deciding them is its own task: see [Approving agent requests](./approvals.md).

The manager's [MCP guide](https://github.com/CryptOS-PKI/cryptos-manager/blob/main/docs/mcp.md) covers setup.

## Audit

Every recorded event: time, kind, target, actor (a certificate or an agent key), how it came in, outcome and summary. It is read-only.

{/* screenshot: fleet-manager/audit.png: the Audit page with a few events, including node-adopted and issued */}
