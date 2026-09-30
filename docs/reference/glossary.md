---
title: "📖 Glossary"
---

# 📖 Glossary

Plain definitions for every term used in these docs.

Terms are in alphabetical order. Where a term names something CryptOS doesn't have, the entry says so.

## A

**ACME** (RFC 8555): a protocol that lets a machine ask for a certificate on its own, proving it controls a name by answering a challenge. CryptOS supports the `http-01` challenge. See [Machine config: ACME and EST](./machine-config-enrollment.md).

**Admin certificate:** see *bootstrap admin*.

**AIA (Authority Information Access):** a certificate extension that says where to find more about the issuer: its OCSP responder and a copy of its certificate (`caIssuers`). CryptOS stamps it when `pki.revocation_base_url` is set.

**AKI (Authority Key Identifier):** a certificate extension naming the key that signed the certificate. On a Root it equals the SKI.

**Audit log:** the node's signed, hash-chained record of every API call. See [Audit log format](./audit-log.md).

## B

**Basic Constraints:** the certificate extension that says whether a certificate belongs to a CA (`cA=TRUE`) and, optionally, how many CA levels may sit below it (`pathLenConstraint`).

**Bootstrap admin:** the administrator certificate named in the machine config's `bootstrap` section. The node trusts it on first boot, and the first-boot ceremony promotes it to the node's administrator. `cryptosctl bootstrap` creates one.

## C

**CA (certificate authority):** something that signs certificates and vouches for them. A CryptOS node is a CA. See [Certificates and CAs 101](../concepts/certificates-101.md).

**CA roles:** the three jobs a node can have: *Root*, *intermediate* and *issuing*, set by `role.kind`. See [CA roles](../concepts/ca-roles.md).

**CDP (CRL Distribution Points):** a certificate extension giving the URL of the CRL that would list the certificate if it were revoked.

**Ceremony:** the first-boot procedure on a Root node that creates the CA key, signs the Root certificate and records a signed **ceremony manifest**. Started with `cryptosctl ceremony start`. See the [ceremony walkthrough](../deep-dives/ceremony-walkthrough.md).

**Certificate:** a signed statement that binds a public key to a name. CryptOS issues X.509 certificates.

