---
title: "🛡️ Secure Boot enrollment"
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import Pre10Notice from '@site/docs/_partials/pre-1-0-notice.mdx';

# 🛡️ Secure Boot enrollment

:::tip[✅ Works today]
This describes CryptOS as it works right now.
:::

CryptOS ships **no signing key** and asks you to trust none. You make your own Secure Boot key, build the image with it, and enroll its certificate in the firmware of the machines you run. The same certificate is stamped into the image as its **upgrade anchor**, so the key that makes an image bootable is also the only key that can replace it later.

This page is the short version. The full guide, with every verification command, is [Secure Boot: build and sign with your own key](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/secure-boot.md) in the `cryptos` repository.

## What the key does

The build uses one key and certificate (`SB_KEY` and `SB_CERT`) for three jobs:

| Job | Checked by |
|---|---|
| The Secure Boot signature on the UKI | the machine's firmware, against its `db` list, at every boot |
| The detached signature file `cryptos-amd64.uki.sig` | the running node, when you stage an upgrade |
| The upgrade anchor built into the image | the node, when it checks the next image's signature |

The anchor is compiled into the image. It is never read from config or disk, so nobody can swap it on a running node.

## 1. Make the key

Do this on the machine that will keep the key, ideally an offline or dedicated build host. Either tool makes the same three files: `sb.key` (the private key), `sb.crt` (the certificate, PEM) and `sb.der` (the certificate, DER, for firmware).

