---
title: "✋ Approving agent requests"
---

# ✋ Approving agent requests

:::tip[Works today]
Step-up approvals are part of the alpha. The manager raises them for the MCP tools that change the fleet, and the web UI's **Approvals** page is where a person decides them.
:::

This page covers one task: deciding a request an AI agent raised through the Fleet Manager's MCP endpoint. How agents get a key and sign in is in [The web UI](./web-ui.md#agent-keys-and-mcp-sign-in) and the manager's [MCP guide](https://github.com/CryptOS-PKI/manager/blob/main/docs/mcp.md).

## What a step-up approval is

An agent holds only an agent key, a bearer secret. It can read the fleet, and some tools run for it straight away. The tools that change something harder to take back never run on the first call. These include revoking a certificate, creating, changing, deleting or applying a profile, switching a protocol adapter on or off, and issuing a CA certificate or a certificate from the Root. Instead the manager stores a **step-up approval** and hands the agent:

- an approval ID, such as `apr-3f9c2a`;
- a one-line summary of what the call would do, such as `Revoke certificate 0A1B issued by node "pki-issuing" (issuing), reason 1 (keyCompromise). This cannot be undone.`;
- a link, `https://fleetos.example.org/approvals?id=apr-3f9c2a`;
- the time the approval expires.

A person then opens that link with their **operator certificate** and approves or denies. If they approve, the agent calls the same tool again with the same arguments and the approval ID, and the call runs once.

The agent can never see or decide approvals itself. The manager refuses the approvals calls for any agent key, so the only way to approve is from a browser presenting an operator certificate. The person running the agent may approve in their own browser.

## Before you start

:::caution[Before you start]
You need an operator certificate installed in your browser and a working login (see [Logging in](./web-ui.md#logging-in)), and the manager's MCP endpoint must be on. Your certificate's level must be at least the request's **Required** level: `viewer`, `operator` or `admin`.
:::

## Open the request

Open the link the agent gave you. The Approvals page opens on every status, with that request highlighted and scrolled into view. The request may already have been decided or expired by the time you open it. If the ID is not in the list, the page says `Approval apr-3f9c2a was not found.`

You can also select **Approvals** in the bar under the header, next to **Agent keys**. Its badge counts the pending requests, and it recounts every 30 seconds and after each decision. From there the page lists pending requests. The **Status** filter switches to `approved`, `denied`, `expired`, `used` or `all`.

Each row shows:

| Column | What it shows |
|---|---|
| **Tool** | The MCP tool the agent called, for example `cert_revoke`. |
| **Summary** | What the call would do, written by the manager from the call's arguments. |
| **Requested by** | The common name of the operator certificate the agent key belongs to. |
| **Key** | The agent key that raised the request. |
| **Required** | The lowest level that may decide it: the tool's minimum level. |
| **Created**, **Expires** | When the request was raised, and when it stops being usable. |
| **Status** | `pending`, `approved`, `denied`, `expired` or `used`. A decided request also shows who decided it. |

## Approve or deny

:::danger[Approving runs the change]
Approving lets the agent run that exact call once, with no further check from you. Some of these calls can't be undone: a revoked certificate stays revoked. Approve only when the summary is what you expect the agent to do. If anything looks wrong, deny it and ask the agent to start over.
:::

1. On the request's row, select **Approve…** or **Deny…**.
2. The confirmation repeats the tool, who asked, the required level, the summary and the **Request digest (SHA-256)**. The digest is a hash of the call's exact arguments. Check that the approval ID and summary match what the agent showed you.
3. Select **Approve** or **Deny**. **Cancel** closes the dialog without deciding.

:::tip[Expected output]
The dialog closes, the row's status changes to `approved` or `denied` with your common name under it, and the pending badge goes down by one.
:::

If the manager refuses the decision, its message shows in red inside the dialog, and the dialog stays open. It refuses when the request has already been decided or has expired, or when your level is too low.

A denied request can't be approved later. The agent has to make the call again, which raises a new request.

## Who can decide

**Approve…** and **Deny…** are greyed out unless the request is `pending` and your level is at least its **Required** level. Hover over them to see why, for example `Needs admin level; you are operator` or `Already used`. The manager checks the same rule again when you decide. Any level may list the requests.

The manager also checks at run time. When the agent makes its second call, the manager checks the agent key's level again, and the call is refused if the key has since dropped below the tool's minimum. That happens when the certificate is revoked or renewed, or the key is revoked.

## Expiry and single use

:::caution[A request lasts 15 minutes]
Each request expires 15 minutes after the agent raised it, whether it is pending or approved. Decide it, and let the agent finish, inside that window. After that it shows as `expired`, and the agent has to make the call again.
:::

An approval runs exactly one call. It is marked `used` as the call starts, so a call that fails still uses it. The second call must come from the same agent key, for the same tool, with the same arguments. The manager compares the SHA-256 digest of the arguments, so an agent can't get one call approved and then run a different one.

Every decision and every approved call is written to the [Audit](./web-ui.md#audit) log with the approval ID, the tool, the request digest and the approver.

## Where to go next

- [The web UI](./web-ui.md): the other pages, including Agent keys.
- The manager's [MCP guide](https://github.com/CryptOS-PKI/manager/blob/main/docs/mcp.md): which tools need an approval, and the error codes an agent sees.
