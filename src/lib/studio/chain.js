import { EFFECTS } from './effects.js';
import { msToCoef } from './dsp/util.js';

// An ordered insert chain. Turning an effect on or off, adding or removing
// one crossfades it in or out over ~10 ms, so editing the chain while the
// song plays doesn't click. An effect that is fully off costs nothing.

export class Chain {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.slots = new Map();
    this.order = [];
    this.coef = msToCoef(8, sampleRate);
    this.dryL = new Float32Array(128); this.dryR = new Float32Array(128);
  }

  set(list = [], ctx = {}) {
    const keep = new Set();
    const order = [];
    for (const fx of list) {
      let slot = this.slots.get(fx.id);
      if (slot && slot.type !== fx.type) { this.slots.delete(fx.id); slot = null; }
      if (!slot) {
        slot = { id: fx.id, type: fx.type, proc: EFFECTS[fx.type].create(this.sr), mix: 0, target: 0 };
        this.slots.set(fx.id, slot);
      }
      slot.proc.setParams(fx.params, ctx);
      slot.target = fx.on ? 1 : 0;
      slot.removing = false;
      keep.add(fx.id);
      order.push(slot);
    }
    // Removed effects fade out in place before they are dropped.
    for (const slot of this.order) {
      if (!keep.has(slot.id)) { slot.target = 0; slot.removing = true; order.splice(Math.min(order.length, this.order.indexOf(slot)), 0, slot); }
    }
    this.order = order;
  }

  /** Builds pending impulses immediately (offline render). */
  flush() { this.order.forEach(s => s.proc.flush?.()); }

  get tail() { return this.order.reduce((t, s) => (s.target > 0 ? Math.max(t, s.proc.tail || 0) : t), 0); }

  meters() {
    const out = {};
    this.order.forEach((s) => { if (EFFECTS[s.type].meter && s.proc.meter) out[s.id] = s.proc.meter(); });
    return out;
  }

  process(L, R, n) {
    if (this.dryL.length < n) { this.dryL = new Float32Array(n); this.dryR = new Float32Array(n); }
    for (const slot of this.order) {
      if (slot.mix === 0 && slot.target === 0) {
        if (slot.removing) { this.slots.delete(slot.id); slot.dead = true; }
        continue;
      }
      if (slot.mix === 1 && slot.target === 1) { slot.proc.process(L, R, n); continue; }
      if (slot.mix === 0) slot.proc.reset?.(); // coming back on: start from silence, not a stale tail
      this.dryL.set(L.subarray(0, n)); this.dryR.set(R.subarray(0, n));
      slot.proc.process(L, R, n);
      let m = slot.mix;
      for (let i = 0; i < n; i++) {
        m = slot.target + (m - slot.target) * this.coef;
        L[i] = this.dryL[i] + (L[i] - this.dryL[i]) * m;
        R[i] = this.dryR[i] + (R[i] - this.dryR[i]) * m;
      }
      slot.mix = Math.abs(m - slot.target) < 1e-4 ? slot.target : m;
    }
    if (this.order.some(s => s.dead)) this.order = this.order.filter(s => !s.dead);
  }
}
