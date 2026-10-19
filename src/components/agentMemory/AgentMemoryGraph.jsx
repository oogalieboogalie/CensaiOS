/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { agentMemoryApi } from '../../lib/agentMemory/api.js';
import { day, moment } from './AgentMemoryParts.jsx';

const span = (row) => (row.validTo ? `true ${day(row.validFrom)} to ${day(row.validTo)}` : `true since ${day(row.validFrom)}`);
const today = () => new Date().toISOString().slice(0, 10);

function LinkLine({ link }) {
  return (
    <div className="hb-amem-link-line">
      <span className="hb-amem-thing">{link.from}</span>
      <span className="hb-amem-rel">{link.relation}</span>
      <span className="hb-amem-thing">{link.to}</span>
    </div>
  );
}

function LinkCard({ link, busy, onEnd, onForget }) {
  const [ending, setEnding] = React.useState(false);
  const [ended, setEnded] = React.useState('');
  return (
    <li className="hb-amem-fact" data-testid="amem-link" data-link={`${link.from}|${link.relation}|${link.to}`.toLowerCase()}>
      <LinkLine link={link} />
      <div className="hb-aep-hint">{span(link)} · learned {moment(link.recordedAt)}{link.source === 'person' ? ' · added by you' : ''}</div>
      <div className="hb-otl-actions">
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} data-testid="amem-link-end" onClick={() => setEnding(true)}>It ended</button>
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} onClick={onForget}>It was wrong</button>
      </div>
      {ending && (
        <form className="hb-aep-new" onSubmit={async (e) => { e.preventDefault(); if (await onEnd(ended || undefined)) setEnding(false); }}>
          <input className="hb-aep-input hb-amem-date" type="date" title="When it ended (default: today)" value={ended}
            onChange={(e) => setEnded(e.target.value)} data-testid="amem-link-ended" />
          <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy}>Save</button>
        </form>
      )}
    </li>
  );
}

const EMPTY = { from: '', relation: '', to: '', since: '', replaces: false };

function AddLinkForm({ busy, onSave }) {
  const [form, setForm] = React.useState(EMPTY);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const { since, ...rest } = form;
    if (await onSave({ ...rest, from: form.from || 'the user', ...(since ? { since } : {}) })) setForm(EMPTY);
  };
  return (
    <form className="hb-otl-add" onSubmit={submit} data-testid="amem-add-link">
      <input className="hb-aep-input" placeholder="Who or what (default: you)" value={form.from} onChange={set('from')} data-testid="amem-link-from" />
      <input className="hb-aep-input" placeholder="How they connect, e.g. works at" value={form.relation} onChange={set('relation')} data-testid="amem-link-relation" />
      <input className="hb-aep-input" placeholder="To what, e.g. Iowa AI LLC" value={form.to} onChange={set('to')} data-testid="amem-link-to" />
      <label className="hb-aep-hint hb-amem-since">True since (leave empty for today)
        <input className="hb-aep-input hb-amem-date" type="date" value={form.since} onChange={set('since')} data-testid="amem-link-since" />
      </label>
      <label className="hb-aep-hint hb-amem-since">
        <input type="checkbox" checked={form.replaces} onChange={set('replaces')} data-testid="amem-link-replaces" />
        This replaces the old one (a new job, a move). The old one is kept as past.
      </label>
      <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy || !form.relation.trim() || !form.to.trim()}
        data-testid="amem-link-add">Remember this connection</button>
    </form>
  );
}

/** "Connections": the knowledge graph, now and in the past. */
export function ConnectionsTab({ agent, data, busy, act }) {
  const past = (data.linkHistory || []).filter((row) => row.validTo && !row.supersededAt);
  const links = data.links || [];
  return (
    <>
      <section className="hb-aep-section">
        <div className="hb-aep-label">How things are connected now</div>
        {links.length === 0
          ? <div className="hb-aep-empty">No connections yet. Tell {agent.name} who works where, who knows who, or add one below.</div>
          : (
            <ul className="hb-amem-list" data-testid="amem-links">
              {links.map((link) => (
                <LinkCard key={link.id} link={link} busy={busy}
                  onEnd={(ended) => act(() => agentMemoryApi.endLink(agent.id, link.id, ended))}
                  onForget={() => act(() => agentMemoryApi.forgetLink(agent.id, link.id))} />
              ))}
            </ul>
          )}
      </section>
      {past.length > 0 && (
        <section className="hb-aep-section">
          <div className="hb-aep-label">Past connections (kept, with their dates)</div>
          <ul className="hb-amem-list" data-testid="amem-past-links">
            {past.map((link) => (
              <li key={link.id} className="hb-amem-fact hb-amem-past" data-testid="amem-past-link">
                <LinkLine link={link} />
                <div className="hb-aep-hint">{span(link)} · learned {moment(link.recordedAt)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="hb-aep-section">
        <div className="hb-aep-label">Add a connection</div>
        <AddLinkForm busy={busy} onSave={(link) => act(() => agentMemoryApi.saveLink(agent.id, link))} />
      </section>
    </>
  );
}

/** "Look back": everything that was true on one date. */
export function LookBackTab({ agent }) {
  const [date, setDate] = React.useState(today());
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const look = async (e) => {
    e?.preventDefault();
    setError('');
    try { setResult(await agentMemoryApi.asOf(agent.id, date)); } catch (err) { setError(err.message); }
  };
  return (
    <section className="hb-aep-section" data-testid="amem-lookback">
      <div className="hb-aep-label">What was true on a date</div>
      <div className="hb-aep-hint">Pick a day. You see what {agent.name} knows was true then, even if it changed since.</div>
      <form className="hb-aep-new" onSubmit={look}>
        <input className="hb-aep-input hb-amem-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="amem-asof-date" />
        <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={!date} data-testid="amem-asof-show">Show</button>
      </form>
      {error && <div className="hb-aep-error" role="alert">{error}</div>}
      {result && (
        <div className="hb-amem-asof" data-testid="amem-asof-result">
          <div className="hb-aep-label">On {day(result.date)}</div>
          {!result.facts.length && !result.links.length && <div className="hb-aep-empty">Nothing {agent.name} knows was true on that day.</div>}
          <ul className="hb-amem-list">
            {result.facts.map((fact) => (
              <li key={`f${fact.id}`} className="hb-amem-fact" data-testid="amem-asof-fact">
                <div className="hb-amem-fact-head">
                  <span className="hb-amem-attr">{fact.attribute} <span className="hb-amem-of">of {fact.subject}</span></span>
                  <span className="hb-amem-value">{fact.value}</span>
                </div>
                <div className="hb-aep-hint">{span(fact)}</div>
              </li>
            ))}
            {result.links.map((link) => (
              <li key={`l${link.id}`} className="hb-amem-fact" data-testid="amem-asof-link">
                <LinkLine link={link} />
                <div className="hb-aep-hint">{span(link)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
