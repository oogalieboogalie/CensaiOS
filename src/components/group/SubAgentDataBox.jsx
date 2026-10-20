import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { boxDoor } from '../../lib/agents/dataBoxes.js';
import { SubAgentDoor } from './SubAgentDoor.jsx';
import { SubAgentHelperForm } from './SubAgentHelperForm.jsx';

// A sub-agent's data box (diagram 15), opened from its row in the
// roster: what it and its main agent wrote there, newest first, plus a line
// to add a note yourself. The box is the sub-agent's scratchpad.
export function SubAgentDataBox({ sub, box }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [entries, setEntries] = React.useState(null);
  const [error, setError] = React.useState('');
  const [key, setKey] = React.useState('');
  const [value, setValue] = React.useState('');
  const door = boxDoor({ subId: sub.id, workspaceId, origin: typeof window === 'undefined' ? '' : window.location.origin });
  const url = door.read;

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || 'The box could not be opened.');
      setEntries(Array.isArray(data) ? data : []);
      setError('');
    } catch (failure) {
      setError(failure.message);
      setEntries([]);
    }
  }, [url]);

  React.useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!key.trim()) return;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim(), value, workspaceId }) }).catch(() => null);
    if (!res?.ok) { setError('That note could not be saved.'); return; }
    setKey('');
    setValue('');
    load();
  };

  return (
    <div className="hb-databox" data-testid="sub-agent-data-box" aria-label={`${sub.name}'s data box ${box}`}>
      <div className="hb-databox-head">{box} Data</div>
      {error && <p className="hb-databox-error" role="alert">{error}</p>}
      {entries === null ? (
        <p className="hb-databox-empty">Opening the box...</p>
      ) : entries.length === 0 ? (
        <p className="hb-databox-empty">Empty. {sub.name} and its main agent write notes here as they work.</p>
      ) : (
        <dl className="hb-databox-list">
          {entries.map(e => (
            <div key={e.key} className="hb-databox-entry">
              <dt>{e.key}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="hb-databox-add">
        <input value={key} onChange={e => setKey(e.target.value)} placeholder="Name" aria-label="Note name" />
        <input value={value} onChange={e => setValue(e.target.value)} placeholder="What to keep" aria-label="Note" onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <button type="button" className="hb-btn" onClick={add} disabled={!key.trim()}>Add</button>
      </div>
      <SubAgentHelperForm sub={sub} workspaceId={workspaceId} onDone={load} />
      <SubAgentDoor door={door} />
    </div>
  );
}
