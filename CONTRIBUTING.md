# Contributing

Karya is an Apache-2.0 project. Contributions are welcome once the repository has a public remote.

## Setup

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

Use Node.js 22 or newer. The test suite does not need `KARYA_API_KEY`.

## Pull requests

- Keep the agent runtime independent of any editor UI.
- Add or update a test for behavior changes.
- Do not commit API keys, `.karya/config.json`, or session logs.
- Prefer a small, reviewable change over a new subsystem.
- New tools need a typed schema, an approval decision, and a workspace-boundary check.

## Decisions

Lasting choices go in `docs/adr/`. The roadmap lives in `ROADMAP.md`.

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
