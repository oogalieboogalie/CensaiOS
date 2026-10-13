import React from 'react';
import { buildTrack, gridSpot, locate } from '../../../lib/games/racetrack/track.js';
import { createCar, INPUT, speedOf, STEP, stepCar } from '../../../lib/games/racetrack/car.js';
import { createLaps, currentLap, mergeBestLaps, updateLaps } from '../../../lib/games/racetrack/laps.js';
import { CAR_MESSAGE, SEND_EVERY_MS, createRivals } from '../../../lib/games/racetrack/wire.js';
import { claimKeyboard, releaseKeyboard } from '../../../lib/keyboardClaim.js';
import { sendGameMessage } from '../../../lib/collaboration/liveText.js';
import { useBoardEvent } from '../../../lib/collaboration/boardEvents.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { addSkid, drawRace, readRaceColors } from './render.js';

const KEY_BITS = {
  ArrowUp: INPUT.UP, KeyW: INPUT.UP,
  ArrowDown: INPUT.DOWN, KeyS: INPUT.DOWN,
  ArrowLeft: INPUT.LEFT, KeyA: INPUT.LEFT,
  ArrowRight: INPUT.RIGHT, KeyD: INPUT.RIGHT,
  Space: INPUT.BRAKE,
};
const HUD_EVERY_MS = 100;
const IDLE_SEND_MS = 1000;

/**
 * Driving a drawn track in a window: the fixed-step loop, keyboard capture,
 * lap timing and the link to everyone else on the board. Each browser owns
 * its own car; teammates' cars arrive as game.car messages.
 */
