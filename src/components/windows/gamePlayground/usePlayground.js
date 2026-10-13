import React from 'react';
import { classifyUrl, frameSandbox } from '../../../lib/games/playground/classify.js';
import { planFromFiles, planFromSample, sampleById, sanitizeRecord } from '../../../lib/games/playground/catalog.js';
import { claimKeyboard, releaseKeyboard } from '../../../lib/keyboardClaim.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { decode, readTheme, understand } from './gameFiles.js';

export { readDropped, readPicked, understand } from './gameFiles.js';

export const RUNNER_URL = '/playground/runner.html';
export const RUNNER_SANDBOX = 'allow-scripts allow-pointer-lock';

/**
 * The Game Playground's state: which game the window shows (shared on the
 * window record), the files only this viewer picked, the runner frame and
 * the keyboard claim.
 */
export function usePlayground({ win, onUpdate }) {
  const containerRef = React.useRef(null);
  const frameRef = React.useRef(null);
  // What I chose shows at once; the shared record catches up a moment later.
  const [mine, setMine] = React.useState(null);
  const record = React.useMemo(() => {
    const shared = sanitizeRecord(win.playground);
    if (!mine) return shared;
    return !shared || (shared.at || 0) < (mine.at || 0) ? mine : shared;
  }, [win.playground, mine]);
  const recordKey = record ? JSON.stringify(record.source) : '';
  const [local, setLocal] = React.useState(null); // { list, info, name } picked on this computer
  const [running, setRunning] = React.useState(false);
  const [runKey, setRunKey] = React.useState(0);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [captured, setCaptured] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const me = getSelf();

  const hasLocal = Boolean(local && record?.source.type === 'local' && local.name === record.source.name);
  const canRun = Boolean(record && (record.source.type !== 'local' || hasLocal));
  const urlInfo = record?.source.type === 'url' ? classifyUrl(record.source.url) : null;
  const direct = urlInfo?.mode === 'frame';

  const release = React.useCallback(() => {
    releaseKeyboard(win.id);
    setCaptured(false);
  }, [win.id]);

  const focusGame = React.useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.focus();
    try { frame.contentWindow?.focus(); } catch { /* cross-origin */ }
    claimKeyboard(win.id);
    setCaptured(true);
  }, [win.id]);

  // The game holds the keyboard while its frame has focus. Keys typed into a
  // frame never reach the canvas anyway; the claim keeps the canvas's own
  // listeners (and other windows) quiet and lets the window show it.
  React.useEffect(() => {
    if (!running) return undefined;
    const onBlur = () => {
      setTimeout(() => {
        if (frameRef.current && document.activeElement === frameRef.current) { claimKeyboard(win.id); setCaptured(true); }
      }, 0);
    };
    const onFocus = () => release();
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); };
  }, [running, release, win.id]);

  React.useEffect(() => () => releaseKeyboard(win.id), [win.id]);

  // Messages from our runner (never from a hosted page).
  const planRef = React.useRef(null);
  planRef.current = async () => {
    const origin = window.location.origin;
    const theme = readTheme(containerRef.current);
    if (record.source.type === 'sample') {
      const sample = sampleById(record.source.id);
      return planFromSample(sample, {
        origin, theme,
        fetchText: async (url) => { const res = await fetch(url); if (!res.ok) throw new Error(`Could not load ${url}`); return res.text(); },
      });
    }
    if (record.source.type === 'local') return planFromFiles(local.list, local.info, { origin, theme, decode });
    const res = await fetch(record.source.url);
    if (!res.ok) throw new Error(`The link answered ${res.status}.`);
    const data = new Uint8Array(await res.arrayBuffer());
    const name = urlInfo.name || 'game';
    const { list, info } = understand([{ path: name.includes('.') ? name : `${name}.zip`, data }]);
    if (info.error) throw new Error(info.error);
    return planFromFiles(list, info, { origin, theme, decode });
  };

  React.useEffect(() => {
    if (!running || direct) return undefined;
    const onMessage = (event) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.__hbPlay !== 1) return;
      if (msg.type === 'ready') {
        setStatus('Loading…');
        planRef.current().then((plan) => {
          frame.contentWindow?.postMessage({ __hbPlay: 1, type: 'boot', plan }, '*');
          focusGame();
        }).catch((err) => { setError(err?.message || 'The game could not start.'); setStatus(''); });
      } else if (msg.type === 'status') setStatus(msg.text || '');
      else if (msg.type === 'started') setStatus('');
      else if (msg.type === 'error') { setError(msg.text || 'The game stopped.'); setStatus(''); }
      else if (msg.type === 'escape') { containerRef.current?.focus({ preventScroll: true }); release(); }
      else if (msg.type === 'focus') { claimKeyboard(win.id); setCaptured(true); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [running, direct, runKey, focusGame, release, win.id]);

  const runningKey = React.useRef('');
  const share = React.useCallback((next) => {
    const value = { ...next, by: me.label || undefined, at: Date.now() };
    const clean = sanitizeRecord(value);
    runningKey.current = clean ? JSON.stringify(clean.source) : '';
    setMine(clean);
    onUpdate?.({ playground: value });
  }, [onUpdate, me.label]);

  // Someone else switched the game: stop the old one and offer the new one.
  React.useEffect(() => {
    if (running && runningKey.current && runningKey.current !== recordKey) { setRunning(false); releaseKeyboard(win.id); setCaptured(false); }
    if (!running) runningKey.current = '';
  }, [recordKey, running, win.id]);

  const start = React.useCallback(() => {
    runningKey.current = recordKey;
    setError('');
    setStatus(direct ? '' : 'Loading…');
    setPicking(false);
    setRunning(true);
    setRunKey((k) => k + 1);
  }, [direct, recordKey]);

  const stop = React.useCallback(() => {
    setRunning(false);
    setStatus('');
    release();
  }, [release]);

  const chooseSample = React.useCallback((id) => {
    const sample = sampleById(id);
    if (!sample) return;
    share({ engine: sample.engine, source: { type: 'sample', id }, title: sample.title });
    setError('');
    setPicking(false);
    setRunning(true);
    setRunKey((k) => k + 1);
  }, [share]);

  const chooseFiles = React.useCallback(async (list, label) => {
    setError('');
    setBusy(true);
    try {
      const { list: files, info } = understand(list);
      if (info.error) { setError(info.error); return; }
      const name = label || files[0]?.path.split('/')[0] || 'Game';
      setLocal({ list: files, info, name });
      share({ engine: info.engine, source: { type: 'local', name }, title: name.replace(/\.(love|zip|html?|m?js)$/i, '') });
      setPicking(false);
      setRunning(true);
      setRunKey((k) => k + 1);
      if (info.note) setStatus(info.note);
    } catch (err) {
      setError(err?.message || 'Those files could not be read.');
    } finally {
      setBusy(false);
    }
  }, [share]);

  const chooseUrl = React.useCallback((value) => {
    const info = classifyUrl(value);
    if (info.error) { setError(info.error); return; }
    share({ engine: info.engine, source: { type: 'url', url: info.url }, title: info.name });
    setError('');
    setPicking(false);
    setRunning(true);
    setRunKey((k) => k + 1);
  }, [share]);

  const fullScreen = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else el.requestFullscreen?.().then(() => focusGame()).catch(() => undefined);
  }, [focusGame]);

  const frameProps = running && record
    ? (direct
      ? { src: record.source.url, sandbox: frameSandbox(record.source.url, window.location.origin) }
      : { src: RUNNER_URL, sandbox: RUNNER_SANDBOX })
    : null;

  return {
    containerRef, frameRef, record, local, hasLocal, canRun, running, runKey, status, error, captured, picking, busy,
    direct, frameProps, selfName: me.label || 'You',
    setPicking, setError, start, stop, restart: start, chooseSample, chooseFiles, chooseUrl, fullScreen, focusGame,
  };
}
