import React from 'react';

// The drafts LeadHound saved with a lead: its 7-day intro sequence and its
// ice breaker, folded under the lead in the Lead Queue with a copy button
// on each day.

const box = { marginTop: 6, border: '1px dashed var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '7px 9px', background: 'var(--surface-2)' };
const small = { all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent-ink)' };

function CopyText({ text }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the text stays on screen to select by hand */ }
  };
  return <button type="button" onClick={copy} style={small}>{copied ? '✓ Copied' : '⧉ Copy'}</button>;
}

export function SavedOutreach({ lead }) {
  const [open, setOpen] = React.useState(false);
  const sequence = Array.isArray(lead.outreach_sequence) ? lead.outreach_sequence : [];
  const ice = lead.ice_breaker;
  if (!sequence.length && !ice) return null;
  const label = [sequence.length && `${sequence.length}-day sequence`, ice && 'ice breaker'].filter(Boolean).join(' + ');
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ ...small, color: 'var(--ps-teal)', marginTop: 6 }}>
        {open ? '▾' : '▸'} Saved drafts: {label}
      </button>
      {open && sequence.map((step) => {
        const text = `${step.subject ? `Subject: ${step.subject}\n\n` : ''}${step.body}`;
        return (
          <div key={step.day} style={box} data-saved-day={step.day}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Day {step.day} · {step.channel}</div>
            {step.subject && <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginTop: 2 }}>{step.subject}</div>}
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{step.body}</div>
            <CopyText text={text} />
          </div>
        );
      })}
      {open && ice && (
        <div style={box} data-saved-ice="true">
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>Ice breaker{ice.format ? ` · ${ice.format}` : ''}</div>
          {ice.title && <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginTop: 2 }}>{ice.title}</div>}
          {ice.opening_line && <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{ice.opening_line}</div>}
          {ice.deliverable && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{ice.deliverable}</div>}
          {ice.cta && <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginTop: 4 }}>{ice.cta}</div>}
          <CopyText text={[ice.title, ice.opening_line, ice.deliverable, ice.cta].filter(Boolean).join('\n\n')} />
        </div>
      )}
    </div>
  );
}
