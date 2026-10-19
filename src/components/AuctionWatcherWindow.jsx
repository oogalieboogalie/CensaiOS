import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { logToApp } from '../lib/appLog/browserLog.js';
import { useAuctionWatcher } from './auctionWatcher/useAuctionWatcher.js';
import { EbayKeyBox, WatchForm } from './auctionWatcher/WatchForm.jsx';
import { MatchCard } from './auctionWatcher/MatchCard.jsx';
import { agoText, dollars, intervalLabel, INTERVALS, SITES } from './auctionWatcher/format.js';

function WatchList({ watches, selectedId, onSelect, onNew }) {
  return (
    <nav className="hb-aw-list" aria-label="Watches">
      <button type="button" className="hb-aw-btn" data-primary="true" onClick={onNew}>New watch</button>
      {watches.map((w) => (
        <button key={w.id} type="button" className="hb-aw-watch" aria-current={w.id === selectedId || undefined} onClick={() => onSelect(w.id)}>
          <span className="hb-aw-watch-q">{w.query}</span>
          <span className="hb-aw-faint">
            {SITES[w.site]}{w.maxPrice ? ` · under ${dollars(w.maxPrice)}` : ''}{w.status === 'paused' ? ' · paused' : ''}
          </span>
          {w.unseenCount > 0 && <span className="hb-aw-count">{w.unseenCount}</span>}
        </button>
      ))}
    </nav>
  );
}

function WatchHead({ watch, aw, ebayKey }) {
  const paused = watch.status === 'paused';
  return (
    <header className="hb-aw-head">
      <div className="hb-aw-head-main">
        <h2 className="hb-aw-h2">{watch.query}</h2>
        <div className="hb-aw-faint">
          {SITES[watch.site]}{watch.maxPrice ? ` · under ${dollars(watch.maxPrice)}` : ''}
          {watch.mustWords.length ? ` · must say ${watch.mustWords.join(', ')}` : ''}
          {watch.notWords.length ? ` · skips ${watch.notWords.join(', ')}` : ''} · {agoText(watch.lastCheckedAt)}
        </div>
      </div>
      <div className="hb-aw-head-actions">
        <select className="hb-aw-input" aria-label="How often" value={watch.intervalMinutes} onChange={(e) => aw.setInterval(watch.id, Number(e.target.value))}>
          {INTERVALS.map((i) => <option key={i.minutes} value={i.minutes}>{i.label}</option>)}
        </select>
        <button type="button" className="hb-aw-btn" disabled={Boolean(aw.busy)} onClick={() => aw.checkNow(watch.id)}>{aw.busy === 'checking' ? 'Checking…' : 'Check now'}</button>
        <button type="button" className="hb-aw-btn" onClick={() => aw.setStatus(watch.id, paused ? 'active' : 'paused')}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className="hb-aw-btn" data-danger="true" onClick={() => aw.removeWatch(watch.id)}>Delete</button>
      </div>
      {watch.statusNote && <div className="hb-aw-alert" role="status">{watch.statusNote}</div>}
      {watch.site === 'ebay' && !ebayKey && <EbayKeyBox onSave={aw.saveEbayKey} busy={Boolean(aw.busy)} />}
    </header>
  );
}

// Auction Watcher: saved searches on shopgoodwill.com and eBay, checked on a
// timer by the server (server/auctionWatcher/). New matches reach the Inbox
// and a toast; each card opens its listing in a censaiOS Browser window.
export function AuctionWatcherWindow({ win = {}, onUpdate }) {
  const aw = useAuctionWatcher({ win, onUpdate });
  const spawnAt = useWorkspaceStore((s) => s.spawnAt);
  const [adding, setAdding] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const { watches, selected, select } = aw;
  React.useEffect(() => {
    if (!adding && watches?.length && !selected) select(watches[0].id);
  }, [adding, watches, selected, select]);

  const openListing = (match) => {
    logToApp('info', `auction-watcher: opened listing ${match.listingId}`, { where: 'auction-watcher' });
    const pos = Number.isFinite(win.x) ? { x: win.x + (win.w || 960) + 24, y: win.y || 0 } : null;
    spawnAt('browser', { url: match.url, title: match.title.slice(0, 60) }, pos);
  };

  const add = async (input) => {
    if (await aw.addWatch(input)) setAdding(false);
  };

  let body;
  if (aw.watches === null) body = <div className="hb-aw-empty">Loading your watches…</div>;
  else if (adding || aw.watches.length === 0) {
    body = <WatchForm onSubmit={add} onCancel={aw.watches.length ? () => setAdding(false) : null} busy={aw.busy} ebayKey={aw.ebayKey} onSaveEbayKey={aw.saveEbayKey} />;
  } else if (!aw.selected) body = <div className="hb-aw-empty">Pick a watch on the left to see what it found.</div>;
  else {
    body = (
      <>
        <WatchHead watch={aw.selected} aw={aw} ebayKey={aw.ebayKey} />
        {aw.matches.length === 0
          ? (
            <div className="hb-aw-empty">
              {aw.selected.status === 'paused' ? 'This watch is paused. Press Resume to look again.' : `Nothing matches yet. censaiOS keeps looking ${intervalLabel(aw.selected.intervalMinutes)}.`}
            </div>
          )
          : (
            <div className="hb-aw-grid">
              {aw.matches.map((m) => (
                <MatchCard key={m.id} match={m} busy={aw.busy} now={now} onOpen={openListing} onInsights={aw.insights} onLastSold={aw.lastSold} />
              ))}
            </div>
          )}
      </>
    );
  }

  return (
    <>
      <WindowTitle icon={<Icon.Eye size={12} />} label={win.title || 'Auction Watcher'} subtitle="Goodwill · eBay" />
      <div className="hb-aw">
        {aw.watches?.length > 0 && (
          <WatchList watches={aw.watches} selectedId={adding ? null : aw.selected?.id} onSelect={(id) => { setAdding(false); aw.select(id); }} onNew={() => setAdding(true)} />
        )}
        <main className="hb-aw-main">
          {aw.error && <div className="hb-aw-alert" role="alert">{aw.error}</div>}
          {aw.note && !aw.error && <div className="hb-aw-note" role="status">{aw.note}</div>}
          {body}
        </main>
      </div>
    </>
  );
}
