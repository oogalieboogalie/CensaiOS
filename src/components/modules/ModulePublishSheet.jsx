/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { checkModuleListing, fetchSellerStatus, publishModuleListing } from '../../lib/marketplace/moduleListingsApi.js';

function CheckList({ checks }) {
  if (!checks) return null;
  return (
    <ul className="hb-module-checks" aria-label="Checks">
      {checks.results.map(r => (
        <li key={r.id} className="hb-module-check" data-passed={r.passed ? 'true' : 'false'}>
          <span className="hb-module-check-mark" aria-hidden="true">{r.passed ? <Icon.Check size={12} /> : <Icon.Close size={12} />}</span>
          <span className="hb-module-check-text">
            {r.label}{r.required && !r.passed ? ' (required)' : ''}
            {!r.passed && r.detail && <span className="hb-module-check-detail">{r.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Publish to marketplace (spec 5b, "Copy to your board"). The checks run
 * first and the result shows before anything is listed; publishing signs a
 * certificate over the module's fingerprint so buyers see a real badge.
 */
export function ModulePublishSheet({ win, onUpdate, onClose, onOpenMarketplace }) {
  const [seller, setSeller] = React.useState(null);
  const [summary, setSummary] = React.useState(win.manifest?.description || '');
  const [preview, setPreview] = React.useState(null);
  const [state, setState] = React.useState('checking'); // checking | ready | publishing | listed
  const [error, setError] = React.useState(null);
  const [listing, setListing] = React.useState(null);

  const runChecks = React.useCallback(async () => {
    setState('checking');
    setError(null);
    try {
      setPreview(await checkModuleListing(win, { summary }));
    } catch (err) {
      setError(err.message);
    }
    setState('ready');
  }, [win, summary]);

  React.useEffect(() => {
    let cancelled = false;
    fetchSellerStatus({ fresh: true }).then(s => { if (!cancelled) setSeller(s); }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Run once on open; "Run again" reruns with the edited summary.
  React.useEffect(() => { runChecks(); }, []);

  const publish = async () => {
    setState('publishing');
    setError(null);
    try {
      const listed = await publishModuleListing(win, { summary });
      setListing(listed);
      onUpdate({ listingId: listed.id, listingFingerprint: listed.fingerprint });
      setState('listed');
    } catch (err) {
      if (err.checks) setPreview(p => ({ ...(p || {}), checks: err.checks }));
      setError(err.message);
      setState('ready');
    }
  };

  const checks = preview?.checks;
  const canPublish = seller?.canSell && checks?.passed && !preview?.refused && state === 'ready';

  return (
    <div className="hb-module-sheet" role="dialog" aria-label="Publish to marketplace" data-module-sheet="publish" data-no-drag onPointerDown={e => e.stopPropagation()}>
      <div className="hb-module-sheet-head">
        <span className="hb-module-sheet-title">{state === 'listed' ? 'Listed' : win.listingId ? 'Update listing' : 'Publish to marketplace'}</span>
        <button type="button" className="hb-btn" data-variant="ghost" onClick={onClose} aria-label="Close"><Icon.Close size={13} /></button>
      </div>

      {state === 'listed' && listing ? (
        <div className="hb-module-sheet-body" data-module-listed>
          <p className="hb-module-sheet-lead">{listing.name} is listed. Anyone on this censaiOS can copy it to their board.</p>
          <dl className="hb-module-facts">
            <dt>Checks</dt><dd>{listing.checks.score} of {listing.checks.total} passed</dd>
            <dt>Identity</dt><dd>{listing.verified ? 'Verified, signed by Censai' : 'Not verified'}</dd>
            <dt>Fingerprint</dt><dd className="hb-module-mono" title={listing.fingerprint}>{listing.fingerprint.slice(0, 16)}…</dd>
            <dt>Price</dt><dd>Free</dd>
          </dl>
          <div className="hb-module-row">
            {onOpenMarketplace && <button type="button" className="hb-btn" onClick={onOpenMarketplace}>Open marketplace</button>}
            <button type="button" className="hb-btn" data-primary="true" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div className="hb-module-sheet-body">
          {seller && !seller.canSell && <p className="hb-module-sheet-note" data-module-not-seller>{seller.reason}</p>}
          <label className="hb-module-field">
            <span className="hb-module-kicker">One line for the listing</span>
            <input value={summary} onChange={e => setSummary(e.target.value)} maxLength={160} placeholder="What it does, in one line" aria-label="Listing summary" />
          </label>
          <div className="hb-module-field">
            <div className="hb-module-row" data-justify="between">
              <span className="hb-module-kicker">Checks</span>
              <span className="hb-module-elapsed" data-module-score>
                {state === 'checking' ? 'Running…' : checks ? `${checks.score} of ${checks.total} passed` : ''}
              </span>
            </div>
            <CheckList checks={checks} />
            {preview?.refused && <p className="hb-module-error">Listings for {preview.refused} are not allowed on Censai.</p>}
          </div>
          <dl className="hb-module-facts">
            <dt>Seller</dt><dd>{seller?.canSell ? `You, ${seller.tierLabel} tier` : '—'}</dd>
            <dt>Price</dt><dd>Free. Paid listings open once Stripe is connected.</dd>
            <dt>Buyers get</dt><dd>A copy on their own board that runs on their keys</dd>
          </dl>
          {error && <p className="hb-module-error" role="alert">{error}</p>}
          <div className="hb-module-row">
            <button type="button" className="hb-btn" onClick={runChecks} disabled={state !== 'ready'}>Run checks again</button>
            <button type="button" className="hb-btn" data-primary="true" onClick={publish} disabled={!canPublish}>
              {state === 'publishing' ? 'Publishing…' : win.listingId ? 'Update listing' : 'Publish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
