// An agent runs only the tools it was given. A model can name any tool, one
// it knows from its training or one that words in the conversation (a page
// it read, a file, an outside app's question) ask for, and that tool used to
// run even though the agent was never given it. Each run remembers the tools
// it offered. executeTool (and an outside tool that does not go through
// executeTool) refuses any other name, for a family agent, a sub-agent and
// a custom agent alike. A call that is not part of a run is unchanged.

import { AsyncLocalStorage } from 'node:async_hooks';

const offeredForRun = new AsyncLocalStorage();

/** The names of the tools a loop offered its model. */
export function offeredToolNames(tools) {
  return new Set((Array.isArray(tools) ? tools : []).map((tool) => tool?.function?.name).filter(Boolean));
}

/** Remember this run's tools for every tool call on the same run. */
export function runWithOfferedTools(tools, fn) {
  return offeredForRun.run(offeredToolNames(tools), fn);
}

/**
 * A call the server itself makes during a run (the code-block scan, or a
 * fixed follow-up an offered tool makes). The model did not name it.
 */
export function outsideOfferedTools(fn) {
  return offeredForRun.run(null, fn);
}

/**
 * Start a long-lived timer or worker outside this run.
 *
 * Background workers must not inherit a run's list. A timer created inside
 * a run keeps that run's async context, and the offered list with it, for
 * every later tick, so unrelated work is refused long after the run ended.
 */
export function scheduleOutsideRun(fn) {
  return offeredForRun.exit(fn);
}

/** True when this call is not part of a run. Null means the server stepped out on purpose. */
export function offeredListMissing() {
  return offeredForRun.getStore() === undefined;
}

/** What the model gets back for a call to a tool it was not given; "Error:" marks the call as not done. */
export function toolNotOfferedResult(name) {
  const shown = String(name ?? '').slice(0, 80);
  return `Error: "${shown}" is not one of the tools you were given here, so it did not run. Use only the tools you were given, and tell the person in plain words if they cannot do what was asked.`;
}

/**
 * The refusal when this run did not offer `name`. Null when this call is not
 * inside a run, when the server stepped outside the list on purpose, or when
 * the tool was offered. Being offered is not permission: the other checks
 * still apply.
 */
export function unofferedToolResult(name) {
  const offered = offeredForRun.getStore();
  if (!(offered instanceof Set) || offered.has(name)) return null;
  return toolNotOfferedResult(name);
}
