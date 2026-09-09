import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';

export function AnalyticsBoardWindow({ win, onUpdate }) {
  // Extract custom state stored on the window object (persists automatically in workspace)
  const count = win.count || 0;
  const note = win.note || '';

  const increment = () => onUpdate({ count: count + 1 });
  const handleNoteChange = (e) => onUpdate({ note: e.target.value });

  return (
    <>
      {/* ─── TITLE STRIP ─── */}
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'AnalyticsBoard View'}
        subtitle={win.subtitle || 'Autonomous Widget'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      />

      {/* ─── BODY CONTAINER ─── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--window-bg, var(--surface))',
      }}>
        {/* Core Description Card */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--hairline)',
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--ink-soft)',
        }}>
          This is a par-baked <strong>AnalyticsBoardWindow</strong>, generated autonomously. Add your custom interactive inputs, charts, or agent workflows here.
        </div>

        {/* Example Interactive Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{
            padding: 12,
            background: 'var(--surface-2)',
            border: '1px solid var(--hairline)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Interactive Counter</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{count}</span>
            <button
              onClick={increment}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                background: 'var(--accent-soft)',
                color: 'var(--accent-ink)',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'oklch(from var(--accent-soft) l c h / 0.85)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent-soft)'}
            >
              Increment
            </button>
          </div>

          <div style={{
            padding: 12,
            background: 'var(--surface-2)',
            border: '1px solid var(--hairline)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workspace Notes</span>
            <textarea
              value={note}
              onChange={handleNoteChange}
              placeholder="Type notes..."
              style={{
                all: 'unset',
                height: 52,
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 6,
                padding: 6,
                fontSize: 12,
                color: 'var(--ink)',
                resize: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
