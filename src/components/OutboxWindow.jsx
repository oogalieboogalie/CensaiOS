/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { checkFairHousing } from '../lib/realEstate/fairHousing.js';
import { OUTBOX_SECTIONS, draftsByStatus, patchDraft, sendLink } from '../lib/realEstate/outbox.js';
import { FairHousingFlags } from './realEstate/FairHousingText.jsx';

// Spec 7: every client email or text an agent drafts waits here until a
// person approves it. Approving opens the message in your own mail or
// messages app, ready to send; the board never sends on its own.

function DraftCard({ draft, onPatch, open = (url) => window.open(url, '_blank', 'noopener') }) {
  const [editing, setEditing] = React.useState(false);
  const [body, setBody] = React.useState(draft.body || '');
  const [subject, setSubject] = React.useState(draft.subject || '');
  React.useEffect(() => { if (!editing) { setBody(draft.body || ''); setSubject(draft.subject || ''); } }, [draft.body, draft.subject, editing]);
  const check = React.useMemo(() => checkFairHousing(`${subject}\n${body}`), [subject, body]);
  const pending = (draft.status || 'pending') === 'pending';

  const save = () => { onPatch({ body, subject, editedAt: new Date().toISOString() }); setEditing(false); };
  const approve = () => {
    const next = editing ? { body, subject } : {};
    onPatch({ ...next, status: 'approved', approvedAt: new Date().toISOString() });
    setEditing(false);
    open(sendLink({ ...draft, ...next }));
  };

  return (
    <article className="re-card re-draft" data-testid="outbox-draft" data-status={draft.status || 'pending'}>
      <div className="re-draft-head">
        <span className="re-pill accent">{draft.channel === 'text' ? 'Text' : 'Email'}</span>
        <strong>{draft.to}</strong>
        {draft.address && <span className="re-faint">{draft.address}</span>}
        <span style={{ flex: 1 }} />
        {draft.deal && <span className="re-pill">{draft.deal}</span>}
      </div>
      {editing ? (
        <>
          {draft.channel !== 'text' && <input className="re-input" value={subject} onChange={e => setSubject(e.target.value)} aria-label="Subject" />}
          <textarea className="re-input" rows={6} value={body} onChange={e => setBody(e.target.value)} aria-label="Message" />
        </>
      ) : (
        <>
          {draft.subject && <div style={{ fontWeight: 500 }}>{draft.subject}</div>}
          <div className="re-copy re-muted">{draft.body}</div>
        </>
      )}
      {check.flags.length > 0 && <FairHousingFlags flags={check.flags} />}
      <div className="re-spread">
        <span className="re-faint">
          Drafted by {draft.agentName || 'an agent'}
          {draft.editedAt ? ' · edited' : ''}
          {draft.status === 'approved' && draft.approvedAt ? ` · approved ${new Date(draft.approvedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
        </span>
        <span className="re-row">
          {pending && !editing && <button type="button" className="re-btn ghost danger" onClick={() => onPatch({ status: 'discarded' })}>Discard</button>}
          {pending && !editing && <button type="button" className="re-btn" onClick={() => setEditing(true)}>Edit</button>}
          {editing && <button type="button" className="re-btn ghost" onClick={() => setEditing(false)}>Cancel</button>}
          {editing && <button type="button" className="re-btn" onClick={save}>Save</button>}
          {pending && <button type="button" className="re-btn primary" onClick={approve} disabled={!check.ok && !editing} title={check.ok ? '' : 'Rewrite the flagged words first'}>Approve and send</button>}
          {!pending && <button type="button" className="re-btn ghost" onClick={() => onPatch({ status: 'pending' })}>Move back</button>}
        </span>
      </div>
    </article>
  );
}

export function OutboxWindow({ win = {}, onUpdate }) {
  const drafts = Array.isArray(win.drafts) ? win.drafts : [];
  const sections = draftsByStatus(drafts);
  const [showDone, setShowDone] = React.useState(false);
  const patch = (id) => (fields) => onUpdate?.({ drafts: patchDraft(drafts, id, fields) });
  const waiting = sections.pending.length;

  return (
    <>
      <WindowTitle icon={<Icon.Mail size={12} />} label={win.title || 'Outbox'} subtitle={waiting ? `${waiting} waiting` : 'Nothing waiting'} />
      <div className="re-win" data-testid="outbox">
        <div className="re-faint">Agents only draft. Nothing reaches a client until someone here approves it.</div>
        {OUTBOX_SECTIONS.filter(section => section.status === 'pending' || showDone).map(section => (
          <section key={section.status} className="re-section">
            <div className="re-spread"><span className="re-label">{section.label}</span><span className="re-faint">{sections[section.status].length}</span></div>
            {sections[section.status].length === 0
              ? <div className="re-empty">{section.status === 'pending' ? 'No drafts waiting. Ask the Follow-up Assistant for one.' : 'None yet.'}</div>
              : sections[section.status].map(draft => <DraftCard key={draft.id} draft={draft} onPatch={patch(draft.id)} />)}
          </section>
        ))}
        {(sections.approved.length + sections.discarded.length) > 0 && (
          <button type="button" className="re-btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDone(v => !v)}>
            {showDone ? 'Hide approved and discarded' : `Show approved and discarded (${sections.approved.length + sections.discarded.length})`}
          </button>
        )}
      </div>
    </>
  );
}
