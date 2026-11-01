# Server folders

One line per folder under `server/`, so a newcomer (person or AI) knows where to look first. When you add a folder, add its line here; `tests/serverFoldersDoc.test.js` fails if a folder is missing or a listed one is gone.

| Folder | What lives there |
|---|---|
| `access` | One shared access policy check. |
| `agent-card-runs` | Running agent cards: the run store, worker, executors and their events. |
| `agent-import` | Bringing agents in from outside services (ElevenLabs). |
| `agent-registry` | The agent_cards subsystem: one barrel for listing, saving and resolving agents. |
| `agent-wakeups` | Agents that wake themselves up later: the schedule, prompt and model loop. |
| `agentEndpoints` | Shared agents reached from outside with an agent key (the MCP endpoint and its rate limit). |
| `agentMemory` | An agent's deep memory: facts, recall and the memory graph. |
| `agentNetwork` | censaiOS installs asking each other's agents for help: addresses, receipts and install identity. |
| `agents` | Prompt pieces for special agents (Censai as everyone's orchestrator). |
| `aiGateway` | The one door to AI models: chat, streaming, embeddings and per-provider adapters. |
| `aiResources` | Which key each agent spends, and the usage meter. |
| `apiBar` | The API Bar: one signed front door with bar keys, paging and a catalog of branches. |
| `appLog` | The in-app log: who may read it and where it is written. |
| `appUpdate` | Updating the app on this PC. |
| `approvals` | Requests, decisions and grants for actions that need a yes. |
| `attributes` | Agent attributes and mindset sources (family recipes, the registry). |
| `auctionWatcher` | Auction Watcher: checking auction sites for matching listings. |
| `autonomy` | How much an agent may do on its own, and who owns it. |
| `blueprints` | Blueprints: what an agent is handed when someone asks "Do we have ...". |
| `boot` | Server start: middleware, routers, database setup, schemas and watchers. |
| `capabilities` | Capability packages and the checks that gate them (window import and more). |
| `censaiOrchestrator` | Censai the orchestrator: jobs, checks and the model it uses to check agents' work. |
| `chatModel` | Front door to Chat's model code for parts outside the web routes. |
| `cli-agents` | Coding CLIs (Claude, Codex, Grok and others) run as agents, with their keys and logins. |
| `collab` | Live shared editing: the collaboration server, board history and snapshots. |
| `collaboration` | What agents see of, and change in, shared windows (CAD and others). |
| `commands` | Slash-style commands: definitions, registry, context and audit. |
| `config` | Product identity settings. |
| `context` | Per-request context (who is acting, for which request). |
| `credentials` | Stored OAuth sign-ins. |
| `design` | Figma and remix design steps. |
| `devServers` | Running a project's dev server ("Run dev") in Docker. |
| `docker` | The Docker manager window's server side (allowlisted actions). |
| `github` | GitHub helpers (fixing merge conflicts and more). |
| `grokSignin` | The Grok chat on the person's own Grok sign-in. |
| `hostedAgents` | Hosted agents: running their turns and the errors they return. |
| `hubAccounts` | censaiOS accounts: passwords, two-step codes and encryption. |
| `inbox` | The Inbox: one line per thing waiting for you, from each source. |
| `invites` | Board invites. |
| `jules` | Jules (Google's coding agent) sessions and sources. |
| `jules-task-sync` | Keeping Jules tasks and their GitHub pull requests in step. |
| `leadhound` | LeadHound: lead briefs, Tavily search and scoring. |
| `legion` | Legion: building something with several agents, then checking it in a browser. |
| `lessons` | Lessons and enrollment (with Stripe payments). |
| `lib` | Small shared helpers (reliability). |
| `liveOps` | Collecting live operations numbers. |
| `local-dev-restarts` | Scheduled restarts of local dev servers. |
| `marketplace` | The module marketplace: listings and name protection. |
| `memory` | Agent memory: the core store, family brain, healing, journal and the chat prompt builder. |
| `middleware` | Request middleware: security headers, rate limits, origin checks and runtime mode. |
| `modelArena` | Model Arena: one prompt to several models side by side. |
| `modules` | Canvas modules and the module model they ask. |
| `operational-intelligence` | Drift detection and prioritization for running agents. |
| `osvMirror` | A local copy of the OSV vulnerability database and version matching. |
| `outsideTools` | Outside tools agents may call (MCP servers over HTTP or a command line), with a network guard. |
| `overseer` | The Overseer window (merging pull requests only when turned on). |
| `ownCalendar` | Each person's own calendar: the events the Calendar window and agents keep without Google. |
| `policy` | The policy engine and its evidence. |
| `project-brief` | Project briefs built from a local folder or GitHub. |
| `projectGit` | Plain git for one project folder on this computer. |
| `providers` | The OAuth provider registry. |
| `realEstate` | The real estate agents' board reads and writes. |
| `repoScout` | Finding the exact file and line in a repository for a question. |
| `research` | Research runs and their real dependencies (Tavily and others). |
| `routes` | Every web address the server answers (`routes/chat/` is Chat). |
| `runEngine` | One shared engine for agent runs. |
| `runner` | The runner service that runs allowed commands for agents. |
| `runs` | Run lifecycle and cause tracking. |
| `salesLeads` | Saved sales leads and their outreach drafts. |
| `sandbox` | Sandboxed code runs in containers: images, lifecycle and toolchains. |
| `scheduler` | Scheduled tasks and who they are assigned to. |
| `scout` | Scout: drafting a pitch from the person's own business and target. |
| `security` | Security checks shared across the server (owner gate, server keys, role lookups, log-safe helpers). |
| `selfFix` | The app fixing its own small problems as the install's owner. |
| `semantic` | Change-impact maps. |
| `sevenContexts` | The seven contexts lookup and its keywords. |
| `shareLinks` | Share links: guest access, comments and agent replies. |
| `skillSets` | Skill sets equipped to agents (driving the Browser window and more). |
| `social` | The social canvas: profiles, posts, follows and the public feed. |
| `speakUp` | Speak-up notes that reach the owner's phone. |
| `state` | Stored workspace state. |
| `stepCards` | Step cards and their page checks. |
| `task-worker` | The background task worker: claims tasks and runs them (at most 30 rounds). |
| `templates` | Ready-made board templates. |
| `terminal` | The terminal window: sessions, backends and agent output. |
| `todos` | To-dos assigned to a person. |
| `tools` | Agent tools: definitions, handlers, the catalog and tool access (RBAC). |
| `video` | Making and collecting videos for agents and the chat window. |
| `wakeUps` | Stored wake-up records. |
| `webOs` | Opening censaiOS from another computer on the home network. |
| `window-import` | Promoting a canvas-built module to a built-in window. |
| `workflows` | Workflows: triggers, runs and their board. |
| `workspaces` | Workspaces: members, project access, briefs and activity. |
| `ws` | Websocket messages (agent registry, games, live shows and more). |
