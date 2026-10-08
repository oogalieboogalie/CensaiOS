// Agent network — discovery: describe a need, see which agents advertise
// matching skills, and ask one for help.

import React from 'react';
import { HelpRequestForm } from './HelpRequestForm.jsx';
import { buttonStyle, inputStyle, pillStyle, rowStyle } from './networkStyles.js';

function Badges({ candidate }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {candidate.installed && <span style={pillStyle('good')}>pinned</span>}
      {!candidate.callable && <span style={pillStyle('quiet')}>card only</span>}
      {candidate.callable && !candidate.acceptsRequests && <span style={pillStyle('quiet')}>not taking requests</span>}
      {candidate.callable && candidate.acceptsRequests && (
        <span style={pillStyle(candidate.approval === 'auto' ? 'good' : 'warn')}>
          {candidate.approval === 'auto' ? 'runs now' : 'owner approves'}
        </span>
      )}
    </span>
  );
}

function CandidateRow({ candidate, open, onToggle, onRequest, canRequest }) {
  const askable = canRequest && candidate.callable && candidate.acceptsRequests;
  const skills = candidate.matchedSkills?.length ? candidate.matchedSkills : candidate.skills || [];
  return (
    <div data-testid="network-candidate" data-card-id={candidate.cardId} style={rowStyle}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--text-md)', color: 'var(--ink)' }}>{candidate.name}</strong>
        {candidate.score > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>match {candidate.score}</span>}
        <Badges candidate={candidate} />
      </div>
      {candidate.description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.4 }}>{candidate.description}</div>}
      {skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {skills.slice(0, 6).map((skill) => (
            <span key={skill.id} title={skill.description || (skill.tags || []).join(', ')}
              style={{ ...pillStyle(candidate.matchedSkills?.some((m) => m.id === skill.id) ? 'good' : 'quiet'), borderRadius: 'var(--radius-sm)' }}>
              {skill.name}
            </span>
          ))}
        </div>
      )}
      {!open && (
        <div>
          <button type="button" data-testid="network-ask" disabled={!askable} onClick={onToggle}
            title={!candidate.callable ? 'This card has no callable adapter yet.' : undefined}
            style={buttonStyle({ primary: true, disabled: !askable })}>
            Ask for help
          </button>
        </div>
      )}
      {open && <HelpRequestForm candidate={candidate} onSubmit={onRequest} onClose={onToggle} />}
    </div>
  );
}

export function AgentDiscoverPanel({ client, onRequested, canRequest = true }) {
  const [query, setQuery] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [openId, setOpenId] = React.useState(null);

  const search = React.useCallback(async (event) => {
    event?.preventDefault?.();
    setLoading(true); setError('');
    try {
      const result = await client.discoverAgents({
        query, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      setItems(result?.items || []);
    } catch (cause) {
      setError(cause.message || 'Discovery failed.');
    } finally {
      setLoading(false);
    }
  }, [client, query, tags]);

  // Show every reachable agent once on open (and when the workspace changes);
  // later searches only run on submit.
  const searchRef = React.useRef(search);
  searchRef.current = search;
  React.useEffect(() => { searchRef.current(); }, [client]);

  const request = async (input) => {
    const created = await client.requestHelp(input);
    onRequested?.(created);
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <form onSubmit={search} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-testid="network-search">
        <input data-testid="network-query" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you need help with? e.g. write a postgres migration"
          style={{ ...inputStyle, flex: '3 1 220px', width: 'auto' }} />
        <input data-testid="network-tags" value={tags} onChange={(e) => setTags(e.target.value)}
          placeholder="tags, comma-separated" style={{ ...inputStyle, flex: '1 1 120px', width: 'auto' }} />
        <button type="submit" disabled={loading} style={buttonStyle({ primary: true, disabled: loading })}>
          {loading ? 'Searching…' : 'Find agents'}
        </button>
      </form>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div data-testid="network-empty" style={{ border: '1px dashed var(--hairline)', borderRadius: 'var(--radius-lg)', padding: 14, color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          No agent advertises a matching skill yet.
        </div>
      )}
      <div data-testid="network-results" style={{ display: 'grid', gap: 8 }}>
        {items.map((candidate) => (
          <CandidateRow key={candidate.cardId} candidate={candidate} canRequest={canRequest}
            open={openId === candidate.cardId}
            onToggle={() => setOpenId((current) => (current === candidate.cardId ? null : candidate.cardId))}
            onRequest={request} />
        ))}
      </div>
    </div>
  );
}
