# Self-hosting Censai

Censai's public edition runs on your hardware. The project publishes source, a validated container
image, Postgres, and Qdrant configuration; it does not require a Censai-operated cloud account.
You supply the machine and, if desired, your own model-provider keys.

## Requirements

- Docker Desktop or Docker Engine with Compose
- Git for source-based installs
- Optional: Ollama on the host for local models

## Install

```bash
git clone https://github.com/oogalieboogalie/CensaiOS.git
cd CensaiOS
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

Open <http://localhost:3002>. The GHCR override pulls the latest container that passed public CI.
For a reproducible deployment, replace `latest` in `docker-compose.ghcr.yml` with the immutable
image tag attached to a GitHub release.

To build the checked-out source instead:

```bash
docker compose up -d --build
```

## Who can reach your copy

censaiOS answers only the computer it runs on. `docker-compose.yml` publishes the app as
`127.0.0.1:3002`, the database as `127.0.0.1:5433` and vector memory as `127.0.0.1:6335` and
`127.0.0.1:6336`, so nothing on your Wi-Fi can reach them. Email sign-in has no password, so this
is what keeps someone in the next room from signing in as you.

Your other computers come in on port `3004`, through **Open anywhere**: on the main computer open
**Settings > Open anywhere**, turn on **Let my other computers open censaiOS**, press **Add a
computer**, and open the link or type the code on the other computer (for example
`http://r2d2:3004`). Until the switch is on, port 3004 shows only a "not open yet" page, and even
with it on, another computer can sign in only with a one-time code, never by typing an email.

**Installed with an older `docker-compose.yml`?** If you cloned the repo, `git pull` and
`docker compose up -d` pick up the change. If you copied the file by hand, change this one line
under `homebase:` > `ports:`, then run `docker compose up -d`:

```yaml
      - "127.0.0.1:3002:3001"   # was "3002:3001", which let anyone on your Wi-Fi sign in
```

To use Open anywhere as well, add `- "3004:3004"` on the next line. Putting `127.0.0.1:` in
front of the `5433:5432`, `6335:6333` and `6336:6334` lines keeps the database off the network too.

## Models

For local inference, install Ollama on the Docker host and pull a tool-calling model plus the
embedding model:

```bash
ollama pull qwen3-coder:latest
ollama pull nomic-embed-text
```

Set `AI_MODEL=qwen3-coder:latest` in `.env`. Docker reaches the host through
`host.docker.internal`. You can instead place provider keys in `.env`; those requests and costs
belong to your provider account.

## Shared or internet-facing installs

The default Compose file is intended for a trusted local machine. Before allowing other people or
the public internet to connect:

1. Set independent random values of at least 32 characters for `SESSION_SECRET`,
   `JOURNAL_SECRET`, `CENSAI_VAULT_SECRET`, and `RUNNER_SECRET`.
2. Set `CENSAI_MODE=private_server` and set `APP_ORIGIN` and `GOOGLE_REDIRECT_URI` to the actual
   HTTPS origin.
3. Put the app behind a TLS reverse proxy and do not expose Postgres, Qdrant, or the runner ports
   to the public internet. (For your own home network, use Open anywhere instead; see above.)
4. Leave the runner profile disabled unless you explicitly need agent code execution and have
   reviewed its Docker-socket access.

### Multiplayer beta status

The current beta line adds workspace invitations, authenticated presence, live window movement, and
durable human/agent canvas commits. It is not included in a public image until the beta source and
its scrubbed export both pass review and merge. Check the release notes and immutable image tag
instead of assuming `latest` contains an unreleased beta capability.

The collaboration hub currently lives in one application process. Keep a shared beta deployment on
one app replica; horizontal replicas require a shared pub/sub backplane for presence and WebSocket
events. Character-level text co-editing is also not implemented yet. See
[COLLABORATION.md](COLLABORATION.md) for the current synchronization contract and roadmap.

## Bring your own agent personas

The built-in family agents ship with short default prompts. You are not stuck with them. Copy
`config/family-agents.example.json` to `config/family-agents.json`, rewrite any prompt, restart —
or point `CENSAI_FAMILY_AGENTS_FILE` at a JSON file anywhere (handy for mounting your own file
into the container). Keys must match built-in agent ids; unknown ids and empty prompts are
ignored, and per-agent customs set in the UI still win.

## Update
```bash
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

The named Docker volumes hold Postgres, Qdrant, and application state across container updates.
Back up those volumes before database or major-version changes.

## Release receipts

Every validated merge to public `main` creates:

- an immutable `selfhost-<date>-<commit>` GitHub release;
- matching `ghcr.io/oogalieboogalie/CensaiOS` release and commit tags;
- a `censai-self-host-release.txt` asset tying the source commit to the image name.

Use the immutable tag when you need repeatable deployments. `latest` is only a convenience pointer.
