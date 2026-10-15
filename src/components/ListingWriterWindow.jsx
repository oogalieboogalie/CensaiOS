/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { getAgentById } from '../lib/agentStore.js';
import { checkFairHousing } from '../lib/realEstate/fairHousing.js';
import { FairHousingFlags, FairHousingText } from './realEstate/FairHousingText.jsx';

// Spec 7: the Listing Writer. A short form becomes a description, a social
// post and an email blast, written by the board's Listing Writer agent and
// checked for fair-housing words. The copy lands in the draft doc next to
// this window for people to edit; this window keeps the agent's original so
// the two sit side by side.

const PARTS = [
  { id: 'description', label: 'Description' },
  { id: 'social', label: 'Social post' },
  { id: 'email', label: 'Email blast' },
];

const EMPTY_LISTING = { address: '', city: '', beds: '', baths: '', sqft: '', price: '', features: '', photos: [] };

export async function requestListingDraft({ workspaceId, agentId, listing }) {
  const res = await fetch('/api/real-estate/listing-draft', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, agentId, listing }),
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) throw new Error(body?.error || 'The Listing Writer could not write this one.');
  return body;
}

function Field({ label, children, span = 1 }) {
  return <label className="re-field" style={{ gridColumn: `span ${span}` }}><span className="re-label">{label}</span>{children}</label>;
}

function partText(draft, part) {
  if (!draft) return '';
  if (part === 'email') return [draft.emailSubject && `Subject: ${draft.emailSubject}`, draft.emailBody].filter(Boolean).join('\n\n');
  return draft[part] || '';
}

export function ListingWriterWindow({ win = {}, onUpdate, request = requestListingDraft }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const listing = { ...EMPTY_LISTING, ...(win.listing || {}) };
  const original = win.agentDraft || null;
  const [tab, setTab] = React.useState('description');
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState('');
  const agent = getAgentById(win.agentId);
  const featureCheck = React.useMemo(() => checkFairHousing(listing.features), [listing.features]);

  const set = (field) => (event) => onUpdate?.({ listing: { ...listing, [field]: event.target.value } });
  const addPhotos = (event) => {
    const names = [...(event.target.files || [])].map(file => ({ name: file.name }));
    if (names.length) onUpdate?.({ listing: { ...listing, photos: [...(listing.photos || []), ...names].slice(0, 12) } });
    event.target.value = '';
  };
  const removePhoto = (index) => onUpdate?.({ listing: { ...listing, photos: listing.photos.filter((_, i) => i !== index) } });

  const write = async (event) => {
    event?.preventDefault?.();
    if (working) return;
    if (!listing.address.trim()) { setError('Add the property address first.'); return; }
    setWorking(true);
    setError('');
    try {
      const result = await request({ workspaceId, agentId: win.agentId, listing });
      const store = useWorkspaceStore.getState();
      let draftId = win.draftWindowId;
      const title = `Listing draft: ${result.listing?.address || listing.address}`;
      if (draftId && store.wins.some(w => w.id === draftId)) {
        store.onUpdate(draftId, { text: result.docText, title, fileName: title });
      } else {
        draftId = store.spawnAt('doc', { title, fileName: title, text: result.docText }, { x: (win.x || 0) + (win.w || 480) + 24, y: win.y || 0 }, { w: 560, h: Math.max(480, win.h || 480) });
      }
      onUpdate?.({ draftWindowId: draftId, agentDraft: { draft: result.draft, check: result.check, at: new Date().toISOString() } });
    } catch (err) {
      setError(err.message || 'The Listing Writer could not write this one.');
    } finally {
      setWorking(false);
    }
  };

  const activePart = PARTS.find(p => p.id === tab) || PARTS[0];
  // Checked here on the exact text shown, so highlights line up.
  const partFlags = React.useMemo(() => Object.fromEntries(PARTS.map(part => [part.id, checkFairHousing(partText(original?.draft, part.id))])), [original]);
  const flags = partFlags[activePart.id].flags;
  const totalFlags = original ? PARTS.reduce((n, part) => n + partFlags[part.id].flags.length, 0) : 0;
  const allOk = PARTS.every(part => partFlags[part.id].ok);

  return (
    <>
      <WindowTitle icon={<Icon.Edit size={12} />} label={win.title || 'Listing Writer'} subtitle={agent?.name ? `${agent.name}${agent.model_provider === 'ollama' ? ' · local model' : ''}` : 'Real Estate Team'} />
      <form className="re-win" onSubmit={write} data-testid="listing-writer">
        <div className="re-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <Field label="Address" span={3}><input className="re-input" value={listing.address} onChange={set('address')} placeholder="14 Alder Way" /></Field>
          <Field label="Price"><input className="re-input" value={listing.price} onChange={set('price')} placeholder="465,000" inputMode="numeric" /></Field>
          <Field label="City" span={1}><input className="re-input" value={listing.city} onChange={set('city')} /></Field>
          <Field label="Beds"><input className="re-input" value={listing.beds} onChange={set('beds')} inputMode="numeric" /></Field>
          <Field label="Baths"><input className="re-input" value={listing.baths} onChange={set('baths')} inputMode="decimal" /></Field>
          <Field label="Sq ft"><input className="re-input" value={listing.sqft} onChange={set('sqft')} inputMode="numeric" /></Field>
          <Field label="Features" span={4}>
            <textarea className="re-input" rows={4} value={listing.features} onChange={set('features')} placeholder="Updated kitchen, fenced yard, new roof…" />
          </Field>
        </div>
        {featureCheck.flags.length > 0 && <div className="re-card"><FairHousingFlags flags={featureCheck.flags} /></div>}
        <div className="re-spread">
          <div className="re-photos">
            {(listing.photos || []).map((photo, index) => (
              <span key={`${photo.name}-${index}`} className="re-pill">{photo.name}
                <button type="button" className="re-btn ghost" style={{ minHeight: 18, padding: '0 var(--space-1)' }} aria-label={`Remove ${photo.name}`} onClick={() => removePhoto(index)}>×</button>
              </span>
            ))}
            <label className="re-btn ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
              Add photos<input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} />
            </label>
          </div>
          <button type="submit" className="re-btn primary" disabled={working} data-testid="listing-write">{working ? 'Writing…' : original ? 'Write again' : 'Write listing'}</button>
        </div>
        {error && <div role="alert" style={{ color: 'var(--danger)' }}>{error}</div>}

        {original && (
          <div className="re-section" data-testid="listing-original">
            <div className="re-spread">
              <span className="re-label">Agent's original</span>
              {totalFlags
                ? <span className={`re-pill ${allOk ? 'warn' : 'risk'}`}>{totalFlags} fair-housing {totalFlags === 1 ? 'flag' : 'flags'}</span>
                : <span className="re-pill ok">Passed fair-housing check</span>}
            </div>
            <div className="re-tabs" role="tablist">
              {PARTS.map(part => (
                <button key={part.id} type="button" role="tab" className="re-tab" aria-selected={tab === part.id} onClick={() => setTab(part.id)}>
                  {part.label}{partFlags[part.id].flags.length ? ` · ${partFlags[part.id].flags.length}` : ''}
                </button>
              ))}
            </div>
            <FairHousingText text={partText(original.draft, activePart.id)} flags={flags} />
            {flags.length > 0 && <div className="re-card"><FairHousingFlags flags={flags} /></div>}
            <div className="re-faint">Your edits go in the draft doc next to this window. This stays as the agent wrote it.</div>
          </div>
        )}
      </form>
    </>
  );
}
