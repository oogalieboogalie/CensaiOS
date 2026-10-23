/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { useWorkspaceStore } from '../../lib/store.js';
import { fetchModuleListings, installModuleListing } from '../../lib/marketplace/moduleListingsApi.js';
import { moduleWindowFromSaved } from '../../lib/modules/moduleWindowState.js';
import { clampModuleSize } from '../../lib/modules/moduleFormat.js';
import { matches } from '../../lib/modules/addPaletteItems.js';
import { describePermissions } from '../../lib/modules/manifestV3.js';

function day(at) {
  const t = Date.parse(at || '');
  return t ? new Date(t).toISOString().slice(0, 10) : '';
}

/**
 * What a listed module may do, in plain words. Before, every permission but
 * "agent" read "the internet", so a module that only saves its data said
 * "Asks for the internet and the internet".
 */
export function mayDo(manifest) {
  const lines = describePermissions(manifest).map(s => s.charAt(0).toLowerCase() + s.slice(1));
  return lines.length ? `May ${lines.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : '';
}

/** The badge comes from the server's signature check, never from listing text. */
function Badge({ listing }) {
  if (listing.verified) return <span className="hb-market-badge" data-state="verified" title={`Fingerprint ${listing.fingerprint}`}><Icon.Check size={11} />Verified</span>;
  if (listing.changed) return <span className="hb-market-badge" data-state="changed">Changed since verification</span>;
  return <span className="hb-market-badge" data-state="unverified">Not verified</span>;
}

/**
 * Marketplace, Modules tab (spec 5b "Copy to your board"): modules sellers
 * published, with their check score and signed identity. Adding one puts a
 * copy on this board that runs on the buyer's own keys.
 */
export function ModuleListings({ search = '' }) {
  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const setActiveId = useWorkspaceStore(state => state.setActiveId);
  const [listings, setListings] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [adding, setAdding] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchModuleListings()
      .then(list => { if (!cancelled) setListings(list); })
      .catch(err => { if (!cancelled) { setListings([]); setError(err.message); } });
    return () => { cancelled = true; };
  }, []);

  const add = async (listing) => {
    setAdding(listing.id);
    setError(null);
    try {
      const full = await installModuleListing(listing.id);
      const props = {
        ...moduleWindowFromSaved({ name: full.name, request: full.request, manifest: full.manifest, source: full.source }),
        fromListing: { id: full.id, fingerprint: full.fingerprint },
      };
      props.versions = props.versions.map(v => ({ ...v, note: 'Copied from the marketplace' }));
      const id = spawnAt?.('module', props, null, clampModuleSize(full.manifest?.size));
      if (id) setActiveId?.(id);
      setListings(list => (list || []).map(l => (l.id === full.id ? { ...l, installs: full.installs } : l)));
    } catch (err) {
      setError(err.message);
    }
    setAdding(null);
  };

  if (listings === null) return <div className="hb-market-empty">Loading modules…</div>;
  const visible = listings.filter(l => matches(search, l.name, l.summary, l.manifest?.description));

  return (
    <div className="hb-market-list" data-testid="marketplace-modules">
      {error && <p className="hb-module-error" role="alert">{error}</p>}
      {visible.length === 0 && (
        <div className="hb-market-empty">
          {listings.length === 0 ? 'No modules are listed yet. Build one, then choose Publish to marketplace from its menu.' : 'No modules match.'}
        </div>
      )}
      {visible.map((l) => {
        const Glyph = Icon[l.manifest?.icon] || Icon.Toolbox;
        return (
          <div key={l.id} className="hb-market-card" data-testid={`marketplace-listing-${l.id}`}>
            <span className="hb-market-icon"><Glyph size={16} /></span>
            <div className="hb-market-main">
              <div className="hb-market-title">
                <span className="hb-market-name">{l.name}</span>
                <Badge listing={l} />
              </div>
              <div className="hb-market-summary">{l.summary || l.manifest?.description}</div>
              <div className="hb-market-meta">
                <span>{l.seller?.name || 'Censai'}</span>
                <span>Checks {l.checks.score} of {l.checks.total}, run {day(l.checks.ranAt)}</span>
                <span>{l.installs === 1 ? '1 copy' : `${l.installs} copies`}</span>
                {mayDo(l.manifest) && <span>{mayDo(l.manifest)}</span>}
              </div>
            </div>
            <div className="hb-market-actions">
              <span className="hb-market-price">Free</span>
              <button type="button" className="hb-btn" data-primary="true" onClick={() => add(l)} disabled={adding === l.id}>
                {adding === l.id ? 'Adding…' : 'Add to board'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
