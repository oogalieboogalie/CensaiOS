import React from 'react';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { darkInputStyle, primaryBtnStyle } from './styles.js';
import { postHosted } from '../../../lib/hostedAgents/api.js';

// Import → Hosted agent → ElevenLabs → "Make a new one": creates a voice
// agent on the person's own ElevenLabs account, then imports it.

const fieldLabel = { fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 850 };
const note = { fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.45 };
const box = { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--radius-xl)', border: '1px solid var(--hairline)', background: 'var(--surface)' };

export function ElevenLabsCreate({ onMade, disabled = false }) {
  const [form, setForm] = React.useState({ name: '', voiceId: '', firstMessage: '', instructions: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(null);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const ready = form.name.trim() && form.instructions.trim() && !disabled;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await postHosted('elevenlabs/create', { ...form, hue: Math.floor(Math.random() * 360) });
      setDone(data.agent);
      onMade?.(data.agent);
      logToApp('info', 'elevenlabs agent created and imported', { where: 'hosted-agents' });
    } catch (err) {
      setError(err.message);
      logToApp('warn', `elevenlabs create failed: ${err.message}`, { where: 'hosted-agents' });
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, placeholder, multi = false) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={fieldLabel}>{label}</span>
      {multi
        ? <textarea value={form[key]} onChange={set(key)} placeholder={placeholder} style={{ ...darkInputStyle, minHeight: 90, resize: 'vertical' }} data-testid={`el-${key}`} />
        : <input value={form[key]} onChange={set(key)} placeholder={placeholder} style={darkInputStyle} data-testid={`el-${key}`} />}
    </label>
  );

  return (
    <div style={box} data-testid="elevenlabs-create">
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 750 }}>New ElevenLabs voice agent</div>
      <div style={note}>censaiOS makes it on your own ElevenLabs account, then brings it onto the board.</div>
      {field('name', 'Name', 'Front desk')}
      {field('voiceId', 'Voice id (optional)', 'Leave empty for the ElevenLabs default voice')}
      {field('firstMessage', 'First thing it says (optional)', 'Hi, thanks for calling. How can I help?')}
      {field('instructions', 'Instructions', 'You answer questions about our store hours and bookings.', true)}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" style={{ ...primaryBtnStyle, opacity: ready && !busy && !done ? 1 : 0.6 }} disabled={!ready || busy || Boolean(done)} onClick={create} data-testid="el-create">
          {done ? 'Made and imported' : busy ? 'Making it...' : 'Make it and import'}
        </button>
      </div>
      {done && <div style={{ ...note, color: 'var(--success)' }}>{done.name} is on ElevenLabs and on your board.</div>}
      {error && <div style={{ ...note, color: 'var(--danger)' }} data-testid="el-error">{error}</div>}
    </div>
  );
}
