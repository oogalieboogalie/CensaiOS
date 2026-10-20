/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// One key: who it belongs to, what censaiOS spent through it, what is left of
// the amount its holder typed in, and (for OpenRouter and Kimi) what the
// provider itself says is left.
import React from 'react';
import { aiResourcesApi } from '../../../lib/aiResources/aiResourcesApi.js';
import { money, tokens, when, sourceLabel, usedShare } from '../../../lib/aiResources/format.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';

function spenderName(row, windowTitles) {
  if (row.kind === 'window') return windowTitles.get(row.ref) || (row.agentName ? `${row.agentName} chat` : 'A chat window');
  return row.label || row.source;
}

function BudgetForm({ card, onChanged }) {
  const [value, setValue] = React.useState(card.budgetUsd == null ? '' : String(card.budgetUsd));
  const [problem, setProblem] = React.useState('');
  const save = async (amount) => {
    setProblem('');
    try {
      await aiResourcesApi.setBudget(card.keyId, amount);
      onChanged();
    } catch (err) {
      setProblem(err.message);
      logToApp('warn', 'AI resources starting amount not saved', { detail: `status ${err.status || 'none'}` });
    }
  };
  return (
    <form className="hb-air-budget" onSubmit={(e) => { e.preventDefault(); save(value.trim() === '' ? null : value); }}>
      <label className="hb-air-quiet" htmlFor={`air-budget-${card.keyId}`}>Starting amount or budget, in dollars</label>
      <div className="hb-air-row">
        <input id={`air-budget-${card.keyId}`} className="hb-air-input" inputMode="decimal" placeholder="e.g. 25" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit" className="hb-air-btn">Save</button>
        {card.budgetUsd != null && <button type="button" className="hb-air-link" onClick={() => { setValue(''); save(null); }}>Clear</button>}
      </div>
      {problem && <span role="alert" className="hb-air-bad">{problem}</span>}
    </form>
  );
}

function ProviderReading({ card, onChanged }) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState('');
  const reading = card.providerReading;
  const ask = async () => {
    setBusy(true);
    setProblem('');
    try {
      await aiResourcesApi.askProvider(card.keyId);
      onChanged();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (!card.canAskProvider && !reading) return null;
  return (
    <div className="hb-air-provider">
      {reading && (
        <span>
          <strong>{card.providerLabel} says: </strong>
          {reading.left != null ? `${money(reading.left)} left` : reading.what}
          {reading.total != null ? ` of ${money(reading.total)}` : ''}
          <span className="hb-air-quiet"> · {reading.what}, checked {when(reading.at)}</span>
        </span>
      )}
      {card.canAskProvider && <button type="button" className="hb-air-link" disabled={busy} onClick={ask}>{busy ? 'Asking…' : 'Ask the provider'}</button>}
      {problem && <span role="alert" className="hb-air-bad">{problem}</span>}
    </div>
  );
}

export function KeyCard({ card, windowTitles, owner, onChanged }) {
  const share = usedShare(card);
  return (
    <li className="hb-air-card" data-mine={card.mine ? 'true' : 'false'}>
      <div className="hb-air-card-head">
        <strong>{card.providerLabel}</strong>
        <code className="hb-air-mask">{card.masked}</code>
        <span className="hb-air-tag">{sourceLabel(card.source)}</span>
      </div>
      {share != null && (
        <div className="hb-air-meter" aria-label={`${money(card.leftUsd)} left of ${money(card.budgetUsd)}`}>
          <div className="hb-air-meter-fill" data-low={card.leftUsd < card.budgetUsd * 0.15 ? 'true' : undefined} style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      )}
      <div className="hb-air-figures">
        {card.budgetUsd != null && <span><strong>About {money(card.leftUsd)} left</strong> of {money(card.budgetUsd)} (estimate)</span>}
        <span>About {money(card.spentUsd)} spent in censaiOS</span>
        <span className="hb-air-quiet">{card.calls} calls · {tokens(card.tokensIn)} in · {tokens(card.tokensOut)} out · last used {when(card.lastAt)}</span>
        {card.unpriced > 0 && <span className="hb-air-quiet">{card.unpriced} of those calls used a model censaiOS has no price for, so they count tokens only.</span>}
      </div>
      <ProviderReading card={card} onChanged={onChanged} />
      {card.mine && card.keyId && <BudgetForm card={card} onChanged={onChanged} />}
      {card.users.length > 0 && (
        <table className="hb-air-table">
          <thead><tr><th>What spent it</th>{owner && <th>Account</th>}<th>Model</th><th>Calls</th><th>Spent</th></tr></thead>
          <tbody>
            {card.users.slice(0, 8).map((row) => (
              <tr key={`${row.kind}:${row.ref}:${row.who || ''}`}>
                <td>{spenderName(row, windowTitles)}{row.allowance ? ' (free allowance)' : ''}</td>
                {owner && <td>{row.who || '—'}</td>}
                <td className="hb-air-mono">{row.model || '—'}</td>
                <td>{row.calls}</td>
                <td>{row.unpriced === row.calls && row.calls ? 'no price' : money(row.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}
