# AGENTS.md - docs

Guidance for coding agents working in this repo.

## What this is

The CryptOS documentation site: Docusaurus 3 + TypeScript, using the shared
`@the-rabbit-hole-tech/docs-theme`. Content lives in `docs/`; the sidebar order
is defined in `sidebars.ts`; the landing page is `src/pages/index.tsx`.

## Commands

- Install: `npm install`
- Run locally: `npm run start` (http://localhost:3000)
- Build: `npm run build`
- Type-check: `npm run typecheck`
- License headers (verify): `task license`

## Conventions

- Docs describe CryptOS as shipped on `main`, not design intent. Where a design
  note and the code disagree, the code wins.
- Plain reading level. Explain concepts; do not assume them.
- Every page states its status: Works today, In flight, or Roadmap.
- MDX 3: do not use explicit `{#id}` heading anchors; rely on auto slugs.
- See CLAUDE.md for the commit / PR / governance workflow.
