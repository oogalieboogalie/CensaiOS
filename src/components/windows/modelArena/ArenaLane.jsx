/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { MessageBody } from '../../chat/MessageBody.jsx';
import { CUT_OFF_REASONS, estimateCost, formatCost, formatMs, tokensPerSecond, PROVIDER_LABELS } from '../../../lib/modelArena/arenaCatalog.js';

// The gateway's key errors are worded for a chat box; say it the arena's way.
function laneError(error, provider) {
  const name = PROVIDER_LABELS[provider] || provider;
  if (error?.code === 'MODEL_KEY_MISSING') return `No ${name} key is saved yet. Add one in Settings, Vault, then race again.`;
  if (error?.code === 'MODEL_KEY_REJECTED') return `${name} turned down the saved key. Check it in Settings, Vault.`;
  return error?.message || 'This model did not answer.';
}

const STATUS_WORDS = { waiting: 'Thinking…', streaming: 'Writing…', stopped: 'Stopped', error: 'Did not answer' };

/** The model picker: every arena model, grouped by provider. */
export function ModelPicker({ value, models, onChange, label, disabled = false }) {
  const groups = Object.keys(PROVIDER_LABELS)
    .map((provider) => ({ provider, items: models.filter((m) => m.provider === provider) }))
    .filter((group) => group.items.length);
  const known = models.some((m) => m.id === value);
  return (
    <select className="hb-arena-select" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>{value.split(':').slice(1).join(':')}</option>}
      {groups.map((group) => (
        <optgroup key={group.provider} label={PROVIDER_LABELS[group.provider]}>
          {group.items.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function Stat({ label, value, title }) {
  return (
    <div className="hb-arena-stat" title={title}>
      <span className="hb-arena-stat-label">{label}</span>
      <span className="hb-arena-stat-value">{value}</span>
    </div>
  );
}

/** One column: the model, its numbers once it finishes, and its reply. */
export function ArenaLane({ index, lane, result, badges = [], models, running, onPick, onRemove, children = null }) {
  const status = result?.status;
  const usage = result?.usage;
  const cost = estimateCost(lane.provider, lane.model, usage);
  const speed = tokensPerSecond(result);
  const approx = usage?.estimated ? '~' : '';
  return (
    <section className="hb-arena-lane" aria-label={`Model ${index + 1}`} data-status={status || 'idle'} data-cut-off={CUT_OFF_REASONS.has(result?.finishReason) || undefined}>
      <header className="hb-arena-lane-head">
        <ModelPicker label={`Model ${index + 1}`} value={`${lane.provider}:${lane.model}`} models={models} onChange={onPick} disabled={running} />
        {onRemove && (
          <button type="button" className="hb-btn" data-variant="ghost" aria-label={`Remove model ${index + 1}`} title="Remove this model" disabled={running} onClick={onRemove}>
            <Icon.Close size={10} />
          </button>
        )}
      </header>
      {badges.length > 0 && (
        <div className="hb-arena-badges">{badges.map((b) => <span key={b} className="hb-arena-badge">{b}</span>)}</div>
      )}
      {children}
      <div className="hb-arena-stats">
        <Stat label="First word" value={formatMs(result?.firstTokenMs)} title="Time from sending until the first word arrived" />
        <Stat label="Finished" value={status === 'done' ? formatMs(result.totalMs) : '—'} title="Time until the whole reply was in" />
        <Stat label="Tokens" value={usage ? `${approx}${usage.input} in · ${approx}${usage.output} out` : '—'}
          title={usage?.estimated ? 'This provider sent no token counts, so these are estimated (about 4 letters a token)' : 'Token counts from the provider'} />
        <Stat label="Speed" value={speed ? `${speed} tok/s` : '—'} title="Reply tokens a second, from the first word to the last" />
        <Stat label="Cost" value={usage ? `${cost && cost >= 0.0001 ? approx : ''}${formatCost(cost)}` : '—'} title="Estimated from list prices; your provider's bill is the real cost" />
      </div>
      <div className="hb-arena-reply">
        {status === 'error' ? (
          <p className="hb-arena-error" role="alert">{laneError(result.error, lane.provider)}</p>
        ) : result?.text ? (
          <MessageBody text={result.text} streaming={status === 'streaming'} />
        ) : (
          <p className="hb-arena-hint">{STATUS_WORDS[status] || 'The reply shows up here.'}</p>
        )}
        {status === 'done' && CUT_OFF_REASONS.has(result.finishReason) && (
          <p className="hb-arena-cutoff" role="status">Cut off at the limit: this model ran out of room before it finished.</p>
        )}
        {status && STATUS_WORDS[status] && result?.text && status !== 'error' && (
          <p className="hb-arena-hint">{STATUS_WORDS[status]}</p>
        )}
      </div>
    </section>
  );
}
