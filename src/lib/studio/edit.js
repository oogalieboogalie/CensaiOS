import { normalizeProject, normalizeTrack, newId, MAX_TRACKS } from './project.js';
import { newEffect } from './effects.js';

// Pure edits on a Studio project. Each returns a new normalised project, so
// the window can apply them locally and save the result to the board.

const mapTrack = (p, id, fn) => ({ ...p, tracks: p.tracks.map(t => (t.id === id ? fn(t) : t)) });
const target = (p, trackId) => (trackId === 'master' ? p.master : p.tracks.find(t => t.id === trackId));
const withFx = (p, trackId, fn) => (trackId === 'master'
  ? { ...p, master: { ...p.master, fx: fn(p.master.fx) } }
  : mapTrack(p, trackId, t => ({ ...t, fx: fn(t.fx) })));

export const edits = {
  set: (p, patch) => normalizeProject({ ...p, ...patch }),
  addTrack(p, kind) {
    if (p.tracks.length >= MAX_TRACKS) return p;
    const i = p.tracks.length;
    const t = normalizeTrack({ id: newId('track'), kind, synth: kind === 'synth' ? { preset: 'keys' } : undefined }, i);
    return normalizeProject({ ...p, tracks: [...p.tracks, t] });
  },
  removeTrack: (p, id) => normalizeProject({ ...p, tracks: p.tracks.filter(t => t.id !== id) }),
  track: (p, id, patch) => normalizeProject(mapTrack(p, id, t => ({ ...t, ...patch }))),
  solo: (p, id) => normalizeProject(mapTrack(p, id, t => ({ ...t, solo: !t.solo }))),
  synth: (p, id, patch) => normalizeProject(mapTrack(p, id, t => ({ ...t, synth: { ...t.synth, ...patch } }))),

  addClip(p, trackId, clip) {
    return normalizeProject(mapTrack(p, trackId, t => ({ ...t, clips: [...t.clips, { id: newId('clip'), ...clip }] })));
  },
  clip: (p, trackId, clipId, patch) => normalizeProject(mapTrack(p, trackId, t => ({ ...t, clips: t.clips.map(c => (c.id === clipId ? { ...c, ...patch } : c)) }))),
  removeClip: (p, trackId, clipId) => normalizeProject(mapTrack(p, trackId, t => ({ ...t, clips: t.clips.filter(c => c.id !== clipId) }))),
  /** Moves a clip to another track of the same kind. */
  moveClipTo(p, fromId, clipId, toId, start) {
    const from = p.tracks.find(t => t.id === fromId); const to = p.tracks.find(t => t.id === toId);
    const clip = from?.clips.find(c => c.id === clipId);
    if (!clip || !to || to.kind !== from.kind) return edits.clip(p, fromId, clipId, { start });
    const removed = mapTrack(p, fromId, t => ({ ...t, clips: t.clips.filter(c => c.id !== clipId) }));
    return normalizeProject(mapTrack(removed, toId, t => ({ ...t, clips: [...t.clips, { ...clip, start }] })));
  },
  notes: (p, trackId, clipId, notes) => edits.clip(p, trackId, clipId, { notes }),

  addFx: (p, trackId, type) => normalizeProject(withFx(p, trackId, fx => [...fx, newEffect(type)])),
  fx: (p, trackId, fxId, patch) => normalizeProject(withFx(p, trackId, fx => fx.map(f => (f.id === fxId ? { ...f, ...patch, params: { ...f.params, ...(patch.params || {}) } } : f)))),
  removeFx: (p, trackId, fxId) => normalizeProject(withFx(p, trackId, fx => fx.filter(f => f.id !== fxId))),
  moveFx(p, trackId, fxId, dir) {
    return normalizeProject(withFx(p, trackId, (fx) => {
      const i = fx.findIndex(f => f.id === fxId); const j = i + dir;
      if (i < 0 || j < 0 || j >= fx.length) return fx;
      const next = fx.slice(); [next[i], next[j]] = [next[j], next[i]];
      return next;
    }));
  },
  master: (p, patch) => normalizeProject({ ...p, master: { ...p.master, ...patch } }),
  limiter: (p, patch) => normalizeProject({ ...p, master: { ...p.master, limiter: { ...p.master.limiter, ...patch } } }),
  addAsset: (p, id, asset) => normalizeProject({ ...p, assets: { ...p.assets, [id]: asset } }),
};

export const fxTarget = target;

/** Rounds a beat position to the snap grid (0 = free). */
export function snapTo(beat, step) {
  return step > 0 ? Math.max(0, Math.round(beat / step) * step) : Math.max(0, beat);
}
