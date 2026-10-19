import React from 'react';
import { FAMILY_AGENT_BY_ID } from '../../data/family-agents.js';

function who(entry) {
  if (entry.authorKind === 'agent') return FAMILY_AGENT_BY_ID[entry.authorId]?.name || entry.authorId;
  return 'You';
}

// "While developing skills and skill sets, keep a log of things that worked
// and things that didn't." Agents add to it with skill_set_log; people here.
export function SkillSetLog({ log, busy, onAdd }) {
  const [note, setNote] = React.useState('');
  const add = async (outcome) => {
    if (!note.trim()) return;
    await onAdd(outcome, note);
    setNote('');
  };
  return (
    <section className="hb-sk-card" data-testid="skill-set-log">
      <div>
        <h3 className="hb-sk-h">What worked, what didn&apos;t</h3>
        <p className="hb-sk-sub">The agent writes here when a skill clearly helps or fails. The latest notes go into its instructions so it learns from them.</p>
      </div>
      <textarea className="hb-sk-text" rows={2} aria-label="What happened" value={note} placeholder="What happened, in a sentence" onChange={(e) => setNote(e.target.value)} />
      <div className="hb-sk-row">
        <button type="button" className="hb-sk-btn" disabled={busy === 'log' || !note.trim()} onClick={() => add('worked')}>It worked</button>
        <button type="button" className="hb-sk-btn" disabled={busy === 'log' || !note.trim()} onClick={() => add('didnt')}>It didn&apos;t work</button>
      </div>
      <div className="hb-sk-log">
        {log.length === 0 && <span className="hb-sk-sub">Nothing logged yet.</span>}
        {log.map((entry) => (
          <div className="hb-sk-log-row" key={entry.id}>
            <span className={`hb-sk-log-mark ${entry.outcome === 'worked' ? 'hb-sk-worked' : 'hb-sk-didnt'}`}>{entry.outcome === 'worked' ? 'Worked' : 'Didn\'t'}</span>
            <span style={{ flex: 1 }}>{entry.note}</span>
            <span className="hb-sk-log-who">{who(entry)} · {new Date(entry.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
