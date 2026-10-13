import { rng } from './util.js';

// Generated impulse responses for the convolution reverb. Each is stereo
// decorrelated noise split into three bands that decay at their own rate
// (lows linger, highs die first, like air and soft walls), plus sparse early
// reflections for the rooms. Seeds are fixed, so a given space sounds the
// same on every computer and in every export.

export const SPACES = Object.freeze({
  room: { label: 'Room', rt: [0.8, 0.7, 0.35], er: 12, erSpan: 0.04, attack: 0.002, seed: 11 },
  chamber: { label: 'Chamber', rt: [1.5, 1.25, 0.7], er: 10, erSpan: 0.05, attack: 0.004, seed: 23 },
  hall: { label: 'Hall', rt: [2.9, 2.4, 1.2], er: 16, erSpan: 0.08, attack: 0.012, seed: 37 },
  plate: { label: 'Plate', rt: [1.6, 1.8, 1.4], er: 0, erSpan: 0, attack: 0.001, seed: 51 },
});

/** Length in samples of the impulse for a space, decay scale and pre-delay. */
export function impulseLength(space, scale, preSamples, sampleRate) {
  const s = SPACES[space] || SPACES.hall;
  return preSamples + Math.ceil(Math.max(...s.rt) * scale * sampleRate);
}

/**
 * Yields the impulse in chunks of `chunk` frames as { l, r } Float32Arrays,
 * so the audio thread can build a new space a little at a time.
 */
export function* impulseChunks(space, { scale = 1, preSamples = 0, sampleRate, chunk }) {
  const s = SPACES[space] || SPACES.hall;
  const total = impulseLength(space, scale, preSamples, sampleRate);
  const rts = s.rt.map(t => t * scale);
  const decay = rts.map(t => Math.exp(-6.907755 / (t * sampleRate)));
  // Unit-energy scaling for uniform noise (variance 1/3) decaying with the mid RT.
  const norm = Math.sqrt((3 * 13.8155) / (rts[1] * sampleRate));
  const lowA = Math.exp((-2 * Math.PI * 250) / sampleRate);
  const highA = Math.exp((-2 * Math.PI * 4000) / sampleRate);
  const chans = [0, 1].map((c) => {
    const rand = rng(s.seed * 7 + c);
    const taps = new Map();
    for (let i = 0; i < s.er; i++) {
      const t = Math.floor((0.004 + rand() * s.erSpan) * sampleRate);
      taps.set(t, (rand() < 0.5 ? -1 : 1) * (0.9 - (0.6 * i) / Math.max(1, s.er)) * 0.5);
    }
    return { rand, taps, low: 0, mid: 0, env: [1, 1, 1] };
  });
  const attack = Math.max(1, s.attack * sampleRate);
  for (let start = 0; start < total; start += chunk) {
    const out = { l: new Float32Array(chunk), r: new Float32Array(chunk) };
    for (let c = 0; c < 2; c++) {
      const st = chans[c]; const buf = c === 0 ? out.l : out.r;
      for (let i = 0; i < chunk; i++) {
        const n = start + i;
        if (n < preSamples || n >= total) continue;
        const t = n - preSamples;
        const x = st.rand() * 2 - 1;
        st.low = x * (1 - lowA) + st.low * lowA;
        const rest = x - st.low;
        st.mid = rest * (1 - highA) + st.mid * highA;
        const high = rest - st.mid;
        const v = st.low * st.env[0] + st.mid * st.env[1] + high * st.env[2];
        st.env[0] *= decay[0]; st.env[1] *= decay[1]; st.env[2] *= decay[2];
        const fadeIn = t < attack ? t / attack : 1;
        buf[i] = v * norm * fadeIn + (st.taps.get(t) || 0) * norm * 12;
      }
    }
    yield out;
  }
}

/** Whole impulse at once (export and tests). */
export function generateImpulse(space, opts) {
  const parts = [...impulseChunks(space, { ...opts, chunk: 4096 })];
  const len = impulseLength(space, opts.scale ?? 1, opts.preSamples ?? 0, opts.sampleRate);
  const l = new Float32Array(len); const r = new Float32Array(len);
  parts.forEach((p, i) => {
    const n = Math.min(4096, len - i * 4096);
    l.set(p.l.subarray(0, n), i * 4096); r.set(p.r.subarray(0, n), i * 4096);
  });
  return { l, r };
}
