/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { agentMemoryApi } from '../../lib/agentMemory/api.js';

export function day(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Date and time, for when the agent learned or replaced something. */
export function moment(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function span(row) {
  return row.validTo ? `true ${day(row.validFrom)} to ${day(row.validTo)}` : `true since ${day(row.validFrom)}`;
}

const KIND_WORDS = { new: 'first learned', change: 'changed', correction: 'corrected', history: 'past value' };
const ORIGIN_WORDS = { chat: 'Chat', help: 'Helping an agent', endpoint: 'Outside app' };

export function HistoryList({ rows }) {
  return (
    <ol className="hb-amem-history" data-testid="amem-history">
      {rows.map((row) => (
        <li key={row.id} className="hb-amem-version" data-state={row.supersededAt ? 'replaced' : row.validTo ? 'past' : 'current'}>
          <span className="hb-amem-value">{row.value}</span>
          <span className="hb-aep-hint">
            {span(row)} · learned {moment(row.recordedAt)} · {KIND_WORDS[row.kind] || row.kind}
            {row.supersededAt ? ` · replaced ${moment(row.supersededAt)}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function FactCard({ fact, history, busy, onSave, onForget }) {
  const [open, setOpen] = React.useState(false);
  const [edit, setEdit] = React.useState(null);
  const [value, setValue] = React.useState('');
  const [since, setSince] = React.useState('');
  const submit = async (e) => {
    e.preventDefault();
    const ok = await onSave({ subject: fact.subject, attribute: fact.attribute, value, kind: edit, ...(edit === 'change' && since ? { validFrom: since } : {}) });
    if (ok) { setEdit(null); setValue(''); setSince(''); setOpen(true); }
  };
  return (
    <li className="hb-amem-fact" data-testid="amem-fact" data-key={fact.key}>
      <div className="hb-amem-fact-head">
        <span className="hb-amem-attr">{fact.attribute} <span className="hb-amem-of">of {fact.subject}</span></span>
        <span className="hb-amem-value" data-testid="amem-fact-value">{fact.value}</span>
      </div>
      <div className="hb-aep-hint">{span(fact)} · learned {moment(fact.recordedAt)}{fact.source === 'person' ? ' · added by you' : ''}</div>
      <div className="hb-otl-actions">
        {history.length > 1 && (
          <button type="button" className="hb-aep-btn" data-variant="quiet" data-testid="amem-show-history" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide history' : `History (${history.length})`}
          </button>
        )}
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} onClick={() => setEdit('change')}>It changed</button>
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} data-testid="amem-correct" onClick={() => setEdit('correction')}>It was wrong</button>
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} onClick={onForget}>Forget</button>
      </div>
      {edit && (
        <form className="hb-aep-new" onSubmit={submit}>
          <input className="hb-aep-input" autoFocus placeholder={edit === 'change' ? 'What is it now?' : 'What was it really?'}
            value={value} onChange={(e) => setValue(e.target.value)} data-testid="amem-new-value" />
          {edit === 'change' && (
            <input className="hb-aep-input hb-amem-date" type="date" title="When it changed (default: today)" value={since}
              onChange={(e) => setSince(e.target.value)} data-testid="amem-new-since" />
          )}
          <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy || !value.trim()}>Save</button>
        </form>
      )}
      {open && <HistoryList rows={history} />}
    </li>
  );
}

const EMPTY = { subject: '', attribute: '', value: '', validFrom: '' };

export function AddFactForm({ busy, onSave }) {
  const [form, setForm] = React.useState(EMPTY);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const { validFrom, ...rest } = form;
    if (await onSave({ ...rest, subject: form.subject || 'the user', ...(validFrom ? { validFrom } : {}) })) setForm(EMPTY);
  };
  return (
    <form className="hb-otl-add" onSubmit={submit} data-testid="amem-add">
      <input className="hb-aep-input" placeholder="About who or what (default: you)" value={form.subject} onChange={set('subject')} />
      <input className="hb-aep-input" placeholder="What about them, e.g. favorite color" value={form.attribute} onChange={set('attribute')} data-testid="amem-add-attribute" />
      <input className="hb-aep-input" placeholder="The fact, e.g. green" value={form.value} onChange={set('value')} data-testid="amem-add-value" />
      <label className="hb-aep-hint hb-amem-since">True since (leave empty for today)
        <input className="hb-aep-input hb-amem-date" type="date" value={form.validFrom} onChange={set('validFrom')} data-testid="amem-add-since" />
      </label>
      <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy || !form.attribute.trim() || !form.value.trim()}
        data-testid="amem-add-btn">Remember this</button>
    </form>
  );
}

export function IdentityEditor({ agent, identity, versions, busy, onSave }) {
  const starter = `I am ${agent.name}${agent.role ? `, ${agent.role}` : ''}. `;
  const [text, setText] = React.useState(identity?.core || '');
  React.useEffect(() => { setText(identity?.core || ''); }, [identity?.core]);
  const older = versions.filter((v) => v.supersededAt);
  return (
    <div className="hb-otl-add" data-testid="amem-identity">
      <div className="hb-aep-label">Who {agent.name} is</div>
      <div className="hb-aep-hint">
        A short description {agent.name} reads before every answer. It stays the same when you switch the AI model behind {agent.name}.
      </div>
      <textarea className="hb-aep-input hb-amem-core" rows={6} maxLength={2000} placeholder={`${starter}I help with…`}
        value={text} onChange={(e) => setText(e.target.value)} data-testid="amem-identity-text" />
      <button type="button" className="hb-aep-btn" data-variant="primary" disabled={busy || text === (identity?.core || '')}
        onClick={() => onSave(text)} data-testid="amem-identity-save">Save</button>
      {identity && <div className="hb-aep-hint">Saved {day(identity.recordedAt)}.</div>}
      {older.length > 0 && (
        <>
          <div className="hb-aep-label">Earlier versions</div>
          <ol className="hb-amem-history">
            {older.map((v) => (
              <li key={v.id} className="hb-amem-version" data-state="replaced">
                <span className="hb-amem-core-old">{v.core}</span>
                <span className="hb-aep-hint">{day(v.recordedAt)} to {day(v.supersededAt)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export function EpisodeList({ agentId, agentName, initial }) {
  const [episodes, setEpisodes] = React.useState(initial);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState('');
  const search = async (e) => {
    e.preventDefault();
    setError('');
    try { setEpisodes((await agentMemoryApi.searchEpisodes(agentId, q)).episodes); } catch (err) { setError(err.message); }
  };
  return (
    <>
      <form className="hb-aep-new" onSubmit={search}>
        <input className="hb-aep-input" placeholder="Search past conversations" value={q} onChange={(e) => setQ(e.target.value)} data-testid="amem-search" />
        <button type="submit" className="hb-aep-btn">Search</button>
      </form>
      {error && <div className="hb-aep-error" role="alert">{error}</div>}
      {episodes.length === 0
        ? <div className="hb-aep-empty">{q ? 'Nothing matches.' : `${agentName} has no past conversations yet.`}</div>
        : (
          <ul className="hb-amem-list" data-testid="amem-episodes">
            {episodes.map((ep) => (
              <li key={ep.id} className="hb-amem-episode" data-testid="amem-episode">
                <div className="hb-aep-hint">{day(ep.at)} · {ORIGIN_WORDS[ep.origin] || ep.origin}{ep.model ? ` · ${ep.model}` : ''}</div>
                <div className="hb-amem-summary">{ep.summary}</div>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
