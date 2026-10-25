// One hunted lead: why it fits, how to reach it, the 7-day introduction
// sequence as an editable day-by-day timeline, and the Ice Breaker
// deliverable. Every draft is plain text the user can rewrite in place, copy,
// or open as a Document window on the canvas.

import React from 'react';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';
import { channelLabel, leadToMarkdown, touchText } from './exportLead.js';

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked; leave label as-is */ }
  };
  return <button type="button" className="hb-lh-pill" data-size="sm" onClick={copy}>{copied ? 'Copied' : label}</button>;
}

function Contacts({ contacts = {} }) {
  const items = [
    ...(contacts.emails || []).map((v) => ['Email', v]),
    ...(contacts.phones || []).map((v) => ['Phone', v]),
    ...['linkedin', 'facebook', 'instagram'].filter((k) => contacts[k]).map((k) => [k, contacts[k]]),
  ];
  if (items.length === 0) return <span>No public contact details on their site.</span>;
  return (
    <span className="hb-lh-chips">
      {items.map(([k, v]) => (
        <span key={`${k}-${v}`} className="hb-lh-chip"><span className="hb-lh-mono">{k.toLowerCase()}</span> {v}</span>
      ))}
    </span>
  );
}

function Sequence({ sequence = [], onChange }) {
  if (sequence.length === 0) return <div className="hb-lh-empty">The AI step did not return a sequence for this lead.</div>;
  const edit = (i, patch) => onChange(sequence.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <ol className="hb-lh-seq">
      {sequence.map((touch, i) => (
        <li key={touch.day} className="hb-lh-touch">
          <div className="hb-lh-day"><span className="hb-lh-label">Day {touch.day}</span></div>
          <div className="hb-lh-touch-card">
            <div className="hb-lh-touch-top">
              <span className="hb-lh-label">{channelLabel(touch.channel)}</span>
              <CopyButton text={touchText(touch)} />
            </div>
            {(touch.subject || touch.channel === 'email') && (
              <input
                className="hb-lh-input hb-lh-subject"
                value={touch.subject || ''}
                onChange={(e) => edit(i, { subject: e.target.value })}
                placeholder="Subject"
                aria-label={`Day ${touch.day} subject`}
              />
            )}
            <textarea
              className="hb-lh-input hb-lh-body"
              value={touch.body || ''}
              onChange={(e) => edit(i, { body: e.target.value })}
              aria-label={`Day ${touch.day} message`}
              rows={4}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function IceBreaker({ iceBreaker, onChange }) {
  const [editing, setEditing] = React.useState(false);
  if (!iceBreaker) return <div className="hb-lh-empty">The AI step did not return an ice breaker for this lead.</div>;
  const edit = (patch) => onChange({ ...iceBreaker, ...patch });
  return (
    <div className="hb-lh-ice">
      <div className="hb-lh-ice-top">
        <input className="hb-lh-input" value={iceBreaker.title || ''} onChange={(e) => edit({ title: e.target.value })} aria-label="Ice breaker title" />
        {iceBreaker.format && <span className="hb-lh-label">{iceBreaker.format}</span>}
      </div>
      {iceBreaker.opening_line !== undefined && (
        <textarea
          className="hb-lh-input hb-lh-opening"
          value={iceBreaker.opening_line || ''}
          onChange={(e) => edit({ opening_line: e.target.value })}
          aria-label="Opening line"
        />
      )}
      {editing ? (
        <textarea
          className="hb-lh-input hb-lh-deliverable"
          value={iceBreaker.deliverable || ''}
          onChange={(e) => edit({ deliverable: e.target.value })}
          aria-label="Ice breaker deliverable"
        />
      ) : (
        <div className="hb-lh-deliverable">{renderMarkdown(iceBreaker.deliverable || '', { compact: true })}</div>
      )}
      <div className="hb-lh-cta">
        <span className="hb-lh-label">Ask</span>
        <input className="hb-lh-input" value={iceBreaker.cta || ''} onChange={(e) => edit({ cta: e.target.value })} aria-label="Ask" />
      </div>
      <div className="hb-lh-tabs">
        <button type="button" className="hb-lh-pill" data-size="sm" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done editing' : 'Edit deliverable'}
        </button>
        <CopyButton text={iceBreaker.deliverable || ''} label="Copy deliverable" />
      </div>
    </div>
  );
}

export function LeadDetail({ lead, brief, onBank, onEdit = () => {}, onOpenDoc }) {
  const [tab, setTab] = React.useState('sequence');
  const [flash, setFlash] = React.useState('');
  React.useEffect(() => { setFlash(''); }, [lead?.url]);
  if (!lead) return null;

  const bank = async () => {
    try {
      const res = await onBank(lead);
      setFlash(`${res?.deduped ? 'Already in your Lead Queue, updated' : 'Saved to your Lead Queue'}${lead.sequence?.length || lead.iceBreaker ? ' with its drafts' : ''}.`);
    } catch (err) {
      setFlash(err.message || 'Could not save the lead');
    }
  };

  return (
    <div className="hb-lh-detail">
      <div className="hb-lh-detail-head">
        <span className="hb-lh-detail-name">{lead.company}</span>
        <a className="hb-lh-link" href={lead.url} target="_blank" rel="noreferrer">{lead.host}</a>
        <span className="hb-lh-actions">
          <CopyButton text={leadToMarkdown(lead, brief)} label="Copy all" />
          {onOpenDoc && <button type="button" className="hb-lh-pill" data-size="sm" onClick={() => onOpenDoc(lead)}>Open as doc</button>}
          <button type="button" className="hb-lh-pill" data-size="sm" data-primary="true" onClick={bank}>Save to Lead Queue</button>
        </span>
      </div>
      {flash && <div className="hb-lh-flash" role="status">{flash}</div>}
      <dl className="hb-lh-facts">
        {lead.why_fit && <><dt>Why</dt><dd>{lead.why_fit}</dd></>}
        {lead.angle && <><dt>Angle</dt><dd>{lead.angle}</dd></>}
        {lead.decision_maker && <><dt>Reach</dt><dd>{lead.decision_maker}</dd></>}
        <dt>Contact</dt><dd><Contacts contacts={lead.contacts} /></dd>
      </dl>
      <div className="hb-lh-tabs" role="tablist">
        <button type="button" className="hb-lh-pill" aria-pressed={tab === 'sequence'} onClick={() => setTab('sequence')}>7-day sequence</button>
        <button type="button" className="hb-lh-pill" aria-pressed={tab === 'ice'} onClick={() => setTab('ice')}>Ice breaker</button>
        <span className="hb-lh-mono">Edits save to the board</span>
      </div>
      {tab === 'sequence'
        ? <Sequence sequence={lead.sequence} onChange={(sequence) => onEdit({ sequence })} />
        : <IceBreaker iceBreaker={lead.iceBreaker} onChange={(iceBreaker) => onEdit({ iceBreaker })} />}
    </div>
  );
}
