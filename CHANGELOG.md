# Changelog

Every censaiOS release, newest first. The release automation writes this file:
each night it lists what the nightly build has that no stable release has yet,
and each Sunday that list becomes the next numbered stable release.

- **Stable releases** (0.4.0, 0.5.0, ...) are on the `main` branch and the
  `latest` container image. Use these.
- **Nightly builds** are on the `nightly` branch and the `nightly` container
  image: the newest work, made automatically every night and not tested by a
  person yet.

The Releases page of this repository has each release's notes and container
tags.

## Unreleased: in the nightly builds, not in a stable release yet

### New

- Family agent marks in the Scheduler, Active Agents and Group sub-agents (Oct 19)
- Music player plays song links and internet radio for real (Oct 19)
- One default window size wherever a window comes from (Oct 19)
- Inbox to-do: one app-log line per Mark done and Open, never the to-do text (Oct 19)
- No free AI allowance box in chats that don't use it (Oct 19)
- Censai the orchestrator: checked plans for the family, right in the pinned chat (Oct 19)
- Inbox to-do: Mark done and Open, whole names in its cells (Oct 19)
- Auction Watcher: AI pros and cons also looks at the listing photos (Oct 19)
- Auction Watcher: lock words in a listing's description raise the red flag too (Oct 18)
- Keep share, lesson and Legion link codes out of the request log (Oct 18)
- Keep invite, pair and join codes out of the request log (Oct 18)
- Auction Watcher: watch Goodwill and eBay for listings under your price (Oct 18)
- Home server install and "Invite to this board" (Oct 18)
- Agent Designer can pull agents from a GitHub repo (Oct 18)
- Import hosted agents from Claude, OpenAI, Google, ElevenLabs and LangChain (Oct 18)
- Adding a window works at a second plain-http address (Oct 18)
- Agent Designer can pull Claude helpers straight from the open project (Oct 18)
- Browser page sees small windows between its test points (Oct 18)
- Files search and backlinks stop at the first 100 (Oct 18)
- Grok chat can run on your own Grok sign-in (SuperGrok / Grok Heavy) (Oct 18)
- To-do Assign: Me, coding agents, and a "For you" reminder (Oct 18)
- Family agents wear the censaiOS mark in their own colour (Oct 18)
- Shared Preview: say what it shows when there is no page (Oct 18)
- MLOps Dashboard: an "Add a model" form (Oct 18)
- Reliability window: a "Run a scan" button (Oct 18)
- Stream Viewer: tell Twitch the board's real address (Oct 18)
- Claude and Grok chats get a Dictate mic with a saved OpenAI or Google key (Oct 18)
- Docker window: start a new container from an image (Oct 18)
- Idea Pad bullets merge one at a time between people (Oct 18)
- Keep both people's to-dos when they add at the same moment (Oct 18)
- Update censaiOS from the desktop tray (Oct 18)
- Tab can leave Censai Sheets at the edge of the grid (Oct 18)
- Censai wake-ups: Censai schedules himself and wakes the family (Oct 18)
- Chat live preview: agent writes show beside the chat and refresh live (Oct 18)
- Agents keep the real conversation with times, plus Recents (Oct 17)
- Censai's pinned chat: everyone's orchestrator, always on screen (Oct 17)
- One log file for everything: server, console, board errors (Oct 17)
- Places to Host: Deploy buttons for Render, Cloud Run and Railway (Oct 17)
- Speak-up notes reach the owner's phone through the Jules ping address (Oct 17)
- Agents can speak up: one short note to the Inbox on their own (Oct 17)
- Errors show a log snippet and a Send to Claude button (Oct 17)
- Starter box: one command turns a spare Linux computer into a vibecoding box (Oct 17)
- Hand-added tools are owner-only for teammates unless they only look (Oct 17)
- Optional phone ping when the overnight Jules runner parks a task (Oct 16)
- Start a nano helper by hand from a sub-agent's data box (Oct 16)
- Each sub-agent's data box gets its own door: GET and POST addresses (Oct 16)
- Sub-agents can start one-job nano helpers (Oct 16)
- Stuck Jules tasks show up in the Inbox (Oct 16)
- Each sub-agent gets its own numbered data box (Oct 16)
- Terminal: one header with a Mount to button, and show a whole shared drive (Oct 16)
- Legion builds front and back at the same time, then joins them (Oct 16)
- Browser page shrinks with the board when zooming out, optional icon cover (Oct 16)
- The review decides each Jules merge (Oct 16)
- Tool kits in one go, and search-first for every AI (Oct 16)
- Places to Host: every place censaiOS can live, with its file and steps (Oct 16)
- Import agents: pull your Assistants straight from your OpenAI account (Oct 16)
- Wave-by-wave Jules runs: the next wave waits for every PR in this one (Oct 16)
- Message Router: one shared line and a router for the board's agents (Oct 16)
- Chunk and tag anything you feed in (Oct 16)
- Agent tools that change the computer are owner-only (Oct 16)
- Smart tool search: find tools by meaning (Oct 16)
- Make the computer's own tools owner-only (Docker, dev servers, git, files, tasks, Legion, terminal) (Oct 16)
- YorWare security names on the real security pieces (Oct 16)
- Keep look-only teammates from changing files on this computer (Oct 16)
- Files window says why a folder or search came back empty (Oct 16)
- Edge window style: buttons hang off the right edge (Oct 16)
- Model strengths auto-pick: chat picks the AI best at each task (Oct 16)
- Agent memory: shelves you can see (Oct 16)
- Scheduler: pick a run from your to-dos, tag it, show its manager (Oct 16)
- Agent memory: a time-aware knowledge graph (connections with dates, Look back) (Oct 16)
- Git Diff Viewer: side-by-side diffs in a new window and the Agent Console Changes tab (Oct 16)
- Blueprints shelf with IDs and "Do we have ..." lookup (Oct 16)
- Seven contexts before answering (Oct 16)
- Idea Foundry mindsets: merge ones that say the same thing (243 to 129) (Oct 16)
- Exo-Skeleton: skill sets, What worked log, Idea Foundry, equippable Browser (Oct 16)
- API Bar: one front door with a doorman for censaiOS APIs (Oct 16)
- Legion slice two: Orchestrator Engine YAML spec, Work Queue, Validation Engine (Oct 16)
- Add menu: list the Group window under Chat and agents (Oct 16)
- Legion window: a team of agents that works until Echo says OK (Oct 16)
- Terminal: say plainly when a shell is not the sandbox, keep app secrets out (Oct 15)
- Ultem "OS" in the censaiOS logo and Ultem tagline words (Oct 15)
- Review team in the GitHub window, on your own sign-ins (plus Grok) (Oct 15)
- The censaiOS shortcut always opens a window on the current build (Oct 15)
- Keep window and group resize corners grabbable over a Browser page (Oct 15)
- CensaiOS on the PC updates itself while it runs (Oct 15)
- Hum a beat: hum a melody, get the real notes, hear it as a beat (Oct 15)
- Terminal: open even when its folder can't be reached (Oct 15)

