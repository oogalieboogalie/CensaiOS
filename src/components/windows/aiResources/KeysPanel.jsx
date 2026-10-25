/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Keys and money: every key this person holds or spent on, grouped by
// provider, with the honest note about where the numbers come from.
import React from 'react';
import { useWorkspaceStore } from '../../../lib/store.js';
import { when } from '../../../lib/aiResources/format.js';
import { KeyCard } from './KeyCard.jsx';

export function KeysPanel({ data, onChanged }) {
  const wins = useWorkspaceStore((s) => s.wins);
  const windowTitles = React.useMemo(() => new Map((wins || []).map((w) => [w.id, w.title || null]).filter(([, t]) => t)), [wins]);
  const keys = [...(data.keys || [])].sort((a, b) => a.providerLabel.localeCompare(b.providerLabel) || Number(b.mine) - Number(a.mine));

  return (
    <div className="hb-air-panel">
      {!keys.length && (
        <p className="hb-air-empty">No AI keys yet. Add one in Settings, under Bring Your Own Key, and it shows up here with what it spends.</p>
      )}
      <ul className="hb-air-cards">
        {keys.map((card) => <KeyCard key={card.keyId || `${card.provider}:${card.source}`} card={card} windowTitles={windowTitles} owner={data.owner} onChanged={onChanged} />)}
      </ul>
      <p className="hb-air-note">
        Spent and left are censaiOS&apos;s own count since {when(data.since)}: the tokens each call used, priced from each
        provider&apos;s list prices. Most providers do not tell apps your balance, so type the amount you put on a key and
        censaiOS counts down from it. Use outside censaiOS (other apps, the provider&apos;s website) is not counted.
        A line that starts with the provider&apos;s name is the provider&apos;s own number.
      </p>
    </div>
  );
}
