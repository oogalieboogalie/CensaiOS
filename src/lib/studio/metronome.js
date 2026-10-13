// Metronome clicks: a short decaying sine, higher on the downbeat. Clicks are
// added after the limiter so they never pump the mix, and they are never in
// an export.

export class Metronome {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.clicks = []; // { at, phase, inc, amp, left }
    this.decay = Math.exp(-1 / (0.012 * sampleRate));
  }
  begin() { this.queue = []; }
  /** Queue clicks for beats that start inside [pos, pos + len), written at `offset`. */
  schedule(pos, len, offset, spb, beatsPerBar) {
    const first = Math.ceil(pos / spb - 1e-9);
    for (let b = first; b * spb < pos + len; b++) {
      const at = offset + Math.max(0, Math.round(b * spb - pos));
      const down = b % beatsPerBar === 0;
      this.queue.push({ at, phase: 0, inc: (2 * Math.PI * (down ? 1760 : 1320)) / this.sr, amp: down ? 0.32 : 0.2, left: Math.round(0.06 * this.sr) });
    }
  }
  render(L, R, n) {
    for (const c of this.queue) this.clicks.push(c);
    this.queue = [];
    for (const c of this.clicks) {
      for (let i = c.at; i < n && c.left > 0; i++, c.left--) {
        const v = Math.sin(c.phase) * c.amp;
        c.phase += c.inc; c.amp *= this.decay;
        L[i] += v; R[i] += v;
      }
      c.at = 0;
    }
    this.clicks = this.clicks.filter(c => c.left > 0);
  }
}
