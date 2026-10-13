import React from 'react';
import { ISLAND_MESSAGE, normalizePresence, toPeer } from '../../../lib/games/driftholm/wire.js';
import { readSave, saveField } from '../../../lib/games/driftholm/save.js';
import { sendGameMessage } from '../../../lib/collaboration/liveText.js';
import { useBoardEvent } from '../../../lib/collaboration/boardEvents.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';

export const GAME_URL = '/games/driftholm/index.html';
// Saves are written to the shared window record at most this often, and at
// once for bank moves and when the window closes.
const SAVE_EVERY_MS = 4000;
const NAME_WAIT_MS = 5000;

/**
 * The Driftholm window's side of the game: it loads the island in a frame,
 * tells it who you are, carries every player's tick to everyone else on the
 * board and keeps your progress in your own field of the window record.
 */
export function useDriftholm({ win, onUpdate }) {
  // Who you are is known once the board has signed you in, which can be just
  // after this window appears on a fresh page; the game waits for it.
  const [who, setWho] = React.useState(() => getSelf());
  const canPlay = who.canEdit !== false;
  const name = who.label || 'Player';
  const windowId = String(win.id);
  const frameRef = React.useRef(null);
  const winRef = React.useRef(win);
  winRef.current = win;
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;

  const [status, setStatus] = React.useState('loading');
  const [problem, setProblem] = React.useState(null);
  const [hud, setHud] = React.useState(null);
  const sent = React.useRef(false);
  const pendingSave = React.useRef(null);
  const lastSaveAt = React.useRef(0);
  const urgent = React.useRef(false);
  const nameRef = React.useRef(name);

  const post = React.useCallback((msg) => {
    frameRef.current?.contentWindow?.postMessage({ source: 'driftholm-host', msg }, window.location.origin);
  }, []);

  const flushSave = React.useCallback(() => {
    const save = pendingSave.current;
    if (!save) return;
    pendingSave.current = null;
    lastSaveAt.current = Date.now();
    const who = nameRef.current;
    updateRef.current?.({ [saveField(who)]: { ...save, name: who, at: Date.now() } });
  }, []);

  React.useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin) return;
      const { source, kind, data } = event.data || {};
      if (source !== 'driftholm') return;
      if (kind === 'ready') {
        let waited = 0;
        const start = () => {
          const self = getSelf();
          if (!self.label && waited < NAME_WAIT_MS) {
            waited += 200;
            setTimeout(start, 200);
            return;
          }
          const label = self.label || 'Player';
          nameRef.current = label;
          setWho({ ...self });
          post({ t: 'init', name: label, can_play: self.canEdit !== false, save: readSave(winRef.current, label), seed: Math.floor(Math.random() * 2 ** 31) + 1 });
          setStatus('ready');
        };
        start();
      } else if (kind === 'hud') {
        setHud(data);
      } else if (kind === 'net' && canPlay && data) {
        sent.current = true;
        sendGameMessage({ type: ISLAND_MESSAGE, windowId, ...data });
      } else if (kind === 'save' && canPlay && data) {
        pendingSave.current = data;
        if (urgent.current || Date.now() - lastSaveAt.current > SAVE_EVERY_MS) {
          urgent.current = false;
          flushSave();
        }
      } else if (kind === 'problem') {
        setProblem(data?.error || 'The island could not start.');
        setStatus((s) => (s === 'ready' ? s : 'problem'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, canPlay, windowId, flushSave]);

  React.useEffect(() => {
    const id = setInterval(flushSave, SAVE_EVERY_MS);
    return () => {
      clearInterval(id);
      flushSave();
    };
  }, [flushSave]);

  React.useEffect(() => () => {
    if (sent.current) sendGameMessage({ type: ISLAND_MESSAGE, windowId, gone: true });
  }, [windowId]);

  useBoardEvent(ISLAND_MESSAGE, (message) => {
    if (message?.windowId !== windowId || !message.clientId) return;
    const clean = normalizePresence(message);
    if (!clean) return;
    if (clean.gone) post({ t: 'peer_gone', id: String(message.clientId) });
    else post({ t: 'peer', id: String(message.clientId), msg: toPeer(clean) });
  });

  const command = React.useCallback((cmd, extra = {}) => {
    post({ t: 'cmd', cmd, ...extra });
    // Bank moves and meals are worth keeping straight away: the next save goes out at once.
    if (cmd === 'deposit_all' || cmd === 'withdraw' || cmd === 'eat') urgent.current = true;
  }, [post]);

  const focusGame = React.useCallback(() => {
    frameRef.current?.contentWindow?.document?.getElementById('driftholm')?.focus({ preventScroll: true });
  }, []);

  return { frameRef, status, problem, hud, canPlay, name, command, focusGame };
}
