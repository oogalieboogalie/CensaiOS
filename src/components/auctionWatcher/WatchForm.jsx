import React from 'react';
import { INTERVALS } from './format.js';

const LOCK_WORDS = 'supervisor password, bios locked, tamper';

/** eBay needs the person's own free developer keys before a watch can run. */
export function EbayKeyBox({ onSave, busy }) {
  const [appId, setAppId] = React.useState('');
  const [certId, setCertId] = React.useState('');
  return (
    <div className="hb-aw-key">
      <div>
        eBay watches use your own free eBay developer keys. Make them at developer.ebay.com (Application Keys, Production),
        then paste the App ID and the Cert ID here. They stay in your key vault on this computer.
      </div>
      <div className="hb-aw-key-row">
        <input className="hb-aw-input" placeholder="App ID (Client ID)" value={appId} onChange={(e) => setAppId(e.target.value)} spellCheck={false} aria-label="eBay App ID" />
        <input className="hb-aw-input" placeholder="Cert ID (Client Secret)" type="password" value={certId} onChange={(e) => setCertId(e.target.value)} aria-label="eBay Cert ID" />
        <button type="button" className="hb-aw-btn" data-primary="true" disabled={busy || !appId.trim() || !certId.trim()} onClick={() => onSave(appId, certId)}>
          Save keys
        </button>
      </div>
    </div>
  );
}

/** A new watch: where, what words, how much at most, which words must (not) be there, how often. */
export function WatchForm({ onSubmit, onCancel, busy, ebayKey, onSaveEbayKey }) {
  const [site, setSite] = React.useState('shopgoodwill');
  const [query, setQuery] = React.useState('');
  const [maxPrice, setMaxPrice] = React.useState('');
  const [mustWords, setMustWords] = React.useState('');
  const [notWords, setNotWords] = React.useState('');
  const [intervalMinutes, setIntervalMinutes] = React.useState(30);
  const needsKey = site === 'ebay' && !ebayKey;

  const submit = (e) => {
    e.preventDefault();
    if (!query.trim() || needsKey) return;
    onSubmit({ site, query, maxPrice: maxPrice ? Number(maxPrice) : null, mustWords, notWords, intervalMinutes });
  };

  return (
    <form className="hb-aw-form" onSubmit={submit} aria-label="New watch">
      <div className="hb-aw-form-head">
        <h2 className="hb-aw-h2">New watch</h2>
        <div className="hb-aw-seg" role="group" aria-label="Site">
          {[['shopgoodwill', 'Goodwill'], ['ebay', 'eBay']].map(([value, label]) => (
            <button key={value} type="button" className="hb-aw-btn" aria-pressed={site === value} onClick={() => setSite(value)}>{label}</button>
          ))}
        </div>
      </div>
      <label className="hb-aw-field">
        <span className="hb-aw-label">Search for</span>
        <input className="hb-aw-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="lenovo thinkpad" autoFocus />
      </label>
      <div className="hb-aw-row">
        <label className="hb-aw-field">
          <span className="hb-aw-label">Max price ($)</span>
          <input className="hb-aw-input" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="300" />
        </label>
        <label className="hb-aw-field">
          <span className="hb-aw-label">Check</span>
          <select className="hb-aw-input" value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
            {INTERVALS.map((i) => <option key={i.minutes} value={i.minutes}>{i.label}</option>)}
          </select>
        </label>
      </div>
      <label className="hb-aw-field">
        <span className="hb-aw-label">Must mention (every word, comma between)</span>
        <input className="hb-aw-input" value={mustWords} onChange={(e) => setMustWords(e.target.value)} placeholder="thinkpad, 16gb" />
      </label>
      <label className="hb-aw-field">
        <span className="hb-aw-label">Must not mention</span>
        <input className="hb-aw-input" value={notWords} onChange={(e) => setNotWords(e.target.value)} placeholder={LOCK_WORDS} />
        <button type="button" className="hb-aw-link" onClick={() => setNotWords((v) => (v ? `${v}, ${LOCK_WORDS}` : LOCK_WORDS))}>
          Skip locked laptops
        </button>
      </label>
      {needsKey && <EbayKeyBox onSave={onSaveEbayKey} busy={Boolean(busy)} />}
      <div className="hb-aw-actions">
        <button type="submit" className="hb-aw-btn" data-primary="true" disabled={Boolean(busy) || !query.trim() || needsKey}>
          {busy === 'adding' ? 'Adding and checking…' : 'Start watching'}
        </button>
        {onCancel && <button type="button" className="hb-aw-btn" onClick={onCancel}>Cancel</button>}
      </div>
      <p className="hb-aw-fine">
        censaiOS asks each site at most every 15 minutes per watch, says who it is, and pauses the watch if a site says no.
        Words are checked against the listing title.
      </p>
    </form>
  );
}
