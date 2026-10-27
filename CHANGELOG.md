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

- Sync the PC's Oct 25 local commits to master (Oct 26)
- Bigger lot, 32 high, turning 3D view, sample builds (Oct 26)
- Starter Box: install censaiOS on MX Linux and 4 GB ThinkPads (Oct 26)
- Add Notes Workspace Obsidian+Finder board preset (Oct 26)
- Blueprints: the UI team recipe as a ready-made blueprint (Oct 23)
- Dompurify 3.4.17: clears the critical advisory that fails the public Security check (Oct 23)
- Docker runner gate: close the outside security review's gaps (Oct 23)
- Test team: Sheets for two people (Oct 23)
- Test team: Sketchpad for two, and keep a label typed right after drawing (Oct 23)
- Music Player: a teammate's song opens the player on every board (item 141) (Oct 23)
- UI team nightly: Message Router gets depth and a guiding empty state (Oct 23)
- The last server log lines keep a code, and a guard keeps it that way (item 140) (Oct 23)
- Agent and worker log lines keep an error code, not the error text (item 139) (Oct 23)
- Server route log lines keep an error code, not the error text (item 138) (Oct 23)
- Board-sharing and start-up log lines keep an error code, not the error text (item 137) (Oct 23)
- UI team: mark every module window against a yardstick, shared depth system, Docker/MLOps/Ollama reworked (Oct 23)
- The last browser console lines reach the app log (Oct 23)
- Landing page: demo people always on the board, plus live visitor cursors (Oct 23)
- Raw console lines can only go down (Oct 23)
- The next browser console lines reach the app log (Oct 23)
- The last raw server console lines reach the app log (Oct 23)
- Sign-in, session and security failures reach the app log (Oct 23)
- Tools: agent tool failures go to the app log, without the error text (Oct 23)
- App shell: move board start-up and selection out of AppContent.jsx (Oct 22)
- Chat: move the tool-call round out of chatExecution.js (Oct 22)
- Test team: Docker check covers images, volumes, networks and Compose (Oct 22)
- Docker window: see what an image is made of (Oct 22)
- Test team: two people edit the board at the same moment (item 124) (Oct 22)
- Keep a group's name clear of the top toolbars (item 123) (Oct 22)
- Remove dead copies nothing uses (item 121) (Oct 22)

### Fixed

- Multi-select right-click deletes all selected windows (Oct 26)
- Test team: Scheduler and To-dos for two, and three fixes it found (Oct 23)
- Test team: the Market for two, and two listing slips fixed (Oct 23)
- Marketplace: Agents tab points to the Agent Registry instead of an empty list (Oct 23)
- Two people typing the same words in a note no longer scramble (Oct 23)
- MCP: stop logging launch arguments, server output and tool arguments (Oct 22)

### Behind the scenes

- Keep the owner's story and health out of the public copy (Oct 26)

## 0.5.0 (2026-10-25)

### New

