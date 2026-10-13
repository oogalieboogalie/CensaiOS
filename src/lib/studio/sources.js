// Sources for the engine: audio clips read from decoded assets with short
// edge fades (a clip that starts or stops mid-waveform would click), and
// note events from piano-roll clips.

const EDGE = 0.003; // seconds of fade every clip gets at both edges

/**
 * Adds every audio clip overlapping [t0, t0 + len) (timeline samples) into
 * L/R at `offset`. Returns true when anything was written.
 */
export function renderAudioClips(clips, assets, L, R, offset, len, t0, spb, sr) {
  let wrote = false;
  for (const c of clips) {
    const data = assets.get(c.asset);
    if (!data) continue;
    const start = c.start * spb;
    const length = c.dur * sr;
    const end = start + length;
    if (end <= t0 || start >= t0 + len) continue;
    const left = data[0]; const right = data[1] || data[0];
    const gain = Math.pow(10, c.gain / 20);
    const fin = Math.max(EDGE, c.fadeIn) * sr; const fout = Math.max(EDGE, c.fadeOut) * sr;
    const from = Math.max(0, Math.ceil(start - t0));
    const to = Math.min(len, Math.ceil(end - t0));
    const srcBase = c.offset * sr - start;
    for (let i = from; i < to; i++) {
      const t = t0 + i;
      const s = Math.floor(srcBase + t);
      if (s < 0 || s >= left.length) continue;
      const into = t - start; const left2 = end - t;
      const fade = Math.min(1, into / fin, left2 / fout);
      const g = gain * fade;
      L[offset + i] += left[s] * g;
      R[offset + i] += right[s] * g;
    }
    wrote = true;
  }
  return wrote;
}

/** Flattens a synth track's clips into absolute note spans in beats, sorted by start. */
export function collectNotes(track) {
  const out = [];
  for (const c of track.clips) {
    for (const nt of c.notes || []) {
      if (nt.t >= c.len) continue;
      const on = c.start + nt.t;
      const off = c.start + Math.min(c.len, nt.t + nt.d);
      out.push({ on, off, p: nt.p, v: nt.v });
    }
  }
  return out.sort((a, b) => a.on - b.on);
}

/**
 * Note on/off events inside [t0, t1) timeline samples, as offsets from t0.
 * Offs sort before ons at the same sample so a repeated note retriggers.
 */
export function noteEvents(notes, t0, t1, spb) {
  const events = [];
  for (const nt of notes) {
    const on = nt.on * spb; const off = nt.off * spb;
    if (on >= t1) break;
    if (on >= t0) events.push({ at: Math.floor(on - t0), on: true, p: nt.p, v: nt.v });
    if (off >= t0 && off < t1) events.push({ at: Math.floor(off - t0), on: false, p: nt.p });
  }
  return events.sort((a, b) => a.at - b.at || (a.on === b.on ? 0 : a.on ? 1 : -1));
}
