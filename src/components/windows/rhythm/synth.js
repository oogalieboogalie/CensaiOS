// The Rhythm Run band: a small Web Audio synth that plays a sequenced song
// on the audio clock. Notes are scheduled a little ahead with a lookahead
// timer, the way drum machines do it, so timing never depends on when a
// JavaScript timer happens to fire.
import { freqOf } from '../../../lib/games/rhythm/sequence.js';

const LOOKAHEAD = 0.2;
const TICK_MS = 40;

function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createBand(ctx, destination) {
  const noise = noiseBuffer(ctx);
  const leadBus = ctx.createGain();
  leadBus.connect(destination);
  const drumBus = ctx.createGain();
  drumBus.gain.value = 0.8;
  drumBus.connect(destination);
  const sources = new Set();
  const track = (node, end) => { sources.add(node); node.onended = () => sources.delete(node); node.stop(end); };

  function tone({ t, dur, midi }, type, level, out, filterHz) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freqOf(midi);
    const env = ctx.createGain();
    const end = t + Math.max(0.06, dur * 0.95);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.006);
    env.gain.exponentialRampToValueAtTime(level * 0.55, t + 0.12);
    env.gain.setValueAtTime(level * 0.55, end - 0.03);
    env.gain.linearRampToValueAtTime(0, end);
    let head = osc;
    if (filterHz) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filterHz;
      osc.connect(lp);
      head = lp;
    }
    head.connect(env);
    env.connect(out);
    osc.start(t);
    track(osc, end + 0.02);
  }

  function noiseHit(t, { hp, dur, level }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hp;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(drumBus);
    src.start(t);
    track(src, t + dur + 0.02);
  }

  function kick(t) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(env);
    env.connect(drumBus);
    osc.start(t);
    track(osc, t + 0.3);
  }

  function play(event, at, tone_) {
    const t = at + event.t;
    if (event.voice === 'lead') tone(event, tone_.lead, 0.16, leadBus, tone_.lead === 'sawtooth' ? 2600 : null);
    else if (event.voice === 'bass') tone(event, tone_.bass, 0.2, destination, 900);
    else if (event.voice === 'kick') kick(t);
    else if (event.voice === 'snare') { noiseHit(t, { hp: 1400, dur: 0.16, level: 0.45 }); }
    else if (event.voice === 'hat') noiseHit(t, { hp: 7500, dur: 0.045, level: 0.22 });
  }

  let timer = null;
  return {
    /** Play `events` with time zero at audio time `at`. */
    start(events, at, toneSet) {
      this.stop();
      let i = 0;
      const pump = () => {
        const horizon = ctx.currentTime + LOOKAHEAD;
        while (i < events.length && at + events[i].t < horizon) {
          if (at + events[i].t >= ctx.currentTime - 0.01) play({ ...events[i], t: at + events[i].t }, 0, toneSet);
          i += 1;
        }
        if (i >= events.length) { clearInterval(timer); timer = null; }
      };
      pump();
      timer = setInterval(pump, TICK_MS);
    },
    /** A missed note mutes the lead for a moment, like a dropped guitar part. */
    flub() {
      const now = ctx.currentTime;
      leadBus.gain.cancelScheduledValues(now);
      leadBus.gain.setValueAtTime(0.15, now);
      leadBus.gain.linearRampToValueAtTime(1, now + 0.35);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } }
      sources.clear();
      leadBus.gain.cancelScheduledValues(ctx.currentTime);
      leadBus.gain.value = 1;
    },
  };
}
