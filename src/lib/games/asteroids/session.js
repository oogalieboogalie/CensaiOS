// One browser's seat at an Asteroids window (spec 11). No React, no timers:
// the window feeds it time, keys and socket messages and asks what to draw.
// Host-authoritative: whoever starts the match runs the only simulation and
// sends pictures; the others send keys. The shared window record (Yjs) only
// says who hosts (`match`) and keeps the scores.

import { STEP, addPlayer, createGame, removePlayer, setInput, standings, step } from './engine.js';
import { FRAME_INTERVAL_MS, decodeFrame, encodeFrame, interpolatePicture, pickPicture, pictureFromState } from './wire.js';
import { mergeHighScores } from '../leaderboard.js';

const STEP_MS = STEP * 1000;
const HEARTBEAT_MS = 200;
const PAUSED_FRAME_MS = 500;
const PLAYER_TIMEOUT_MS = 4000;
const HOST_TIMEOUT_MS = 5000;
const JUST_STARTED_MS = 8000;
const RENDER_DELAY_MS = 80;
const MAX_CATCH_UP_MS = 250;

export function createAsteroidsSession({ windowId, selfId, send = () => false, update = () => {}, now = () => Date.now() }) {
  let record = { match: null, highScores: [], canPlay: true, present: [], selfName: 'Player' };
  let role = 'idle';
  let host = null; // the host we play with (player) or watch
  let game = null; // host only
  let paused = false;
  let keys = 0;
  let clock = { last: 0, acc: 0, lastFrameAt: 0, lastBeatAt: 0, lastStepAt: 0, joinedAt: 0 };
  let pictures = []; // [{ picture, at }] newest last
  let results = null;
  const lastInputAt = new Map();

  const live = () => {
    const match = record.match;
    if (!match?.host) return false;
    if (match.host === selfId) return role === 'host';
    const heard = pictures.length && pictures[pictures.length - 1].from === match.host
      && now() - pictures[pictures.length - 1].at < HOST_TIMEOUT_MS;
    const fresh = now() - (Number(match.startedAt) || 0) < JUST_STARTED_MS;
    return Boolean(heard || (fresh && (record.present.length === 0 || record.present.includes(match.host))));
  };

  function remember(picture, from) {
    pictures.push({ picture, at: now(), from });
    if (pictures.length > 12) pictures = pictures.slice(-12);
  }

  function broadcast() {
    if (!game) return;
    send({ type: 'game.frame', windowId, ...encodeFrame(game, { paused }) });
    clock.lastFrameAt = now();
  }

  function startHosting() {
    const seed = (Math.floor(now()) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    game = createGame({ seed, players: [{ id: selfId, name: record.selfName }] });
    role = 'host';
    host = selfId;
    paused = false;
    results = null;
    pictures = [];
    lastInputAt.clear();
    clock = { last: now(), acc: 0, lastFrameAt: 0, lastBeatAt: 0, lastStepAt: now(), joinedAt: 0 };
    remember(pictureFromState(game, windowId), selfId);
    const match = { host: selfId, hostName: record.selfName, startedAt: now() };
    record = { ...record, match };
    update({ match });
    broadcast();
  }

  function joinHost(hostId) {
    role = 'player';
    host = hostId;
    results = null;
    keys = 0;
    send({ type: 'game.input', windowId, to: hostId, keys: 0, join: true });
    clock.lastBeatAt = now();
    clock.joinedAt = now();
  }

  function finish(final) {
    results = standings(final);
    const at = now();
    const scored = results.filter((r) => r.score > 0).map((r) => ({ name: r.name, score: r.score, wave: final.wave, at }));
    update({ match: null, ...(scored.length ? { highScores: mergeHighScores(record.highScores, scored) } : {}) });
  }

  function endHosting() {
    if (!game) return;
    if (game.status === 'playing') {
      send({ type: 'game.frame', windowId, ...encodeFrame({ ...game, status: 'ended' }) });
      finish(game);
    }
    game = null;
  }

  const session = {
    /** The window record changed (or who is on the board). */
    sync(next) {
      record = { ...record, ...next, present: Array.isArray(next.present) ? next.present : record.present };
      // Two people pressed Play at once: the shared doc kept one host; the
      // other quietly joins that match.
      if (role === 'host' && record.match?.host && record.match.host !== selfId) {
        game = null;
        joinHost(record.match.host);
      }
    },

    play() {
      if (!record.canPlay) return 'watch';
      if (role === 'host' && paused) { paused = false; clock.last = now(); return 'host'; }
      if (role !== 'idle') return role;
      if (live() && record.match.host !== selfId) { joinHost(record.match.host); return 'player'; }
      startHosting();
      return 'host';
    },

    leave() {
      if (role === 'host') {
        endHosting();
      } else if (role === 'player' && host) {
        send({ type: 'game.input', windowId, to: host, keys: 0, leave: true });
      }
      role = 'idle';
      keys = 0;
    },

    setKeys(bits) {
      if (bits === keys) return;
      keys = bits;
      if (role === 'host' && game) setInput(game, selfId, bits);
      if (role === 'player' && host) {
        send({ type: 'game.input', windowId, to: host, keys: bits, join: true });
        clock.lastBeatAt = now();
      }
    },

    /** Pausing only freezes a match you're playing alone. */
    setPaused(value) {
      if (role !== 'host' || !game) return false;
      const solo = Object.keys(game.ships).length <= 1;
      paused = Boolean(value) && solo;
      if (!paused) clock.last = now();
      broadcast();
      return paused;
    },

    receiveInput(message) {
      if (role !== 'host' || !game || message?.windowId !== windowId || message.to !== selfId) return;
      const id = String(message.clientId || '');
      if (!id || id === selfId) return;
      if (message.leave) { removePlayer(game, id); lastInputAt.delete(id); return; }
      if (!game.ships[id] && message.join && game.status === 'playing') {
        if (!addPlayer(game, { id, name: message.actor?.label || 'Player' })) return;
        paused = false;
      }
      if (!game.ships[id]) return;
      setInput(game, id, message.keys);
      lastInputAt.set(id, now());
    },

    receiveFrame(message) {
      if (role === 'host' || message?.windowId !== windowId) return;
      // Only the host named on the shared record (or the one we joined) may
      // send pictures; anyone else's are ignored.
      const from = String(message.clientId || '');
      if (from !== record.match?.host && from !== host) return;
      const picture = decodeFrame(message);
      if (!picture) return;
      remember(picture, from);
      if (role === 'player' && (picture.status === 'over' || picture.status === 'ended')) {
        results = picture.ships.map((s) => ({ id: s.id, name: s.name, score: s.score, slot: s.slot })).sort((a, b) => b.score - a.score);
        role = 'idle';
        host = null;
      }
    },

    /** Advance time: the host simulates and sends; players keep in touch. */
    tick() {
      const t = now();
      if (role === 'host' && game) {
        if (!paused && game.status === 'playing') {
          clock.acc += Math.min(MAX_CATCH_UP_MS, t - clock.last);
          while (clock.acc >= STEP_MS) {
            step(game);
            clock.acc -= STEP_MS;
            clock.lastStepAt = t;
            remember(pictureFromState(game, windowId, { paused }), selfId);
          }
          for (const [id, at] of lastInputAt) {
            if (t - at > PLAYER_TIMEOUT_MS) { removePlayer(game, id); lastInputAt.delete(id); }
          }
        }
        clock.last = t;
        if (t - clock.lastFrameAt >= (paused ? PAUSED_FRAME_MS : FRAME_INTERVAL_MS)) broadcast();
        if (game.status === 'over') {
          broadcast();
          remember(pictureFromState(game, windowId), selfId);
          finish(game);
          game = null;
          role = 'idle';
          host = null;
        }
      } else if (role === 'player' && host) {
        if (t - clock.lastBeatAt >= HEARTBEAT_MS) {
          send({ type: 'game.input', windowId, to: host, keys, join: true });
          clock.lastBeatAt = t;
        }
        // The host went quiet (closed the tab, lost the connection).
        const last = pictures[pictures.length - 1];
        const heardAt = last?.from === host ? Math.max(last.at, clock.joinedAt) : clock.joinedAt;
        if (t - heardAt > HOST_TIMEOUT_MS) { role = 'idle'; host = null; }
      }
    },

    /** The picture to draw now, eased between the last two received. */
    picture() {
      if (!pictures.length) return null;
      const newest = pictures[pictures.length - 1];
      if (role === 'host') {
        const prev = pictures[pictures.length - 2];
        return interpolatePicture(prev?.picture, newest.picture, (now() - clock.lastStepAt) / STEP_MS);
      }
      if (now() - newest.at > HOST_TIMEOUT_MS && !results) return null;
      return pickPicture(pictures, now() - RENDER_DELAY_MS);
    },

    /** The newest picture, for sounds and sparks. */
    latest() {
      return pictures.length ? pictures[pictures.length - 1].picture : null;
    },

    view() {
      const latest = session.latest();
      const match = record.match;
      return {
        role,
        paused,
        live: live(),
        hostName: match?.host && match.host !== selfId ? (match.hostName || 'Someone') : null,
        status: latest?.status || null,
        wave: latest?.wave || 0,
        ships: latest ? latest.ships.map((s) => ({ id: s.id, name: s.name, score: s.score, lives: s.lives, slot: s.slot })) : [],
        results,
        solo: role !== 'host' || !game || Object.keys(game.ships).length <= 1,
      };
    },
  };
  return session;
}

