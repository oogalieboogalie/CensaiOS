import { PartitionedConvolver } from './convolver.js';
import { impulseChunks, SPACES } from './impulses.js';
import { Smoother, msToCoef } from './util.js';
import { Biquad, designBiquad } from './biquad.js';

// Convolution reverb over the generated spaces. Choosing another space,
// decay or pre-delay builds the new impulse a few partitions per audio
// block, then fades the old tail out, swaps and fades back in, so the audio
// thread never stalls and the switch never clicks.

const BLOCK = 1024;
const STEPS_PER_CALL = 6;

export class ConvReverb {
  constructor(sampleRate, { block = BLOCK } = {}) {
    this.sr = sampleRate;
    this.conv = new PartitionedConvolver(block);
    this.block = block;
    this.key = '';
    this.pending = null;
    this.gate = 0; this.gateTarget = 1;
    this.gateCoef = msToCoef(15, sampleRate);
    this.mix = new Smoother(0.3, 20, sampleRate);
    this.tone = new Biquad(); this.lowcut = new Biquad();
    this.mono = new Float64Array(128); this.wl = new Float64Array(128); this.wr = new Float64Array(128);
    this.tail = 3;
    this.setParams({});
  }

  setParams(p = {}) {
    const n = (v, fb) => (Number.isFinite(+v) ? +v : fb);
    const space = SPACES[p.space] ? p.space : 'hall';
    const scale = Math.min(2, Math.max(0.4, n(p.decay, 1)));
    const preMs = Math.min(150, Math.max(0, n(p.predelay, 10)));
    // The convolver's own block latency counts toward the pre-delay.
    const preSamples = Math.max(0, Math.round((preMs / 1000) * this.sr) - this.block);
    const key = `${space}|${scale.toFixed(3)}|${preSamples}`;
    if (key !== this.key) {
      this.key = key;
      this.pending = { gen: impulseChunks(space, { scale, preSamples, sampleRate: this.sr, chunk: this.block }), parts: [] };
      this.tail = Math.max(...SPACES[space].rt) * scale + (preMs / 1000) + 0.1;
    }
    this.mix.set(Math.min(1, Math.max(0, n(p.mix, 30) / 100)));
    this.tone.setCoefs(designBiquad('highcut', Math.min(20000, Math.max(1000, n(p.tone, 9000))), 0, 0.71, this.sr));
    this.lowcut.setCoefs(designBiquad('lowcut', Math.max(20, n(p.lowcut, 100)), 0, 0.71, this.sr));
  }

  /** Build the whole pending impulse now (offline render and tests). */
  flush() {
    while (this.pending) { this.build(Infinity); this.gate = 0; }
    this.gate = 1; this.gateTarget = 1;
  }

  build(steps) {
    const job = this.pending;
    for (let s = 0; s < steps; s++) {
      const next = job.gen.next();
      if (next.done) { job.ready = true; break; }
      job.parts.push(this.conv.partition(next.value.l, next.value.r));
    }
    if (!job.ready) return;
    // Fade out, then swap. On the first impulse there is nothing to fade.
    if (this.conv.parts.length === 0 || this.gate < 0.001) {
      this.conv.setPartitions(job.parts);
      this.tone.reset(); this.lowcut.reset();
      this.pending = null;
      this.gateTarget = 1;
    } else {
      this.gateTarget = 0;
    }
  }

  reset() { this.conv.reset(); this.tone.reset(); this.lowcut.reset(); }

  process(L, R, n) {
    if (this.pending) this.build(STEPS_PER_CALL);
    if (this.mono.length < n) { this.mono = new Float64Array(n); this.wl = new Float64Array(n); this.wr = new Float64Array(n); }
    const { mono, wl, wr } = this;
    for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) * 0.5;
    this.conv.process(mono, wl, wr, n);
    this.lowcut.process(wl, wr, 0, n);
    this.tone.process(wl, wr, 0, n);
    for (let i = 0; i < n; i++) {
      this.gate = this.gateTarget + (this.gate - this.gateTarget) * this.gateCoef;
      const m = this.mix.next();
      const g = m * this.gate;
      L[i] = L[i] * (1 - m) + wl[i] * g;
      R[i] = R[i] * (1 - m) + wr[i] * g;
    }
  }
}
