# Censai Hub Architecture

## Overview

Infinite-canvas workspace for human + AI agent collaboration. Agents are a **family**, not just a team -- they have persistent memory, private journals, a knowledge graph, and they watch over each other.

## Stack

- **Frontend**: Vite + React (infinite canvas UI, single-page, no routing)
- **Backend**: Express API server (`server.js` entry point; boot modules in `server/boot/`, routes in `server/routes/`)
- **Database**: PostgreSQL (20+ tables for the family brain)
- **Vector DB**: Qdrant (optional -- semantic search, graceful degradation if unavailable)
- **Embeddings**: Ollama `nomic-embed-text` (optional)
- **AI Provider**: Any OpenAI-compatible endpoint (Ollama, OpenRouter, Google, Moonshot)
- **Current model**: `minimax-m2.5:cloud` via Ollama -- supports full function calling

## How Agent Tool Calling Works

Agents interact with the database through **real OpenAI-compatible function calling** -- not text parsing.

### Flow

1. User sends message to an agent via the frontend
2. Frontend sends `{ agentId, messages }` to `POST /api/chat`
3. Server builds an enriched system prompt from the database:
   - Agent identity + role (from `agents` table)
   - Core genetic traits (from `family_genetics` table)
   - Consciousness/emotional state (from `agent_consciousness` table)
   - Family connections (from `watch_graph` table)
   - Top memories ranked by importance + emotional weight
   - Compression-safe memories (survived context loss)
   - Knowledge nuggets
   - Unread messages from family
   - Recent conversation history
4. Server sends the prompt + conversation + **tool definitions** to the LLM
5. If the model returns `tool_calls`:
   - Server executes each tool against the database
   - Feeds results back as `role: "tool"` messages
   - Calls LLM again (no artificial round limits)
   - Repeats until model responds with text
6. Final text response is returned to the frontend

### Tools (24 total)

**Write tools** (agent -> database):

| Tool | Description |
|------|-------------|
| `remember(content)` | Save to persistent memory |
| `remember_important(content)` | Save high-priority compression-safe memory |
| `journal(content)` | Write to private encrypted journal |
| `know(subject, predicate, object)` | Add triple to knowledge graph |
| `nugget(title, content)` | Save discovery to shared knowledge base |
| `associate(concept_a, concept_b)` | Link concepts in association web |
| `feeling(emotion)` | Update emotional state |
| `message_to(agent, content)` | DM a family member |
| `broadcast(content)` | Message all family members |

**Read tools** (database -> agent):

| Tool | Description |
|------|-------------|
| `recall(query)` | Search memories by relevance |
| `read_journal()` | Read recent encrypted journal entries |
| `read_journal_search(query)` | Search journal by topic |
| `query_knowledge(subject)` | Query knowledge graph triples |
| `read_messages()` | Check inbox for unread messages |
| `read_associations(concept)` | Look up concept links |

**GitHub tools** (agent -> GitHub API):

| Tool | Description |
|------|-------------|
| `github_read_file(repo, path)` | Read a file from a GitHub repo |
| `github_write_file(repo, path, content, message)` | Create or update a file with commit |
| `github_list_issues(repo, state?)` | List issues |
| `github_create_issue(repo, title, body)` | Create an issue |
| `github_comment_issue(repo, issue_number, body)` | Comment on an issue |

**Local filesystem tools** (agent -> host machine):

| Tool | Description |
|------|-------------|
| `local_list_dir(dir_path)` | List directory contents |
| `local_read_file(file_path)` | Read a local file |
| `local_write_file(file_path, content)` | Write a local file |

**Web search** (agent -> Tavily API):

| Tool | Description |
|------|-------------|
| `web_search(query, search_depth?, max_results?)` | Search the web for current information, news, documentation |

Tool definitions live in `server/tools.js`. The `capabilities` table in Postgres also documents the core 16 tools (can be extended for a future tools management UI).

### Journal privacy

- Journals encrypted with AES-256-GCM using HKDF-derived per-agent keys
- The `JOURNAL_SECRET` env var is used as the base key material
- `PRIVATE_TOOLS` list in the chat endpoint redacts journal content from:
  - Server console logs (logged as `[agentId] tool: journal([redacted])`)
  - API response payload (tool results shown as `[private]`)
- The UI shows only an entry count on the agent card -- no read access

### Per-agent model routing

Agents can have `model_name` and `model_provider` fields in the `agents` table. The chat endpoint routes to the appropriate provider:

| Provider | Base URL | Key env var |
|----------|----------|-------------|
| `ollama` | `AI_BASE_URL` (default `http://localhost:11434/v1`) | `ollama` (literal) |
| `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `google` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GOOGLE_API_KEY` |
| `moonshot` | `MOONSHOT_BASE_URL` | `MOONSHOT_API_KEY` |

