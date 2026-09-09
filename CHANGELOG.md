# Changelog

> **Note**: This is a secondary changelog for the OSS export. The canonical record of all changes is maintained in the root [CHANGELOG.md](../../../CHANGELOG.md).

## 0.2.0 — 2026-06-10

First release as **Censai** (supersedes the openhub-oss 0.1.x line).

- Complete AI-first modular refactor: monolith server and window components split into small, single-purpose modules with a size budget enforced in CI.
- Manifest-driven window system: 38 window types declared in one manifest; registry, component wiring, and launcher tiles all derive from it (`npm run window:validate`).
- Window SDK: scaffold new window types with `npm run window:new`.
- Memory subsystem: weighted memories, AES-256-GCM encrypted per-agent journals, knowledge graph, memory-healing cascade, semantic recall via Qdrant with graceful degradation.
- Background workers: agent task queue and cron scheduler.
- Runtime modes: `local_desktop`, `private_server`, `cloud_saas` — filesystem and terminal access are gated off outside local mode.
- Licensing: Apache License 2.0.
