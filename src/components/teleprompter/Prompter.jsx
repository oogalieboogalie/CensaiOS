/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { pixelsPerSecond, SIZE_MAX, SIZE_MIN, SPEED_MAX, SPEED_MIN } from '../../lib/teleprompter/prompterState.js';

const step = (n, by, lo, hi) => Math.min(hi, Math.max(lo, n + by));

/** Keys: Space play/pause, Up/Down speed, +/- text size, Home or R back to the top. */
export function prompterKeyAction(key) {
  if (key === ' ' || key === 'Spacebar') return 'toggle';
  if (key === 'ArrowUp') return 'faster';
  if (key === 'ArrowDown') return 'slower';
  if (key === '+' || key === '=') return 'bigger';
  if (key === '-' || key === '_') return 'smaller';
  if (key === 'Home' || key === 'r' || key === 'R') return 'restart';
  return null;
}

/**
 * The scrolling reader: big words that glide up past a reading line near
 * the top, so your eyes stay close to the camera. Used inside the canvas
 * window and alone in the pop-out.
 */
export function Prompter({ state, onChange, globalKeys = false, autoFocus = false }) {
  const { text, speed, size, mirror } = state;
  const scrollRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const speedRef = React.useRef(pixelsPerSecond(speed, size));
  speedRef.current = pixelsPerSecond(speed, size);

  React.useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now) => {
      const el = scrollRef.current;
      if (!el) return;
      carry += (speedRef.current * (now - last)) / 1000;
      last = now;
      const whole = Math.floor(carry);
      if (whole > 0) {
        el.scrollTop += whole;
        carry -= whole;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const restart = React.useCallback(() => {
    setPlaying(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const run = React.useCallback((action) => {
    if (action === 'toggle') setPlaying((p) => !p);
    else if (action === 'faster') onChange({ speed: step(speed, 1, SPEED_MIN, SPEED_MAX) });
    else if (action === 'slower') onChange({ speed: step(speed, -1, SPEED_MIN, SPEED_MAX) });
    else if (action === 'bigger') onChange({ size: step(size, 4, SIZE_MIN, SIZE_MAX) });
    else if (action === 'smaller') onChange({ size: step(size, -4, SIZE_MIN, SIZE_MAX) });
    else if (action === 'restart') restart();
  }, [onChange, restart, size, speed]);

  const onKeyDown = React.useCallback((e) => {
    if (e.target?.closest?.('button, input, textarea, select')) return;
    const action = prompterKeyAction(e.key);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    run(action);
  }, [run]);

  React.useEffect(() => {
    if (!globalKeys) return undefined;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [globalKeys, onKeyDown]);

  const rootRef = React.useRef(null);
  React.useEffect(() => { if (autoFocus) rootRef.current?.focus(); }, [autoFocus]);

  return (
    <div ref={rootRef} className="hb-prompter" tabIndex={0} onKeyDown={globalKeys ? undefined : onKeyDown} aria-label="Teleprompter">
      <div ref={scrollRef} className="hb-prompter-scroll" data-mirror={mirror ? 'true' : 'false'}>
        <div className="hb-prompter-text" style={{ '--prompter-size': `${size}px` }}>
          {text.trim() ? text : 'Your script is empty. Click Edit script to write one.'}
        </div>
      </div>
      <div className="hb-prompter-line" aria-hidden="true" />
      <div className="hb-prompter-bar" role="toolbar" aria-label="Teleprompter controls">
        <button type="button" className="hb-prompter-btn" data-primary="true" onClick={() => run('toggle')} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <><Icon.Stop size={12} /> Pause</> : <><Icon.Play size={12} /> Play</>}
        </button>
        <button type="button" className="hb-prompter-btn" onClick={restart} title="Back to the top (R)">Restart</button>
        <span className="hb-prompter-group" aria-label="Speed">
          <button type="button" className="hb-prompter-btn" onClick={() => run('slower')} aria-label="Slower">-</button>
          <span className="hb-prompter-value">Speed {speed}</span>
          <button type="button" className="hb-prompter-btn" onClick={() => run('faster')} aria-label="Faster">+</button>
        </span>
        <span className="hb-prompter-group" aria-label="Text size">
          <button type="button" className="hb-prompter-btn" onClick={() => run('smaller')} aria-label="Smaller text">A-</button>
          <button type="button" className="hb-prompter-btn" onClick={() => run('bigger')} aria-label="Bigger text">A+</button>
        </span>
        <button type="button" className="hb-prompter-btn" aria-pressed={mirror} onClick={() => onChange({ mirror: !mirror })} title="Flip the words for a mirror glass rig">Mirror</button>
      </div>
    </div>
  );
}
