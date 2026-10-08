import React, { useEffect, useState } from 'react';
import { DIcon } from './dockerIcons.jsx';

// Small shared primitives for the Docker window: buttons, a two-step
// confirm, status dots, meters, sparklines and the empty/loading/error
// states, so every panel speaks the same visual language.

export function IconButton({ icon, label, onClick, disabled, busy, tone, children, className = '' }) {
  return (
    <button type="button" className={`dk-btn ${tone ? `dk-btn--${tone}` : ''} ${children ? '' : 'dk-btn--icon'} ${className}`}
      onClick={onClick} disabled={disabled || busy} title={label} aria-label={label} data-busy={busy ? 'true' : undefined}>
      {busy ? <span className="dk-spinner" aria-hidden="true" /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

/** First click arms, second click within 3s confirms. No browser dialogs. */
export function ConfirmButton({ icon, label, confirmLabel = 'Confirm', onConfirm, busy, disabled, children }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <IconButton icon={icon} label={armed ? confirmLabel : label} tone={armed ? 'danger-solid' : 'danger'}
      busy={busy} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : children}
    </IconButton>
  );
}

export function StatusDot({ tone = 'idle', pulse = false }) {
  return <span className={`dk-dot dk-dot--${tone} ${pulse ? 'dk-dot--pulse' : ''}`} aria-hidden="true" />;
}

export function Badge({ tone = 'idle', children, title }) {
  return <span className={`dk-badge dk-badge--${tone}`} title={title}>{children}</span>;
}

export function Meter({ value, label, detail }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = pct >= 85 ? 'danger' : pct >= 60 ? 'warn' : 'ok';
  return (
    <div className="dk-meter" title={detail}>
      <div className="dk-meter-head"><span>{label}</span><strong>{detail}</strong></div>
      <div className="dk-meter-track"><div className={`dk-meter-fill dk-meter-fill--${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function Sparkline({ points = [], max = 100, height = 36, className = '' }) {
  if (points.length < 2) return <div className={`dk-spark dk-spark--empty ${className}`} style={{ height }}>collecting…</div>;
  const w = 100;
  const top = Math.max(max, ...points, 1);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, height - (p / top) * (height - 2) - 1]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg className={`dk-spark ${className}`} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
      <path d={`${line} L${w},${height} L0,${height} Z`} className="dk-spark-area" />
      <path d={line} className="dk-spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="dk-empty" role="status">
      <div className="dk-empty-icon">{icon}</div>
      <div className="dk-empty-title">{title}</div>
      {children && <div className="dk-empty-body">{children}</div>}
      {action}
    </div>
  );
}

export function SkeletonRows({ count = 5 }) {
  return (
    <div className="dk-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="dk-skeleton-row" style={{ opacity: 1 - i * 0.14 }}>
          <span className="dk-skel dk-skel--dot" /><span className="dk-skel dk-skel--name" />
          <span className="dk-skel dk-skel--meta" /><span className="dk-skel dk-skel--bar" />
        </div>
      ))}
    </div>
  );
}

const UNAVAILABLE_COPY = {
  'daemon-down': { title: 'Docker engine isn\'t running', hint: 'Start Docker Desktop (or run `sudo systemctl start docker`). This window reconnects on its own.' },
  'not-installed': { title: 'Docker isn\'t installed', hint: 'Install Docker Desktop from docker.com, then reopen this window.' },
  'runner-disabled': { title: 'Docker control is off on this server', hint: 'Set RUNNER_ENABLED=true (or point RUNNER_URL at a runner) to manage containers from Homebase.' },
  'runner-unreachable': { title: 'Can\'t reach the command runner', hint: 'RUNNER_URL points at a runner that isn\'t answering or is missing RUNNER_SECRET. Start the runner, or remove RUNNER_URL to run Docker commands locally.' },
  forbidden: { title: 'Docker management isn\'t available here', hint: 'This server doesn\'t expose its Docker engine to workspace users.' },
};

export function UnavailableState({ reason, message, onRetry, retrying }) {
  const copy = UNAVAILABLE_COPY[reason] || { title: 'Can\'t reach Docker', hint: message };
  return (
    <EmptyState icon={<DIcon.Whale size={34} />} title={copy.title}
      action={onRetry && <IconButton icon={<DIcon.Refresh />} label="Check again" onClick={onRetry} busy={retrying}>Check again</IconButton>}>
      <p>{copy.hint}</p>
      {message && message !== copy.hint && <p className="dk-empty-detail">{message}</p>}
    </EmptyState>
  );
}

export function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className={`dk-toast dk-toast--${toast.tone}`} role={toast.tone === 'danger' ? 'alert' : 'status'}>
      <StatusDot tone={toast.tone === 'danger' ? 'danger' : 'ok'} />
      <span className="dk-toast-msg">{toast.message}</span>
      <button type="button" className="dk-toast-x" onClick={onDismiss} aria-label="Dismiss"><DIcon.Close size={12} /></button>
    </div>
  );
}
