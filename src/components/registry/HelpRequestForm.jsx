// Inline "ask this agent for help" form under a discovery result.

import React from 'react';
import { FAMILY_AGENTS } from '../../data/family-agents.js';
import { buttonStyle, inputStyle, sectionLabel } from './networkStyles.js';

export function HelpRequestForm({ candidate, onSubmit, onClose }) {
  const skills = candidate.skills || [];
  const [skillId, setSkillId] = React.useState(candidate.matchedSkills?.[0]?.id || '');
  const [task, setTask] = React.useState('');
  const [onBehalfOf, setOnBehalfOf] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const selfAgent = candidate.cardId.startsWith('agent:') ? candidate.cardId.slice(6) : null;

  const submit = async (event) => {
    event?.preventDefault?.();
    if (!task.trim()) return;
    setSending(true); setError('');
    try {
      await onSubmit({ cardId: candidate.cardId, task: task.trim(), skillId, onBehalfOf });
      setTask('');
      onClose?.();
    } catch (cause) {
      setError(cause.message || 'The request could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} data-testid="network-request-form" style={{ display: 'grid', gap: 8, paddingTop: 6, borderTop: '1px solid var(--hairline)' }}>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      {skills.length > 0 && (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={sectionLabel}>Skill</span>
          <select data-testid="network-request-skill" value={skillId} onChange={(e) => setSkillId(e.target.value)} style={inputStyle}>
            <option value="">Any skill</option>
            {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
          </select>
        </label>
      )}
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={sectionLabel}>Task</span>
        <textarea
          data-testid="network-request-task" value={task} onChange={(e) => setTask(e.target.value)} rows={3}
          placeholder="Everything the helper needs to finish this on its own…" maxLength={8000}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={sectionLabel}>Asking as</span>
        <select data-testid="network-request-as" value={onBehalfOf} onChange={(e) => setOnBehalfOf(e.target.value)} style={inputStyle}>
          <option value="">Me</option>
          {FAMILY_AGENTS.filter((agent) => agent.id !== selfAgent).map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name} (on my behalf)</option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="submit" data-testid="network-request-send" disabled={sending || !task.trim()} style={buttonStyle({ primary: true, disabled: sending || !task.trim() })}>
          {sending ? 'Sending…' : candidate.approval === 'owner' ? 'Send to owner' : 'Send'}
        </button>
        <button type="button" onClick={onClose} style={buttonStyle()}>Cancel</button>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
          {candidate.approval === 'owner' ? 'Runs after the owner accepts.'
            : candidate.executorKind === 'builtin' ? 'Runs now on your model keys.' : 'Runs now at the agent\'s own endpoint.'}
        </span>
      </div>
    </form>
  );
}
