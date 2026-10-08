import React from 'react';
import { drawAmbience, drawBars, drawScope, synthSpectrum } from './visualizerSignal.js';

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

/**
 * Canvas visualizer for the retro player screen. Animates only while
 * `playing`; on pause the bars fall to rest and the loop stops so an idle
 * player costs nothing.
 */
export function MusicVisualizer({ mode, skin, playing, seed, onClick }) {
  const canvasRef = React.useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const stateRef = React.useRef({ levels: null, peaks: null, target: null, t: 0, last: 0 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return undefined;
    let raf = 0;
    let stopped = false;
    const st = stateRef.current;

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
      if (animate) {
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
      for (let i = 0; i < bands; i++) {
        const cur = st.levels[i];
        const tgt = st.target[i];
        st.levels[i] = tgt > cur ? cur + (tgt - cur) * 0.55 : cur + (tgt - cur) * 0.14;
        st.peaks[i] = Math.max(st.levels[i], st.peaks[i] - dt * 0.45);
        energy += st.levels[i] + st.peaks[i];
      }
      if (mode === 'scope') drawScope(ctx, w, h, st.levels, st.t, skin);
      else if (mode === 'ambience') drawAmbience(ctx, w, h, st.levels, st.t, skin);
      else drawBars(ctx, w, h, st.levels, st.peaks, skin);

      const settled = !animate && energy < 0.01 * bands;
      if (!settled) raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
    };
  }, [mode, skin, playing, seed, reducedMotion]);

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
