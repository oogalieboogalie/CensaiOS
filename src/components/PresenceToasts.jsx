import React from 'react';

/**
 * Top-center canvas toasts for presence: joins, leaves, invites.
 * Auto-dismisses after 6s; newest on top, max 3 visible.
 */
export function PresenceToasts({ collaboration, onDismiss }) {
  const notices = (collaboration?.notices || []).slice(-3).reverse();
  const [dismissed, setDismissed] = React.useState({});
  const visible = notices.filter((n) => !dismissed[n.id]);
  if (visible.length === 0) return null;

  const hide = (id) => {
    setDismissed((d) => ({ ...d, [id]: true }));
    onDismiss?.(id);
  };

  return (
    <div style={{
      position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1300, display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {visible.map((n) => (
        <Toast key={n.id} notice={n} onHide={() => hide(n.id)} />
      ))}
    </div>
  );
}

function Toast({ notice, onHide }) {
  React.useEffect(() => {
    const timer = setTimeout(onHide, 6000);
    return () => clearTimeout(timer);
  }, [onHide]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--surface)', border: '1px solid var(--hairline)',
      borderRadius: 999, boxShadow: 'var(--shadow-pop)',
      padding: '8px 8px 8px 14px', fontFamily: 'var(--font-sans)', fontSize: 12,
      color: 'var(--ink)', pointerEvents: 'auto',
      animation: 'presence-toast-in 0.25s ease-out',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: notice.kind === 'join' ? 'var(--ps-green)' : 'var(--ink-faint)',
      }} />
      <span>{notice.text}</span>
      <button
        onClick={onHide}
        title="Dismiss"
        style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 12, padding: '0 4px' }}
      >
        ✕
      </button>
      <style>{'@keyframes presence-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }'}</style>
    </div>
  );
}