- Nightly release: mark the teleprompter storage name as not a secret
- Send the board's busiest console failures to the app log (item 120)
- Chat's own failure notes reach the app log
- Test team: name pictures by theme and link each theme's copy
- Test team: each chat shows only what its model can do
- Z.ai GLM chats get the picture button on vision models and show tools
- Test team: agents asking agents check, and board search knows agent roles
- Test team: Figma and pasted designs check
- Test team: LeadHound check, and a brief must be words
- Test team: window groups check for two people
- Music Player frames only real music links
- Group goals and milestones work with whole-number ids too
- Browser lines reach the app log with quoted values and links taken out
- Board-help log line names agents by id only
- Scheduler error answers carry no raw database text
- Key sharing log lines carry no typed account
- Add the test team, and stop shared windows from running planted script links
- Group window: a milestone only shows as done once it is saved
- Make Docker reads owner-only, and close two side doors into container logs
- Import guard: parts may only reach into each other less, never more (item 97)
- Group goals and milestones belong to the person who made them (item 102)
- Newcomer guide matches the code, with a map of server folders (item 100)
- Grok Build G5: Music Player radio links are detected by more than words in the address
- The everyone-is-user-1 shortcut runs only inside jest (item 99)
- Grok Build 53: two people in one chat window both keep their messages
- Server notes from five files reach the app log (item 98)
- Grok Build 47: Figma import lists frames inside Sections
- Grok Build 48: Agents on a starter board can ask their own teammates
- Board sync rules live in one shared folder both sides use
- Grok Build 52: Group Chat uses the AI keys saved in censaiOS
- Tests for the seven server addresses nobody tested
- One real end-to-end check: two made-up people on one board
- A check stops two database setup files from sharing a number
- Grok Build 50: Scheduler Delete works on a schedule that has run, and the card shows its last answer
- Database: a setup ledger records which docker/*.sql files each install has
- Grok Build 56: YouTube search takes your own YouTube key
- Grok Build 55: Chats say in plain words why the AI provider turned a message down
- Security: one home for an account's role lookup
- Server keys: embeddings and Tavily search keep the owner's keys for the owner
- Grok Build G8: The terminal's Mount to chip fits at narrow widths
- Logs: http_test refusals and page checks drop typed hosts and paths
- A role changed in the database counts on the next request, no sign-out
- Keys: saving, removing and sharing AI keys leave app log lines
- Terminal: start failures log the kind of folder, not the folder
- Task worker: the start line logs ids and priority, not the task's text
- Auth: sign-in problems leave an app log line without the email
- Grok Build G1: Code Editor and Document never save an error message over a file
- Grok Build G4: Image Studio's Insert button inserts the picture you clicked
- Automation: buttons say when Windows said no, and log through the app log
- Sheets: test two people typing in one cell, and count merges honestly
- Outside tools started as programs get shared settings only for the owner
- CENSAI_ENV_KEYS=off also keeps setup-file keys from coding CLIs
- AI resources: Ask the provider goes through the outbound checks
- Notes say how to link to them
- To-do Assign offers only the coding agents this computer has
- Agent tools and Censai code jobs name the owner account
- AI resources: say why Codex and Grok show no account name
- AI resources: decide the owner view with assertSystemAdmin
- LeadHound: Download CSV saves every lead as a spreadsheet file
- Design: Figma import, Sync from Figma and remix leave app log lines
- Agent registry: one app log line for every agent card change
- Docker: every button leaves a line in the app log
- Step cards: a page check that asks the project's own running app
- GitHub window, HTTP Test and Pull merged changes are owner-only where they use the PC or the owner's GitHub key
- Docker: a container's Open link goes to the computer the board is on
- Music Player: swirl light show that pulses with the music
- Music Player: pick the skin yourself, plus a Desktop 2001 skin
- Calendar: each person keeps their own view on a shared board
- Mailcow lists and changes are owner only
- Terminal: the refusal's app log line carries no account names
- Keep the PC's .env provider keys away from teammates' CLI agents
- Sheet cells merge one at a time on a shared board
- "Only the owner" messages name the owner account and yours
- AI resources window: every AI key and sign-in, what it spent, what is left
- LeadHound: saved leads keep their drafts and don't pile up twice
- Docker Run form takes settings, a shared folder and a restart choice
- Step cards, plain steps that unlock one by one, and .todo files

### Fixed

- A file that cannot play says so instead of PLAYING
- Raw error text stays out of four leftover answers and log lines (item 104)
- Chat model front door: parts outside the routes stop borrowing Chat's files
- Grok Build 51: F1 to F9 full screen stops cutting off what runs outside the group
- Grok Build G2: A second browser tab no longer counts as another person
- Chat: a "dev server restarted" note no longer wipes the conversation
- Grok Build 49: Sketchpad draws again, and two people drawing keep both lines
- Grok Build 54: Try-it board's Add your AI key step stops breaking Settings
- Grok Build G6: A stray % in a song link no longer breaks the Music Player
- Grok Build G3: Lead Queue counts stay right once you pick a filter
- Docker: log lines give a fixed reason, never Docker's own words
- Fix the public nightly's failing test and secret scan

### Behind the scenes

- Keep personal details out of the public copy

## 0.4.0 (2026-10-19)

### New

- Family agent marks in the Scheduler, Active Agents and Group sub-agents
- Music player plays song links and internet radio for real
- One default window size wherever a window comes from
- Inbox to-do: one app-log line per Mark done and Open, never the to-do text
- No free AI allowance box in chats that don't use it
- Censai the orchestrator: checked plans for the family, right in the pinned chat
- Inbox to-do: Mark done and Open, whole names in its cells
- Auction Watcher: AI pros and cons also looks at the listing photos
- Auction Watcher: lock words in a listing's description raise the red flag too
- Keep share, lesson and Legion link codes out of the request log
- Keep invite, pair and join codes out of the request log
- Auction Watcher: watch Goodwill and eBay for listings under your price
- Home server install and "Invite to this board"
- Agent Designer can pull agents from a GitHub repo
- Import hosted agents from Claude, OpenAI, Google, ElevenLabs and LangChain
- Adding a window works at a second plain-http address
- Agent Designer can pull Claude helpers straight from the open project
- Browser page sees small windows between its test points
- Files search and backlinks stop at the first 100
- Grok chat can run on your own Grok sign-in (SuperGrok / Grok Heavy)
- To-do Assign: Me, coding agents, and a "For you" reminder
- Family agents wear the censaiOS mark in their own colour
- Shared Preview: say what it shows when there is no page
- MLOps Dashboard: an "Add a model" form
- Reliability window: a "Run a scan" button
- Stream Viewer: tell Twitch the board's real address
- Claude and Grok chats get a Dictate mic with a saved OpenAI or Google key
- Docker window: start a new container from an image
- Idea Pad bullets merge one at a time between people
- Keep both people's to-dos when they add at the same moment
- Update censaiOS from the desktop tray
- Tab can leave Censai Sheets at the edge of the grid
- Censai wake-ups: Censai schedules himself and wakes the family
- Chat live preview: agent writes show beside the chat and refresh live
- Agents keep the real conversation with times, plus Recents
- Censai's pinned chat: everyone's orchestrator, always on screen
- One log file for everything: server, console, board errors
- Places to Host: Deploy buttons for Render, Cloud Run and Railway
- Speak-up notes reach the owner's phone through the Jules ping address
- Agents can speak up: one short note to the Inbox on their own
- Errors show a log snippet and a Send to Claude button
- Starter box: one command turns a spare Linux computer into a vibecoding box
- Hand-added tools are owner-only for teammates unless they only look
- Optional phone ping when the overnight Jules runner parks a task
- Start a nano helper by hand from a sub-agent's data box
- Each sub-agent's data box gets its own door: GET and POST addresses
- Sub-agents can start one-job nano helpers
- Stuck Jules tasks show up in the Inbox
- Each sub-agent gets its own numbered data box
- Terminal: one header with a Mount to button, and show a whole shared drive
- Legion builds front and back at the same time, then joins them
- Browser page shrinks with the board when zooming out, optional icon cover
- The review decides each Jules merge
- Tool kits in one go, and search-first for every AI
- Places to Host: every place censaiOS can live, with its file and steps
- Import agents: pull your Assistants straight from your OpenAI account
- Wave-by-wave Jules runs: the next wave waits for every PR in this one
- Message Router: one shared line and a router for the board's agents
- Chunk and tag anything you feed in
- Agent tools that change the computer are owner-only
- Smart tool search: find tools by meaning
- Make the computer's own tools owner-only (Docker, dev servers, git, files, tasks, Legion, terminal)
- YorWare security names on the real security pieces
- Keep look-only teammates from changing files on this computer
- Files window says why a folder or search came back empty
- Edge window style: buttons hang off the right edge
- Model strengths auto-pick: chat picks the AI best at each task
- Agent memory: shelves you can see
- Scheduler: pick a run from your to-dos, tag it, show its manager
- Agent memory: a time-aware knowledge graph (connections with dates, Look back)
- Git Diff Viewer: side-by-side diffs in a new window and the Agent Console Changes tab
- Blueprints shelf with IDs and "Do we have ..." lookup
- Seven contexts before answering
- Idea Foundry mindsets: merge ones that say the same thing (243 to 129)
- Exo-Skeleton: skill sets, What worked log, Idea Foundry, equippable Browser
- API Bar: one front door with a doorman for censaiOS APIs
- Legion slice two: Orchestrator Engine YAML spec, Work Queue, Validation Engine
- Add menu: list the Group window under Chat and agents
- Legion window: a team of agents that works until Echo says OK
- Terminal: say plainly when a shell is not the sandbox, keep app secrets out
- Ultem "OS" in the censaiOS logo and Ultem tagline words
- Review team in the GitHub window, on your own sign-ins (plus Grok)
- The censaiOS shortcut always opens a window on the current build
- Keep window and group resize corners grabbable over a Browser page
- CensaiOS on the PC updates itself while it runs
- Hum a beat: hum a melody, get the real notes, hear it as a beat
- Terminal: open even when its folder can't be reached

### Fixed

- A paste in a window stays there, no "Pasted Note" over Sheets
- A tiled group stays tiled when dragged past a loose window
- Log every address refusal
- Pin outside calls to the checked address (DNS rebinding)
- Refuse private addresses on hosted and shared runs
- Browser page no longer goes dark when something small sits on it
- Terminal says why it won't open for a non-owner instead of "Connection lost"
- Kubernetes window: show a real cluster instead of crashing
- Terminal: a shell that can't start stops instead of retrying forever
- Give Censai its real persona instead of the newsletter editor prompt
- Terminal: "Mount to" button opens a folder picker instead of the dropdown
- Dock app: keep the header above the docked app so selecting the window no longer tucks it away
- Backend check: stop a test leaking Vite onto the API port; no more 500s for setup states

### Behind the scenes

- Nightly builds and Sunday stable releases for the public copy
- Nightly public sync: stop the safety scan flagging a music model file
- Clear the last two code-scanner findings on the public copy
- Clear the security warnings the public copy's checks raised

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