:::danger[This key controls every upgrade]
`sb.key` is the only key that can sign an image your nodes will accept. Losing it means reinstalling, which destroys the CA key, and anyone who gets it can install an image of their choosing on a node they administer. Keep it as described in [Look after the key](#look-after-the-key).
:::

With openssl (3.0 or later):

<Tabs groupId="os" queryString>
<TabItem value="unix" label="Linux / macOS" default>

```bash
umask 077
mkdir -p ~/cryptos-sb && cd ~/cryptos-sb

openssl req -new -x509 -newkey rsa:2048 -sha256 -noenc -days 3650 \
  -subj "/O=Example Org/CN=Example Org Secure Boot Signing 2026" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,digitalSignature,keyCertSign" \
  -addext "extendedKeyUsage=codeSigning" \
  -keyout sb.key -out sb.crt

openssl x509 -in sb.crt -outform DER -out sb.der
```

</TabItem>
<TabItem value="windows" label="Windows (PowerShell)">

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\cryptos-sb" | Out-Null
Set-Location "$HOME\cryptos-sb"

openssl req -new -x509 -newkey rsa:2048 -sha256 -noenc -days 3650 `
  -subj "/O=Example Org/CN=Example Org Secure Boot Signing 2026" `
  -addext "basicConstraints=critical,CA:TRUE" `
  -addext "keyUsage=critical,digitalSignature,keyCertSign" `
  -addext "extendedKeyUsage=codeSigning" `
  -keyout sb.key -out sb.crt

openssl x509 -in sb.crt -outform DER -out sb.der
```

</TabItem>
</Tabs>

Or with `cryptos-sbkey`, which `task build` puts in `bin/`:

```bash
bin/cryptos-sbkey --out-dir ~/cryptos-sb --cn "Example Org Secure Boot Signing 2026"
```

Its flags are `--out-dir`, `--cn`, `--days` (0, the default, means about 10 years), `--bits` (`2048` or `4096`) and `--force` to overwrite existing files.

- 🔑 **Use RSA.** The node only accepts an RSA anchor. RSA-2048 works on every UEFI firmware; RSA-4096 only on firmware that accepts it in `db`, so test a boot first.
- ⏳ **Give it a long life.** Ten years is a good value. Changing the key later is the expensive part, not expiry.

## 2. Decide: Secure Boot on or off

| | Secure Boot **on**, your certificate in `db` | Secure Boot **off** |
|---|---|---|
| Firmware refuses a tampered or foreign image at boot | yes | no |
| Upgrades must be signed by your key | yes | yes, through the anchor |
| Setup per machine | enroll `sb.der` | none |

:::danger[Decide before you install]
On a TPM-backed node the disk key is sealed to TPM PCR 7, which measures the Secure Boot state and the `db` contents, and to PCR 11, which measures the image. Turning Secure Boot on or off, or changing `db`, after the install means the node can no longer unlock its own disk. A `nodeid` node does not use the TPM and is not affected.
:::

## 3. Enroll the certificate

Skip this if Secure Boot stays off. You only need to **add your certificate to `db`**; the existing platform keys and vendor entries can stay.

### VMware vSphere and ESXi

You add your certificate from the VM's own firmware setup, reading it from a virtual CD. These steps were checked on ESXi 8.0.3.

#### Build the certificate CD

The firmware's file browser reads only FAT file systems, and on a CD it finds one only as an El Torito boot image. So you put `sb.der` in a small FAT image and make that image the CD's El Torito image. No extra virtual disk is needed.

:::caution[A plain ISO does not work]
A plain ISO 9660 CD holding `sb.der` shows `No File System Found` in the firmware. Build the CD as below.
:::

Install the tools:

<Tabs groupId="unix-os" queryString>
<TabItem value="linux" label="Linux" default>

```bash
sudo apt install mtools xorriso      # Debian or Ubuntu
sudo dnf install mtools xorriso      # Fedora
```

</TabItem>
<TabItem value="macos" label="macOS">

```bash
brew install mtools xorriso
```

</TabItem>
</Tabs>

Then, in the directory that holds `sb.der`, build `sb-enrol.iso`. The commands are the same on Linux and macOS:

```bash
mkdir sb-enrol
mformat -i sb-enrol/sb-enrol.img -C -f 1440 -v SBCERT ::
mcopy -i sb-enrol/sb-enrol.img sb.der ::/cryptos-sb.der
xorriso -as mkisofs -o sb-enrol.iso -V SBCERT \
  -e sb-enrol.img -no-emul-boot sb-enrol
```

:::info[On Windows]
mtools and xorriso are not native Windows tools. Run the commands above in WSL, or on the Linux host that builds the image.
:::

:::caution[The file name must end in a lowercase .der]
The firmware refuses a name stored only as an upper-case 8.3 name, such as `SB.DER`, with `Unsupported file type`. A name longer than eight characters, such as `cryptos-sb.der`, keeps its lowercase long name on the FAT image.
:::

Check the image before you upload it:

```bash
mdir -i sb-enrol/sb-enrol.img ::/
xorriso -indev sb-enrol.iso -report_el_torito plain
```

:::tip[What to expect]
`mdir` lists `cryptos-sb.der` in lowercase at the end of its line, and the xorriso report has an `El Torito img path` line naming `/sb-enrol.img`.
:::

#### Enroll the certificate

1. Upload `sb-enrol.iso` to a datastore the host can read.
2. Power the VM off. Under **VM Options > Advanced > Configuration Parameters**, add `uefi.allowAuthBypass` = `TRUE`, so the firmware setup accepts a `db` entry that is not signed by a KEK.
3. Under **VM Options > Boot Options**, check the firmware is **EFI** and turn **Secure Boot** on.
4. Attach `sb-enrol.iso` to the VM's CD/DVD drive with **Connect At Power On** ticked.
5. Under **VM Options > Boot Options**, tick **Force EFI setup** and power the VM on. It stops in the **Boot Manager**.
6. Choose **Enter setup**, then **Secure Boot Configuration > Custom Secure Boot Options > DB Options > Enroll DB > Enroll DB Using File**.
7. In the **File Explorer**, pick the volume labelled `SBCERT` (its path ends in `CDROM(...)`), then `cryptos-sb.der`.
8. Choose **Commit Changes and Exit**.
9. To check, open **DB Options > Delete DB**: your certificate's name is listed next to the Microsoft and VMware entries. Leave with **Esc** without ticking anything, then choose **Shut down the system** in the Boot Manager.

With govc, steps 2 to 5 are:

```bash
govc vm.change -vm cryptos-node -e uefi.allowAuthBypass=TRUE
govc device.boot -vm cryptos-node -firmware efi -secure=true
govc device.cdrom.insert -vm cryptos-node -ds datastore1 ISO/sb-enrol.iso
govc device.boot -vm cryptos-node -setup
govc vm.power -on cryptos-node
```

:::warning[Remove the bypass straight away]
While `uefi.allowAuthBypass` is set, anyone with the VM's console can change `db` from firmware setup without a KEK signature. Remove it as soon as the certificate is enrolled.
:::

10. With the VM off, remove `uefi.allowAuthBypass` (with govc: `govc vm.change -vm cryptos-node -e uefi.allowAuthBypass=`), detach `sb-enrol.iso`, and check that **Secure Boot** is still on.

Do this before the VM first boots the CryptOS ISO.

### Bare metal

- **Firmware setup:** copy `sb.der` to a FAT32 USB stick, put Secure Boot in Setup or Custom mode, choose the option to add or append a key to `db`, then set Secure Boot back to User mode.
- **`sbctl` from a Linux live USB**, with the firmware in Setup Mode: `sbctl import-keys --db-cert ./sb.der`, then `sbctl enroll-keys --append`. `--append` keeps the existing keys.

## 4. Build with the key

```bash
export SB_KEY="$HOME/cryptos-sb/sb.key"
export SB_CERT="$HOME/cryptos-sb/sb.crt"
task iso PLATFORM=vmware
```

Keep both variables set for the whole run, as described in [Build a bootable image](./build-bootable-image.md). The build checks its own signatures before it finishes. To check the result yourself:

```bash
sbverify --cert "$SB_CERT" build/out/cryptos-amd64.uki
```

## 5. Upgrade with the same key

<Pre10Notice />

A node accepts a new image only if the image's `.sig` verifies against the anchor in the image it is **running**. Build every later version with the same key, then stage it:

```bash
cryptosctl --endpoint 192.0.2.10:443 --trust node-trust.pem image stage --image build/out/cryptos-amd64.uki
```

An image signed by any other key is refused before anything is written. The [in-place upgrade guide](https://github.com/CryptOS-PKI/cryptos/blob/main/docs/image-upgrade.md) covers staging, activating and rolling back.

`cryptosctl` runs on Linux and macOS.

## Look after the key

- 💥 **Losing it means reinstalling.** Nothing on a node can replace its anchor. Without the key you cannot sign an image the node will accept, and a reinstall reformats the disk and destroys the CA key.
- 🚨 **A leaked key is serious.** Anyone with admin access to a node could install an image of their choosing, and with Secure Boot on it would boot on any machine that trusts your certificate. Treat it like a CA key.
- 🗄️ **Keep it offline** when you are not building: an encrypted backup in at least two places, never committed, and never stored in CI secrets for a public repository.
