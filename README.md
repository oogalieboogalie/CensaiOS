# CensaiOS

I made CensaiOS because there's so many tools out there but there's not a singular place to use them all
and none of the major companies are going to make it because they want you locked into their ecosystem.

It's not just for AI users or just for Developers, its also for anyone that works on projects with teams
that wishes there was a way to do it in real time that wasn't a zoom call. It's for people that like to visually
understand things, scribble notes down, and draw literal connections between things.

<img width="932" height="464" alt="Recording 2026-09-12 234041" src="https://github.com/user-attachments/assets/46308484-0ce8-4cf6-b7ed-8c5dece53dad" />

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/oogalieboogalie/CensaiOS/actions/workflows/ci.yml/badge.svg)](https://github.com/oogalieboogalie/CensaiOS/actions/workflows/ci.yml)
[![Docker Ready](https://img.shields.io/badge/Docker-ready-blue.svg?logo=docker&logoColor=white)](https://www.docker.com)
[![GitHub stars](https://img.shields.io/github/stars/oogalieboogalie/CensaiOS?style=social)](https://github.com/oogalieboogalie/CensaiOS/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/oogalieboogalie/CensaiOS?sort=date&display_name=tag)](https://github.com/oogalieboogalie/CensaiOS/releases)
[![Last commit](https://img.shields.io/github/last-commit/oogalieboogalie/CensaiOS)](https://github.com/oogalieboogalie/CensaiOS/commits/main)
[![Contributors](https://img.shields.io/github/contributors/oogalieboogalie/CensaiOS)](https://github.com/oogalieboogalie/CensaiOS/graphs/contributors)

Here's the shape of it: CensaiOS is a multiplayer canvas. Instead of one person staring at one
chat box, a workspace holds the people, the agents, and the work itself — documents, terminals,
tasks, files — arranged in space so you can see what the hell is going on.

## The core idea

A chat box forgets. A canvas doesn't. Censai is built around the **shared workspace** as the unit
that matters:

- **People share a canvas**, not a screen recording. Presence, window positions, and durable canvas
  changes belong to the workspace.
- **Agents occupy the workspace too.** They can inspect authorized context, use equipped tools, run
  in the background, and—after the required approval—write into visible work surfaces.
- **The canvas preserves context.** Documents, terminals, tasks, files, chats, browsers, agents, and
  their relationships stay spatially arranged instead of disappearing into a transcript.
- **You own the runtime.** Run it on your workstation, home server, or private server with Docker.

## Multiplayer collaboration

The multiplayer beta covers the important slice end to end: an owner invites a workspace member,
both see live presence and window movement, durable changes are revision-checked into PostgreSQL
and broadcast to everyone, and an equipped agent can request approval, write into a canvas window,
and publish the result to both people. Reconnecting restores the authoritative revision;
non-members are denied.

One honest boundary: no character-by-character collaborative text editing yet. Text is shared on commit, so a
teammate sees the result after the editor pauses rather than on every keystroke. See
[COLLABORATION.md](COLLABORATION.md) for the exact boundary and the path to CRDT-backed live
co-editing.

> **Release status:** the multiplayer vertical slice is implemented and under review in the current
> beta line. It is not part of the latest public image until that source and its scrubbed public export
> both pass review and merge. The release receipt identifies the exact commit in every published image.

## What else is inside

### Infinite canvas

- Pan, zoom, draw, group, resize, and arrange work across a persistent spatial surface.
- Connect agents to windows and organize related work into visual stations.
- Use 50+ manifest-registered window types, including documents, code, terminals, files, tasks,
  schedules, chats, browsers, images, media, agent design, and operational tools.
- Scaffold a new window with `npm run window:new` and validate it with `npm run window:validate`.

### Persistent agents

- Create agents with their own identity, role, model route, tools, and workspace-scoped permissions.
- Store weighted memories, knowledge-graph facts, and AES-256-GCM encrypted private journals.
- Run with Ollama locally or use OpenAI-compatible, OpenRouter, Gemini, and other configured providers.
- Queue background tasks and schedules that continue after the browser closes.
- Give different agents different tools instead of exposing every capability to every model.

### Self-hosted control

- PostgreSQL is the durable authority for workspace and agent state.
- Qdrant provides optional semantic recall and degrades gracefully when unavailable.
- Risky execution capabilities can be kept behind the optional runner boundary.
- Public releases pass tests, production build, window validation, secret scanning, dependency audit,
  malicious-code tripwires, and CodeQL before an immutable image is published.

## Run it on your computer: three commands

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running, and about 8 GB of memory. Then:

```bash
git clone https://github.com/oogalieboogalie/CensaiOS.git
cd CensaiOS
docker compose up -d
```

**What you see.** The first start takes a few minutes while Docker builds the app. Then open **<http://localhost:3002>** and you get the censaiOS sign-in screen. Type your email and press **Enter Canvas**. The first person to sign in owns this copy. It answers this computer only; to open it from your other computers, turn on **Settings > Open anywhere** and sign them in with a one-time code ([details](SELF_HOSTING_GUIDE.md#who-can-reach-your-copy)).

**Where your AI keys go.** Right after you sign in, a **Connect your AI** screen asks for a key from Claude, OpenAI, Gemini, OpenRouter or another provider. Paste one and press **Save key and open canvas**. Keys are encrypted and stored in this copy's own database, never in a file. You can skip that screen and add or change keys later under **Settings > AI provider keys**. If you run [Ollama](https://ollama.com/) on the same computer, censaiOS can use it with no key at all.

**You don't edit any settings files.** The app makes its own secret passwords on first start and keeps them, sets up its whole database, and wires every part together: the app, the database (PostgreSQL), vector memory (Qdrant) and the Docker helper. Your boards, agents and keys are kept in Docker volumes, so they survive restarts and updates.

**To update**, from the same folder:

```bash
git pull
docker compose up -d --build
```

**To stop it:** `docker compose down`. Your data stays. (`docker compose down -v` deletes everything, so don't run that unless you mean it.)

**Tweaking it for your business.** Make a file called `.env` next to `docker-compose.yml` with only the lines you want to change. A few useful ones:

| Line | What it changes |
|------|-----------------|
| `CENSAI_APP_MEMORY=6g` | More memory for the app (the default is 4g; the database and vector memory get 1g each) |
| `CENSAI_DOCKER_AI_BASE_URL=...`, `CENSAI_DOCKER_AI_MODEL=...`, `CENSAI_DOCKER_AI_API_KEY=...` | The default AI the app uses when an agent has no key of its own (Ollama on this computer by default) |
| `G_CLIENT_ID=...`, `G_SECRET=...` | Turns on "Continue with Google" sign-in |

Everything else in [`.env.example`](.env.example) is optional. Before you open your copy to other people or the internet, read the [Self-Hosting Guide](SELF_HOSTING_GUIDE.md).

### Or with the one-line installer

With Docker Desktop running:

```bash
# macOS / Linux
curl -fsSL https://censai.app/install | sh
```

```powershell
# Windows (PowerShell)
irm https://censai.app/install.ps1 | iex
```

The installer downloads this repository into `~/.censai/CensaiOS`, pulls the newest public image
instead of building it, and opens <http://localhost:3002>. Re-run it to update. The script itself
lives at [`public/install.sh`](public/install.sh) if you want to read it first.

## Releases you can reproduce

Every reviewed merge to public `main` must pass the public CI and security gates. A successful merge
publishes:

- an immutable `selfhost-<date>-<commit>` GitHub release;
- a matching `ghcr.io/oogalieboogalie/censaios:<release-tag>` container;
- a release receipt tying the source commit to the image.

Use the immutable tag for a repeatable installation. `latest` is only a convenience pointer.

## Documentation

- [Collaboration model and live-text roadmap](COLLABORATION.md)
- [Self-hosting guide](SELF_HOSTING_GUIDE.md)
- [Architecture](ARCHITECTURE.md)
- [Window integration specification](docs/WINDOW_INTEGRATION_SPEC.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Project status

CensaiOS is an active, founder-led beta. The canvas, agents, memory, tools, self-hosting, and
release pipeline are real and used daily; the multiplayer slice works in the beta line;
character-level co-editing and multi-node fan-out are still engineering work. This README
deliberately claims less than the ambition.

## License

[Apache License 2.0](LICENSE). You may run, modify, and self-host Censai,
including for business use.
