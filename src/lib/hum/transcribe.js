import { cleanHeard } from './melody.js';

// Listens to a recording and writes down the notes, using Spotify's open
// source Basic Pitch model. It runs entirely in this browser: the model
// ships with censaiOS (public/models/basic-pitch), the sound never leaves
// the computer, and there is no key or account. The model and TensorFlow
// load the first time someone uses it, not with the app.

const MODEL_URL = '/models/basic-pitch/model.json';
const RATE = 22050; // the model listens at 22.05 kHz mono
export const MAX_SECONDS = 60;

let loading = null;
function loadModel() {
  if (!loading) {
    loading = import('@spotify/basic-pitch').then(mod => ({ mod, model: new mod.BasicPitch(MODEL_URL) }))
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/** Decodes any audio file the browser can play and mixes it to mono at the model's rate. */
export async function toModelAudio(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !window.OfflineAudioContext) throw new Error('This browser has no Web Audio.');
  const ctx = new Ctx();
  let decoded;
  try { decoded = await ctx.decodeAudioData(await blob.arrayBuffer()); } catch {
    throw new Error('That file could not be opened as sound. Try a WAV, MP3, M4A or a new recording.');
  } finally { ctx.close?.(); }
  const seconds = Math.min(decoded.duration, MAX_SECONDS);
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * RATE)), RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const mono = (await offline.startRendering()).getChannelData(0);
  return { samples: normalizeLevel(mono), seconds, trimmed: decoded.duration > MAX_SECONDS };
}

/** Quiet recordings are lifted to a steady level so a soft hum is heard as clearly as a loud one. */
export function normalizeLevel(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-4) return samples;
  const g = Math.min(20, 0.9 / peak);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}

/**
 * The notes in a recording as { p, s, d, v } (MIDI pitch, start and length
 * in seconds, loudness). `onProgress` gets 0..1 while the model listens.
 */
export async function transcribe(blob, { onProgress } = {}) {
  const [{ mod, model }, audio] = await Promise.all([loadModel(), toModelAudio(blob)]);
  const frames = []; const onsets = []; const contours = [];
  await model.evaluateModel(audio.samples, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, p => onProgress?.(p));
  // Thresholds tuned for a single voice: fairly sure of each onset, notes at least ~60 ms.
  const notes = mod.noteFramesToTime(mod.addPitchBendsToNoteEvents(contours, mod.outputToNotesPoly(frames, onsets, 0.5, 0.3, 5)));
  return { notes: cleanHeard(notes), seconds: audio.seconds, trimmed: audio.trimmed };
}
