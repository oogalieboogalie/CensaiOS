import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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

// ── Confirmation ──────────────────────────────────────────────────────────
// Destructive actions ask once, in a dialog that lives inside the window (a
// browser confirm() would freeze the whole canvas for every collaborator).
// Enter confirms, Esc cancels, focus stays trapped on the two buttons.

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), []);
  const close = (ok) => { ask?.resolve(ok); setAsk(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask && <ConfirmDialog {...ask} onCancel={() => close(false)} onConfirm={() => close(true)} />}
    </ConfirmContext.Provider>
  );
}

/** `await confirm({ title, body, confirmLabel })` resolves true when confirmed. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  // Outside a provider (isolated tests) fall through to "confirmed".
  return ctx || (async () => true);
}

export function ConfirmDialog({ title, body, detail, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const before = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const id = React.useId();
  useEffect(() => {
    confirmRef.current?.focus();
    const prev = before.current;
    return () => { if (prev && typeof prev.focus === 'function') prev.focus(); };
  }, []);
  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === confirmRef.current ? cancelRef : confirmRef).current?.focus();
    }
  };
  return (
    <div className="dk-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }} onKeyDown={onKeyDown}>
      <div className="dk-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`}>
        <div className="dk-dialog-title" id={`${id}-t`}>{title}</div>
        <div className="dk-dialog-body" id={`${id}-b`}>{body}</div>
        {detail && <div className="dk-dialog-detail">{detail}</div>}
        <div className="dk-dialog-actions">
          <span className="dk-dialog-keys"><kbd>Esc</kbd> cancel <kbd>↵</kbd> confirm</span>
          <button ref={cancelRef} type="button" className="dk-btn dk-btn--quiet" onClick={onCancel}>Cancel</button>
          <button ref={confirmRef} type="button" className={`dk-btn ${tone === 'danger' ? 'dk-btn--danger-solid' : 'dk-btn--primary'}`}
            onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** A button that asks before it acts. `ask` is the confirm() payload. */
export function ConfirmButton({ icon, label, ask, onConfirm, busy, disabled, children, tone = 'danger' }) {
  const confirm = useConfirm();
  return (
    <IconButton icon={icon} label={label} tone={tone} busy={busy} disabled={disabled}
      onClick={async (e) => { e.stopPropagation(); if (await confirm({ confirmLabel: label, ...ask })) onConfirm(); }}>
      {children}
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

// Round a chart ceiling up to 1, 2 or 5 x 10^n so gridline labels read cleanly.
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/**
 * A wider time-series chart for the Stats tab: area + line, a dashed
 * average, gridlines at the top value and half of it, and a dot on the
 * latest sample. Values are drawn in percent of `max` (auto-grows).
 */
export function SeriesChart({ points = [], max = 100, format = (v) => v, height = 96, label }) {
  if (points.length < 2) return <div className="dk-chart dk-spark--empty" style={{ height }}>collecting samples…</div>;
  const w = 300;
  const top = niceCeil(Math.max(max, ...points) * 1.15) * 1.1 || 1;
  const y = (v) => height - (v / top) * (height - 6) - 3;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, y(p)]);
  const line = xy.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const avg = points.reduce((a, b) => a + b, 0) / points.length;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <div className="dk-chart" role="img" aria-label={`${label}: latest ${format(points[points.length - 1])}, average ${format(avg)}`}>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
        <line x1="0" x2={w} y1={y(top / 1.1)} y2={y(top / 1.1)} className="dk-chart-grid" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={w} y1={y(top / 2.2)} y2={y(top / 2.2)} className="dk-chart-grid" vectorEffect="non-scaling-stroke" />
        <path d={`${line} L${w},${height} L0,${height} Z`} className="dk-spark-area" />
        <line x1="0" x2={w} y1={y(avg)} y2={y(avg)} className="dk-chart-avg" vectorEffect="non-scaling-stroke" />
        <path d={line} className="dk-spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="dk-chart-dot" style={{ left: `${(lx / w) * 100}%`, top: ly }} />
      <span className="dk-chart-axis dk-chart-axis--top">{format(top / 1.1)}</span>
      <span className="dk-chart-axis dk-chart-axis--mid">{format(top / 2.2)}</span>
    </div>
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

export function Kbd({ children }) {
  return <kbd className="dk-kbd">{children}</kbd>;
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