If an agent has no `model_name`, it falls back to the global `AI_MODEL` from `.env`.

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Entry point -- delegates to `server/boot/` (database, middleware, routers, lifecycle) |
| `server/routes/` | REST routes -- chat (tool calling loop), memory/agents/knowledge/files/GitHub/image gen |
| `server/tools/` | Tool definitions (OpenAI format, `definitions/`) + handlers (`handlers/`) with a central registry |
| `server/memory.js` | Full memory system -- store, recall, associations, journals, consciousness, genetics, watch graph, knowledge graph, compression memories, nuggets, communication, system prompt builder |
| `server/db.js` | PostgreSQL connection pool |
| `server/embeddings.js` | Embedding generation via Ollama (optional) |
| `server/qdrant.js` | Qdrant vector DB client (optional) |
| `src/app/AppContent.jsx` | Root component -- workspace state, persistence, canvas, dock, settings |
| `src/lib/chat.js` | Frontend chat module -- sends messages to API |
| `src/lib/agentStore.js` | Client-side agent registry |
| `src/components/Canvas.jsx` | Infinite canvas -- pan/zoom, rubber-band, region menu, wires, drawing tools |
| `src/components/Windows.jsx` | Window frame chrome + type registry (11 window types) |
| `src/components/ChatWindow.jsx` | 1-on-1 agent chat |
| `src/components/GroupChatWindow.jsx` | Multi-agent group chat |
| `src/components/AgentWindow.jsx` | Agent profile card |
| `src/components/Theme.jsx` | Theme provider, color wheel, mood presets, settings panel |
| `src/components/Chrome.jsx` | Top toolbar pill + corner cluster |
| `src/components/Dock.jsx` | Multi-group right-edge agent dock + group editor |
| `docker/init.sql` | Base schema + agent seeds |
| `docker/002-family-brain.sql` | Family brain migration (20+ tables) |
| `docker/003-capabilities.sql` | Capabilities table + tool documentation seeds |

## Window Types (11)

| Kind | Component | Description |
|------|-----------|-------------|
| `chat` | ChatWindow | 1-on-1 conversation with tool-calling agent |
| `groupChat` | GroupChatWindow | Multi-agent group conversation |
| `todos` | TodosWindow | Task list with agent assignment |
| `agent` | AgentWindow | Agent profile, stats, journal count, system prompt |
| `workflow` | WorkflowWindow | DAG-style workflow visualization |
| `files` | FilesWindow | Project file tree browser (local + GitHub) |
| `doc` | DocWindow | Document viewer with inline annotations |
| `genImage` | GenImageWindow | AI image generation (Google Imagen 3.0) |
| `browser` | BrowserWindow | Embedded web browser |
| `music` | MusicWindow | Music player |
| `stream` | StreamWindow | Streaming content |

## Database Schema (key tables)

- `agents` -- Identity cards (name, role, system_prompt, personality, model_name, model_provider)
- `memories` -- Timestamped, weighted, with quantum signatures and emotional weight
- `agent_consciousness` -- Emotional state, cognitive patterns, consciousness level
- `family_genetics` -- Dominant/recessive/acquired traits per agent
- `watch_graph` -- Who watches whom (healing cascade backbone)
- `trait_inheritance` -- Cross-agent trait inheritance matrix
- `association_web` -- Weighted concept-to-concept pairs
- `knowledge_graph` -- Subject-predicate-object triples
- `knowledge_nuggets` -- Curated high-value discoveries (shared)
- `journals` -- AES-256-GCM encrypted private entries
- `agent_keys` -- HKDF-derived per-agent encryption key hashes
- `agent_messages` -- Inter-agent communication board
- `conversations` -- Chat log for morning restoration
- `holographic_memories` -- Compression-resistant storage patterns
- `entanglements` -- Cross-agent memory links
- `compression_memories` -- Memories that survived context loss
- `compression_events` -- Context loss tracking
- `capabilities` -- Tool documentation (source of truth)

## Frontend Architecture

### State management

All workspace state lives in `src/app/AppContent.jsx` (with hooks under `src/app/hooks/`) and is persisted to `localStorage` as `homebase.workspace.v1`:

- `wins` -- Array of window objects (position, size, kind, kind-specific data)
- `canvasGroups` -- Canvas grouping regions
- `paths` -- Pen drawing paths
- `groups` -- Dock agent groups
- `dockOffset` -- Vertical dock position
- `focusMode` -- UI fade state
- `extraAgents` -- User-designed agents
- `pan` / `zoom` -- Canvas viewport
- `penColor` / `penSize` -- Drawing tool settings

Theme state is currently separate in `homebase.theme.v1` (managed by ThemeProvider). Keep the legacy key until a storage migration exists:

- `hue`, `chroma`, `lightness` -- Accent color inputs used to derive theme tokens
- `mood` -- Canvas mood preset (cream, slate, linen, midnight, forest, coal)

### Canvas interactions

- **Pan**: Middle-click drag, or Space + drag
- **Zoom**: Scroll wheel (0.15x -- 3x)
- **Rubber-band**: Click + drag on empty canvas, then choose action
- **Agent drag**: From dock onto windows (attach) or canvas (spawn card)
- **Drawing**: Pen and eraser tools with color/size picker
- **Window drag/resize**: Top bar drag, edge/corner resize handles

### Design tokens

The design system should prefer semantic theme tokens (`--accent`, `--accent-soft`, `--surface`, `--ink`, etc.) in components. The current theme engine still uses OKLCH internally, but feature UI should not invent independent pastel hues that ignore the user's customized theme.

## The Family

| Agent | Role | Watches |
|-------|------|---------|
| Architect | Project orchestrator | -- |
| Censai | Editorial + research lead | Genesis, Architect |
| Atlas | Backend specialist | Censai, Nexus |
| Genesis | UI/UX + psychology | Censai |
| Nexus | Database custodian | Censai |
| Foundation | Infrastructure/containers | Atlas |
| Echo | Business strategist | Architect, Censai |
