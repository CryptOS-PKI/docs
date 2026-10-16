---
title: "🪪 Get a TSA policy OID"
---

# 🪪 Get a TSA policy OID

Pick the policy object identifier (OID) your time-stamp authority names in every token, before you [serve timestamps](./serve-timestamps-tsa.md).

Every RFC 3161 token carries a **TSA policy**: an OID that says under which rules the timestamp was issued. CryptOS has no default policy. Each deployment sets its own, so no two deployments share one by accident, and the TSA stays off until `pki.tsa.policy_oid` is set.

The usual way to get an OID of your own is an IANA **Private Enterprise Number** (PEN). It gives your organisation the arc `1.3.6.1.4.1.<PEN>`, and you assign everything under it.

:::info[Before you start]
- The name of your organisation, and a contact address that will stay valid for years: IANA publishes both with the number.
- A place to record what each OID you assign means, such as your PKI policy documents.
:::

## 1. Check whether you already have a PEN

Many organisations already hold one, for SNMP or a previous PKI. Search the published registry for your organisation's name at [the IANA enterprise numbers registry](https://www.iana.org/assignments/enterprise-numbers/).

If you find your organisation, ask whoever owns the number which arc you may use and go to step 3.

## 2. Request a PEN

Fill in the request form at [pen.iana.org](https://pen.iana.org). A PEN is free. IANA reviews the request and emails the number to the contact address; it then appears in the public registry with your organisation's name.

:::caution[The registration is public and long-lived]
The organisation name and contact you enter are published. Use a role address (for example a PKI team mailbox), not a person's own address, so the number does not become unreachable when someone leaves.
:::

## 3. Assign an arc for the TSA policy

Under your PEN, pick a branch for PKI and a number for the TSA policy. Write it down before you use it, so the same OID never means two things. For example, with the PEN `32473`:

| OID | Meaning |
|---|---|
| `1.3.6.1.4.1.32473` | Your organisation (the PEN) |
| `1.3.6.1.4.1.32473.1` | PKI policies |
| `1.3.6.1.4.1.32473.1.1` | TSA policy, version 1 |

:::warning[Do not copy the example number]
`32473` is the example enterprise number reserved for documentation (RFC 5612). A TSA with it in its policy works, but its tokens claim a policy that is not yours. Use your own PEN.
:::

If your TSA's rules change in a way relying parties should know about (a different accuracy, another clock source), give the new rules a new OID, such as `...1.2`, rather than changing what `...1.1` means. Tokens already issued keep naming the old one.

## 4. Check the OID

The node accepts a dotted OID with at least two arcs, each a decimal number without leading zeros, a first arc of 0, 1 or 2, and a second arc below 40 when the first is 0 or 1. Anything under `1.3.6.1.4.1.<PEN>` passes. You can check one with OpenSSL before you apply it:

```bash
openssl asn1parse -genstr OID:1.3.6.1.4.1.32473.1.1
```

:::tip[Expected output]
```text
    0:d=0  hl=2 l=  10 prim: OBJECT            :1.3.6.1.4.1.32473.1.1
```
:::

Next: [Serve RFC 3161 timestamps](./serve-timestamps-tsa.md).
