---
title: "📋 Certificates, enrollment and protocols"
---

# 📋 Certificates, enrollment and protocols

:::tip[Works today]
The web UI is part of the alpha. A few screens still read demo data in places; see [Known gaps in the alpha](./web-ui.md#known-gaps-in-the-alpha).
:::

The fleet-wide pages: every certificate, every join request, the profile catalog and what each node actually serves.

## Certificates

Every certificate across the fleet, with its issuer, kind, profile, expiry and status. Pick a node under **Select an issuing node** and select **Issue certificate** to open that node's issue form.

## Enrollment

Join requests and their status (`PENDING`, `APPROVED` or `REJECTED`). **New enrollment** (`operator`) opens either kind:

- **Subordinate (CSR):** the child node, the parent CA's common name and the profile.
- **Link (agentless):** the node's endpoint, an admin certificate and key the node trusts, and the CA certificate that signed the node's management certificate. The manager refuses a node whose certificate doesn't verify against it.

On a request's page, **Approve** runs it. A subordinate needs `operator`; a link needs `admin` and asks for the connection details again. **Reject** needs a reason.

{/* screenshot: fleet-manager/enrollment-detail.png: a pending subordinate request with its attestation panel and the Approve and Reject buttons */}

## Profiles

The catalog of certificate templates: key algorithm, validity, subject, CA or not, key usages, extended key usages, SANs and extra extensions. **New profile** and **Save** need `admin`. Deleting a catalog profile leaves the copies on nodes alone.

## Protocols

What each managed node actually reports serving, not a fleet-wide setting. The list page counts, per protocol, how many ESTABLISHED Issuing nodes are running it and how many are waiting on a reboot; its detail page lists every node with its role, identity state, and an **Enable** or **Disable** switch (`admin`) for that node.

ACME (RFC 8555) and EST (RFC 7030) are served by the nodes themselves, set per node under `pki.acme` and `pki.est`; the switch calls `SetNodeProtocol` (see [Switching an enrolment protocol on a node](./overview.md#switching-an-enrolment-protocol-on-a-node)) and takes effect at that node's next reboot. A node that cannot serve the protocol -- a Root or Intermediate, or an Issuing node that is not yet ESTABLISHED -- shows why instead of a switch.

:::info[SCEP and Windows autoenrollment are not wired up]
Neither protocol has a config block on the node yet, so this page has nothing to read or switch for them and says so instead of showing an empty table.
:::
