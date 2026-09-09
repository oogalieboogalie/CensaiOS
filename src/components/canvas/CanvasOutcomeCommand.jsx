/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';

export function buildOutcomePrompt(value) {
  const outcome = String(value || '').trim();
  if (!outcome) return '';
  return [
    'I want my agent team to accomplish this outcome:',
    '',
    outcome,
    '',
    'Start now. Turn this into a concrete workspace plan, choose the agents and tools that are actually needed, and create or schedule the next steps you can execute. Ask only when a missing decision would materially change the result. Keep the work and receipts visible in this workspace.',
  ].join('\n');
}

export function CanvasOutcomeCommand({ onSubmit }) {
  const [outcome, setOutcome] = React.useState('');
  const prompt = buildOutcomePrompt(outcome);
  const canSubmit = Boolean(prompt) && typeof onSubmit === 'function';

  const submit = (event) => {
    event.preventDefault();
    if (canSubmit) onSubmit(prompt);
  };

  return (
    <div style={{ margin: '14px 0 17px', textAlign: 'left' }}>
      <label htmlFor="canvas-outcome" style={{
        display: 'block', color: 'var(--ink)', fontSize: 13.5, fontWeight: 750,
      }}>
        What would you like to do?
      </label>
      <p style={{
        margin: '4px 0 9px', color: 'var(--ink-soft)', fontSize: 11.5, lineHeight: 1.45,
      }}>
        Describe what you want to do and Censai will suggest modules that fit your needs.
      </p>
      <form onSubmit={submit} style={{
        display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 34px',
        alignItems: 'center', gap: 7, padding: 6, border: '1px solid var(--hairline-strong)',
        borderRadius: 11, background: 'var(--surface)', boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{
          gridColumn: '1 / -1', margin: '-2px 0 2px', color: 'var(--ink-faint)', fontSize: 10.5, lineHeight: 1.45,
        }}>
          Censai can make mistakes. Feedback is welcome.
        </div>
        <span aria-hidden="true" style={{
          width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
          color: 'var(--ps-blue)', background: 'color-mix(in oklab, var(--ps-blue) 12%, var(--surface))',
        }}>
          <Icon.Plus size={14} />
        </span>
        <input
          id="canvas-outcome"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          placeholder="Tell Censai what you want done…"
          autoComplete="off"
          autoFocus
          style={{
            width: '100%', minWidth: 0, padding: '6px 2px', border: 0, outline: 0,
            background: 'transparent', color: 'var(--ink)', font: '500 13px var(--font-sans)',
          }}
        />
        <button type="submit" aria-label="Start with Censai" disabled={!canSubmit} style={{
          width: 34, height: 34, border: 0, borderRadius: 9, display: 'grid', placeItems: 'center',
          background: canSubmit ? 'var(--ps-blue)' : 'var(--surface-2)',
          color: canSubmit ? 'var(--color-white)' : 'var(--ink-faint)',
          cursor: canSubmit ? 'pointer' : 'default',
        }}>
          <Icon.ArrowAssign size={15} />
        </button>
      </form>
    </div>
  );
}
