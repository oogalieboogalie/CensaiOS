/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { SHELVES, shelfOf } from '../../lib/agentMemory/shelves.js';

/** One shelf: what sits on it, and a quick way to put something there. */
function Shelf({ shelf, facts, busy, onSave }) {
  const [attribute, setAttribute] = React.useState('');
  const [value, setValue] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const subject = shelf.id === 'project' ? 'the project' : shelf.id === 'team' ? 'the team' : 'the user';
    if (await onSave({ subject, attribute, value, shelf: shelf.id })) { setAttribute(''); setValue(''); setAdding(false); }
  };
  return (
    <section className="hb-amem-shelf" data-shelf={shelf.id} data-testid={`amem-shelf-${shelf.id}`}>
      <header className="hb-amem-shelf-head">
        <span className="hb-amem-shelf-name">{shelf.label}</span>
        <span className="hb-amem-shelf-count">{facts.length}</span>
      </header>
      <div className="hb-amem-shelf-parts">{shelf.parts.map((p) => <span key={p}>{p}</span>)}</div>
      {facts.length ? (
        <ul className="hb-amem-shelf-items">
          {facts.map((f) => (
            <li key={f.id} title={`${f.attribute} of ${f.subject}`}>
              <span className="hb-amem-shelf-attr">{f.attribute}</span>
              <span className="hb-amem-shelf-val">{f.value}</span>
            </li>
          ))}
        </ul>
      ) : <div className="hb-aep-hint">{shelf.hint} Nothing here yet.</div>}
      {adding ? (
        <form className="hb-amem-shelf-add" onSubmit={submit}>
          <input className="hb-aep-input" autoFocus placeholder={`What, e.g. ${shelf.parts[0]}`} value={attribute}
            onChange={(e) => setAttribute(e.target.value)} data-testid={`amem-shelf-attr-${shelf.id}`} />
          <input className="hb-aep-input" placeholder="The fact" value={value} onChange={(e) => setValue(e.target.value)}
            data-testid={`amem-shelf-value-${shelf.id}`} />
          <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy || !attribute.trim() || !value.trim()}>Put it here</button>
        </form>
      ) : (
        <button type="button" className="hb-aep-btn" data-variant="quiet" onClick={() => setAdding(true)}
          data-testid={`amem-shelf-add-${shelf.id}`}>+ Add to {shelf.label}</button>
      )}
    </section>
  );
}

/** "Shelves": everything the agent knows, sorted the way diagram 20 draws it. */
export function ShelvesTab({ agent, data, busy, onSave }) {
  const byShelf = React.useMemo(() => {
    const out = Object.fromEntries(SHELVES.map((s) => [s.id, []]));
    for (const fact of data.facts) out[shelfOf(fact)].push(fact);
    return out;
  }, [data.facts]);
  return (
    <div className="hb-amem-shelves" data-testid="amem-shelves">
      <div className="hb-aep-hint">
        {agent.name}&apos;s memory, sorted onto shelves. {agent.name} files new facts here by itself; you can add to any shelf.
      </div>
      <div className="hb-amem-shelf-grid">
        {SHELVES.map((s) => <Shelf key={s.id} shelf={s} facts={byShelf[s.id]} busy={busy} onSave={onSave} />)}
      </div>
    </div>
  );
}
