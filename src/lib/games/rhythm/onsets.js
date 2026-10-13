// Chart any song: find the moments the music hits (onsets) in decoded audio
// and give each a lane. Pure: takes decoded audio, never touches the DOM.
//
// Onset strength is the rise in loudness from one short frame to the next;
// a peak counts when it stands well above the music around it. The lane
// comes from how bright the sound is (its zero-crossing rate), so cymbals
// and high notes land right, kicks and bass land left.
import { DIFFICULTIES, LANES } from './sequence.js';

const HOP = 512;
const GAPS = { easy: 0.42, normal: 0.24, hard: 0.13 };

// Loudness (log energy) and brightness (zero-crossing rate) of each short
// frame. Reads the channels in place and mixes on the fly, so a long track
// never needs a second full-length copy in memory.
function frames(channels, length) {
  const count = Math.floor(length / HOP);
  const energy = new Float32Array(count);
  const zcr = new Float32Array(count);
  const nc = channels.length;
  for (let f = 0; f < count; f += 1) {
    let e = 0;
    let z = 0;
    let prev = 0;
    const start = f * HOP;
    for (let i = start; i < start + HOP; i += 1) {
      let v = 0;
      for (let c = 0; c < nc; c += 1) v += channels[c][i];
      v /= nc;
      e += v * v;
      if (i > start && (v >= 0) !== (prev >= 0)) z += 1;
      prev = v;
    }
    energy[f] = Math.log10(1e-9 + e / HOP);
    zcr[f] = z / HOP;
  }
  return { energy, zcr };
}

/**
 * The per-frame features of a decoded track (an AudioBuffer or anything with
 * numberOfChannels, length, sampleRate and getChannelData). Work it out once,
 * then chart every difficulty from it with chartFromFeatures.
 */
export function audioFeatures(buffer) {
  const nc = Math.max(1, buffer.numberOfChannels || 1);
  const channels = Array.from({ length: nc }, (_, c) => buffer.getChannelData(c));
  return { ...frames(channels, buffer.length), frameTime: HOP / buffer.sampleRate };
}

/**
 * Find onsets and build a chart: [{ id, t, lane }]. `difficulty` sets the
 * smallest gap between notes.
 */
export function chartFromAudio(samples, sampleRate, difficulty = 'normal') {
  return chartFromFeatures({ ...frames([samples], samples.length), frameTime: HOP / sampleRate }, difficulty);
}

/** The chart for one difficulty from audioFeatures(). */
export function chartFromFeatures({ energy, zcr, frameTime }, difficulty = 'normal') {
  const diffId = DIFFICULTIES.some((d) => d.id === difficulty) ? difficulty : 'normal';
  const n = energy.length;
  const flux = new Float32Array(n);
  for (let i = 1; i < n; i += 1) flux[i] = Math.max(0, energy[i] - energy[i - 1]);
  const half = Math.max(4, Math.round(0.35 / frameTime));
  const minGap = GAPS[diffId];
  const picks = [];
  for (let i = 1; i < n - 1; i += 1) {
    if (flux[i] <= flux[i - 1] || flux[i] < flux[i + 1]) continue;
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j += 1) { sum += flux[j]; count += 1; }
    const local = sum / count;
    if (flux[i] < local * 1.6 + 0.08) continue;
    const t = i * frameTime;
    const prev = picks[picks.length - 1];
    if (prev && t - prev.t < minGap) {
      if (flux[i] > prev.strength) picks[picks.length - 1] = { t, strength: flux[i], zcr: zcr[i] };
      continue;
    }
    picks.push({ t, strength: flux[i], zcr: zcr[i] });
  }
  // Lanes by brightness rank, so every lane gets used whatever the song.
  const sorted = picks.map((p) => p.zcr).sort((a, b) => a - b);
  const laneOf = (z) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < z) lo = mid + 1; else hi = mid; }
    return Math.min(LANES - 1, Math.floor((lo / Math.max(1, sorted.length)) * LANES));
  };
  return picks.map((p, id) => ({ id, t: Math.round(p.t * 1000) / 1000, lane: laneOf(p.zcr) }));
}
