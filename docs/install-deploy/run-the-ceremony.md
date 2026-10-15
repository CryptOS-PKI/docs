---
title: "🔑 Run the first-boot ceremony"
---

# 🔑 Run the first-boot ceremony

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

With the node trusted and ready ([Reboot into the ceremony](./reboot-ceremony.md)), create its Root CA for the first time.

## Run the first-boot ceremony

Send the same machine config again. The ceremony uses it for the Root's name, key type and lifetime:

:::danger[The ceremony runs once]
The Root's name, key type and lifetime are fixed by this run. Check `root.yaml` first: the only way to redo it is `cryptosctl reset`, which erases the CA key.
:::

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem ceremony start --config root.yaml
```

:::tip[Expected output]
Each line is a step of the ceremony as it finishes. `COMPLETE` means the Root exists.

```text
KEY_CREATED      tpm_public=<size> bytes
CERT_SIGNED      cert_sha256=<SHA-256 of the new Root certificate>
MANIFEST_WRITTEN manifest_id=<ceremony ID>
ADMIN_ROTATED    admin_cert_sha256=<SHA-256 of your bootstrap certificate>
COMPLETE
```
:::

Step by step, the node:

1. checks that your client certificate is the bootstrap admin named in the config;
2. saves the config and creates the CA key inside the TPM (or in software on a `nodeid` image);
3. self-signs the Root certificate with that key;
4. writes a signed **ceremony manifest** that records what happened, for audit;
5. makes your bootstrap identity the node's standing administrator.

While it runs, the console shows `Ceremony in progress`. A run that fails before `COMPLETE` leaves that screen up; fix the cause and run `ceremony start` again.

The ceremony runs once. After it succeeds, running it again fails with `IDENTITY_EXISTS`, and only one ceremony can run at a time. It is only for the `root` role: an `intermediate` or `issuing` node refuses it, because a subordinate CA must be signed by its parent instead (see [Subordinate nodes](./subordinate-nodes.md)).

## Switch to your root after the ceremony

As soon as the node has its CA, the management listener stops presenting the self-signed certificate. From the next connection on, with no restart, it presents a certificate signed by the node's own CA, followed by the node's CA chain up to the root. The console follows within about 30 seconds.

That certificate:

- gets a new key on every boot, like before, but always chains to your root;
- names the node's `network.address` IP and every name in `pki.est.hostnames`, and no longer `localhost`;
- is valid for 90 days (never past the CA's own expiry) and is renewed at the halfway point;
- is a server certificate only (`serverAuth`), never a CA.

:::caution[The pin you used for the ceremony stops working]
The self-signed pin in `node-trust.pem` no longer matches once the ceremony commits. Any call with it fails with `x509: certificate signed by unknown authority`. Follow the steps below instead of fetching the old certificate again.
:::

The serving dashboard shows the change under the fingerprint: the **Mgmt cert** line changes from `self-signed, compare the fingerprint` to:

```text
Mgmt SHA-256   ....
Mgmt cert      CA-signed, trust the CA
```

From now on, trust the root instead of a pin. To get it, fetch this boot's CA-signed certificate once, checked against the console as before, read the Root certificate over it, and check the Root against the `cert_sha256` the ceremony printed:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem \
  trust fetch --expect-sha256 "<Mgmt SHA-256 on the console now>"
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem identity show -o pem > root.pem
openssl x509 -in root.pem -noout -fingerprint -sha256
```

:::danger[Check the Root fingerprint before you rely on root.pem]
The SHA-256 openssl prints must equal the `cert_sha256` from the ceremony's `CERT_SIGNED` line (openssl adds colons; ignore them and case). If it doesn't, don't use the file: something other than your node answered.
:::

Then use `root.pem` for every call. It keeps working across reboots and image upgrades. Address the node by its IP or by a name in `pki.est.hostnames`; for any other name, add `--server-name 192.0.2.10`.

:::caution[Don't keep a CA-signed certificate as a pin]
`trust fetch` saves the CA-signed management certificate itself, and that stops matching at the next reboot because the key changes. Use it only to read the root, as above.
:::

## Check the Root

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem identity show
cryptosctl --endpoint 192.0.2.10:443 --trust root.pem identity validate
```

`identity show` prints the subject, issuer, serial, validity and SHA-256 of the Root certificate; add `-o pem` to get the certificate itself, ready to hand to the systems that should trust it. `identity validate` checks the chain and prints `OK: certificate chain validates`.

## Next step

Setting up a Root gives you one node. To add more under it, see [Subordinate nodes](./subordinate-nodes.md).
