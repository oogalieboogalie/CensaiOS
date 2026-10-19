# Contributing to Censai

Thanks for your interest! Censai is young and moving fast, so small, focused PRs have the best chance of landing.

## Dev setup

1. Start the backing services (PostgreSQL + Qdrant): `docker compose up -d` (or run them yourself — see `.env.example` for connection settings).
2. `npm install`
3. `npm run dev` — Express API on port 3001, Vite client on port 5173.

## How changes get here

censaiOS is developed in a private repository. Its release automation writes the two branches here:
`nightly` every night, and `main` every Sunday, when the newest nightly build that passed every
check becomes the next stable release ([CHANGELOG.md](CHANGELOG.md)). Nobody commits to them by
hand, and the next release would replace anything that did.

Pull requests are still welcome, against `main`. A change we take is carried into the development
repository and comes back here with the next nightly build; the pull request is then closed with a
link to that build.

## Before you open a PR

Run the full check suite:

```bash
npm run check      # lint + tests + build
npm run window:validate
npm run security   # malicious-code tripwires (also runs in CI)
```

Tests use experimental VM modules — always use the npm scripts, never `jest` directly.

## Security

Because Censai runs AI agents with real tools, every PR goes through a security gate (tripwires,
secret scanning, dependency audit, CodeQL) on top of normal CI. Please read
[SECURITY.md](SECURITY.md) before contributing — it explains what's checked and how to report a
vulnerability privately (never in a public issue).

## Adding a window type

Window types are declared in **one place**: the window manifest. Use `npm run window:new` to scaffold correctly — hand-wiring the registry or launcher will fail validation.

## License

By contributing, you agree that your contributions are licensed under the repository's [Apache License 2.0](LICENSE).