**Certificate profile:** a named template under `pki.profiles` that sets everything about an issued certificate except its subject and key. See [Machine config: pki](./machine-config-pki.md#-certificate-profiles).

**Chain of trust:** the path from a certificate up through the CAs that signed it to a Root the reader already trusts. See [Chain of trust](../concepts/chain-of-trust.md).

**CRL (certificate revocation list):** a signed list of certificates a CA has revoked, published at `<revocation_base_url>/crl`.

**CSR (certificate signing request):** a request, signed by the requester's own key, asking a CA to issue a certificate for that key.

**cryptosctl:** the command-line tool for managing a CryptOS node. It runs on Linux and macOS; a Windows build is coming. See the [cryptosctl reference](./cryptosctl.md).

## D

**DER / PEM:** two encodings of the same certificate. DER is binary. PEM is DER in base64 between `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----` lines.

## E

**EKU (Extended Key Usage):** a certificate extension listing what the certificate may be used for, such as `serverAuth` or `clientAuth`. A Root carries none.

**EST** (RFC 7030): a protocol for enrolling and renewing certificates over HTTPS, often used by network gear. See [Machine config: ACME and EST](./machine-config-enrollment.md).

**External Account Binding (EAB):** an ACME feature that ties a new ACME account to a key the CA operator handed out, so only known clients can enrol.

## F

**Fleet Manager:** the separate web application and API for running many CryptOS nodes from one place. It holds no CA keys. See the [Fleet Manager overview](../fleet-manager/overview.md).

## G

**Generation:** the counter the node keeps next to its stored machine config. It goes up by one with every successful apply.

**gRPC / mTLS gRPC:** the API a node speaks. Every remote call is over mutual TLS (*mTLS*): the client proves who it is with its own certificate, and the node proves who it is with its management certificate. See the [gRPC API reference](./grpc-api.md).

## I

**Immutable:** the node's operating system files are read-only and can't be changed while it runs. See [Immutable, no login](../concepts/immutable-no-login.md).

**Intermediate CA:** a CA signed by a Root (or by another intermediate) that signs further CAs.

**Issuing CA:** a CA that signs end-entity (leaf) certificates for servers, users and devices.

## K

**Key Usage:** the certificate extension listing the operations a key may do, such as `digitalSignature`, `keyCertSign` and `cRLSign`.

**KMS state key:** the `state_key.mode: kms` option, where an external key management service wraps the key that unlocks the state partition.

## L

**Leaf (end-entity) certificate:** a certificate that is not a CA, such as a web server's.

**LUKS:** the Linux disk-encryption format CryptOS uses for its state partition.

## M

**Machine config:** the one YAML file that describes a node. See the [machine config schema](./machine-config.md) and [Declarative config](../concepts/declarative-config.md).

**Maintenance mode:** the state a node boots into before it is installed, where it waits for a machine config. See [Maintenance mode](../concepts/maintenance-mode.md).

**Management certificate:** the self-signed certificate a node's management API presents. The node makes a new one on every boot, so a client pins it again after each reboot.

## N

**nodeID state key:** the `state_key.mode: nodeid` option, where the state-partition key is derived from the machine's SMBIOS UUID. For development only.

## O

**OCSP** (RFC 6960): a protocol for asking a CA, one certificate at a time, whether a certificate is revoked. Served at `<revocation_base_url>/ocsp`.

**otherName:** a kind of subject alternative name for identities that aren't DNS names or addresses, such as Kerberos principals and Microsoft UPNs.

## P

**Path length (`pathLenConstraint`):** the part of Basic Constraints that limits how many CA levels may sit below a CA. A Root carries none.

## R

**RFC 5280:** the standard that defines X.509 certificates and CRLs on the internet. See the [Root certificate profile](./root-cert-profile.md).

**Revocation preflight:** the node's check, before it issues, that its revocation URLs resolve and answer. Issuance is refused while it fails.

**Root CA:** the top of a hierarchy. It signs its own certificate, and everything below it is trusted because the Root is.

## S

**SAN (Subject Alternative Name):** the certificate extension listing the names a certificate is valid for, such as DNS names and IP addresses.

**SCEP** (RFC 8894): a certificate enrolment protocol for network gear and devices. Not available in CryptOS.

**Secure Boot:** firmware checking that the operating system image is signed by a key it trusts before running it. See [Secure Boot](../install-deploy/secure-boot.md).

**Serial number:** a certificate's unique number from its issuer. CryptOS uses 20 random bytes.

**SKI (Subject Key Identifier):** a certificate extension identifying the certificate's own public key.

**SquashFS:** the compressed, read-only file system the node's operating system runs from.

**State partition:** the encrypted disk partition, mounted at `/var/lib/cryptos`, that holds everything the node must remember: its config, CA key material, issued-certificate records and audit log.

**Subordinate CA:** any CA signed by another CA: an intermediate or issuing CA.

## T

**TPM (Trusted Platform Module):** a security chip that can create and use keys without letting them out. A virtual machine gets a virtual one, a *vTPM*. See [TPM-sealed keys](../concepts/tpm-sealed-keys.md).

**Trust anchor:** a certificate you trust directly, without anything above it vouching for it. Usually a Root.

## U

**UKI (Unified Kernel Image):** a single file holding the kernel, its command line and the initial file system, which the firmware boots directly and Secure Boot can verify as one signed unit.

**UPN (user principal name):** a Microsoft account name in `user@domain` form, carried in certificates as an otherName.

## V

**VMCA:** VMware vCenter's built-in certificate authority, which CryptOS can sign as a subordinate CA.

## W

**WSTEP:** a Microsoft protocol Windows uses to request certificates. Not available in CryptOS.

## X

**X.509:** the certificate format CryptOS issues, defined for the internet by RFC 5280.
