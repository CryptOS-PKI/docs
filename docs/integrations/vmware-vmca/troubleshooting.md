# 11. Troubleshooting and gotchas

:::info[Before you start]
Nothing. This page is a reference for every stage; go to the section that matches what you see.
:::

## 11.1 DRS moved the VCSA

The VCSA's host is whatever DRS last chose, not where it was deployed. Before the snapshot, and again before any revert, check `govc vm.info /DC-01/vm/vcenter | grep Host` (or the VM's **Summary**). Setting DRS to partially automated in [5.3](./cluster-prep.md#53-drs-fullyautomated-to-partiallyautomated) keeps it where it is for the window.

## 11.2 A vLCM depot sync task fails during the window

You may see a failed task **Sync depots** (`SyncDepotsTask`) with *Merged depot content is invalid* around the time services restart. Check the task history for the days before the change. In the tested run the same error appeared daily at the same time for more than a week before the change, so it was unrelated. Fix it separately (usually a stale or unreachable online depot URL in Lifecycle Manager settings).

Similarly, the appliance management API's database health endpoint may return an error about `dbcc` not being found. That is an API-side issue in the appliance management service, not a failed vCenter service; `service-control --status --all` is the authority.

## 11.3 ESXi certificates carry VMware's default subject

The renewed host certificates chain correctly, but their subject still reads `O=VMware, OU=VMware Engineering, L=Palo Alto, ST=California`. Those fields come from the `vpxd.certmgmt.certs.cn.*` advanced settings, not from the certool values in [6.2](./import.md#62-prompt-and-answer-transcript). To use your own, set them and renew each host again:

```sh
govc option.set vpxd.certmgmt.certs.cn.country US
govc option.set vpxd.certmgmt.certs.cn.organizationName 'Example Organization'
govc option.set vpxd.certmgmt.certs.cn.organizationalUnitName 'IT Infrastructure'
govc option.set vpxd.certmgmt.certs.cn.state 'Example State'
govc option.set vpxd.certmgmt.certs.cn.localityName 'Example City'
govc option.set vpxd.certmgmt.certs.cn.email ca-admin@example.org
govc option.ls vpxd.certmgmt.certs.cn
```

vSphere UI: `vcenter.example.org` > **Configure** > **Settings** > **Advanced Settings** > **Edit Settings**, filter on `certmgmt.certs.cn`.

Then **Renew** each host ([7.1](./esxi-hosts.md#71-vsphere-ui-per-host) step 4, or the second call in [7.2](./esxi-hosts.md#72-api-equivalents)). A refresh of CA certificates is not needed for this.

## 11.4 Re-pinning thumbprints

Every certificate vCenter serves changed. Anything that stored the old machine SSL fingerprint fails with a thumbprint or verification error until updated. vCenter itself updates the ESXi host thumbprints it stores when it renews host certificates, so hosts do not need to be removed and re-added. External tools do need attention: see [9.4](./verify.md#94-clients-and-automation).

## 11.5 Common import failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Certificate uses an unsupported signature algorithm - ecdsa-with-SHA256` (or a SHA-384 ECDSA name), then automatic rollback | A CA in the chain has an ECDSA key | The whole hierarchy must be RSA ([prerequisite 1](./index.md#prerequisites)) |
| Automatic rollback with a chain or validation error | Chain file in the wrong order, missing the Root, or containing only the VMCA certificate | Rebuild `vmca-fullchain.pem` as VMCA, Intermediate, Root ([4.3](./sign-and-chain.md#43-build-the-full-chain-in-the-right-order)) |
| Automatic rollback with a key error | The certificate does not match the key, or the key is encrypted | Re-run the modulus check ([4.4](./sign-and-chain.md#44-verify-with-openssl)); regenerate without a passphrase |
| A prompt repeats after you answer it | The value failed validation (for example a hostname that is not an FQDN) | Enter a valid value; press Ctrl-D to leave without changes if unsure |
| Browsers show a name mismatch although the chain verifies | `Hostname` in [6.2](./import.md#62-prompt-and-answer-transcript) was not the PNID | Regenerate the machine SSL certificate with the right name (option 3, *Replace Machine SSL certificate with VMCA Certificate*) |
| Clients that hold only the Root fail, others work | The server sends only the leaf | Check [9.1](./verify.md#91-vcenter-port-443-with-hostname-verification) counts three certificates. If not, republish the full chain into `MACHINE_SSL_CERT` and restart `vmware-envoy` |

## 11.6 CryptOS-side issues

| Symptom | Cause | Fix |
| --- | --- | --- |
| `x509: certificate signed by unknown authority` from `cryptosctl` | Stale `node-trust.pem` after a node reboot | Re-fetch it ([2.4](./profile.md#24-apply-and-verify)) |
| `FailedPrecondition` mentioning the revocation preflight | The node cannot resolve or reach its own `revocation_base_url` | Set `network.nameservers`, reboot the node, confirm `Revocation: OK` |
| VMCA certificate has no CDP or AIA | It was signed before `revocation_base_url` was set | Sign the same CSR again after setting it, rebuild the chain, import again |
| The Intermediate in the chain has no CDP or AIA | The Intermediate enrolled before the Root had `revocation_base_url` | Re-certify the Intermediate (same key), rebuild `vmca-fullchain.pem` with the new Intermediate copy. The VMCA certificate still verifies, because the key and SKI are unchanged. |
| VMCA certificate outlives the Intermediate | `validity_days` too large; CryptOS does not cap it | Lower `validity_days`, sign again |
