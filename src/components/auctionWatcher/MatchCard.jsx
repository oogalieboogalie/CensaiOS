import { dollars, endingSoon, timeLeft } from './format.js';

function LastSold({ sold }) {
  if (!sold) return null;
  if (sold.none) return <div className="hb-aw-sold">{sold.none}</div>;
  const when = sold.soldAt ? new Date(sold.soldAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
  return (
    <div className="hb-aw-sold">
      Last sold on {sold.where}: <b>{dollars(sold.price, sold.currency)}</b>{when ? ` on ${when}` : ''}
      <span className="hb-aw-faint"> · for "{sold.query}"{sold.title ? ` (${sold.title})` : ''}</span>
    </div>
  );
}

function Insights({ insights }) {
  if (!insights) return null;
  return (
    <div className="hb-aw-insights">
      {insights.verdict && <div className="hb-aw-verdict">{insights.verdict}</div>}
      <div className="hb-aw-pc">
        {insights.pros?.length > 0 && <ul aria-label="Pros">{insights.pros.map((p) => <li key={p} data-tone="good">{p}</li>)}</ul>}
        {insights.cons?.length > 0 && <ul aria-label="Cons">{insights.cons.map((c) => <li key={c} data-tone="bad">{c}</li>)}</ul>}
      </div>
      {insights.photoLock && <div className="hb-aw-flag" role="note">In the photos: {insights.photoLock}</div>}
      {!insights.photoLock && insights.photosChecked > 0 && (
        <div className="hb-aw-faint">Looked at {insights.photosChecked} photo{insights.photosChecked === 1 ? '' : 's'}: no lock screen seen.</div>
      )}
      {insights.photosNote && <div className="hb-aw-faint">{insights.photosNote}</div>}
      {!insights.readDescription && <div className="hb-aw-faint">Written from the title only: the site did not give a description.</div>}
    </div>
  );
}

/** One listing: picture, title, price, time left, red flags and the on-demand extras. */
export function MatchCard({ match, busy, now, onOpen, onInsights, onLastSold }) {
  const flags = [...new Set([...(match.redFlags || []), ...(match.insights?.redFlags || [])])];
  const left = timeLeft(match.endsAt, now);
  return (
    <article className="hb-aw-card" data-ended={left === 'ended' || undefined}>
      <button type="button" className="hb-aw-pic" onClick={() => onOpen(match)} title="Open the listing in a Browser window">
        {match.imageUrl ? <img src={match.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>No picture</span>}
        {match.isNew && <span className="hb-aw-new">New</span>}
      </button>
      <div className="hb-aw-card-body">
        <div className="hb-aw-title" title={match.title}>{match.title}</div>
        <div className="hb-aw-meta">
          <b className="hb-aw-price">{dollars(match.price, match.currency)}</b>
          <span>{match.bids === null || match.bids === undefined ? 'buy now' : `${match.bids} bid${match.bids === 1 ? '' : 's'}`}</span>
          <span data-soon={endingSoon(match.endsAt, now) || undefined}>{left}</span>
        </div>
        {flags.length > 0 && <div className="hb-aw-flag" role="note">Red flag: {flags.join(', ')}. It may stay locked.</div>}
        <Insights insights={match.insights} />
        <LastSold sold={match.lastSold} />
        <div className="hb-aw-card-actions">
          <button type="button" className="hb-aw-btn" data-primary="true" onClick={() => onOpen(match)}>Open listing</button>
          <button type="button" className="hb-aw-btn" disabled={Boolean(busy)} onClick={() => onInsights(match.id)}>
            {busy === `insights-${match.id}` ? 'Thinking…' : match.insights ? 'Redo pros and cons' : 'AI pros and cons'}
          </button>
          <button type="button" className="hb-aw-btn" disabled={Boolean(busy)} onClick={() => onLastSold(match.id)}>
            {busy === `sold-${match.id}` ? 'Looking…' : 'Last sold price'}
          </button>
        </div>
      </div>
    </article>
  );
}
