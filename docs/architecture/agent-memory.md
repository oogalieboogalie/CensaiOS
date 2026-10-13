# Agent memory

Part 5 of the frontier plan ([ideas-catalog-and-frontier-architecture.md](ideas-catalog-and-frontier-architecture.md)).
Agents remember three things, kept separately for each person and each agent:

| Kind | What it holds | Table |
| --- | --- | --- |
| Episodes | One short summary per run (chat, help request, outside call): what was asked, what was answered, which tools were used, which model answered | `agent_episodes` |
| Dated facts | What is true, since when (`valid_from`/`valid_to`), and when the agent learned it (`recorded_at`/`superseded_at`). A change or a correction never deletes a row | `agent_facts` |
| Identity core | A short self-description the agent reads before every answer, the same whichever model runs it. Versioned | `agent_identity` |

Tables: `docker/056-agent-memory.sql`, applied at boot by `server/agentMemory/schema.js`. Plain Postgres
(full-text search for episodes), so memory works on every install; nothing points at one machine.

## How a run uses it

`server/runEngine/index.js` calls `loadRunMemory` (`server/agentMemory/forRun.js`) once per run, so chat,
help requests, shared endpoints and imported agents all get the same memory:

1. The memory block (`server/agentMemory/recall.js`) is added to the system message: identity core,
   current facts with both dates, and up to three earlier episodes that share words with the question.
   The block says it is remembered data, not instructions.
2. Three tools are added: `remember_fact`, `recall_memory`, `fact_history` (`server/agentMemory/tools.js`).
3. When the run ends it is recorded as an episode.

Outside apps calling through Share get the identity core only: no facts, no episodes, no memory tools.
Their questions are still recorded so the owner can see them. Memory never stops a run: on a database
error the agent answers without it.

## Change versus correction

`planFactWrite` in `server/agentMemory/facts.js`:

- **Change** ("since September I live in Denver"): the old belief is marked replaced, a "was" row keeps the
  old value true until the new one started, and the new value becomes current.
- **Correction** ("it was never green, it was blue"): the old belief is marked replaced and the new value
  takes the old start date.
- A change dated before the old value started is a correction.

`factsAsOf(rows, { trueAt, knownAt })` answers "what did the agent believe at `knownAt` about `trueAt`".

## The Memory panel

Chat header, **Memory** (`src/components/agentMemory/`): what it knows (with history, "It changed",
"It was wrong", "Forget", add a fact), who it is (edit, earlier versions), past conversations (search).
Routes: `/api/agent-memory` (`server/routes/agentMemory.js`), scoped to the signed-in person.

## deep_memory

`deep_memory` now also searches these tables, and skips the family brain DuckDB file when it is not on
this machine instead of starting a process that can only fail. The family brain itself is unchanged.
The older temporal tables in `docker/012-tkg-bellman-extension.sql` are still unused by server code;
`agent_facts` is the dated-facts store.

## Eval

`node scripts/memory-eval.mjs` asks a fixed set of questions with and without memory and prints a table
(`server/agentMemory/eval.js`). With `DATABASE_URL` set it goes through the real tables. With
`MEMORY_EVAL_BASE_URL`, `MEMORY_EVAL_API_KEY` and `MEMORY_EVAL_MODEL` it uses a real model you bring.
Latest stand-in run: [docs/evals/agent-memory-eval.md](../evals/agent-memory-eval.md).
Tests: `tests/agentMemory*.test.js` (the Postgres one runs when `MEMORY_TEST_DATABASE_URL` is set).
