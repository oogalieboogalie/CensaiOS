import React from 'react';
import { Icon } from '../Icons.jsx';
import { ThemePanelCard } from './ThemeControls.jsx';
import { api } from '../../lib/api.js';
import { BYOK_PROVIDERS } from '../../lib/byokProviders.js';

export function VaultSection() {
  const [keys, setKeys] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [addingProvider, setAddingProvider] = React.useState(null);
  const [keyInput, setKeyInput] = React.useState('');
  const [modelInput, setModelInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const data = await api.getUserKeys();
      setKeys(data || []);
    } catch (err) {
      console.error('Vault fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchKeys();
  }, []);

  const selectProvider = (provider) => {
    setAddingProvider(provider);
    setKeyInput('');
    setModelInput('');
  };

  const handleSave = async () => {
    if (!addingProvider || !keyInput) return;
    setSaving(true);
    try {
      await api.setUserKey(addingProvider.id, keyInput, null, modelInput || null);
      await fetchKeys();
      setAddingProvider(null);
      setKeyInput('');
      setModelInput('');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerId) => {
    if (!confirm(`Remove ${providerId} key from your vault?`)) return;
    try {
      await api.deleteUserKey(providerId);
      await fetchKeys();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div style={{ padding: 30, color: 'var(--ink-faint)', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>Loading AI provider keys...</div>;

  return (
    <div style={{ display: 'grid', gap: 16, padding: '4px 0 20px' }}>
      <div style={{ padding: '0 4px', marginBottom: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 12, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', color: 'white', display: 'grid', placeItems: 'center', boxShadow: '4px 4px 0 var(--ink)' }}>
            <Icon.Memory size={18} stroke={2.5} />
          </div>
          AI provider keys
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 12, lineHeight: 1.5, maxWidth: '90%' }}>
          Bring Your Own Key (BYOK). Keys are AES-256-GCM encrypted at rest and stored in your private account.
        </p>
      </div>

      {BYOK_PROVIDERS.map(p => {
        const userKey = keys.find(k => k.provider === p.id);
        const isEditing = addingProvider?.id === p.id;

        return (
          <ThemePanelCard key={p.id} style={{ 
            padding: 0, 
            overflow: 'hidden',
            border: isEditing ? '2px solid var(--accent)' : '1px solid var(--hairline)',
            boxShadow: isEditing ? '6px 6px 0 var(--accent-soft)' : 'none',
            transition: 'all 0.2s'
          }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isEditing ? 'var(--surface-2)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ 
                  width: 40, height: 40, borderRadius: 10, 
                  background: userKey ? 'var(--accent-soft)' : 'var(--surface-3)', 
                  border: `1px solid ${userKey ? 'var(--accent)' : 'var(--hairline)'}`, 
                  display: 'grid', placeItems: 'center', color: userKey ? 'var(--accent-ink)' : 'var(--ink-faint)',
                  boxShadow: userKey ? '2px 2px 0 var(--accent)' : 'none'
                }}>
                   {p.id === 'google' ? <Icon.Plus size={20} /> : p.id === 'anthropic' ? <Icon.List size={20} /> : <Icon.Tools size={20} />}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: userKey ? 'var(--ps-green)' : 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                    {userKey ? (
                      <><Icon.Check size={10} stroke={3} /> Configured</>
                    ) : (
                      'Not configured'
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {userKey && !isEditing && (
                  <button 
                    onClick={() => handleDelete(p.id)}
                    style={{ all: 'unset', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ps-red)', display: 'grid', placeItems: 'center', border: '1px solid var(--hairline)' }}
                    title="Delete Key"
                  >
                    <Icon.Close size={14} stroke={2.5} />
                  </button>
                )}
                <button 
                  onClick={() => selectProvider(isEditing ? null : p)}
                  style={{ 
                    all: 'unset', cursor: 'pointer', padding: '0 16px', height: 32, borderRadius: 8, 
                    background: isEditing ? 'var(--ink)' : 'var(--accent)', 
                    color: isEditing ? 'var(--surface)' : 'white', 
                    fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                    boxShadow: isEditing ? 'none' : '3px 3px 0 var(--ink)'
                  }}
                >
                  {isEditing ? 'Cancel' : (userKey ? 'Update' : 'Add key')}
                </button>
              </div>
            </div>

            {isEditing && (
              <div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}>
                <div style={{ height: 1, background: 'var(--hairline)' }} />
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>API Key</label>
                  <input 
                    type="password"
                    autoFocus
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    placeholder={p.placeholder}
                    style={{ all: 'unset', width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-mono)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}
                  />
                </div>
                
                {p.id === 'openrouter' && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Default Model Slug</label>
                    <input 
                      value={modelInput}
                      onChange={e => setModelInput(e.target.value)}
                      placeholder="anthropic/claude-3.5-sonnet"
                      style={{ all: 'unset', boxSizing: 'border-box', width: '100%', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                )}

                <button 
                  onClick={handleSave}
                  disabled={saving || !keyInput}
                  style={{ 
                    all: 'unset', cursor: (saving || !keyInput) ? 'not-allowed' : 'pointer', 
                    padding: '12px', borderRadius: 8, 
                    background: 'var(--ps-green)', color: 'white', 
                    fontSize: 12, fontWeight: 900, textAlign: 'center', 
                    marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
                    boxShadow: (saving || !keyInput) ? 'none' : '4px 4px 0 var(--ink)',
                    opacity: (saving || !keyInput) ? 0.5 : 1
                  }}
                >
                  {saving ? 'Encrypting...' : 'Save encrypted key'}
                </button>
              </div>
            )}
          </ThemePanelCard>
        );
      })}

      <div style={{ 
        marginTop: 8, padding: '12px 16px', borderRadius: 12, 
        background: 'var(--surface-2)', border: '1px solid var(--hairline)', 
        display: 'flex', gap: 14, alignItems: 'start',
        boxShadow: 'inset 4px 0 0 var(--ps-blue)'
      }}>
        <Icon.Eye size={18} style={{ color: 'var(--ps-blue)', marginTop: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          <strong>Personal credentials:</strong> Requests to a configured provider use your encrypted key instead of shared server credentials.
        </div>
      </div>
    </div>
  );
}
