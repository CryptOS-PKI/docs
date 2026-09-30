---
title: "1. Create the operator CA"
---

# 1. Create the operator CA

:::info[Before you start]
A machine for the CA, ideally offline, with OpenSSL 1.1.1 or later. The commands are the same on every OS; run them on the CA machine.
:::

The operator CA signs the certificates operators log in with. This stage makes an OpenSSL CA with the profile the Fleet Manager checks. An enterprise or offline CA (EJBCA, Vault PKI, AD CS, an HSM-backed CA) also works if it can issue the profile in [1.3](#13-what-an-operator-certificate-must-carry); skip to [stage 2](./start-first-run.md) with its CA certificate in hand.

:::caution[Not a CryptOS node]
The operator CA must never be a CryptOS node's CA, or share a key with one. The manager refuses such a CA at registration, and at start when it comes from `operatorCAPath`. A CA issued by a node's CA is accepted with a warning, because anything that trusts that node's CA for client authentication would also accept operator certificates.
:::

## 1.1 The CA

:::danger[Keep the CA key offline]
Whoever holds `operator-ca.key` can sign themselves an admin certificate for the Fleet Manager. Keep it on an offline or tightly controlled machine, never on the manager host. The manager never needs it.
:::

```sh
mkdir -p operator-ca/newcerts && cd operator-ca
openssl ecparam -name secp384r1 -genkey -noout -out operator-ca.key
chmod 600 operator-ca.key
openssl req -x509 -new -key operator-ca.key -sha384 -days 3650 \
  -subj "/O=Example/CN=Example FleetOS Operator CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash" \
  -out operator-ca.crt
touch index.txt
openssl rand -hex 16 > serial
echo 1000 > crlnumber
```

`cRLSign` lets the manager check the CRLs this CA publishes. Keep it even if you don't plan a CRL yet: without a CRL the CA gets no MCP keys.

## 1.2 The CA config

Save this as `operator-ca.cnf` in the same folder. Each `op_<level>` section is the operator certificate profile for one access level.

```ini
[ ca ]
default_ca = operator_ca

[ operator_ca ]
dir              = .
database         = $dir/index.txt
new_certs_dir    = $dir/newcerts
certificate      = $dir/operator-ca.crt
private_key      = $dir/operator-ca.key
serial           = $dir/serial
crlnumber        = $dir/crlnumber
default_md       = sha384
default_days     = 365
default_crl_days = 7
unique_subject   = no
# Never copy extensions from a CSR: the sections below are the policy.
copy_extensions  = none
# Keep only the CN from the CSR subject.
policy           = policy_cn_only
crl_extensions   = crl_ext

[ policy_cn_only ]
commonName = supplied

[ op_admin ]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature
extendedKeyUsage       = clientAuth
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid
1.3.6.1.4.1.59999.1.1  = DER:13:05:61:64:6D:69:6E

[ op_operator ]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature
extendedKeyUsage       = clientAuth
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid
1.3.6.1.4.1.59999.1.1  = DER:13:08:6F:70:65:72:61:74:6F:72

[ op_viewer ]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature
extendedKeyUsage       = clientAuth
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid
1.3.6.1.4.1.59999.1.1  = DER:13:06:76:69:65:77:65:72

[ crl_ext ]
authorityKeyIdentifier = keyid
```

## 1.3 What an operator certificate must carry

| Field | Value |
|---|---|
| Subject | exactly one RDN: `CN=<email>`, lower case |
| Key | ECDSA P-384, or RSA of 3072 bits or more. P-256 is refused for operator certificates. |
| Level extension | OID `1.3.6.1.4.1.59999.1.1`, **not critical**, a PrintableString of the level (the DER in the sections above) |
| Extended key usage | exactly `clientAuth` |
| Key usage | critical, `digitalSignature` only |
| Basic constraints | critical, `CA:FALSE`, present |
| Validity | 365 days recommended; more than 400 days is warned about |

:::warning[The level extension must not be critical]
Browsers send the certificate, but the manager's TLS check refuses any certificate with an unknown critical extension, so a critical level extension can't sign in at all. The manager's pre-flight check in [stage 4](./first-admin-certificate.md) catches it.
:::

## 1.4 A first CRL

If you'll give the manager a CRL (recommended), make the first one now:

```sh
openssl ca -config operator-ca.cnf -gencrl -out fleetos-operator.crl.pem
```

`default_crl_days = 7` makes each CRL valid for 7 days. Publish or upload a new one before it runs out: once it does, the manager keeps enforcing the last one under the default `soft` policy, but MCP keys stop working.

## 1.5 Note the fingerprint

```sh
openssl x509 -in operator-ca.crt -noout -fingerprint -sha256
```

You compare this with the manager's preview in [stage 3](./register-operator-ca.md).

## Verify before continuing

- [ ] `operator-ca.crt`, `operator-ca.cnf`, `index.txt`, `serial` and `crlnumber` are in the CA folder, and `operator-ca.key` is readable only by you.
- [ ] You wrote down the SHA-256 fingerprint.
- [ ] If you'll use a CRL: `fleetos-operator.crl.pem` exists, or the CA publishes one at an http or https URL.

Next: [2. Start first run](./start-first-run.md)