export function useRacetrack({ win, onUpdate }) {
  const containerRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  // Remote edits to the window (a teammate's best lap, a move) hand back a
  // fresh copy of the track; only a different road may reset the car.
  const trackKey = React.useMemo(() => JSON.stringify(win.track || null), [win.track]);
  const track = React.useMemo(() => buildTrack(JSON.parse(trackKey)), [trackKey]);
  const me = getSelf();
  const canPlay = me.canEdit !== false;
  const selfName = me.label || 'You';
  const winRef = React.useRef(win);
  winRef.current = win;
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;

  const sim = React.useRef(null);
  const reset = React.useCallback(() => {
    const best = sim.current?.laps.best ?? null;
    const laps = createLaps();
    laps.best = best;
    sim.current = { car: track ? createCar(gridSpot(track)) : null, laps, keys: 0, clock: 0, skids: [], driven: false };
  }, [track]);
  if (!sim.current) reset();
  React.useEffect(() => { reset(); }, [reset]);

  const rivals = React.useMemo(() => createRivals(), []);
  const [hud, setHud] = React.useState({ lap: 0, time: 0, last: null, best: null, laps: 0, offRoad: false, started: false, rivals: [] });
  const [captured, setCaptured] = React.useState(false);
  const [flash, setFlash] = React.useState(null);

  useBoardEvent(CAR_MESSAGE, (message) => {
    if (message?.windowId === String(win.id)) rivals.receive(message, performance.now());
  });

  const send = React.useCallback((extra = {}) => {
    const s = sim.current;
    if (!canPlay || !s?.car) return;
    sendGameMessage({
      type: CAR_MESSAGE, windowId: String(win.id), x: s.car.x, y: s.car.y, a: s.car.a,
      lap: s.laps.laps, best: s.laps.best ?? undefined, name: selfName, ...extra,
    });
  }, [canPlay, win.id, selfName]);

  const release = React.useCallback(() => {
    if (sim.current) sim.current.keys = 0;
    releaseKeyboard(win.id);
    setCaptured(false);
  }, [win.id]);

  const capture = React.useCallback(() => {
    if (!canPlay || !track) return;
    claimKeyboard(win.id);
    setCaptured(true);
    containerRef.current?.focus({ preventScroll: true });
  }, [canPlay, track, win.id]);

  const restart = React.useCallback(() => {
    reset();
    send();
    capture();
  }, [reset, send, capture]);

  React.useEffect(() => () => {
    if (sim.current?.driven) sendGameMessage({ type: CAR_MESSAGE, windowId: String(win.id), gone: true });
    releaseKeyboard(win.id);
  }, [win.id]);

  // While the window holds the keyboard, keys drive the car and nothing
  // reaches the canvas shortcuts. Escape, a click elsewhere or leaving the
  // tab hands the keyboard back.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !captured) return undefined;
    const held = new Set();
    const apply = () => { sim.current.keys = [...held].reduce((sum, code) => sum | KEY_BITS[code], 0); };
    const onDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); release(); return; }
      if (e.key === 'Tab') return;
      e.stopPropagation();
      if (e.code === 'KeyR') { e.preventDefault(); held.clear(); reset(); send(); return; }
      if (!KEY_BITS[e.code]) return;
      e.preventDefault();
      held.add(e.code);
      apply();
    };
    const onUp = (e) => {
      e.stopPropagation();
      if (!KEY_BITS[e.code]) return;
      held.delete(e.code);
      apply();
    };
    const onPointerOutside = (e) => { if (!el.contains(e.target)) release(); };
    const onHidden = () => { if (document.visibilityState === 'hidden') release(); };
    el.addEventListener('keydown', onDown);
    el.addEventListener('keyup', onUp);
    el.addEventListener('blur', release);
    window.addEventListener('blur', release);
    document.addEventListener('pointerdown', onPointerOutside, true);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      el.removeEventListener('keydown', onDown);
      el.removeEventListener('keyup', onUp);
      el.removeEventListener('blur', release);
      window.removeEventListener('blur', release);
      document.removeEventListener('pointerdown', onPointerOutside, true);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [captured, release, reset, send]);

  // A finished lap that beats your best goes on the board's table.
  const recordLap = React.useCallback((seconds) => {
    const entry = { name: selfName, ms: Math.round(seconds * 1000), at: Date.now() };
    const table = winRef.current.bestLaps || [];
    const mine = table.find((row) => row.name === selfName);
    if (mine && mine.ms <= entry.ms) return;
    updateRef.current?.({ bestLaps: mergeBestLaps(table, entry) });
  }, [selfName]);

  React.useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let lastSend = 0;
    let lastHud = 0;
    let colorsAt = -Infinity;
    let colors = null;
    const course = {};
    const loop = (t) => {
      frame = requestAnimationFrame(loop);
      const s = sim.current;
      acc += Math.min(0.25, (t - last) / 1000);
      last = t;
      let offRoad = false;
      if (track && s.car) {
        while (acc >= STEP) {
          acc -= STEP;
          s.clock += STEP;
          const here = locate(track, s.car.x, s.car.y);
          offRoad = here.dist > track.half;
          stepCar(s.car, s.keys, { onRoad: !offRoad, bounds: track.world });
          if (s.keys) s.driven = true;
          addSkid(s.skids, s.car, t);
          const lapped = updateLaps(s.laps, locate(track, s.car.x, s.car.y).s, track.length, s.clock);
          if (lapped.lap !== null) {
            if (lapped.best) recordLap(lapped.lap);
            setFlash({ lap: lapped.lap, best: lapped.best, at: t });
          }
        }
      } else acc = 0;
      const moving = s.car && speedOf(s.car) > 1;
      if (s.driven && (t - lastSend > (moving ? SEND_EVERY_MS : IDLE_SEND_MS))) { lastSend = t; send(); }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      if (t - colorsAt > 1000) { colors = readRaceColors(canvas); colorsAt = t; }
      const others = rivals.list(t);
      const ctx = canvas.getContext('2d');
      if (ctx) drawRace(ctx, { track, me: s.car, rivals: others, skids: s.skids, colors, width: w, height: h, dpr, course, now: t, selfLabel: 'You' });
      if (t - lastHud > HUD_EVERY_MS) {
        lastHud = t;
        // Dev builds expose the car so browser tests can drive it.
        if (import.meta.env?.DEV) (globalThis.__hbRace ||= {})[win.id] = { sim: s, track };
        const next = {
          lap: s.laps.started ? s.laps.laps + 1 : 0, time: currentLap(s.laps, s.clock), last: s.laps.last, best: s.laps.best,
          laps: s.laps.laps, offRoad, started: s.laps.started, speed: s.car ? Math.round(speedOf(s.car) / 3) : 0,
          rivals: others.map((r) => ({ id: r.id, name: r.name, lap: r.lap, best: r.best })),
        };
        setHud(next);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [track, rivals, send, recordLap, win.id]);

  const fullScreen = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else el.requestFullscreen?.().catch(() => undefined);
  }, []);

  return { containerRef, canvasRef, track, hud, captured, capture, release, restart, fullScreen, flash, canPlay, selfName };
}
