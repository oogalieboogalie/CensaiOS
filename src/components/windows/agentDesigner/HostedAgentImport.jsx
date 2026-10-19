import React from 'react';
import { api } from '../../../lib/api.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { BrandIcon } from '../../brand/BrandIcon.jsx';
import { darkInputStyle, primaryBtnStyle } from './styles.js';
import { ElevenLabsCreate } from './ElevenLabsCreate.jsx';
import { getHostedVendors, postHosted } from '../../../lib/hostedAgents/api.js';

// Import → Hosted agent: an agent that lives on Claude, OpenAI, Google,
// ElevenLabs or a LangChain deployment joins the board like any agent.
// Its messages go to that vendor with the person's own saved key
// (server/routes/hostedAgents.js, server/hostedAgents/).

const chip = (active) => ({
  all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px',
  borderRadius: 'var(--radius-full)', border: `1px solid ${active ? 'var(--accent-line)' : 'var(--hairline)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontWeight: 750,
});
const ghostBtn = {
  all: 'unset', cursor: 'pointer', padding: '8px 13px', borderRadius: 'var(--radius-full)',
  border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontWeight: 800,
};
const fieldLabel = { fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 850 };
const note = { fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.45 };
const box = { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--radius-xl)', border: '1px solid var(--hairline)', background: 'var(--surface)' };

export function HostedAgentImport({ onImported }) {
  const [vendors, setVendors] = React.useState([]);
  const [loadError, setLoadError] = React.useState('');
  const [vendorId, setVendorId] = React.useState('anthropic');
  const [ref, setRef] = React.useState('');
  const [endpoint, setEndpoint] = React.useState('');
  const [savedKeys, setSavedKeys] = React.useState(null);
  const [busy, setBusy] = React.useState('');
  const [found, setFound] = React.useState(null);
  const [error, setError] = React.useState('');
  const [made, setMade] = React.useState(null);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    getHostedVendors()
      .then((list) => { if (alive) setVendors(list); })
      .catch((err) => { if (alive) setLoadError(err.message); });
    api.getUserKeys()
      .then((rows) => { if (alive) setSavedKeys(new Set((rows || []).map((row) => row.provider))); })
      .catch(() => { if (alive) setSavedKeys(null); });
    return () => { alive = false; };
  }, []);

  const vendor = vendors.find((v) => v.id === vendorId) || vendors[0];
  const hasKey = vendor && savedKeys ? savedKeys.has(vendor.keyProvider) : null;
  const pick = (id) => { setVendorId(id); setFound(null); setError(''); setMade(null); setCreating(false); };

  const run = async (what) => {
    setBusy(what);
    setError('');
    try {
      const body = { vendor: vendor.id, ref: ref.trim(), endpoint: endpoint.trim() || undefined };
      if (what === 'test') {
        const data = await postHosted('test', body);
        setFound(data);
        logToApp('info', `hosted agent connection ok (${vendor.id})`, { where: 'hosted-agents' });
      } else {
        const data = await postHosted('import', { ...body, hue: Math.floor(Math.random() * 360) });
        setMade(data.agent);
        onImported?.(data.agent, vendor);
        logToApp('info', `hosted agent imported (${vendor.id})`, { where: 'hosted-agents' });
      }
    } catch (err) {
      setError(err.message);
      logToApp('warn', `hosted agent ${what} failed (${vendor.id}): ${err.message}`, { where: 'hosted-agents' });
    } finally {
      setBusy('');
    }
  };

  if (loadError) return <div style={{ ...note, color: 'var(--danger)' }} data-testid="hosted-load-error">{loadError}</div>;
  if (!vendor) return <div style={note}>Loading the vendors...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="hosted-agent-import">
      <div style={note}>Bring in an agent you already made on another platform. It keeps living there, keeps its own memory there, and joins your board and crews here.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {vendors.map((v) => (
          <button key={v.id} type="button" style={chip(v.id === vendor.id)} onClick={() => pick(v.id)} data-vendor={v.id}>
            <BrandIcon brand={v.brand} size={14} title="" />{v.label}
          </button>
        ))}
      </div>

      <div style={box}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 750 }}>{vendor.product}</div>
        <div style={note}>{vendor.howTo}</div>
        {vendor.needsEndpoint && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={fieldLabel}>{vendor.endpointLabel}</span>
            <input value={endpoint} onChange={(e) => { setEndpoint(e.target.value); setFound(null); }} placeholder={vendor.endpointPlaceholder} style={darkInputStyle} data-testid="hosted-endpoint" />
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={fieldLabel}>{vendor.refLabel}</span>
          <input value={ref} onChange={(e) => { setRef(e.target.value); setFound(null); }} placeholder={vendor.refPlaceholder} style={darkInputStyle} data-testid="hosted-ref" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={fieldLabel}>Key it uses</span>
          <select value={vendor.keyProvider} disabled style={darkInputStyle} data-testid="hosted-key">
            <option value={vendor.keyProvider}>
              {hasKey === false ? `No ${vendor.keyLabel} saved yet` : `Your saved ${vendor.keyLabel}`}
            </option>
          </select>
        </label>
        {hasKey === false && <div style={{ ...note, color: 'var(--warning)' }}>Add your {vendor.keyLabel} in Settings → Vault first. Each person who messages this agent uses their own key.</div>}
        <div style={note} data-testid="hosted-billing">Messages to this agent are billed by {vendor.billedBy} to the key's owner, not by censaiOS.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" style={ghostBtn} disabled={Boolean(busy) || !ref.trim()} onClick={() => run('test')} data-testid="hosted-test">
            {busy === 'test' ? 'Checking...' : 'Test the connection'}
          </button>
          <button type="button" style={{ ...primaryBtnStyle, opacity: busy || !ref.trim() || made ? 0.6 : 1 }} disabled={Boolean(busy) || !ref.trim() || Boolean(made)} onClick={() => run('import')} data-testid="hosted-import">
            {made ? 'Imported' : busy === 'import' ? 'Importing...' : 'Import'}
          </button>
          {vendor.canCreate && (
            <button type="button" style={ghostBtn} onClick={() => setCreating((v) => !v)} data-testid="hosted-create-toggle">
              {creating ? 'Close' : `Make a new one on ${vendor.label}`}
            </button>
          )}
        </div>
        {found && <div style={{ ...note, color: 'var(--success)' }} data-testid="hosted-found">Connected. {vendor.label} knows this agent{found.name ? ` as "${found.name}"` : ''}.</div>}
        {made && <div style={{ ...note, color: 'var(--success)' }} data-testid="hosted-made">{made.name} is on your board now. Add it to a crew like any agent.</div>}
        {error && <div style={{ ...note, color: 'var(--danger)' }} data-testid="hosted-error">{error}</div>}
      </div>

      {creating && vendor.canCreate && (
        <ElevenLabsCreate disabled={hasKey === false} onMade={(agent) => { setMade(agent); onImported?.(agent, vendor); }} />
      )}
    </div>
  );
}
