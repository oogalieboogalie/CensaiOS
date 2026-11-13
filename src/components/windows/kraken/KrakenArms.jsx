/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { armWord, progressLine, rankWord, requestIsOpen, requestWord } from '../../../lib/kraken/words.js';

/** One request: every arm, who has it, and how far it got. The live steps of each arm show in Censai's chat. */
export function KrakenRequestCard({ request, onStop, stopping = false }) {
  return (
    <section className="hb-kraken-request" data-status={request.status} data-testid="kraken-request" aria-label={`Kraken Request: ${request.title}`}>
      <header className="hb-kraken-head">
        <span className="hb-kraken-state">{requestWord(request.status)}</span>
        <span className="hb-kraken-count">{progressLine(request)}</span>
        <span className="hb-kraken-spacer" />
        {requestIsOpen(request) && (
          <button type="button" className="hb-btn" onClick={() => onStop(request.id)} disabled={stopping} aria-label={`Stop the Kraken Request: ${request.title}`}>
            <Icon.Stop size={12} /> {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </header>
      <p className="hb-kraken-goal">{request.title}</p>
      <ul className="hb-kraken-arms">
        {request.arms.map((arm) => (
          <li key={arm.n} className="hb-kraken-arm" data-rank={arm.severity} data-status={arm.status}>
            <div className="hb-kraken-pick">
              <span className="hb-kraken-rank">{rankWord(arm.severity)}</span>
              <span className="hb-kraken-title">{arm.title}</span>
            </div>
            <span className="hb-kraken-to">{arm.agent} · {armWord(arm.status)}</span>
            {arm.note && <p className="hb-kraken-note">Went out as a write-up: {arm.note}</p>}
            {arm.result && <p className="hb-kraken-result">{arm.result}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
