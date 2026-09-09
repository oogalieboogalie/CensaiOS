import React from 'react';
import { createPortal } from 'react-dom';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';
import { Icon } from '../Icons.jsx';

const MODAL_OVERLAY = {
  position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.32)',
  backdropFilter: 'blur(6px)', zIndex: 200, animation: 'fadeIn 0.2s ease both',
};
const MODAL_KEYFRAMES = `
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes popIn { from { opacity: 0; transform: translate(-50%,-48%) scale(0.97) } to { opacity: 1; transform: translate(-50%,-50%) scale(1) } }
`;
const MODAL_BASE = {
  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
  zIndex: 210, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
  background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 14,
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-pop)', animation: 'popIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) both',
};

function renderReceiptLayer(children) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

export function TaskResultModal({ task, onClose }) {
  const body = task.error || task.result || '';
  return (
    <>
      <div onClick={onClose} style={MODAL_OVERLAY} />
      <style>{MODAL_KEYFRAMES}</style>
      <div role="dialog" aria-modal="true" style={{ ...MODAL_BASE, width: 640, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Task Result</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title || 'Untitled task'}</div>
          </div>
          <button onClick={onClose} title="Close" style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4 }}>
            {React.createElement(Icon.Close, { size: 16 })}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-2)', padding: 14, borderRadius: 10, border: '1px solid var(--hairline)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink)', userSelect: 'text' }}>
          {body ? renderMarkdown(body) : <div style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>No result provided.</div>}
        </div>
      </div>
    </>
  );
}

export function ReceiptModal({ task, receipt, onClose }) {
  return renderReceiptLayer(
    <>
      <div onClick={onClose} style={MODAL_OVERLAY} />
      <style>{MODAL_KEYFRAMES}</style>
      <div role="dialog" aria-modal="true" aria-label="Completion Receipt" style={{ ...MODAL_BASE, width: 620, padding: 18, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Completion Receipt</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{receipt.title || task.title || 'Completed agent work'}</div>
          </div>
          <button onClick={onClose} title="Close" style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4 }}>
            {React.createElement(Icon.Close, { size: 16 })}
          </button>
        </div>
        <div style={{ minHeight: 0, display: 'grid', gap: 10, overflowY: 'auto', paddingRight: 2 }}>
          <ReceiptBlock title="Changed" items={receipt.summary} empty="No change summary was captured." />
          <ReceiptBlock title="Landed" items={receipt.landed} empty="No landing location was captured." />
          <ReceiptBlock title="Verify" items={receipt.verify} empty="No verification steps were captured." />
        </div>
      </div>
    </>
  );
}

export function ReceiptBlock({ title, items, empty }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <section style={{ minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 10, background: 'var(--surface-2)', padding: 12 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>{title}</div>
      {list.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 5, fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
          {list.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{empty}</div>
      )}
    </section>
  );
}
