# censaiOS architecture

censaiOS is one shared board (an infinite canvas) where people and AI agents work in the same
windows. This page is the map: what the parts are, how they talk, and where to look first. The
code is the source of truth, so counts here are rounded on purpose and every claim names the file
that backs it.

## The parts

| Part | What it is | Where |
|------|------------|-------|
| Browser app | Vite + React. One canvas, no pages and no URL routing | `src/` |
| App server | Node + Express. Chat, tools, agents, files, sockets | `server.js`, `server/boot/`, `server/routes/` |
| PostgreSQL | The durable home of everything: boards, agents, memory, keys, runs | `docker/*.sql` |
| Qdrant | Optional search by meaning. Without it, recall falls back to matching words | `server/qdrant.js` |
| Runner | The only container allowed to use Docker on the computer | `server/runner/` |
| AI providers | Whichever ones the owner has keys for, or Ollama with no key | `server/aiGateway/` |
| Shared code | Small pieces both the browser and the server import | `shared/` |

`docker compose up -d` starts four containers: `postgres`, `qdrant`, the app (`homebase`) and
`runner`. The live-board server runs inside the app. [docs/server-folders.md](docs/server-folders.md)
has one line for every folder under `server/`.

## The board

A board's windows, groups, ink, links and dock live in **one shared Yjs document per workspace**
(`shared/collab/ySchema.js`). That document is the board: every browser holds a live copy, and
edits merge instead of overwriting each other.

- **In the browser**, `src/lib/collaboration/yCanvasSync.js` maps the document to and from the
  canvas state in the Zustand store (`src/lib/store.js`). `src/app/AppContent.jsx` is the root
  component, with its hooks under `src/app/hooks/`.
- **On the server**, Hocuspocus serves the document at `/hocuspocus` (`server/collab/hocuspocus.js`).
  Every change is appended to a log in PostgreSQL (`workspace_yjs_updates`) and folded into a base
  copy now and then (`workspace_yjs_docs`), so a restart loses nothing
  (`server/collab/yPersistence.js`, `yUpdateLog.js`).
- **Settings beside the board** (everything in a workspace's state that is not in the shared
  document) are saved under the key `homebase.workspace.v1`
  (`src/app/hooks/useWorkspacePersistence.js`, `server/state/clientStateStore.js`). Work the server
  does not have yet is kept as a draft in the browser. Do not rename that key without a migration.
- **A board that predates the shared document** is moved into it the first time it is opened.

`COLLABORATION.md`, at the top of the open source copy, has the rest: who may connect, presence,
guests on share links, how agents write to the board, and board history.

## Windows

Everything on the board is a window: chat, documents, sheets, a browser, a terminal and over a
hundred more. `npm run window:list` prints them all.

- **One entry declares a window.** The entry goes in a category file under `src/lib/manifest/`
  (new windows in `factoryWindows.js`); `src/lib/windowManifest.js` gathers the categories.
- **Everything else is derived.** The registry (`src/lib/windowRegistry.js`) is worked out from the
  manifest, and the React component in `src/components/` is wired in by
  `src/components/windows/windowRegistry.js`. Neither is edited by hand.
- **`npm run window:new`** scaffolds a window and **`npm run window:validate`** fails when one is
  hand-wired. [docs/WINDOW_INTEGRATION_SPEC.md](docs/WINDOW_INTEGRATION_SPEC.md) is the contract.
- **Modules** are small apps an agent builds on request (`make_module`). Each one says in its own
  manifest which actions an agent may take in it, and agents use it only through those
  (`read_module`, `use_module`; `server/modules/`, `src/lib/modules/`).
- **Looks** come from one place. Colors, radii, type sizes and motion are defined in
  `src/styles/tokens.css`, and components use only those names. `npm run lint` fails on a raw color.

## Agents

An agent is a row in the `agents` table (who it is, its role, its model) plus its memory and the
tools it is allowed. Seven are seeded: Architect, Censai, Atlas, Genesis, Nexus, Foundation and
Echo. People add their own in the Agent Designer window.

### One run engine

However an agent is started, the same steps run in the same order (`server/runEngine/index.js`):
a person typing in its chat window, another agent asking it for help, or an outside app calling
its shared endpoint.

1. Build the agent's context: its model, the key to use, its memory prompt, the tools it may use.
2. Add the outside (MCP) tools its owner gave it (`server/outsideTools/`).
3. Add its memory: who it is, the facts it knows with their dates, and related earlier
   conversations (`server/agentMemory/`).
4. Narrow the tools when the caller is outside censaiOS.
5. Run the model and tool loop.
6. Record the run as an episode.

While it runs, everyone on the board sees the agent's cursor move to the window it is working in
(`server/collab/agentPresence.js`).

### Chat and the tool loop

`POST /api/chat` is handled in `server/routes/chat/` (`main.js` is the entry). Tools are real
function calls, not text the server parses:

1. The server sends the prompt, the conversation and the tool definitions to the model.
2. When the model answers with tool calls, the server runs each one and sends the results back.
3. That repeats until the model answers in words, or after 10 rounds in chat
   (`MAX_CHAT_MODEL_ROUNDS`, `server/routes/chat/shared.js`) and 30 in background tasks
   (`server/task-worker/shared.js`).

### Tools

There are about 140. A tool needs two things: its definition in `server/tools/definitions/`
(grouped by subject) and its handler in `server/tools/handlers/`, registered in
`handlers/index.js`. `server/tools/definitions.js` narrows the list for each agent before the
model sees it, so different agents get different tools.

### Models

