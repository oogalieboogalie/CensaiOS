/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { formatAmount } from '../../../lib/games/idle/economy.js';

export function awayText(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

/** The big Dig button, with the "+1" that floats up on every dig. */
export function DigButton({ onDig, canPlay }) {
  const [floaters, setFloaters] = React.useState([]);
  const [pressed, setPressed] = React.useState(false);
  const nextId = React.useRef(0);

  const onTap = (e) => {
    const value = onDig();
    if (!value) return;
    const button = e.currentTarget.getBoundingClientRect();
    const wrap = e.currentTarget.parentElement.getBoundingClientRect();
    const id = (nextId.current += 1);
    const x = (e.clientX || button.left + button.width / 2) - wrap.left;
    const y = (e.clientY || button.top + button.height / 2) - wrap.top;
    setFloaters((list) => [...list.slice(-14), { id, x, y, value }]);
    setTimeout(() => setFloaters((list) => list.filter((f) => f.id !== id)), 900);
  };
  const onKey = (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) { setPressed(true); onTap(e); }
  };

  return (
    <div className="hb-idle-tap-wrap">
      <button type="button" className="hb-idle-tap hb-blocks-dig" data-pressed={pressed ? 'true' : undefined} disabled={!canPlay}
        onClick={onTap} onKeyDown={onKey} onKeyUp={() => setPressed(false)} data-testid="blocks-dig" data-no-drag aria-label="Dig">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M12 4 L19 8 L12 12 L5 8 Z" className="hb-blocks-dig-top" />
          <path d="M5 8 L12 12 L12 20 L5 16 Z" className="hb-blocks-dig-left" />
          <path d="M19 8 L12 12 L12 20 L19 16 Z" className="hb-blocks-dig-right" />
        </svg>
        <span>Dig</span>
      </button>
      {floaters.map((f) => (
        <span key={f.id} className="hb-idle-float" style={{ left: f.x, top: f.y }} aria-hidden="true">+{formatAmount(f.value)}</span>
      ))}
    </div>
  );
}
