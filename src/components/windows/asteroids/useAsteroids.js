import React from 'react';
import { createAsteroidsSession } from '../../../lib/games/asteroids/session.js';
import { INPUT } from '../../../lib/games/asteroids/engine.js';
import { SHIP_ALIVE, SHIP_THRUST, pictureEvents } from '../../../lib/games/asteroids/wire.js';
import { createGameSound } from '../../../lib/games/sound.js';
import { loadSoundSettings, saveSoundSettings } from '../../../lib/games/soundSettings.js';
import { claimKeyboard, releaseKeyboard } from '../../../lib/keyboardClaim.js';
import { getCollaborationClientId } from '../../../lib/collaboration/clientIdentity.js';
import { sendGameMessage } from '../../../lib/collaboration/liveText.js';
import { useBoardEvent } from '../../../lib/collaboration/boardEvents.js';
import { getPresentClientIds, getSelf } from '../../../lib/modules/presenceRoster.js';
import { drawPicture, readGameColors, sparks } from './render.js';

const KEY_BITS = {
  ArrowLeft: INPUT.LEFT, KeyA: INPUT.LEFT,
  ArrowRight: INPUT.RIGHT, KeyD: INPUT.RIGHT,
  ArrowUp: INPUT.THRUST, KeyW: INPUT.THRUST,
  Space: INPUT.FIRE,
};
const VIEW_EVERY_MS = 120;

/**
 * Asteroids in a window (spec 11): the game loop, keyboard capture, sound and
 * the link to everyone else on the board. Returns refs for the container and
 * canvas plus what the overlay needs.
 */
export function useAsteroids({ win, onUpdate }) {
  const containerRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const selfId = React.useMemo(() => getCollaborationClientId(), []);
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;
  const session = React.useMemo(() => createAsteroidsSession({
    windowId: String(win.id), selfId, send: sendGameMessage, update: (patch) => updateRef.current?.(patch),
  }), [win.id, selfId]);
  const [view, setView] = React.useState(() => session.view());
  const [captured, setCaptured] = React.useState(false);
  const [sound, setSoundState] = React.useState(loadSoundSettings);
  const audio = React.useMemo(() => createGameSound(loadSoundSettings()), []);
  const keys = React.useRef(new Set());

  const me = getSelf();
  React.useEffect(() => {
    session.sync({ match: win.match || null, highScores: win.highScores || [], canPlay: me.canEdit !== false, selfName: me.label || 'Player', present: getPresentClientIds() });
  }, [session, win.match, win.highScores, me.canEdit, me.label]);

  useBoardEvent('game.frame', (message) => session.receiveFrame(message));
  useBoardEvent('game.input', (message) => session.receiveInput(message));

  const setSound = React.useCallback((patch) => {
    setSoundState((current) => {
      const next = saveSoundSettings({ ...current, ...patch });
      audio.configure(next);
      return next;
    });
  }, [audio]);

  const release = React.useCallback(() => {
    keys.current.clear();
    session.setKeys(0);
    session.setPaused(true);
    audio.thrust(false);
    releaseKeyboard(win.id);
    setCaptured(false);
  }, [session, audio, win.id]);

  // Click to play (or resume): the window takes the keyboard until Escape.
  const capture = React.useCallback(() => {
    audio.unlock();
    const role = session.play();
    if (role === 'watch') return;
    session.setPaused(false);
    claimKeyboard(win.id);
    setCaptured(true);
    containerRef.current?.focus({ preventScroll: true });
    setView(session.view());
  }, [session, audio, win.id]);

  const leave = React.useCallback(() => {
    release();
    session.leave();
    setView(session.view());
  }, [release, session]);

  React.useEffect(() => () => {
    session.leave();
    releaseKeyboard(win.id);
    audio.close();
  }, [session, audio, win.id]);

  // Keys go to the game only while it holds the keyboard; nothing reaches the
  // canvas shortcuts meanwhile. Escape, a click elsewhere or leaving the tab
  // gives the keyboard back.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !captured) return undefined;
    const onDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); release(); return; }
      if (e.key === 'Tab') return;
      e.stopPropagation();
      const bit = KEY_BITS[e.code];
      if (!bit) return;
      e.preventDefault();
      keys.current.add(e.code);
      session.setKeys([...keys.current].reduce((sum, code) => sum | KEY_BITS[code], 0));
    };
    const onUp = (e) => {
      e.stopPropagation();
      if (!KEY_BITS[e.code]) return;
      keys.current.delete(e.code);
      session.setKeys([...keys.current].reduce((sum, code) => sum | KEY_BITS[code], 0));
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
  }, [captured, release, session]);

  // The loop: simulate (host), draw at the screen's rate, play sounds for
  // what changed. A slow interval keeps a host's match going in a hidden tab.
  React.useEffect(() => {
    let frame = 0;
    let lastDraw = performance.now();
    let lastView = 0;
    let colorsAt = -Infinity;
    let colors = null;
    let seen = null;
    const particles = [];
    const keepAlive = setInterval(() => session.tick(), 50);
    const loop = (t) => {
      frame = requestAnimationFrame(loop);
      session.tick();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      if (t - colorsAt > 1000) { colors = readGameColors(canvas); colorsAt = t; }
      const latest = session.latest();
      if (latest !== seen) {
        const mine = latest?.ships.find((s) => s.id === selfId);
        const events = pictureEvents(seen, latest);
        events.broken.slice(0, 3).forEach((rock) => audio.explode(4 - rock.size));
        events.broken.forEach((rock) => particles.push(...sparks(rock.x, rock.y, 4 + rock.size * 3, colors.inkSoft, rock.id)));
        events.destroyed.forEach((ship) => {
          particles.push(...sparks(ship.x, ship.y, 26, ship.id === selfId ? colors.accent : colors.ink, ship.slot + 1));
          if (ship.id === selfId) audio.shipDown(); else audio.explode(3);
        });
        events.fired.slice(0, 2).forEach((shot) => audio.shoot(mine && shot.slot === mine.slot));
        audio.thrust(Boolean(mine && (mine.flags & SHIP_ALIVE) && (mine.flags & SHIP_THRUST)));
        seen = latest;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) drawPicture(ctx, session.picture(), { width: w, height: h, dpr, colors, selfId, particles, dt: Math.min(0.1, (t - lastDraw) / 1000), time: t / 1000 });
      lastDraw = t;
      if (t - lastView > VIEW_EVERY_MS) {
        lastView = t;
        session.sync({ present: getPresentClientIds() });
        const next = session.view();
        setView((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      }
    };
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); clearInterval(keepAlive); };
  }, [session, audio, selfId]);

  // A finished match hands the keyboard back.
  React.useEffect(() => {
    if (view.role === 'idle' && captured) release();
  }, [view.role, captured, release]);

  const fullScreen = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else el.requestFullscreen?.().catch(() => undefined);
  }, []);

  return { containerRef, canvasRef, view, captured, capture, leave, sound, setSound, fullScreen, canPlay: me.canEdit !== false, selfId, selfName: me.label || 'Player' };
}
