# Scout agents

Every core agent that can read projects (Atlas, Echo, Genesis, Nexus and the
rest) has a **scout**: a fast, cheap helper that keeps a map of a project's
code and points to the exact file, line and column where a change belongs.
The scout is the eyes and ears; the core agent keeps the hands and makes the
edit itself (with `project_edit`, which still waits for the owner's OK when
the Project Writer module is equipped).

## Pieces

| Piece | Where |
| --- | --- |
| Read one file without running it: functions, classes, routes, tables, imports, words | `server/repoScout/parse.js` |
| The map of a whole folder, links both ways, re-reads only files whose size or time changed | `server/repoScout/map.js` |
| What a file links to, who uses it (one and two hops), its tests; likely places for a change | `server/repoScout/query.js` |
| The scout's one model call: pick file, line, column and a one-sentence reason from the places the map found | `server/repoScout/scoutModel.js`, `find.js` |
| Which model the scout runs on | `server/repoScout/settings.js`, table `agent_scout_settings` (`docker/058-agent-scouts.sql`) |
| Agent tools `scout_map`, `scout_find` (read-only, every project reader) | `server/tools/definitions/scout.js`, `handlers/scout.js`, `rbac/familyBaseline.js` |
| Scout panel in the agent chat (model, map, "where would a change go?") | `src/components/agentScout/`, route `/api/agent-scout` |

## Rules

- **The map costs nothing.** No model call and no parser package: plain text
  rules for JS/TS, Python, SQL, CSS and Markdown. On the censaiOS repo the first
  look reads about 3,100 files in under two seconds; later looks read only
  what changed.
- **The model only pins the spot.** The map finds up to six likely places; the
  scout's model picks one. An answer outside those places (or past the end of
  the file) is thrown away and the map's best match is used, with a note.
- **BYOK only.** The scout runs on the person's own key. Auto picks the
  cheapest fast model they have a key for, in this order: Gemini 3.8 Flash,
  Claude Haiku 5.5, GPT-4.1 mini, Grok Code Fast, GLM 5.3 Flash, Gemini 2.5
  Flash on OpenRouter, a free OpenCode model, Command R7B. A model on this
  computer (Ollama) can be picked by hand. With no key the scout still points,
  from the map alone, and says so. The scout never uses the core agent's
  (bigger) model.
- **Folders on this computer only, for now.** GitHub-only projects get a plain
  "maps projects in a folder on this computer" answer.
- **Viewers do not get code.** The Scout panel's routes need an owner, admin or
  member of the board, and only map projects open for that agent there.

## Next

Teams for Echo (research and development) and Genesis can reuse the same map:
a second scout kind that writes one-line summaries per file with the cheap
model, and a "what breaks if I change this" answer that follows the map to
callers and tests before the core agent edits.
