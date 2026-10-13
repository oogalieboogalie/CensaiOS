import { fft } from './fft.js';

// Uniformly partitioned overlap-save convolution (block B, FFT 2B), mono in
// and stereo out. The stereo impulse is packed as left + i*right, so one
// complex multiply-add per bin convolves both sides at once.
//
// Work is spread evenly: right after a block boundary every partition but
// the first is already computable for the next block, so those are summed a
// slice at a time while the next block's input arrives. The boundary itself
// only does two FFTs and partition 0, which keeps the audio thread's load
// flat instead of spiking once per block. Latency is B samples.

export class PartitionedConvolver {
  constructor(block = 1024) {
    this.B = block; this.N = block * 2;
    this.parts = []; // [{ re, im }] impulse spectra
    this.fdl = []; this.fdlPos = 0;
    this.prev = new Float64Array(block); this.cur = new Float64Array(block); this.fill = 0;
    this.outL = new Float64Array(block); this.outR = new Float64Array(block);
    this.accRe = new Float64Array(this.N); this.accIm = new Float64Array(this.N);
    this.nextK = 1;
    this.tRe = new Float64Array(this.N); this.tIm = new Float64Array(this.N);
  }

  /** Spectrum of one impulse partition (B frames of left and right). */
  partition(l, r) {
    const re = new Float64Array(this.N); const im = new Float64Array(this.N);
    re.set(l.subarray(0, this.B)); im.set(r.subarray(0, this.B));
    fft(re, im);
    return { re, im };
  }

  setPartitions(parts) {
    this.parts = parts;
    this.fdl = parts.map(() => ({ re: new Float64Array(this.N), im: new Float64Array(this.N) }));
    this.reset();
  }

  reset() {
    this.fdl.forEach(f => { f.re.fill(0); f.im.fill(0); });
    this.prev.fill(0); this.cur.fill(0); this.fill = 0;
    this.outL.fill(0); this.outR.fill(0);
    this.accRe.fill(0); this.accIm.fill(0); this.nextK = 1; this.fdlPos = 0;
  }

  /** acc += X(t+1-k) * H(k) for k in [this.nextK, upTo). */
  accumulate(upTo) {
    const P = this.parts.length; const N = this.N;
    const aRe = this.accRe; const aIm = this.accIm;
    for (let k = this.nextK; k < upTo && k < P; k++) {
      const x = this.fdl[(this.fdlPos - (k - 1) + P) % P];
      const h = this.parts[k];
      const xr = x.re; const xi = x.im; const hr = h.re; const hi = h.im;
      for (let i = 0; i < N; i++) {
        aRe[i] += xr[i] * hr[i] - xi[i] * hi[i];
        aIm[i] += xr[i] * hi[i] + xi[i] * hr[i];
      }
    }
    this.nextK = Math.max(this.nextK, Math.min(upTo, P));
  }

  boundary() {
    const P = this.parts.length; const B = this.B; const N = this.N;
    this.accumulate(P);
    this.fdlPos = (this.fdlPos + 1) % P;
    const x = this.fdl[this.fdlPos];
    x.re.set(this.prev); x.re.set(this.cur, B); x.im.fill(0);
    fft(x.re, x.im);
    const h = this.parts[0];
    const yRe = this.tRe; const yIm = this.tIm;
    for (let i = 0; i < N; i++) {
      yRe[i] = this.accRe[i] + x.re[i] * h.re[i] - x.im[i] * h.im[i];
      yIm[i] = this.accIm[i] + x.re[i] * h.im[i] + x.im[i] * h.re[i];
    }
    fft(yRe, yIm, true);
    for (let i = 0; i < B; i++) { this.outL[i] = yRe[B + i]; this.outR[i] = yIm[B + i]; }
    const t = this.prev; this.prev = this.cur; this.cur = t;
    this.fill = 0;
    this.accRe.fill(0); this.accIm.fill(0); this.nextK = 1;
  }

  /** Mono input `x[0..n)`, adds nothing: writes the wet signal into wl/wr. */
  process(x, wl, wr, n) {
    if (!this.parts.length) { wl.fill(0, 0, n); wr.fill(0, 0, n); return; }
    const B = this.B; const P = this.parts.length;
    let i = 0;
    while (i < n) {
      const take = Math.min(n - i, B - this.fill);
      for (let k = 0; k < take; k++) {
        this.cur[this.fill + k] = x[i + k];
        wl[i + k] = this.outL[this.fill + k];
        wr[i + k] = this.outR[this.fill + k];
      }
      this.fill += take; i += take;
      // Spread partitions 1..P-1 over the block in proportion to how far in we are.
      this.accumulate(1 + Math.ceil(((P - 1) * this.fill) / B));
      if (this.fill === B) this.boundary();
    }
  }
}
