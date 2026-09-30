# docs 📚

> 📖 The documentation site for [CryptOS-PKI](https://github.com/CryptOS-PKI): how to build, install, and run CryptOS, written to be readable by everyone. Built with [Docusaurus](https://docusaurus.io) 3 and a CryptOS theme that matches the Fleet Manager web UI.

## ✨ What it is

The single place the whole project is documented — deployment and install through day-to-day use, with concepts explained in plain language rather than assumed. Every page is tagged with its status so a reader always knows whether a feature exists yet:

- ✅ **Works today**
- 🚧 **In flight**
- 🧭 **Roadmap**

CryptOS ships no docs inside the OS image; this is a standalone site the project publishes to the web.

## 🧱 Stack

- 📘 **[Docusaurus](https://docusaurus.io) 3 + TypeScript**
- 🎨 **CryptOS theme** in `src/css/theme.css`, ported from the Fleet Manager web UI
- 🌒 **Dark mode by default** (the navbar switch turns on light mode)
- 📝 **Content in Markdown / MDX** under `docs/`; sidebar order lives in `sidebars.ts`

## 🚀 Run it locally

```bash
npm install
npm run start
```

Then open http://localhost:3000.

## 🛠️ Local development

[`go-task`](https://taskfile.dev) wraps the common workflows:

```bash
task start       # run the site locally with hot reload
task build       # build the static site into build/
task license     # re-inject Apache 2.0 headers via golic
task ci          # build the site
```

## 🎨 Theme

The site carries its own theme, taken from the Fleet Manager web UI ([`web`](https://github.com/CryptOS-PKI/web), `src/index.css`) so the docs and the product look the same:

- 🎨 **Palette:** the web UI's Shield Blue on a graphite ramp, as `--cryptos-*` custom properties mapped onto Docusaurus's Infima variables in `src/css/theme.css`. Change a colour in the web UI first, then mirror it here.
- 🔤 **Type:** Inter for text and JetBrains Mono for code, the navbar, tabs and the sidebar, both self-hosted through `@fontsource` (no font CDN).
- ♿ **Contrast:** body text, links, callouts, tabs, tables, code tokens and the sidebar meet WCAG AA in both modes, and every caret and chevron (sidebar, hide-sidebar button, breadcrumbs, TOC, details, navbar) takes a palette colour at 3:1 or better. Check any new colour against its real background before adding it.
- ©️ **Footer:** the copyright line follows the CNCF convention, "Copyright © The CryptOS Authors" (no year, per the CNCF copyright-notices guidance), with the docs licence (Apache 2.0) under it.
- 🧩 **No swizzled components:** everything is CSS on top of the classic theme. The landing page is `src/pages/index.tsx`.

Page-level tweaks go in `src/css/custom.css`, using the tokens from `theme.css`.

## 🚦 Status

**Pre-alpha.** The full information architecture is in place. The Introduction, Install & Deploy, and `cryptosctl` reference pages are written; the other pages are still stubs being filled in. It stays on `0.x.y` until the whole system lands.

The build phases (project-wide):

1. 🪨 Phase 1 — Core OS + single-node Root CA MVP (documented now).
2. 🔌 Phase 2 — Role-aware API + protocol adapters + Fleet Manager (roadmap pages today).
3. 🛡️ Phase 3 — Pool, HA, extensions, isolation, recovery (roadmap pages today).

## 🧭 Companion repos

- 🧠 [`cryptos`](https://github.com/CryptOS-PKI/cryptos) — the OS / CA engine (UKI; bare metal or VM).
- 🛰️ [`manager`](https://github.com/CryptOS-PKI/manager) — Fleet Manager backend.
- 🎨 [`web`](https://github.com/CryptOS-PKI/web) — Fleet Manager web frontend.
- 📡 [`api`](https://github.com/CryptOS-PKI/api) — shared `.proto` definitions and generated stubs.
- ⚓ [`helm`](https://github.com/CryptOS-PKI/helm) — Helm charts for the control plane.

## 📄 License

[Apache License 2.0](LICENSE). Copyright The CryptOS Authors.
