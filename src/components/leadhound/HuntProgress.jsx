import React from 'react';
import { Icon } from '../Icons.jsx';
import { HUNT_STEPS } from './useLeadHound.js';

function StepDetail({ id, detail = {} }) {
  if (id === 'search' && detail.queries?.length) {
    return (
      <div className="hb-lh-chips">
        {detail.queries.map((q) => <span key={q} className="hb-lh-chip" title={q}><Icon.Search size={10} />{q}</span>)}
      </div>
    );
  }
  if (id === 'score' && Number.isFinite(detail.found)) {
    return <div className="hb-lh-step-detail">{detail.found} {detail.found === 1 ? 'site' : 'sites'} came back. Ranking them by how likely they are to buy.</div>;
  }
  if (id === 'enrich' && detail.shortlist?.length) {
    return (
      <div className="hb-lh-chips">
        {detail.shortlist.map((l) => <span key={l.host || l.company} className="hb-lh-chip">{l.company} <span className="hb-lh-mono">{l.fitScore}</span></span>)}
      </div>
    );
  }
  if (id === 'draft' && detail.total) {
    return <div className="hb-lh-step-detail">{detail.drafted || 0} of {detail.total} written{detail.company ? `, latest ${detail.company}` : ''}</div>;
  }
  return null;
}

export function HuntProgress({ progress = { stepIndex: 0, details: {} }, brief, note = '' }) {
  const { stepIndex, details } = progress;
  return (
    <div className="hb-lh-progress" role="status" aria-live="polite">
      <h3 className="hb-lh-progress-head">{brief?.market ? `Hunting for ${brief.market}` : 'Hunting'}</h3>
      {note && <p className="hb-lh-step-detail">{note}</p>}
      {HUNT_STEPS.map((step, i) => {
        const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo';
        return (
          <div key={step.id} className="hb-lh-step" data-state={state}>
            <span className="hb-lh-dot" aria-hidden="true" />
            <div className="hb-lh-step-body">
              <span className="hb-lh-step-label">{step.label}{state === 'active' ? '…' : ''}</span>
              {state !== 'todo' && <StepDetail id={step.id} detail={details[step.id]} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TavilyKeyPrompt({ onSave, replacing = false, who = 'LeadHound' }) {
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const save = async (event) => {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setMsg('');
    try {
      await onSave(value.trim());
      setValue('');
    } catch (err) {
      setMsg(err.message || 'Could not save the key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="hb-lh-key">
      <div>
        {replacing
          ? 'Paste a new Tavily key. It replaces the one in your key vault.'
          : `${who} searches with your own Tavily key. It is stored encrypted in your key vault, and your chat agents use it for web search too. Get one free at app.tavily.com.`}
      </div>
      <div className="hb-lh-key-row">
        <input
          className="hb-lh-input"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="tvly-…"
          aria-label="Tavily API key"
        />
        <button type="submit" className="hb-lh-pill" disabled={!value.trim() || busy}>
          {busy ? 'Saving…' : 'Save key'}
        </button>
      </div>
      {msg && <div className="hb-lh-alert">{msg}</div>}
    </form>
  );
}
