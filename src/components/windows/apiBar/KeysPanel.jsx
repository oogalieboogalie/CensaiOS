/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Bar keys: the one key a script, an app or an agent holds. Each key opens
// only the branches picked here, and "look only" keys cannot spend money or
// change anything. A key is shown once; revoking it closes every branch.
import React from 'react';
import { apiBarApi, curlExample } from '../../../lib/apiBar/apiBarApi.js';

function KeyRow({ k, onRevoke }) {
  return (
    <li className="hb-ab-key" data-revoked={k.revokedAt ? 'true' : undefined}>
      <div className="hb-ab-key-main">
        <strong>{k.label}</strong>
        <span className="hb-ab-quiet">…{k.hint} · {k.branches.join(', ')} · {k.lookOnly ? 'look only' : 'can spend and change'}</span>
        <span className="hb-ab-quiet">{k.revokedAt ? 'Revoked' : k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleString()}` : 'Not used yet'}</span>
      </div>
      {!k.revokedAt && <button type="button" className="hb-ab-link" onClick={() => onRevoke(k.id)}>Revoke</button>}
    </li>
  );
}

export function KeysPanel({ menu }) {
  const [keys, setKeys] = React.useState([]);
  const [label, setLabel] = React.useState('');
  const [branches, setBranches] = React.useState(['leads']);
  const [lookOnly, setLookOnly] = React.useState(true);
  const [made, setMade] = React.useState(null);
  const [problem, setProblem] = React.useState('');

  const load = React.useCallback(() => apiBarApi.keys().then((d) => setKeys(d.keys || [])).catch((e) => setProblem(e.message)), []);
  React.useEffect(() => { load(); }, [load]);

  const toggle = (b) => setBranches((list) => (list.includes(b) ? list.filter((x) => x !== b) : [...list, b]));
  const make = async (e) => {
    e.preventDefault();
    setProblem('');
    try {
      const out = await apiBarApi.makeKey({ label, branches, lookOnly });
      setMade(out);
      setLabel('');
      load();
    } catch (err) {
      setProblem(err.message);
    }
  };
  const revoke = async (id) => {
    try {
      await apiBarApi.revokeKey(id);
      load();
    } catch (err) {
      setProblem(err.message);
    }
  };

  return (
    <div className="hb-ab-panel">
      <form className="hb-ab-make" onSubmit={make}>
        <label className="hb-ab-note">
          <span className="hb-ab-label">Key name</span>
          <input className="hb-ab-input" value={label} placeholder="My script" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <fieldset className="hb-ab-pick">
          <legend className="hb-ab-label">Branches this key may open</legend>
          {(menu || []).map((b) => (
            <label key={b.branch} className="hb-ab-check">
              <input type="checkbox" checked={branches.includes(b.branch)} onChange={() => toggle(b.branch)} /> {b.branch}
            </label>
          ))}
        </fieldset>
        <label className="hb-ab-check">
          <input type="checkbox" checked={lookOnly} onChange={(e) => setLookOnly(e.target.checked)} /> Look only (no hunts, searches, agent questions or changes)
        </label>
        <button type="submit" className="hb-ab-send">Make a key</button>
      </form>
      {problem && <div role="alert" className="hb-ab-alert">{problem}</div>}
      {made && (
        <div className="hb-ab-made" role="status">
          <strong>Copy this key now. It is shown once.</strong>
          <code className="hb-ab-path">{made.token}</code>
          <span className="hb-ab-quiet">Try it from a terminal:</span>
          <pre className="hb-ab-json">{curlExample(made.token)}</pre>
          <button type="button" className="hb-ab-link" onClick={() => navigator.clipboard?.writeText(made.token)}>Copy key</button>
        </div>
      )}
      <ul className="hb-ab-keys">{keys.map((k) => <KeyRow key={k.id} k={k} onRevoke={revoke} />)}</ul>
      {!keys.length && <p className="hb-ab-quiet">No keys yet. The board itself does not need one.</p>}
    </div>
  );
}