### Fixed

- A paste in a window stays there, no "Pasted Note" over Sheets (Oct 18)
- A tiled group stays tiled when dragged past a loose window (Oct 18)
- Log every address refusal (Oct 18)
- Pin outside calls to the checked address (DNS rebinding) (Oct 18)
- Refuse private addresses on hosted and shared runs (Oct 18)
- Browser page no longer goes dark when something small sits on it (Oct 18)
- Terminal says why it won't open for a non-owner instead of "Connection lost" (Oct 18)
- Kubernetes window: show a real cluster instead of crashing (Oct 18)
- Terminal: a shell that can't start stops instead of retrying forever (Oct 17)
- Give Censai its real persona instead of the newsletter editor prompt (Oct 16)
- Terminal: "Mount to" button opens a folder picker instead of the dropdown (Oct 16)
- Dock app: keep the header above the docked app so selecting the window no longer tucks it away (Oct 15)
- Backend check: stop a test leaking Vite onto the API port; no more 500s for setup states (Oct 15)

### Behind the scenes

- Nightly builds and Sunday stable releases for the public copy (Oct 19)
- Nightly public sync: stop the safety scan flagging a music model file (Oct 18)
- Clear the last two code-scanner findings on the public copy (Oct 15)
- Clear the security warnings the public copy's checks raised (Oct 15)

_1 more change is not listed because the description names a part of censaiOS that is not in the public copy._

## 0.3.0 (2026-10-15)

The public copy brought up to date by hand with the work since 0.2.0, before
releases were automatic. Releases from 0.4.0 on list every change.

## 0.2.0 (2026-06-10)

First release as **Censai** (supersedes the openhub-oss 0.1.x line).

- Complete AI-first modular refactor: monolith server and window components split into small, single-purpose modules with a size budget enforced in CI.
- Manifest-driven window system: 38 window types declared in one manifest; registry, component wiring, and launcher tiles all derive from it (`npm run window:validate`).
- Window SDK: scaffold new window types with `npm run window:new`.
- Memory subsystem: AES-256-GCM encrypted per-agent journals, knowledge graph, semantic recall via Qdrant with graceful degradation.
- Background workers: agent task queue and cron scheduler.
- Runtime modes: `local_desktop`, `private_server`, `cloud_saas`; filesystem and terminal access are gated off outside local mode.
- Licensing: Apache License 2.0.
