import React from 'react';
import { drawAmbience, drawBars, drawScope, synthSpectrum } from './visualizerSignal.js';
import { drawVu, readSpectrum, readVu, readWaveform, vuFromLevels } from './audioSignal.js';
import { drawSwirl } from './visualizerSwirl.js';
import { logMusic } from './linkAudio.js';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return reduced;
}

// One app log line per window and track when the visualizer can't read the
// sound and draws the made-up beat instead. Names the window only.
function useFallbackLog(windowId, playing, signal, seed) {
  const logged = React.useRef('');
  React.useEffect(() => {
    if (!playing || signal) return;
    const key = `${seed}`;
    if (logged.current === key) return;
    logged.current = key;
    logMusic('info', `visualizer can't read the sound in window ${windowId || 'unknown'}, so it follows a made-up beat`);
  }, [windowId, playing, signal, seed]);
}

/**
 * Canvas visualizer for the retro player screen. With a `signal` (USB files
 * through the Web Audio analyser) it draws the real audio; without one it
 * draws the synthesized beat. Animates only while `playing`; on pause the
 * bars fall to rest and the loop stops so an idle player costs nothing. With
 * reduced motion it draws one calm frame and stops too.
 */
export function MusicVisualizer({ mode, skin, playing, seed, signal, onClick, windowId }) {
  const canvasRef = React.useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  useFallbackLog(windowId, playing, signal, seed);
  const stateRef = React.useRef({ levels: null, peaks: null, target: null, t: 0, last: 0, vu: [0, 0] });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return undefined;
    let raf = 0;
    let stopped = false;
    const st = stateRef.current;
    const freqBuf = signal ? new Uint8Array(signal.analyser.frequencyBinCount) : null;
    const timeBuf = signal ? new Uint8Array(signal.analyser.fftSize) : null;
    const wave = signal ? new Float32Array(512) : null;
    const chanBuf = signal ? new Uint8Array(signal.left.fftSize) : null;

    const frame = (now) => {
      if (stopped) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bands = Math.max(12, Math.min(40, Math.floor(w / 9)));
      if (!st.levels || st.levels.length !== bands) {
        st.levels = new Float32Array(bands);
        st.peaks = new Float32Array(bands);
        st.target = new Float32Array(bands);
      }
      const dt = st.last ? Math.min(0.1, (now - st.last) / 1000) : 0.016;
      st.last = now;
      const animate = playing && !reducedMotion;
      const live = signal && playing;
      if (animate && live) {
        st.t += dt;
        readSpectrum(signal.analyser, st.target, freqBuf);
      } else if (animate) {
        st.t += dt;
        synthSpectrum(st.t, seed, st.target);
      } else if (playing) {
        // Reduced motion: hold a calm, static spectrum instead of animating.
        synthSpectrum(1.234, seed, st.target);
        for (let i = 0; i < bands; i++) st.target[i] *= 0.6;
      } else {
        st.target.fill(0);
      }
      let energy = 0;
      let moved = 0;
      for (let i = 0; i < bands; i++) {
        const cur = st.levels[i];
        const tgt = st.target[i];
        st.levels[i] = tgt > cur ? cur + (tgt - cur) * 0.55 : cur + (tgt - cur) * 0.14;
        moved = Math.max(moved, Math.abs(st.levels[i] - cur));
        const peak = Math.max(st.levels[i], st.peaks[i] - dt * 0.45);
        moved = Math.max(moved, Math.abs(peak - st.peaks[i]));
        st.peaks[i] = peak;
        energy += st.levels[i] + st.peaks[i];
      }
      const vuTarget = live && animate
        ? [readVu(signal.left, chanBuf), readVu(signal.right, chanBuf)]
        : vuFromLevels(st.levels);
      for (let c = 0; c < 2; c++) {
        const step = (vuTarget[c] - st.vu[c]) * (vuTarget[c] > st.vu[c] ? 0.5 : 0.12);
        st.vu[c] += step;
        moved = Math.max(moved, Math.abs(step));
      }
      energy += st.vu[0] + st.vu[1];
      if (mode === 'scope') drawScope(ctx, w, h, st.levels, st.t, skin, live && animate ? readWaveform(signal.analyser, wave, timeBuf) : null);
      else if (mode === 'vu') drawVu(ctx, w, h, st.vu, skin);
      else if (mode === 'ambience') drawAmbience(ctx, w, h, st.levels, st.t, skin);
      else if (mode === 'swirl') drawSwirl(ctx, w, h, st.levels, st.t, skin, { still: !animate });
      else drawBars(ctx, w, h, st.levels, st.peaks, skin);

      // Paused and faded out, or held still and no longer changing: stop.
      const settled = !animate && (energy < 0.01 * bands || moved < 0.0005);
      if (!settled) raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
    };
  }, [mode, skin, playing, seed, signal, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      data-music-visualizer={mode}
      onClick={onClick}
      title="Click to change visualization"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', display: 'block' }}
    />
  );
}
