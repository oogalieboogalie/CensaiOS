/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { useKraken } from './useKraken.js';
import { KrakenPaste, KrakenPreview } from './KrakenSetup.jsx';
import { KrakenRequestCard } from './KrakenArms.jsx';
import { windowMeta } from './meta.js';

export { windowMeta };

/**
 * Kraken Request: one report in, many arms out. Paste a review or an audit,
 * see which family member would get each finding, then release it. Each arm
 * runs as one of Censai's plans (server/kraken, server/censaiOrchestrator),
 * a couple at a time, and Censai checks each answer before it counts.
 */
export function KrakenWindow({ win = {}, onUpdate }) {
  const kraken = useKraken(win, onUpdate);
  const { requests, open, preview, error } = kraken;
  const past = requests.filter((request) => request.id !== open?.id).slice(0, 3);

  return (
    <>
      <WindowTitle icon={<Icon.Branch size={12} />} label={win.title || windowMeta.label} subtitle="One report in, many arms out" />
      <div className="hb-kraken">
        {error && <p className="hb-kraken-error" role="alert">{error}</p>}
        {open && <KrakenRequestCard request={open} onStop={kraken.stop} stopping={kraken.busy === 'stop'} />}
        {preview ? <KrakenPreview kraken={kraken} /> : <KrakenPaste kraken={kraken} />}
        {past.length > 0 && (
          <section className="hb-kraken-past">
            <h3 className="hb-kraken-label">Earlier</h3>
            {past.map((request) => <KrakenRequestCard key={request.id} request={request} onStop={kraken.stop} />)}
          </section>
        )}
      </div>
    </>
  );
}

export default KrakenWindow;
