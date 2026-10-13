import { Chain } from './chain.js';
import { Synth } from './dsp/synth.js';
import { Limiter } from './dsp/dynamics.js';
import { Smoother, dbToGain } from './dsp/util.js';
import { Metronome } from './metronome.js';
import { renderAudioClips, collectNotes, noteEvents } from './sources.js';

// The Studio engine: transport, sources, per-track chains, the mixer, the
// master chain and limiter. It is pure JavaScript with no Web Audio, so one
// implementation runs live inside the audio worklet, renders the WAV export
// and runs under Node in the tests.

class TrackState {
  constructor(sr) {
    this.chain = new Chain(sr);
    this.synth = null;
    this.gain = new Smoother(1, 25, sr);
    this.pan = new Smoother(0, 25, sr);
    this.L = new Float32Array(128); this.R = new Float32Array(128);
    this.notes = []; this.peak = 0; this.silent = Infinity;
  }
}

export class Engine {
  constructor(sampleRate, { offline = false } = {}) {
    this.sr = sampleRate;
    this.offline = offline;
    this.tracks = new Map();
    this.assets = new Map();
    this.master = new Chain(sampleRate);
    this.limiter = new Limiter(sampleRate);
    this.limiterOn = true;
    this.masterGain = new Smoother(1, 25, sampleRate);
    this.metronome = new Metronome(sampleRate);
    this.mL = new Float32Array(128); this.mR = new Float32Array(128);
    this.playing = false; this.pos = 0; this.peak = [0, 0];
    this.project = null; this.spb = sampleRate / 2;
  }

  setProject(project) {
    this.project = project;
    const oldSpb = this.spb;
    this.spb = (this.sr * 60) / project.bpm;
    if (this.playing && oldSpb !== this.spb) this.pos = (this.pos / oldSpb) * this.spb; // keep the musical position
    const ctx = { bpm: project.bpm };
    const anySolo = project.tracks.some(t => t.solo);
    const seen = new Set();
    for (const t of project.tracks) {
      let st = this.tracks.get(t.id);
      if (!st) { st = new TrackState(this.sr); this.tracks.set(t.id, st); }
      seen.add(t.id);
      st.def = t;
      st.chain.set(t.fx, ctx);
      if (t.kind === 'synth') { st.synth = st.synth || new Synth(this.sr); st.synth.setParams(t.synth); } else st.synth = null;
      st.notes = t.kind === 'synth' ? collectNotes(t) : [];
      const audible = !t.mute && (!anySolo || t.solo);
      st.gain.set(audible ? dbToGain(t.gain) : 0);
      st.pan.set(t.pan);
      if (this.offline) { st.gain.snap(); st.pan.snap(); }
    }
    for (const id of [...this.tracks.keys()]) if (!seen.has(id)) this.tracks.delete(id);
    this.master.set(project.master.fx, ctx);
    this.limiterOn = project.master.limiter.on;
    this.limiter.setParams({ ceiling: project.master.limiter.ceiling, release: project.master.limiter.release });
    this.masterGain.set(dbToGain(project.master.gain));
    if (this.offline) { this.masterGain.snap(); this.flush(); }
  }

  flush() { this.tracks.forEach(t => t.chain.flush()); this.master.flush(); }

  /** Decoded audio for an asset: one or two Float32Arrays at the engine's sample rate. */
  setAsset(id, channels) { if (channels?.length) this.assets.set(id, channels); }
  dropAsset(id) { this.assets.delete(id); }

  play(beat = 0) { this.pos = Math.max(0, beat) * this.spb; this.playing = true; this.allOff(); }
  stop() { this.playing = false; this.allOff(); }
  seek(beat) { this.pos = Math.max(0, beat) * this.spb; this.allOff(); }
  allOff() { this.tracks.forEach(t => t.synth?.allOff()); }
  get beat() { return this.pos / this.spb; }

  /** Peak levels since the last call, per track and master, plus effect meters. */
  meters() {
    const tracks = {}; const fx = {};
    this.tracks.forEach((t, id) => { tracks[id] = t.peak; t.peak = 0; Object.assign(fx, t.chain.meters()); });
    Object.assign(fx, this.master.meters());
    fx.limiter = this.limiter.meter();
    const master = this.peak; this.peak = [0, 0];
    return { tracks, master, fx };
  }

