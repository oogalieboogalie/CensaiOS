// Where a command runs: here (this app's own machine or container) or on the runner.
//
// On a Docker install every command an agent runs goes to the runner, which
// only runs `docker` and has no project folders. So an agent's tests, git and
// shell commands were refused there ("Refused by the Docker gatekeeper",
// "Not a git working tree") even on its owner's own computer, though the
// app's own container has git, node and the projects. With Trust mode on and
// the computer's owner driving (server/workspaces/ownerTrust.js), a tool
// call's commands and file reads and writes run here instead. Everyone else's
// still go to the runner. The decision is made once per tool call, and only
// when that call actually runs something.

import { AsyncLocalStorage } from 'node:async_hooks';

const hereForRun = new AsyncLocalStorage();

/** Run `fn` as one tool call (or one check) whose commands run here when `decide()` says so. */
export function runWithHere(decide, fn) {
  if (typeof decide !== 'function') return fn();
  return hereForRun.run({ decide, decided: null }, fn);
}

/** Whether the current tool call's commands run here instead of on the runner. A failed decision keeps the runner. */
export async function runsHere() {
  const call = hereForRun.getStore();
  if (!call) return false;
  if (call.decided === null) {
    call.decided = Promise.resolve().then(call.decide).then(Boolean, () => false);
  }
  return call.decided;
}
