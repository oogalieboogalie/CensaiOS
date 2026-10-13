import { Engine } from './engine.js';
import { projectEndBeats } from './project.js';

// Offline render of a whole project through the same engine that plays it
// live: metronome off, loop off, every impulse built up front, and a tail
// long enough for the longest reverb or delay to ring out. Trailing silence
// below -100 dBFS is trimmed.

const BLOCK = 512;

function setup(project, assets, sampleRate) {
  const engine = new Engine(sampleRate, { offline: true });
  engine.setProject({ ...project, metronome: false, loop: { ...project.loop, on: false } });
  for (const [id, channels] of Object.entries(assets || {})) engine.setAsset(id, channels);
  const endBeat = projectEndBeats(project);
  let tail = engine.master.tail;
  engine.tracks.forEach(t => { tail = Math.max(tail, t.chain.tail + engine.master.tail); });
  const total = Math.ceil(endBeat * engine.spb + Math.min(12, tail + 0.1) * sampleRate);
  engine.play(0);
  return { engine, total: Math.max(BLOCK, total) };
}

function finish(left, right) {
  let last = left.length - 1;
  while (last > 0 && Math.abs(left[last]) < 1e-5 && Math.abs(right[last]) < 1e-5) last--;
  const len = Math.min(left.length, last + 1 + 64);
  return { left: left.slice(0, len), right: right.slice(0, len) };
}

/** Renders synchronously. `assets` maps asset id to [left, right?] Float32Arrays at `sampleRate`. */
export function renderProject(project, assets, { sampleRate = 48000 } = {}) {
  const { engine, total } = setup(project, assets, sampleRate);
  const left = new Float32Array(total); const right = new Float32Array(total);
  for (let at = 0; at < total; at += BLOCK) {
    const n = Math.min(BLOCK, total - at);
    engine.process(left.subarray(at, at + n), right.subarray(at, at + n), n);
  }
  return finish(left, right);
}

/** Same render, yielding to the page between slices and reporting progress 0..1. */
export async function renderProjectAsync(project, assets, { sampleRate = 48000, onProgress, signal } = {}) {
  const { engine, total } = setup(project, assets, sampleRate);
  const left = new Float32Array(total); const right = new Float32Array(total);
  let lastYield = Date.now();
  for (let at = 0; at < total; at += BLOCK) {
    if (signal?.aborted) throw new Error('Export cancelled');
    const n = Math.min(BLOCK, total - at);
    engine.process(left.subarray(at, at + n), right.subarray(at, at + n), n);
    if (Date.now() - lastYield > 30) {
      onProgress?.(at / total);
      await new Promise(r => setTimeout(r, 0));
      lastYield = Date.now();
    }
  }
  onProgress?.(1);
  return finish(left, right);
}
