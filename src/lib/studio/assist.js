import { EFFECTS, EFFECT_TYPES, newEffect, normalizeEffect } from './effects.js';
import { SYNTH_PRESETS } from './dsp/synth.js';
import { fitToScale, keyLabel } from './musicKey.js';
import { MAX_NOTES } from './project.js';

// The Studio's "ask a model" box. The browser describes the song, the chosen
// track and the effects the Studio really has; the model (the person's own
// key, see server/routes/studio.js) answers with effects and settings, and
// for a synth track optionally notes. Only effects from the catalog can come
// back, and every setting is clamped to its real range before it is used.

export const MAX_PROMPT = 600;
export const MAX_CONTEXT = 7000;

function paramText(p) {
  if (p.kind === 'num') return `${p.key} ${p.min}..${p.max}${p.unit ? ` ${p.unit}` : ''}`;
  if (p.kind === 'choice') return `${p.key} one of ${p.options.join('|')}`;
  return `${p.key} true|false`;
}

/** One line per effect the Studio has, with each setting's real range. */
export function describeEffects() {
  return EFFECT_TYPES.map((type) => {
    const spec = EFFECTS[type];
    const params = spec.params.map(paramText);
    if (type === 'eq') params.push('bands: list of up to 5 {type lowcut|lowshelf|peak|highshelf|highcut, freq 20..20000, gain -24..24, q 0.1..18, on}');
    return `- ${type} (${spec.label}, ${spec.hint}): ${params.join('; ')}`;
  }).join('\n');
}

const fxText = fx => fx.map(f => `${f.type}${f.on ? '' : ' (off)'} ${JSON.stringify(Object.fromEntries(Object.entries(f.params).filter(([k]) => k !== 'bands')))}`).join('\n  ');

/** What the model is told about the song and the chosen track. */
export function assistContext(project, trackId) {
  const track = project.tracks.find(t => t.id === trackId);
  const fx = track ? track.fx : project.master.fx;
  const lines = [
    `Song: ${project.bpm} BPM, ${project.beatsPerBar} beats per bar, key ${keyLabel(project.key, project.scale)}.`,
    track
      ? `Chosen track: "${track.name}", ${track.kind === 'synth' ? `a synth track playing notes with the ${track.synth.preset} sound` : 'an audio track (recorded or imported sound)'}.`
      : 'Chosen track: the master (the whole mix).',
    `Its effects now, in order:${fx.length ? `\n  ${fxText(fx)}` : ' none'}`,
    `Effects the Studio has:\n${describeEffects()}`,
  ];
  if (track?.kind === 'synth') {
    const notes = track.clips.reduce((s, c) => s + c.notes.length, 0);
    lines.push(`This track has ${track.clips.length} clips with ${notes} notes. Synth sounds: ${Object.keys(SYNTH_PRESETS).join(', ')}. You may write new notes for it.`);
  }
  return lines.join('\n').slice(0, MAX_CONTEXT);
}

const num = (v, lo, hi, fb) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, +v)) : fb);

/** The model's notes, cleaned: pitch, start and length in beats from the clip start, loudness 0-1. */
export function cleanNotes(raw, maxLen = 64) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_NOTES).map(n => ({
    p: Math.round(num(n?.p, 0, 127, 60)), t: num(n?.t, 0, maxLen - 0.125, 0), d: num(n?.d, 1 / 32, 16, 0.5), v: num(n?.v, 0.05, 1, 0.8),
  }));
}

const clipEnd = (c, spb) => (c.kind === 'midi' ? c.start + c.len : c.start + c.dur / spb);

/** The playhead if the new clip fits there, else the first whole bar after the track's last clip. */
export function freeStart(project, track, atBeat, len) {
  const spb = 60 / project.bpm;
  const overlaps = track.clips.some(c => c.start < atBeat + len && clipEnd(c, spb) > atBeat);
  if (!overlaps) return atBeat;
  const end = track.clips.reduce((m, c) => Math.max(m, clipEnd(c, spb)), 0);
  return Math.ceil(end / project.beatsPerBar - 1e-9) * project.beatsPerBar;
}

/**
 * What the answer changes on the track: its new effect list, a new clip of
 * notes and a synth sound when the model wrote any, and a short list of what
 * was done for the notice. Unknown effects are dropped and counted.
 */
export function planAssist(project, trackId, reply, { atBeat = 0 } = {}) {
  const track = project.tracks.find(t => t.id === trackId) || null;
  const current = track ? track.fx : project.master.fx;
  const asked = Array.isArray(reply?.fx) ? reply.fx.slice(0, 8) : [];
  const made = asked.map(f => (EFFECTS[f?.type] ? normalizeEffect({ ...newEffect(f.type), params: f.params || {}, on: f.on !== false }) : null));
  const added = made.filter(Boolean);
  const skipped = made.length - added.length;
  const replace = reply?.fxMode === 'replace';
  const fx = (replace ? added : [...current, ...added]).slice(0, 8);
  const done = added.length ? [`${replace ? 'Set' : 'Added'} ${added.map(f => EFFECTS[f.type].label).join(', ')}`] : [];
  if (skipped) done.push(`skipped ${skipped} the Studio does not have`);
  // Only a real effect can change the chain: a "replace" with nothing usable must not empty it.
  const plan = { fx: added.length ? fx : null, clip: null, preset: null, done };
  if (track?.kind === 'synth') {
    const len = Math.round(num(reply?.len, 1, 64, 8));
    let notes = cleanNotes(reply?.notes, len);
    if (project.scaleLock) notes = fitToScale(notes, project.key, project.scale);
    if (notes.length) {
      plan.clip = { start: freeStart(project, track, atBeat, len), len, notes, name: 'From the model' };
      done.push(`wrote ${notes.length} notes over ${len} beats`);
    }
    if (SYNTH_PRESETS[reply?.preset] && reply.preset !== track.synth.preset) {
      plan.preset = reply.preset;
      done.push(`switched the sound to ${SYNTH_PRESETS[reply.preset].label}`);
    }
  }
  return plan;
}
