// Game sounds made on the fly with Web Audio (spec 11): no sound files to
// ship. The audio context starts on the first click (browsers require a
// gesture) and every sound goes through one master volume.

export function createGameSound({ muted = false, volume = 0.6 } = {}) {
  let ctx = null;
  let master = null;
  let noise = null;
  let thrust = null;
  let settings = { muted, volume };

  const level = () => (settings.muted ? 0 : settings.volume * 0.5);

  function ensure() {
    if (ctx) return ctx;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(ctx.destination);
    const length = ctx.sampleRate;
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function tone({ from, to, duration, type = 'square', gain = 0.25 }) {
    if (!ctx || settings.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function burst({ duration, cutoff, gain }) {
    if (!ctx || settings.muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  return {
    /** Call from a click so the browser lets audio play. */
    unlock() {
      const c = ensure();
      if (c?.state === 'suspended') c.resume().catch(() => undefined);
    },
    configure(next) {
      settings = { ...settings, ...next };
      if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.02);
      if (settings.muted) this.thrust(false);
    },
    shoot(mine = true) { tone({ from: mine ? 880 : 660, to: 220, duration: 0.09, gain: mine ? 0.18 : 0.06 }); },
    explode(size = 2) { burst({ duration: 0.25 + size * 0.18, cutoff: 600 + size * 500, gain: 0.25 + size * 0.12 }); },
    shipDown() {
      burst({ duration: 0.9, cutoff: 1800, gain: 0.6 });
      tone({ from: 240, to: 40, duration: 0.7, type: 'sawtooth', gain: 0.12 });
    },
    thrust(on) {
      if (!ctx) return;
      if (on && !thrust && !settings.muted) {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        const amp = ctx.createGain();
        amp.gain.value = 0.18;
        src.connect(filter).connect(amp).connect(master);
        src.start();
        thrust = src;
      } else if (!on && thrust) {
        try { thrust.stop(); } catch { /* already stopped */ }
        thrust = null;
      }
    },
    close() {
      this.thrust(false);
      ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
