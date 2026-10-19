import React from 'react';
import { applyLegionEvents, emptyLegion, legionApi } from '../../../lib/legion/legionState.js';

const POLL_MS = 1200;
const MAX_BACKOFF_MS = 15_000;

/**
 * State for the Legion window. The run itself lives on the server, so the
 * window only keeps the run's id (saved on the window) and polls its events;
 * closing the window or reloading never stops the Legion.
 */
export function useLegion(win = {}, onUpdate) {
  const runId = win.legionRunId || null;
  const [run, setRun] = React.useState(null);
  const [state, setState] = React.useState(emptyLegion);
  const [error, setError] = React.useState('');
  const [browser, setBrowser] = React.useState(null);
  const cursor = React.useRef(0);

  React.useEffect(() => {
    cursor.current = 0;
    setState(emptyLegion());
    setRun(null);
    if (!runId) return undefined;
    let alive = true;
    let timer = null;
    let wait = POLL_MS;
    const tick = async () => {
      try {
        const data = await legionApi.read(runId, cursor.current);
        if (!alive) return;
        wait = POLL_MS;
        setError('');
        cursor.current = data.next ?? cursor.current;
        setRun(data);
        if (data.events?.length) setState((s) => applyLegionEvents(s, data.events));
        if (data.status === 'running') timer = setTimeout(tick, POLL_MS);
      } catch (failure) {
        if (!alive) return;
        // A blip (a restart, a dropped connection) must not freeze the view:
        // keep asking, a little less often each time.
        setError(failure.message);
        wait = Math.min(MAX_BACKOFF_MS, wait * 2);
        timer = setTimeout(tick, wait);
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);

  const start = React.useCallback(async ({ goal, models, model, askQuestions, specYaml, selfEducate }) => {
    setError('');
    try {
      const data = await legionApi.start({ goal, models, model, askQuestions, specYaml, selfEducate });
      setBrowser(data.browser);
      onUpdate?.({ legionRunId: data.run.id, legionGoal: goal || data.run.goal });
    } catch (failure) {
      setError(failure.message);
    }
  }, [onUpdate]);

  const act = (fn) => async (...args) => {
    setError('');
    try { await fn(...args); } catch (failure) { setError(failure.message); }
  };

  return {
    runId, run, state, error, browser,
    running: run?.status === 'running',
    start,
    answer: act((text) => legionApi.answer(runId, text)),
    stop: act(() => legionApi.stop(runId)),
    newRun: () => onUpdate?.({ legionRunId: null }),
    open: (id) => onUpdate?.({ legionRunId: id }),
  };
}
