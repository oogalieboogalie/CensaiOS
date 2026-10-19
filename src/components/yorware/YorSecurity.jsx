import React from 'react';
import { YOR_SECURITY, yorSecurity } from '../../lib/yorware/securityNames.js';

/** A small Yor-* name badge on a security piece (diagram 11). */
export function YorName({ id }) {
  const entry = yorSecurity(id);
  if (!entry) return null;
  return (
    <span className="hb-yor-name" data-yor={entry.id} title={entry.line}>
      <span className="hb-yor-name-dot" aria-hidden="true" />
      {entry.name}
    </span>
  );
}

/** Settings > Open anywhere: the four guards by name, and where each lives. */
export function YorSecurityCard() {
  return (
    <section className="hb-yor-card" data-testid="yor-security" aria-label="YorWare Security">
      <div className="hb-yor-card-head">
        <div className="hb-yor-card-title">YorWare Security</div>
        <div className="hb-yor-card-sub">Four guards keep censaiOS safe. Each name is on the real piece.</div>
      </div>
      <ul className="hb-yor-list">
        {YOR_SECURITY.map((entry) => (
          <li key={entry.id} className="hb-yor-row" data-yor-row={entry.id}>
            <YorName id={entry.id} />
            <div className="hb-yor-line">{entry.line}</div>
            <div className="hb-yor-where">{entry.piece} · {entry.where}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
