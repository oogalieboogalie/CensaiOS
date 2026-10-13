/* global sampleRate */
import { Engine } from './engine.js';

// The Studio's audio thread: one worklet runs the whole engine (sources,
// chains, mixer, master) in 128-frame blocks and reports the playhead and
// meters back about 30 times a second.

class StudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new Engine(sampleRate);
    this.since = 0;
    this.failed = false;
    this.port.onmessage = (e) => this.handle(e.data || {});
  }

  handle(m) {
    const e = this.engine;
    if (m.type === 'project') e.setProject(m.project);
    else if (m.type === 'asset') e.setAsset(m.id, m.channels);
    else if (m.type === 'dropAsset') e.dropAsset(m.id);
    else if (m.type === 'play') e.play(m.beat);
    else if (m.type === 'stop') e.stop();
    else if (m.type === 'seek') e.seek(m.beat);
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0]; const R = out[1] || out[0];
    if (this.failed) { L.fill(0); R.fill(0); return true; }
    try {
      this.engine.process(L, R, L.length);
    } catch (err) {
      this.failed = true;
      L.fill(0); R.fill(0);
      this.port.postMessage({ type: 'error', message: String(err?.message || err) });
      return true;
    }
    this.since += L.length;
    if (this.since >= sampleRate / 30) {
      this.since = 0;
      const e = this.engine;
      this.port.postMessage({ type: 'tick', beat: e.beat, playing: e.playing, meters: e.meters() });
    }
    return true;
  }
}

registerProcessor('censai-studio', StudioProcessor);
