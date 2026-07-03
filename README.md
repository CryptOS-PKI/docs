# CryptOS docs

The documentation site for [CryptOS](https://github.com/CryptOS-PKI) -- an
immutable, API-driven certificate authority operating system. Built with
Docusaurus 3 and the shared rabbit-hole docs theme.

> Pre-alpha. The site stays on `0.x.y` until the whole system lands.

## Run it locally

```bash
npm install
npm run start
```

Then open http://localhost:3000.

## Theme

The look and feel come from
[`@the-rabbit-hole-tech/docs-theme`](https://github.com/the-rabbit-hole-tech/docs-theme),
published to GitHub Packages. Installing from the registry needs a token with
the `read:packages` scope (the scope mapping in `.npmrc` is committed; the token
is not):

```ini
@the-rabbit-hole-tech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## Structure

- `docs/` -- the documentation pages (sidebar order lives in `sidebars.ts`).
- `src/pages/index.tsx` -- the landing page.
- `docusaurus.config.ts` -- site config and theme wiring.

## Status labels

Every page carries a badge -- **Works today**, **In flight**, or **Roadmap** --
so readers always know whether a feature exists yet.
