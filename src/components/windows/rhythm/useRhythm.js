import React from 'react';
import { SONGS, songById } from '../../../lib/games/rhythm/songs.js';
import { chartFor, sequence } from '../../../lib/games/rhythm/sequence.js';
import { createRun, multiplierFor, press, summary, sweep } from '../../../lib/games/rhythm/judge.js';
import { bestKey, cleanMatch, livePlayers, playerField, readPlayers, recordBest } from '../../../lib/games/rhythm/progress.js';
import { claimKeyboard, releaseKeyboard } from '../../../lib/keyboardClaim.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { createBand } from './synth.js';
import { useCustomTrack } from './useCustomTrack.js';
import { useLaneKeys } from './useLaneKeys.js';

export { KEY_LABELS } from './useLaneKeys.js';
import { drawHighway, readColors } from './render.js';

const LEAD_IN = 2.5;
const MATCH_DELAY_MS = 6000;
const LIVE_EVERY_MS = 1000;
const HUD_EVERY_MS = 60;

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'track';

/**
 * Rhythm Run for one window: song choice, the audio clock, the note
 * highway, keys and scoring, plus the board-wide bits (best scores, live
 * scores while someone plays, and "play together" countdowns).
 */
export function useRhythm({ win, onUpdate }) {
  const me = getSelf();
  const canPlay = me.canEdit !== false;
  const selfName = me.label || 'You';
  const field = playerField(selfName);
  const playersKey = React.useMemo(() => JSON.stringify(readPlayers(win)), [win]);
  const players = React.useMemo(() => JSON.parse(playersKey), [playersKey]);
  const match = React.useMemo(() => cleanMatch(win.match), [win.match]);
  const playersRef = React.useRef(players);
  playersRef.current = players;
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;

  const containerRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [songId, setSongId] = React.useState(SONGS[0].id);
  const [difficulty, setDifficulty] = React.useState('normal');
  const [phase, setPhase] = React.useState('menu');
  const [hud, setHud] = React.useState({ score: 0, combo: 0, mult: 1, last: null, progress: 0, countdown: 0 });
  const [result, setResult] = React.useState(null);
  const [volume, setVolume] = React.useState(0.8);

  const audio = React.useRef(null);
  const live = React.useRef(null);
  const getAudio = React.useCallback(() => {
    if (!audio.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      const master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      audio.current = { ctx, master, band: createBand(ctx, master), source: null };
    }
    return audio.current;
  }, [volume]);
  React.useEffect(() => { if (audio.current) audio.current.master.gain.value = volume; }, [volume]);
  const { custom, customNote, loadFile } = useCustomTrack({ getAudio, difficulty, onReady: () => setSongId('custom') });

  const songTitle = songId === 'custom' ? (custom?.name || 'Your track') : songById(songId)?.title;
  const scoreKey = songId === 'custom' ? bestKey(`custom-${slug(custom?.name)}`, difficulty) : bestKey(songId, difficulty);

  const writeLive = React.useCallback((value) => {
    if (!canPlay) return;
    const prev = playersRef.current[field] || { name: selfName, best: {}, live: null };
    updateRef.current?.({ [field]: { ...prev, name: selfName, live: value } });
  }, [canPlay, field, selfName]);

  const stopAudio = React.useCallback(() => {
    const a = audio.current;
    if (!a) return;
    a.band.stop();
    if (a.source) { try { a.source.stop(); } catch { /* not started */ } a.source = null; }
  }, []);

  const finish = React.useCallback((completed) => {
    const l = live.current;
    live.current = null;
    stopAudio();
    releaseKeyboard(win.id);
    if (!l) return;
    if (!completed) { writeLive(null); setPhase('menu'); return; }
    const sum = summary(l.run);
    setResult({ ...sum, title: l.title, key: l.key });
    setPhase('results');
    if (canPlay) {
      const next = recordBest(playersRef.current[field], selfName, l.key, { ...sum, at: Date.now() });
      updateRef.current?.({ [field]: next });
    }
  }, [stopAudio, win.id, writeLive, canPlay, field, selfName]);

  const start = React.useCallback(async ({ startAt = null, song: forcedSong, difficulty: forcedDiff } = {}) => {
    if (!canPlay || live.current) return;
    const a = getAudio();
    await a.ctx.resume();
    const diff = forcedDiff || difficulty;
    const id = forcedSong || songId;
    let chart;
    let duration;
    let title;
    const lead = startAt ? Math.max(0.6, (startAt - Date.now()) / 1000) : LEAD_IN;
    const songStart = a.ctx.currentTime + lead;
    stopAudio();
    if (id === 'custom') {
      if (!custom) return;
      chart = custom.charts[diff];
      duration = custom.buffer.duration;
      title = custom.name;
      const src = a.ctx.createBufferSource();
      src.buffer = custom.buffer;
      src.connect(a.master);
      src.start(songStart);
      a.source = src;
    } else {
      const song = songById(id);
      if (!song) return;
      const seq = sequence(song);
      chart = chartFor(song, diff);
      duration = seq.duration;
      title = song.title;
      a.band.start(seq.events, songStart, song.tone);
    }
    const key = id === 'custom' ? bestKey(`custom-${slug(title)}`, diff) : bestKey(id, diff);
    live.current = { run: createRun(chart), songStart, duration, title, key, pressed: [false, false, false, false], flashes: [], misses: 0 };
    setResult(null);
    setPhase('playing');
    claimKeyboard(win.id);
    containerRef.current?.focus({ preventScroll: true });
  }, [canPlay, getAudio, difficulty, songId, custom, stopAudio, win.id]);

  const playTogether = React.useCallback(() => {
    if (!canPlay || songId === 'custom') return;
    const startAt = Date.now() + MATCH_DELAY_MS;
    updateRef.current?.({ match: { song: songId, difficulty, startAt, by: selfName } });
    start({ startAt, song: songId, difficulty });
  }, [canPlay, songId, difficulty, selfName, start]);

  const joinMatch = React.useCallback(() => {
    if (!match) return;
    setSongId(match.song);
    setDifficulty(match.difficulty);
    start({ startAt: match.startAt, song: match.song, difficulty: match.difficulty });
  }, [match, start]);

  const now = () => {
    const a = audio.current;
    const l = live.current;
    if (!a || !l) return 0;
    const latency = (a.ctx.outputLatency || 0) + (a.ctx.baseLatency || 0);
    return a.ctx.currentTime - l.songStart - latency;
  };

  const hitLane = React.useCallback((lane) => {
    const l = live.current;
    if (!l) return;
    const t = now();
    const got = press(l.run, lane, t);
    if (got) l.flashes = [...l.flashes.filter((f) => t - f.at < 0.3), { lane, at: t }];
  }, []);

  // Keys while playing: D F J K hit, Escape quits.
  useLaneKeys(containerRef, phase === 'playing', {
    onLane: (lane, down) => { if (live.current) live.current.pressed[lane] = down; if (down) hitLane(lane); },
    onQuit: () => finish(false),
  });

  // The frame loop: judge misses, draw the road, report the score. It only
  // runs while a song plays; the menu and results get one still frame (and
  // another when the window is resized), so an idle window costs nothing.
  const playing = phase === 'playing';
  React.useEffect(() => {
    let frame = 0;
    let colors = null;
    let colorsAt = -Infinity;
    let hudAt = 0;
    let liveAt = 0;
    const draw = (ts) => {
      const canvas = canvasRef.current;
      const l = live.current;
      if (!canvas) return true;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      if (ts - colorsAt > 1000) { colors = readColors(canvas); colorsAt = ts; }
      const ctx = canvas.getContext('2d');
      const t = l ? now() : -1;
      if (l) {
        const before = l.run.counts.miss;
        sweep(l.run, t);
        if (l.run.counts.miss > before) audio.current?.band.flub();
        if (t > l.duration + 0.8) { finish(true); return false; }
      }
      if (ctx) drawHighway(ctx, { width: w, height: h, colors, chart: l ? l.run.chart : [], hitIds: l ? l.run.hit : new Set(), now: t, pressed: l ? l.pressed : [], flashes: l ? l.flashes : [] });
      if (l && ts - hudAt > HUD_EVERY_MS) {
        hudAt = ts;
        // Dev builds expose the run so browser tests can play it.
        if (import.meta.env?.DEV) (globalThis.__hbRhythm ||= {})[win.id] = { live: l, now, hitLane };
        setHud({ score: l.run.score, combo: l.run.combo, mult: multiplierFor(l.run.combo), last: l.run.last && t - l.run.last.at < 0.6 ? l.run.last : null, progress: Math.min(1, Math.max(0, t / l.duration)), countdown: t < 0 ? Math.ceil(-t) : 0 });
      }
      if (l && t >= 0 && ts - liveAt > LIVE_EVERY_MS) {
        liveAt = ts;
        writeLive({ song: l.title, score: l.run.score, combo: l.run.combo, at: Date.now() });
      }
      return true;
    };
    if (playing) {
      const loop = (ts) => { if (draw(ts)) frame = requestAnimationFrame(loop); };
      frame = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frame);
    }
    const still = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame((ts) => { colorsAt = -Infinity; draw(ts); }); };
    still();
    const ro = typeof ResizeObserver === 'function' && canvasRef.current ? new ResizeObserver(still) : null;
    ro?.observe(canvasRef.current);
    return () => { cancelAnimationFrame(frame); ro?.disconnect(); };
  }, [playing, finish, writeLive, hitLane, win.id]);

  React.useEffect(() => () => {
    stopAudio();
    releaseKeyboard(win.id);
    audio.current?.ctx.close().catch(() => undefined);
    audio.current = null;
  }, [stopAudio, win.id]);

  const [clock, setClock] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const pendingMatch = match && match.startAt > clock && phase !== 'playing' ? match : null;

  return {
    containerRef, canvasRef, songId, setSongId, difficulty, setDifficulty, custom, customNote, loadFile,
    phase, setPhase, hud, result, start, stop: () => finish(false), playTogether, joinMatch, pendingMatch,
    players, live: livePlayers(players, clock).filter((p) => p.field !== field), field, canPlay, selfName,
    songTitle, scoreKey, volume, setVolume, hitLane,
    pressLane: (lane, down) => { if (live.current) live.current.pressed[lane] = down; if (down) hitLane(lane); },
    secondsToMatch: pendingMatch ? Math.ceil((pendingMatch.startAt - clock) / 1000) : 0,
  };
}
