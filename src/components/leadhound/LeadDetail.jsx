// One hunted lead: why it fits, how to reach it, the 7-day introduction
// sequence as a day-by-day timeline, and the Ice Breaker deliverable.

import React from 'react';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';

const pill = (active) => ({
  all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', padding: '4px 12px', borderRadius: 'var(--radius-full)',
  border: '1px solid var(--hairline)', fontWeight: active ? 650 : 450,
  color: active ? 'var(--accent-contrast)' : 'var(--ink-soft)',
  background: active ? 'var(--accent)' : 'var(--surface)',
});
const mono = { fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--ink-faint)' };

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked; leave label as-is */ }
  };
  return <button type="button" onClick={copy} style={{ ...pill(false), padding: '2px 10px', fontSize: 'var(--text-xs)' }}>{copied ? 'Copied' : label}</button>;
}

function Contacts({ contacts = {} }) {
  const items = [
    ...(contacts.emails || []).map((v) => ['Email', v]),
    ...(contacts.phones || []).map((v) => ['Phone', v]),
    ...['linkedin', 'facebook', 'instagram'].filter((k) => contacts[k]).map((k) => [k, contacts[k]]),
  ];
  if (items.length === 0) return <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>No public contact details found on their site.</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(([k, v]) => (
        <span key={`${k}-${v}`} style={{ fontSize: 'var(--text-xs)', padding: '3px 9px', borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}>
          <span style={{ color: 'var(--ink-faint)', textTransform: 'capitalize' }}>{k}</span> {v}
        </span>
      ))}
    </div>
  );
}

function Sequence({ sequence = [] }) {
  if (sequence.length === 0) return <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>The AI step did not return a sequence for this lead.</div>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {sequence.map((touch) => (
        <li key={touch.day} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 10, paddingBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ ...mono, color: 'var(--accent)' }}>Day {touch.day}</span>
            <span style={{ flex: 1, width: 1, background: 'var(--hairline)' }} />
          </div>
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)', padding: '9px 12px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={mono}>{touch.channel}</span>
              {touch.subject && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', flex: 1, minWidth: 0 }}>{touch.subject}</span>}
              <span style={{ marginLeft: 'auto' }}><CopyButton text={[touch.subject, touch.body].filter(Boolean).join('\n\n')} /></span>
            </div>
            <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{touch.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function IceBreaker({ iceBreaker }) {
  if (!iceBreaker) return <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>The AI step did not return an ice breaker for this lead.</div>;
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)', background: 'var(--surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-base)', fontWeight: 650, color: 'var(--ink)' }}>{iceBreaker.title}</span>
        {iceBreaker.format && <span style={mono}>{iceBreaker.format}</span>}
        <span style={{ marginLeft: 'auto' }}><CopyButton text={iceBreaker.deliverable} label="Copy deliverable" /></span>
      </div>
      {iceBreaker.opening_line && <div style={{ fontSize: 'var(--text-sm)', fontStyle: 'italic', color: 'var(--ink-soft)', borderLeft: '2px solid var(--accent)', paddingLeft: 10 }}>{iceBreaker.opening_line}</div>}
      <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--ink)' }}>{renderMarkdown(iceBreaker.deliverable, { compact: true })}</div>
      {iceBreaker.cta && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}><span style={mono}>Ask</span> {iceBreaker.cta}</div>}
    </div>
  );
}

export function LeadDetail({ lead, onBank }) {
  const [tab, setTab] = React.useState('sequence');
  const [bankMsg, setBankMsg] = React.useState('');
  React.useEffect(() => { setBankMsg(''); }, [lead?.url]);
  if (!lead) return null;

  const bank = async () => {
    try {
      const res = await onBank(lead);
      setBankMsg(res?.deduped ? 'Already in your Lead Queue, updated.' : 'Saved to your Lead Queue.');
    } catch (err) {
      setBankMsg(err.message || 'Could not save the lead');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 650, color: 'var(--ink)' }}>{lead.company}</span>
          <a href={lead.url} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>{lead.host}</a>
          <button type="button" onClick={bank} style={{ ...pill(false), marginLeft: 'auto' }}>Save to Lead Queue</button>
        </div>
        {bankMsg && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{bankMsg}</div>}
        {lead.why_fit && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>{lead.why_fit}</div>}
        {lead.decision_maker && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}><span style={mono}>Reach</span> {lead.decision_maker}</div>}
      </div>
      <Contacts contacts={lead.contacts} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setTab('sequence')} style={pill(tab === 'sequence')}>7-day sequence</button>
        <button type="button" onClick={() => setTab('ice')} style={pill(tab === 'ice')}>Ice breaker</button>
      </div>
      {tab === 'sequence' ? <Sequence sequence={lead.sequence} /> : <IceBreaker iceBreaker={lead.iceBreaker} />}
    </div>
  );
}
