import { useCallback, useEffect, useRef, useState } from 'react';
import { devServerApi } from './devServerApi.js';

const BUSY = new Set(['preparing', 'pulling', 'starting', 'installing']);

/**
 * One Run dev window's container: start, follow its phase until the site
 * answers, keep it alive with a heartbeat while the window is open (the
 * server removes containers no window pings), stop.
 */
export function useDevServer({ name, onName, canChange = true }) {
  const [engine, setEngine] = useState({ checked: false, error: null, reason: null, defaults: null });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  const checkEngine = useCallback(async () => {
    try {
      const data = await devServerApi.list();
      setEngine({ checked: true, error: null, reason: null, defaults: data.defaults || null });
    } catch (err) {
      setEngine({ checked: true, error: err.message, reason: err.reason, defaults: null });
    }
  }, []);
  useEffect(() => { checkEngine(); }, [checkEngine]);

  const poll = useCallback(async () => {
    const current = nameRef.current;
    if (!current) return;
    try {
      const next = await devServerApi.status(current);
      if (nameRef.current === current) setStatus(next);
    } catch (err) {
      setStatus({ name: current, phase: 'error', message: err.message, reason: err.reason });
    }
  }, []);

  // Fast while starting, slow once the site answers.
  const phase = status?.phase;
  useEffect(() => {
    if (!name) { setStatus(null); return undefined; }
    poll();
    const every = !phase || BUSY.has(phase) ? 1500 : 5000;
    const t = setInterval(poll, every);
    return () => clearInterval(t);
  }, [name, phase, poll]);

  // Plain interval on purpose: a minimised app must still count as open.
  // Only the owner's window keeps it alive: a teammate's heartbeat would be refused.
  useEffect(() => {
    if (!name || !canChange) return undefined;
    const beat = () => devServerApi.heartbeat([name]).catch(() => {});
    beat();
    const t = setInterval(beat, 20_000);
    return () => clearInterval(t);
  }, [name, canChange]);

  const start = useCallback(async (opts) => {
    setBusy(true);
    setError(null);
    try {
      const started = await devServerApi.start(opts);
      setStatus({ name: started.name, phase: 'preparing' });
      onName(started.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [onName]);

  const stop = useCallback(async () => {
    const current = nameRef.current;
    if (!current) return;
    setBusy(true);
    try {
      await devServerApi.stop(current);
      setStatus({ name: current, phase: 'stopped' });
      onName(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [onName]);

  return { engine, checkEngine, status, busy, error, setError, start, stop, starting: BUSY.has(phase) };
}
