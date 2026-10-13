# Canvas core: one source of truth

The board (windows, groups, ink, links, dock) lives in one Yjs document per workspace, served by Hocuspocus on `/hocuspocus`. Nothing else is the board.

## How a change travels

1. A person moves a window. The store change is written into the local Yjs doc field by field (`src/lib/collaboration/yCanvasSync.js`), and the provider sends it to the server.
2. The server applies it to the room, every other person in the room gets it at once, and `onChange` appends it to the update log (`server/collab/yPersistence.js`).
3. Two edits to different windows, or different fields of one window, both survive. Two edits to the same field at the same moment: one wins, and every screen agrees which (Yjs client order). A window's position (x, y) and size (w, h) each move as one value, so when two people drop the same window at once one whole drop wins.

## Storage

| Table | What it holds |
|---|---|
| `workspace_yjs_updates` | Append-only log, one row per burst of changes, with who made it (`user:<id>`, `server`, `migration`). |
| `workspace_yjs_docs` | Compacted base: every row up to `compacted_seq` folded together. |
| `workspace_client_state` | Older snapshot row. Its canvas fields are a backup copy written from the doc; it is never read back as the board. Per-person settings (pen, favourites) still save here. |

The board is rebuilt as base + every log row after `compacted_seq` (`server/collab/yUpdateLog.js`). `rebuild(workspaceId, { untilSeq, until })` returns the board at any earlier point still in the log. Compaction folds rows older than seven days, or beyond 2000 rows, into the base.

## Older writers

- A board that only has a snapshot is migrated into the doc on first open, and the migration is the first log row.
- Whole-snapshot writes (the commands API `workspace.set`, a recovery-copy restore) are mirrored into the doc limited to what they changed (`server/collab/canvasSnapshot.js`), so a stale snapshot cannot rewind other people's edits.
- The browser's snapshot save sends `canvasSource: 'yjs'` and only the settings (pen, favourites and the like); the board fields are left out of the request, and the server keeps its own. Moving, opening or editing windows sends nothing on this route at all: a save goes out only when a setting, or the set of agents the board uses (for project prewarm), changes. While the doc is not connected, edits wait in the local draft; edits made before the first sync are replayed onto the doc when it connects.

## Board history

The dock's History button opens the Board history panel (`src/components/history/BoardHistoryPanel.jsx`). It lists every change still in the log, newest first, grouped per person (a person's changes within two minutes of each other are one entry) and described in plain words ("Sam added Notes, moved 1 window"). Picking an entry shows a small map of the board right after it; "Roll back to here" returns the live board to that point for everyone.

A roll-back writes only the difference into the doc, as one new log row tagged `restore:<seq>:user:<id>`, so nothing after that point is lost and the roll-back can be undone the same way. Members, admins and owners can roll back; viewers can only look. Changes already folded into the base (older than seven days) can't be picked one by one.

Server: `server/collab/boardHistory.js` (list, board at a point, restore) and `server/routes/boardHistory.js`: `GET /api/workspaces/:id/history`, `GET /api/workspaces/:id/history/:seq`, `POST /api/workspaces/:id/history/:seq/restore`. The log rows now also name share-link guests (`guest:<id>`).

## Presence

Presence rides Yjs awareness on the same connection (`src/app/hooks/useAwarenessPresence.js`): name, colour, cursor, selected windows, the window being dragged (others see it follow the hand with the holder's colour, a soft lock) and the window being typed in. A closed tab drops out on its own. The older `/ws/workspace-collaboration` socket still carries server events (agent runs, commits) and is the presence fallback until the doc connects.

Agents have cursors too. While an agent runs through the run engine, the server publishes one awareness state for the board from its side of the room (`server/collab/agentPresence.js`): `{ agents: [{ name, color, home, at, phase, label, tail, total }] }`. Browsers draw each agent's cursor at its own window (or at a window a tool call names, outlined in the agent's colour while it reads or works there) and type out the answer as it streams (`src/components/canvas/AgentCursors.jsx`). Nothing is published when no browser has the board open, the cursor leaves a moment after the run ends, and Settings > Canvas > Show agent cursors hides them for that board. With Redis on, an agent cursor shows in the process that runs the agent.

## Several server processes

Set `REDIS_URL` and the Hocuspocus Redis extension shares rooms (updates and presence) across processes. Without it one process keeps rooms in memory. Postgres is always the durable store; Redis holds nothing that matters after a restart.

## Not done yet

- Per-window subdocuments for heavy windows (docs, code, sketches).
- Retiring `/ws/workspace-collaboration` once agent events move onto the doc.