`server/aiGateway/` is the one door to AI models. `providers.js` has an adapter for each provider:
OpenRouter, OpenAI, Anthropic, Google, xAI, Cohere, Moonshot, Z.ai, OpenCode Zen and Ollama. Each
agent can have its own provider and model. A key saved in Settings is used first, and with no key
at all Ollama on the same computer works. The default chat model is named in exactly one file,
`shared/models/defaultChatModel.js`; `AI_MODEL` overrides it.

### Asking before acting

A tool that is marked as needing a yes is checked in `server/approvals/` before it runs
(`server/tools.js` asks). Trust mode is on by default: an agent asked by the board's owner or an
admin runs its write tools straight away. With trust mode off, or when a member asks, the action
waits in Action Approvals for an owner or admin to say yes (`server/approvals/trustMode.js`).

## Memory

An agent remembers in two layers.

- **Agent memory** (`server/agentMemory/`): a short summary of every run, facts with the date they
  became true and the date the agent learned them, a graph of people and things, and a short
  self-description it reads before every answer. A correction never deletes a row, so "what was
  true on this date" can be answered. [docs/architecture/agent-memory.md](docs/architecture/agent-memory.md)
  has the detail.
- **The older layer** (`server/memory/`): saved memories, knowledge triples, shared notes, messages
  between agents and private journals. It builds the memory part of the system prompt
  (`server/memory/prompt.js`).

Journals are private. Each one is encrypted with AES-256-GCM using a key derived for that agent
from `JOURNAL_SECRET` (`server/memory/journal.js`). Server logs and API replies never carry their
text, and the app shows only how many entries there are.

Some parts of the older layer are not in the open source copy: the formula that ranks memories,
the family brain, healing, the second copy kept of each memory, and trait evolution. That copy
carries plain stand-ins for them, so everything still runs; its `server/memory/scoring.js` ranks by
matching words, meaning and age.

## Work in the background

The server starts these when it boots (`server/boot/lifecycle.js`), and they keep going after the
browser closes:

- **Task worker** (`server/taskWorker.js`): looks for queued agent tasks every 5 seconds, runs at
  most 3 at once, and gives each one 120 seconds.
- **Scheduler** (`server/schedulerWorker.js`): looks for due schedules every 30 seconds and queues
  their tasks.
- **Wake-ups** (`server/agent-wakeups/`): agents that asked to be started again later.
- **Agent card runs** (`server/agent-card-runs/`): agents described by an agent card, run by their
  own worker.

## Database

PostgreSQL is set up by the files in `docker/`: `init.sql`, then the numbered files in order. A
new file takes a number nobody has used. An install records which files it has in `censai_setup_ledger`
(`server/boot/setupLedger.js`), so an old file is never renumbered, edited or run again on an
existing install. A few tables are made by the server itself the first time they are needed (the
shared board's two, and the workspace tables in `server/workspaces/schema.js`).

| Tables | What they hold |
|--------|----------------|
| `agents` | Who each agent is, and its provider and model |
| `workspace_members`, `share_links` | Who may open a board, and with what role |
| `workspace_yjs_updates`, `workspace_yjs_docs` | The shared board: its change log and base copy |
| `workspace_client_state`, `user_client_state` | Settings saved beside the board |
| `agent_episodes`, `agent_facts`, `agent_entities`, `agent_relations`, `agent_identity` | Agent memory |
| `memories`, `knowledge_graph`, `knowledge_nuggets`, `agent_messages`, `journals` | The older memory layer |
| `agent_tasks`, `schedules` | Background tasks and what is due when |
| `workspace_agent_trust` | Trust mode, for the board and for single agents |

## What keeps it safe

- **One check for everyone on a board.** People, share-link guests and agents all go through
  `can()` in `server/access/policy.js`. An agent acting for someone never gets more than that
  person has.
- **Docker is fenced off.** Only the `runner` container can reach Docker, it has no open port, and
  it refuses the calls that could take over the computer (`server/runner/dockerOnly.js`).
- **A shared board cannot start a run on someone else's computer.** Only the board owner's own
  connection may set the fields that start one (`server/collab/autoRunGuard.js`).
- **Notes on the board are information, not orders.** What an agent reads from the board reaches
  it as quoted notes.
- **Logs carry a code, not what someone typed.** `npm run guard:log-errors` fails a server log line
  that copies an error's message.

## Sockets

| Path | What travels on it | Where |
|------|--------------------|-------|
| `/hocuspocus` | The shared board and presence | `server/collab/hocuspocus.js` |
| `/ws/workspace-collaboration` | Live previews of drags and typing, and the board as view and comment guests see it | `server/ws/workspaceCollaboration.js` |
| `/ws/agent-registry` | Agents and what each one is doing | `server/ws/agentRegistry.js` |
| `/api/terminal` | The Terminal window | `server/terminal/` |

## Where to look first

| To change | Start in |
|-----------|----------|
| A window | Its entry in `src/lib/manifest/`, then its component in `src/components/` |
| How the board syncs | `src/lib/collaboration/yCanvasSync.js`, `server/collab/` |
| What an agent knows when it answers | `server/runEngine/index.js`, `server/agentMemory/`, `server/memory/prompt.js` |
| A tool | `server/tools/definitions/` and `server/tools/handlers/` |
| Which model answers | `server/aiGateway/providers.js`, `shared/models/defaultChatModel.js` |
| Who may do what | `server/access/policy.js`, `server/approvals/` |
| What starts at boot | `server/boot/` |
| The database | `docker/*.sql` (add the next free number, never edit an old file) |