  process(outL, outR, n) {
    if (!this.project) { outL.fill(0, 0, n); outR.fill(0, 0, n); return; }
    if (this.mL.length < n) this.mL = new Float32Array(n);
    if (this.mR.length < n) this.mR = new Float32Array(n);
    const mL = this.mL; const mR = this.mR;
    mL.fill(0, 0, n); mR.fill(0, 0, n);
    this.tracks.forEach((st) => {
      if (st.L.length < n) { st.L = new Float32Array(n); st.R = new Float32Array(n); }
      st.L.fill(0, 0, n); st.R.fill(0, 0, n); st.fed = false;
    });
    const click = this.metronome;
    click.begin(n);
    const loop = this.project.loop;
    // Render sources segment by segment so a loop wrap lands on the exact sample.
    let done = 0;
    while (done < n) {
      let len = n - done;
      if (this.playing && loop.on) {
        const end = loop.end * this.spb;
        // Only a playhead that reaches the loop end from inside wraps; one parked after it plays on.
        if (this.pos >= end - 0.5 && this.pos < end + n) { this.pos = loop.start * this.spb; this.allOff(); }
        if (this.pos < end) len = Math.max(1, Math.min(len, Math.ceil(end - this.pos)));
      }
      this.renderSources(done, len);
      if (this.playing && this.project.metronome) click.schedule(this.pos, len, done, this.spb, this.project.beatsPerBar);
      if (this.playing) this.pos += len;
      done += len;
    }
    this.mix(mL, mR, n);
    this.master.process(mL, mR, n);
    let pk0 = this.peak[0]; let pk1 = this.peak[1];
    const g0 = this.masterGain.value; const g1 = this.masterGain.skip(n);
    for (let i = 0; i < n; i++) { const g = g0 + ((g1 - g0) * i) / n; mL[i] *= g; mR[i] *= g; }
    if (this.limiterOn) this.limiter.process(mL, mR, n);
    for (let i = 0; i < n; i++) {
      const l = mL[i]; const r = mR[i];
      if (Math.abs(l) > pk0) pk0 = Math.abs(l);
      if (Math.abs(r) > pk1) pk1 = Math.abs(r);
      outL[i] = l; outR[i] = r;
    }
    this.peak = [pk0, pk1];
    click.render(outL, outR, n);
  }

  renderSources(offset, len) {
    const t0 = this.pos;
    this.tracks.forEach((st) => {
      const t = st.def;
      if (!this.playing) { if (st.synth?.active) { st.synth.render(st.L, st.R, offset, offset + len); st.fed = true; } return; }
      if (t.kind === 'audio') { if (renderAudioClips(t.clips, this.assets, st.L, st.R, offset, len, t0, this.spb, this.sr)) st.fed = true; return; }
      // Synth: split the segment at every note on/off so timing is sample-accurate.
      const events = noteEvents(st.notes, t0, t0 + len, this.spb);
      let at = 0;
      for (const ev of events) {
        if (ev.at > at) st.synth.render(st.L, st.R, offset + at, offset + ev.at);
        at = ev.at;
        if (ev.on) st.synth.noteOn(ev.p, ev.v); else st.synth.noteOff(ev.p);
      }
      if (st.synth.active || events.length) { st.synth.render(st.L, st.R, offset + at, offset + len); st.fed = true; }
    });
  }

  mix(mL, mR, n) {
    const blockSec = n / this.sr;
    this.tracks.forEach((st) => {
      // A track with no input for longer than its effects ring skips its chain entirely.
      st.silent = st.fed ? 0 : st.silent + blockSec;
      if (st.silent > st.chain.tail + 0.25 && st.gain.settled && st.pan.settled) return;
      st.chain.process(st.L, st.R, n);
      const g0 = st.gain.value; const g1 = st.gain.skip(n);
      const p0 = st.pan.value; const p1 = st.pan.skip(n);
      let pk = st.peak;
      for (let i = 0; i < n; i++) {
        const f = i / n; const g = g0 + (g1 - g0) * f; const p = p0 + (p1 - p0) * f;
        // Balance pan: centre is unity, the far side falls off along a quarter cosine.
        const gl = g * (p > 0 ? Math.cos(p * Math.PI / 2) : 1);
        const gr = g * (p < 0 ? Math.cos(-p * Math.PI / 2) : 1);
        const l = st.L[i] * gl; const r = st.R[i] * gr;
        mL[i] += l; mR[i] += r;
        const a = Math.max(Math.abs(l), Math.abs(r));
        if (a > pk) pk = a;
      }
      st.peak = pk;
    });
  }
}
