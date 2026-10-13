import React from 'react';
import { LEVELS, levelById } from '../../../lib/games/codeRobot/levels.js';
import { starsFor } from '../../../lib/games/codeRobot/run.js';
import { classProgress, coderField, mergeSolve, readCoders } from '../../../lib/games/codeRobot/progress.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';

const TIMEOUT_MS = 2000;
const STEP_MS = 220;
const draftKey = (winId, levelId) => `homebase.codeRobot.${winId}.${levelId}`;

function readDraft(winId, level) {
  try { return localStorage.getItem(draftKey(winId, level.id)) ?? level.starter; } catch { return level.starter; }
}
function writeDraft(winId, levelId, code) {
  try { localStorage.setItem(draftKey(winId, levelId), code); } catch { /* private window */ }
}

// One worker per run, ended on a timer so `while (true) {}` can't hang the tab.
function runInWorker(level, code) {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./runner.worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      resolve({ solved: false, results: [{ outcome: 'error', message: `Could not start the runner: ${err.message}`, trace: [], moves: 0 }], failedMap: 0, lines: 0 });
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ solved: false, results: [{ outcome: 'too-long', message: 'The program ran for too long without moving. Is a loop running forever?', trace: [], moves: 0 }], failedMap: 0, lines: 0 });
    }, TIMEOUT_MS);
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); resolve(e.data.run); };
    worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); resolve({ solved: false, results: [{ outcome: 'error', message: e.message || 'The runner failed', trace: [], moves: 0 }], failedMap: 0, lines: 0 }); };
    worker.postMessage({ id: 1, level: { maps: level.maps, par: level.par }, code });
  });
}

/**
 * Code Robot for one window: which level I'm on, my draft code, running it
 * in a sandboxed worker and replaying the robot's path step by step. Solved
 * levels go on my seat in the shared window record for the class to see.
 */
export function useCodeRobot({ win, onUpdate }) {
  const me = getSelf();
  const canPlay = me.canEdit !== false;
  const selfName = me.label || 'You';
  const field = coderField(selfName);
  const codersKey = React.useMemo(() => JSON.stringify(readCoders(win)), [win]);
  const coders = React.useMemo(() => JSON.parse(codersKey), [codersKey]);
  const mine = coders[field];
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;

  // Open on the first level I haven't solved yet.
  const [levelId, setLevelId] = React.useState(() => (LEVELS.find((l) => !mine?.solved?.[l.id]) || LEVELS[0]).id);
  const level = levelById(levelId) || LEVELS[0];
  const [code, setCode] = React.useState(() => readDraft(win.id, level));
  const [mapIndex, setMapIndex] = React.useState(0);
  const [run, setRun] = React.useState(null);
  const [frame, setFrame] = React.useState(0);
  const [running, setRunning] = React.useState(false);

  const chooseLevel = React.useCallback((id) => {
    const next = levelById(id);
    if (!next) return;
    setLevelId(id);
    setCode(readDraft(win.id, next));
    setRun(null);
    setFrame(0);
    setMapIndex(0);
  }, [win.id]);

  const editCode = React.useCallback((value) => {
    setCode(value);
    writeDraft(win.id, levelId, value);
  }, [win.id, levelId]);

  const resetCode = React.useCallback(() => editCode(level.starter), [editCode, level.starter]);

  const start = React.useCallback(async () => {
    if (running) return;
    setRunning(true);
    const result = await runInWorker(level, code);
    setRunning(false);
    setRun(result);
    // Replay the map that failed, or the first one when everything passed.
    setMapIndex(result.solved ? 0 : Math.max(0, result.failedMap));
    setFrame(0);
    if (canPlay) {
      const stars = starsFor(level, result);
      const seat = mergeSolve(mine, selfName, level.id, { stars, lines: result.lines, code, at: Date.now() });
      if (JSON.stringify(seat) !== JSON.stringify(mine)) updateRef.current?.({ [field]: seat });
    }
  }, [running, level, code, canPlay, mine, selfName, field]);

  // Step the replay along.
  const trace = run?.results?.[mapIndex]?.trace || [];
  React.useEffect(() => {
    if (!run || frame >= trace.length - 1) return undefined;
    const id = setTimeout(() => setFrame((f) => f + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [run, frame, trace.length]);

  const showMap = React.useCallback((i) => { setMapIndex(i); setFrame(0); }, []);
  const skip = React.useCallback(() => setFrame(Math.max(0, trace.length - 1)), [trace.length]);
  const replaying = Boolean(run) && frame < trace.length - 1;
  const result = run?.results?.[mapIndex] || null;

  return {
    level, levelId, chooseLevel, code, editCode, resetCode, start, running, run, result, frame, replaying, skip,
    mapIndex, showMap, state: trace[frame] || null, canPlay, selfName, field, mine,
    progress: classProgress(coders), stars: run ? starsFor(level, run) : 0,
  };
}
