# docs 📚

> 📖 The documentation site for [CryptOS-PKI](https://github.com/CryptOS-PKI): how to build, install, and run CryptOS, written to be readable by everyone. Built with [Docusaurus](https://docusaurus.io) 3 and the shared [rabbit-hole docs theme](https://github.com/the-rabbit-hole-tech/docs-theme).

## ✨ What it is

The single place the whole project is documented — deployment and install through day-to-day use, with concepts explained in plain language rather than assumed. Every page is tagged with its status so a reader always knows whether a feature exists yet:

- ✅ **Works today**
- 🚧 **In flight**
- 🧭 **Roadmap**

CryptOS ships no docs inside the OS image; this is a standalone site the project publishes to the web.

## 🧱 Stack

- 📘 **[Docusaurus](https://docusaurus.io) 3 + TypeScript**
- 🐇 **[`@the-rabbit-hole-tech/docs-theme`](https://github.com/the-rabbit-hole-tech/docs-theme)** — the shared brand theme
- 🌒 **Dark mode only** (set by the theme; no light/dark switch)
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

The look and feel come from [`@the-rabbit-hole-tech/docs-theme`](https://github.com/the-rabbit-hole-tech/docs-theme), published to GitHub Packages. Consuming it from the registry needs a token with the `read:packages` scope (the scope mapping in `.npmrc` is committed; the token is not):

```ini
@the-rabbit-hole-tech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

> The theme is currently vendored as a local tarball so the site builds without a token. It switches to the registry (`^0.1.1`) once that theme release ships.

## 🚦 Status

**Pre-alpha.** The site is a structural skeleton — the full information architecture with stub pages; the prose is being written. It stays on `0.x.y` until the whole system lands.

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

[Apache License 2.0](LICENSE). Copyright 2026 Shane.
