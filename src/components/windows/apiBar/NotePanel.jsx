/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The bar itself, drawn the way it was first sketched: a row of doors (the
// branches) inside one bar, an address line, the note, and the doorman's
// answer underneath.
import React from 'react';
import { apiBarApi, exampleNote, readNote } from '../../../lib/apiBar/apiBarApi.js';

const METHODS = ['GET', 'POST', 'PUT'];

function Answer({ reply, onPage }) {
  if (!reply) return <p className="hb-ab-quiet">The doorman's answer shows here.</p>;
  const { status, data } = reply;
  const bar = data?.api_bar || {};
  return (
    <section className="hb-ab-answer" aria-label="Answer">
      <div className="hb-ab-answer-head">
        <span className="hb-ab-status" data-ok={reply.ok ? 'true' : 'false'}>{status} {reply.ok ? 'answered' : 'refused'}</span>
        {bar.paginate && (
          <span className="hb-ab-paging">
            Page {bar.page} · {bar.total} in all
            {bar.page > 1 && <button type="button" className="hb-ab-link" onClick={() => onPage(bar.page - 1)}>Back</button>}
            {bar.has_more && <button type="button" className="hb-ab-link" onClick={() => onPage(bar.next_page)}>Next page</button>}
          </span>
        )}
        {data?.signed && (
          <span className="hb-ab-signed" title={`Signature ${data.signed.signature}`}>
            Signed by this censaiOS · {data.signed.install_id}{data.signed.agent ? ` · agent ${data.signed.agent.identity}` : ''}
          </span>
        )}
      </div>
      <pre className="hb-ab-json">{JSON.stringify(data?.answer ?? data, null, 2)}</pre>
    </section>
  );
}

export function NotePanel({ menu }) {
  const [branch, setBranch] = React.useState('finance');
  const [action, setAction] = React.useState('');
  const [method, setMethod] = React.useState('POST');
  const [text, setText] = React.useState('');
  const [reply, setReply] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState('');

  const current = (menu || []).find((b) => b.branch === branch);
  const pick = React.useCallback((b, a) => {
    setBranch(b.branch);
    setAction(a.action);
    setText(exampleNote(a));
    setMethod(a.changes ? 'POST' : 'GET');
    setProblem('');
  }, []);

  React.useEffect(() => {
    if (!menu?.length || text) return;
    const first = menu.find((b) => b.branch === branch) || menu[0];
    if (first?.actions?.[0]) pick(first, first.actions[0]);
  }, [menu, branch, text, pick]);

  const send = async (pageOverride) => {
    const { note, error } = readNote(text);
    if (error) return setProblem(error);
    if (pageOverride) {
      note.api_bar = { ...note.api_bar, paginate: true, page: pageOverride };
      setText(JSON.stringify(note, null, 2));
    }
    setProblem('');
    setBusy(true);
    try {
      setReply(await apiBarApi.send(method, note));
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hb-ab-panel">
      <div className="hb-ab-bar" role="group" aria-label="Branches behind the door">
        <span className="hb-ab-bar-name">"API BAR"</span>
        <div className="hb-ab-doors">
          {(menu || []).map((b) => (
            <button key={b.branch} type="button" className="hb-ab-door" aria-pressed={b.branch === branch}
              title={b.about} onClick={() => b.actions[0] && pick(b, b.actions[0])}>
              <span className="hb-ab-door-name">{b.branch}</span>
              <span className="hb-ab-door-label">{b.label}</span>
            </button>
          ))}
        </div>
      </div>
      {current && (
        <div className="hb-ab-actions">
          {current.actions.map((a) => (
            <button key={a.action} type="button" className="hb-ab-chip" aria-pressed={a.action === action} onClick={() => pick(current, a)}>
              {a.action}{a.changes && <span className="hb-ab-spends">spends</span>}
            </button>
          ))}
          <span className="hb-ab-quiet">{current.actions.find((a) => a.action === action)?.about || current.about}</span>
        </div>
      )}
      <div className="hb-ab-address">
        <div className="hb-ab-seg" role="group" aria-label="Method">
          {METHODS.map((m) => (
            <button key={m} type="button" aria-pressed={m === method} onClick={() => setMethod(m)}>{m}</button>
          ))}
        </div>
        <code className="hb-ab-path">/api/bar</code>
        <button type="button" className="hb-ab-send" disabled={busy} onClick={() => send()}>
          {busy ? 'Passing the note…' : 'Hand it to the doorman'}
        </button>
      </div>
      <label className="hb-ab-note">
        <span className="hb-ab-label">The note</span>
        <textarea className="hb-ab-text" value={text} spellCheck={false} rows={7} onChange={(e) => setText(e.target.value)} />
      </label>
      {problem && <div role="alert" className="hb-ab-alert">{problem}</div>}
      <Answer reply={reply} onPage={(p) => send(p)} />
    </div>
  );
}
