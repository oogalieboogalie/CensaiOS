import { Equalizer, EQ_DEFAULT_BANDS, normalizeBand } from './dsp/eq.js';
import { Compressor, Limiter } from './dsp/dynamics.js';
import { Saturator, SATURATION_MODES } from './dsp/saturation.js';
import { Chorus, Delay } from './dsp/modulation.js';
import { AlgoReverb } from './dsp/reverb.js';
import { ConvReverb } from './dsp/convReverb.js';
import { SPACES } from './dsp/impulses.js';
import { DIVISIONS } from './dsp/util.js';

// The Studio's effect catalog. Each entry names its processor and declares
// its parameters (range, unit, curve), which drives both normalisation of
// saved projects and the knobs in the effects panel.

const num = (key, label, min, max, def, unit = '', curve = 'lin', step) => ({ key, label, kind: 'num', min, max, def, unit, curve, step });
const pick = (key, label, options, def) => ({ key, label, kind: 'choice', options, def });
const flag = (key, label, def) => ({ key, label, kind: 'flag', def });

export const EFFECTS = Object.freeze({
  eq: {
    label: 'EQ', hint: 'Five-band parametric EQ',
    create: sr => new Equalizer(sr),
    params: [num('out', 'Output', -24, 12, 0, 'dB')],
  },
  compressor: {
    label: 'Compressor', hint: 'Soft-knee compressor with makeup gain', meter: 'reduction',
    create: sr => new Compressor(sr),
    params: [
      num('threshold', 'Threshold', -60, 0, -18, 'dB'), num('ratio', 'Ratio', 1, 20, 4, ':1', 'log'),
      num('attack', 'Attack', 0.1, 100, 10, 'ms', 'log'), num('release', 'Release', 10, 1000, 120, 'ms', 'log'),
      num('knee', 'Knee', 0, 18, 6, 'dB'), num('makeup', 'Makeup', 0, 24, 0, 'dB'), num('mix', 'Mix', 0, 100, 100, '%'),
    ],
  },
  saturation: {
    label: 'Saturation', hint: 'Tape, tube or clip drive at 4x oversampling',
    create: sr => new Saturator(sr),
    params: [
      pick('mode', 'Curve', SATURATION_MODES, 'tape'), num('drive', 'Drive', 0, 36, 12, 'dB'),
      num('tone', 'Tone', 800, 20000, 12000, 'Hz', 'log'), num('output', 'Output', -24, 6, -3, 'dB'), num('mix', 'Mix', 0, 100, 100, '%'),
    ],
  },
  chorus: {
    label: 'Chorus', hint: 'Two-voice stereo chorus',
    create: sr => new Chorus(sr),
    params: [
      num('rate', 'Rate', 0.05, 8, 0.8, 'Hz', 'log'), num('depth', 'Depth', 0, 8, 3, 'ms'), num('delay', 'Delay', 3, 30, 12, 'ms'),
      num('feedback', 'Feedback', 0, 70, 0, '%'), num('mix', 'Mix', 0, 100, 50, '%'),
    ],
  },
  delay: {
    label: 'Delay', hint: 'Tempo-synced echo with filtered repeats',
    create: sr => new Delay(sr),
    params: [
      flag('sync', 'Sync', true), pick('division', 'Time', Object.keys(DIVISIONS), '1/8d'), num('ms', 'Free time', 1, 2000, 375, 'ms', 'log'),
      num('feedback', 'Feedback', 0, 95, 35, '%'), num('lowcut', 'Low cut', 20, 2000, 150, 'Hz', 'log'),
      num('highcut', 'High cut', 1000, 20000, 6000, 'Hz', 'log'), flag('pingpong', 'Ping-pong', false), num('mix', 'Level', 0, 100, 30, '%'),
    ],
  },
  reverb: {
    label: 'Convolution reverb', hint: 'Room, chamber, hall and plate impulses',
    create: sr => new ConvReverb(sr),
    params: [
      pick('space', 'Space', Object.keys(SPACES), 'hall'), num('decay', 'Decay', 0.4, 2, 1, 'x', 'log'),
      num('predelay', 'Pre-delay', 0, 150, 10, 'ms'), num('tone', 'Tone', 1000, 20000, 9000, 'Hz', 'log'),
      num('lowcut', 'Low cut', 20, 1000, 100, 'Hz', 'log'), num('mix', 'Mix', 0, 100, 30, '%'),
    ],
  },
  algoReverb: {
    label: 'Algorithmic reverb', hint: 'Modulated 8-line feedback delay network',
    create: sr => new AlgoReverb(sr),
    params: [
      num('size', 'Size', 0.3, 1.6, 1, 'x'), num('decay', 'Decay', 0.2, 12, 2.2, 's', 'log'),
      num('damping', 'Damping', 800, 18000, 6000, 'Hz', 'log'), num('predelay', 'Pre-delay', 0, 200, 20, 'ms'),
      num('mod', 'Motion', 0, 100, 30, '%'), num('width', 'Width', 0, 100, 100, '%'),
      num('lowcut', 'Low cut', 20, 1000, 120, 'Hz', 'log'), num('mix', 'Mix', 0, 100, 25, '%'),
    ],
  },
  limiter: {
    label: 'Limiter', hint: 'Lookahead brickwall limiter', meter: 'reduction',
    create: sr => new Limiter(sr),
    params: [num('gain', 'Input', 0, 24, 0, 'dB'), num('ceiling', 'Ceiling', -12, 0, -1, 'dB'), num('release', 'Release', 1, 1000, 80, 'ms', 'log')],
  },
});

export const EFFECT_TYPES = Object.freeze(Object.keys(EFFECTS));

export function defaultParams(type) {
  const spec = EFFECTS[type];
  const out = {};
  spec.params.forEach((p) => { out[p.key] = p.def; });
  if (type === 'eq') out.bands = EQ_DEFAULT_BANDS.map(b => ({ ...b }));
  return out;
}

export function normalizeParams(type, raw = {}) {
  const spec = EFFECTS[type];
  const out = {};
  spec.params.forEach((p) => {
    const v = raw?.[p.key];
    if (p.kind === 'num') out[p.key] = Number.isFinite(+v) && v !== null && v !== '' ? Math.min(p.max, Math.max(p.min, +v)) : p.def;
    else if (p.kind === 'choice') out[p.key] = p.options.includes(v) ? v : p.def;
    else out[p.key] = typeof v === 'boolean' ? v : p.def;
  });
  if (type === 'eq') out.bands = EQ_DEFAULT_BANDS.map((d, i) => normalizeBand(raw?.bands?.[i], i));
  return out;
}

let fxCounter = 0;
export function newEffect(type) {
  return { id: `fx-${Date.now().toString(36)}-${(fxCounter++).toString(36)}`, type, on: true, params: defaultParams(type) };
}

export function normalizeEffect(fx) {
  if (!fx || !EFFECTS[fx.type]) return null;
  return { id: String(fx.id || `fx-${fx.type}`), type: fx.type, on: fx.on !== false, params: normalizeParams(fx.type, fx.params) };
}
