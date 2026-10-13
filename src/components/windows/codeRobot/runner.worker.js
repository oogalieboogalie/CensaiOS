// Runs a Code Robot program off the main thread. The program is the
// player's own, but it still gets no network or storage: those names are
// removed before anything runs. The window ends this worker if a program
// loops without ever calling a command.
import { runLevel } from '../../../lib/games/codeRobot/run.js';

const BLOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker'];
for (let target = self; target; target = Object.getPrototypeOf(target)) {
  for (const name of BLOCKED) {
    try { if (Object.prototype.hasOwnProperty.call(target, name)) delete target[name]; } catch { /* not configurable */ }
    try { if (name in target) Object.defineProperty(target, name, { value: undefined, configurable: false }); } catch { /* read-only */ }
  }
}

self.onmessage = (event) => {
  const { id, level, code } = event.data || {};
  let run;
  try {
    run = runLevel(level, code);
  } catch (err) {
    run = { solved: false, results: [{ outcome: 'error', message: String(err?.message || err), trace: [], moves: 0 }], failedMap: 0, lines: 0 };
  }
  self.postMessage({ id, run });
};
