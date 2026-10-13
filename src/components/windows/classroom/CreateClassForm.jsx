/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { api } from '../../../lib/api.js';
import { saveClassTokens } from './classTokens.js';

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="hb-class-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} disabled={option.disabled}
          title={option.title} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}

const STEPS_EXAMPLE = 'Connect your model key\nBuild the contract-search agent\nRun it on one real search';

/**
 * Start a class from this board. The board as it is right now becomes the
 * starter copy every student gets; the teaching windows stay behind.
 */
export function CreateClassForm({ workspaceId, stripe, onCreated }) {
  const [form, setForm] = React.useState({
    title: '', steps: '', seatLimit: 16, gate: 'invite', stripePriceId: '',
    agentMode: 'own', agentBudgetTokens: 50000, streamUrl: '',
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.createClass(workspaceId, {
        title: form.title, checkpoints: form.steps.split('\n'), seatLimit: Number(form.seatLimit),
        gate: form.gate, stripePriceId: form.stripePriceId, agentMode: form.agentMode,
        agentBudgetTokens: Number(form.agentBudgetTokens), streamUrl: form.streamUrl,
      });
      saveClassTokens(result.class.id, { token: result.token, codes: result.codes });
      onCreated(result);
    } catch (createError) {
      setError(createError.message);
      setBusy(false);
    }
  };

  return (
    <form className="hb-class-form" onSubmit={submit} data-testid="class-create">
      <p className="hb-class-note">
        Everyone who joins gets their own copy of this board as it looks now, and can watch yours.
        You see every student&apos;s board in a grid, follow anyone, and stamp each step when it looks good.
      </p>
      <label className="hb-class-field">
        <span className="hb-class-label">Class name</span>
        <input className="hb-class-input" data-testid="class-title" value={form.title} maxLength={80}
          placeholder="AI agents for contract search" onChange={(event) => set({ title: event.target.value })} />
      </label>
      <label className="hb-class-field">
        <span className="hb-class-label">Steps, one per line</span>
        <textarea className="hb-class-input" data-testid="class-steps" value={form.steps} placeholder={STEPS_EXAMPLE} onChange={(event) => set({ steps: event.target.value })} />
      </label>
      <div className="hb-class-row">
        <label className="hb-class-field">
          <span className="hb-class-label">Seats</span>
          <input className="hb-class-input" type="number" min={1} max={16} value={form.seatLimit} onChange={(event) => set({ seatLimit: event.target.value })} />
        </label>
        <div className="hb-class-field">
          <span className="hb-class-label">Who can join</span>
          <Segmented label="Who can join" value={form.gate} onChange={(gate) => set({ gate })} options={[
            { value: 'invite', label: 'Invite codes' },
            { value: 'stripe', label: 'Paid members', disabled: !stripe, title: stripe ? 'Stripe subscription' : 'Connect Stripe on the server first' },
          ]} />
        </div>
      </div>
      {form.gate === 'stripe' && (
        <label className="hb-class-field">
          <span className="hb-class-label">Stripe price</span>
          <input className="hb-class-input" value={form.stripePriceId} placeholder="price_..." onChange={(event) => set({ stripePriceId: event.target.value })} />
        </label>
      )}
      <div className="hb-class-row">
        <div className="hb-class-field">
          <span className="hb-class-label">Students&apos; agents run on</span>
          <Segmented label="Agent keys" value={form.agentMode} onChange={(agentMode) => set({ agentMode })} options={[
            { value: 'own', label: 'Their own keys' },
            { value: 'instructor', label: 'My keys' },
          ]} />
        </div>
        {form.agentMode === 'instructor' && (
          <label className="hb-class-field">
            <span className="hb-class-label">Tokens per student</span>
            <input className="hb-class-input" type="number" min={0} max={500000} step={1000} value={form.agentBudgetTokens}
              onChange={(event) => set({ agentBudgetTokens: event.target.value })} />
          </label>
        )}
      </div>
      <label className="hb-class-field">
        <span className="hb-class-label">Live stream (optional)</span>
        <input className="hb-class-input" value={form.streamUrl} placeholder="YouTube or Twitch live link"
          onChange={(event) => set({ streamUrl: event.target.value })} />
      </label>
      {error && <div role="alert" className="hb-class-error">{error}</div>}
      <div>
        <button type="submit" className="hb-btn" data-primary="true" data-testid="class-start" disabled={busy || !form.title.trim() || !form.steps.trim()}>
          {busy ? 'Starting…' : 'Start class'}
        </button>
      </div>
    </form>
  );
}
