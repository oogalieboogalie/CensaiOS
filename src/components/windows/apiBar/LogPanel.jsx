/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Every knock at the door: which key (or the board), which branch and
// action, how it went and how long it took. The notes themselves are never
// kept, only their size.
import React from 'react';
import { apiBarApi } from '../../../lib/apiBar/apiBarApi.js';

export function LogPanel() {
  const [calls, setCalls] = React.useState(null);
  const [problem, setProblem] = React.useState('');
  const load = React.useCallback(() => apiBarApi.log().then((d) => setCalls(d.calls || [])).catch((e) => setProblem(e.message)), []);
  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="hb-ab-panel">
      <div className="hb-ab-address">
        <span className="hb-ab-quiet">The last 50 notes through the door.</span>
        <button type="button" className="hb-ab-link" onClick={load}>Refresh</button>
      </div>
      {problem && <div role="alert" className="hb-ab-alert">{problem}</div>}
      {calls && !calls.length && <p className="hb-ab-quiet">Nobody has knocked yet.</p>}
      {calls?.length > 0 && (
        <table className="hb-ab-log">
          <thead><tr><th>When</th><th>Who</th><th>Note</th><th>Answer</th><th>Time</th></tr></thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.created_at).toLocaleString()}</td>
                <td>{c.key_label || 'The board'}</td>
                <td><code>{c.method} {c.branch}/{c.action}</code></td>
                <td data-ok={c.status < 400 ? 'true' : 'false'}>{c.status}{c.error ? ` · ${c.error}` : ''}</td>
                <td>{c.duration_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
