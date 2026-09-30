---
title: "⚖️ License"
---

# ⚖️ License

CryptOS is open source under the **Apache License, Version 2.0**. You can use it, change it and redistribute it, including commercially, as long as you keep the license and notices with it.

## Which repos carry which license

| Repo | License | Files |
|---|---|---|
| [cryptos](https://github.com/CryptOS-PKI/cryptos) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/cryptos/blob/main/LICENSE), [`NOTICE`](https://github.com/CryptOS-PKI/cryptos/blob/main/NOTICE) |
| [api](https://github.com/CryptOS-PKI/api) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/api/blob/main/LICENSE), [`NOTICE`](https://github.com/CryptOS-PKI/api/blob/main/NOTICE) |
| [manager](https://github.com/CryptOS-PKI/manager) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/manager/blob/main/LICENSE), [`NOTICE`](https://github.com/CryptOS-PKI/manager/blob/main/NOTICE) |
| [web](https://github.com/CryptOS-PKI/web) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/web/blob/main/LICENSE), [`NOTICE`](https://github.com/CryptOS-PKI/web/blob/main/NOTICE) |
| [helm](https://github.com/CryptOS-PKI/helm) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/helm/blob/main/LICENSE), [`NOTICE`](https://github.com/CryptOS-PKI/helm/blob/main/NOTICE) |
| [docs](https://github.com/CryptOS-PKI/docs) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/docs/blob/main/LICENSE), [`NOTICE`](https://github.com/CryptOS-PKI/docs/blob/main/NOTICE) |
| [lab](https://github.com/CryptOS-PKI/lab) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/lab/blob/main/LICENSE), [`NOTICE`](https://github.com/CryptOS-PKI/lab/blob/main/NOTICE) |
| [.github](https://github.com/CryptOS-PKI/.github) | Apache License 2.0 | [`LICENSE`](https://github.com/CryptOS-PKI/.github/blob/main/LICENSE) |

Every repo's `LICENSE` file is the Apache License 2.0 text exactly as published at [apache.org/licenses/LICENSE-2.0.txt](https://www.apache.org/licenses/LICENSE-2.0.txt), with nothing reworded or filled in, so GitHub and other license scanners detect it as `Apache-2.0`. The copyright line lives in `NOTICE`, not in `LICENSE`.

## Copyright

Copyright 2026 Shane.

Each code repo has a `NOTICE` file in this form, with its own repo name on the first line:

```text
CryptOS-PKI / cryptos
Copyright 2026 Shane

This product includes software developed as part of the CryptOS-PKI project
(https://github.com/CryptOS-PKI).
```

Section 4 of the license asks you to keep this notice when you redistribute the work or something built from it.

## License headers in source files

Source files carry a short Apache 2.0 header. In Go files it is a block comment after the `package` line; in YAML it is a `#` comment block:

```text
Apache License 2.0

Copyright 2026 Shane

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

The headers are managed with [golic](https://github.com/Bugs5382/golic). Each repo's `.golic.yaml` and `.licignore` say which files get one, and `task license` puts them back. If you contribute, run `task license` before you push; each repo's CI checks the headers on pull requests.

## Third-party code

CryptOS uses open source libraries, and each keeps its own license. On each pull request, CI checks the third-party Go modules and production npm packages against an allowlist, and fails if one carries any other license:

| Repo | Checked | Allowed licenses |
|---|---|---|
| cryptos | Go modules | MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, MPL-2.0, CC-BY-4.0 |
| api | Go modules | MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, MPL-2.0, CC-BY-4.0 |
| manager | Go modules | MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, MPL-2.0, CC-BY-4.0 |
| web | npm packages | MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0, Python-2.0, MPL-2.0, CC-BY-4.0, OFL-1.1 |
| docs | npm packages | MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0, Python-2.0, MPL-2.0, CC-BY-4.0 |

`web` also allows OFL-1.1, the license of the Inter and JetBrains Mono fonts it bundles instead of loading them from a CDN. The `helm` chart has no third-party dependencies to check.

:::info[The OS image contains more than CryptOS code]
A CryptOS image built from `cryptos` also contains third-party components built from their own sources, most notably the Linux kernel, and the disk tools that `build/` packages (cryptsetup, dosfstools, e2fsprogs and gptfdisk). Those keep their own licenses, not Apache 2.0. The allowlist check above covers Go and npm dependencies only.
:::

## Read the license

The full text is in each repo's `LICENSE` file, and at [apache.org/licenses/LICENSE-2.0](https://www.apache.org/licenses/LICENSE-2.0).
