import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { useMailcow } from './mailcow/useMailcow.js';
import { SetupGuide } from './mailcow/SetupGuide.jsx';
import { DomainsTab } from './mailcow/DomainsTab.jsx';
import { MailboxesTab } from './mailcow/MailboxesTab.jsx';
import { AliasesTab } from './mailcow/AliasesTab.jsx';
import { QueueTab } from './mailcow/QueueTab.jsx';

export function MailcowWindow({ win, onUpdate }) {
  const mailcow = useMailcow();
  const { activeTab, setActiveTab, health, healthLoading, error, showAddForm, setShowAddForm, queue, loading, fetchHealth, fetchData } = mailcow;

  const envelopeIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );

  return (
    <>
      <WindowTitle
        accent="oklch(0.62 0.14 260)"
        icon={envelopeIcon}
        label={win.title || 'Mailcow Panel'}
        subtitle={win.subtitle || 'Infrastructure Manager'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)' }}>
        
        {/* Connection status header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 'var(--text-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {healthLoading ? (
              <span style={{ color: 'var(--ink-faint)' }}>Checking Mailcow API status...</span>
            ) : health.configured ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: health.ok ? 'var(--ps-green)' : 'var(--ps-red)', display: 'inline-block' }} />
                <span style={{ fontWeight: 500 }}>{health.ok ? 'Mailcow Connected' : 'Connection Failed'}</span>
                {health.baseUrl && <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>({health.baseUrl})</span>}
              </>
            ) : (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.60 0.15 45)', display: 'inline-block' }} />
                <span style={{ fontWeight: 500, color: 'oklch(0.50 0.12 45)' }}>Mailcow Not Configured</span>
              </>
            )}
          </div>
          {health.configured && health.ok && (
            <button onClick={() => { fetchHealth(); fetchData(); }} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 4 }} title="Reload data">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              Refresh
            </button>
          )}
        </div>

        {/* Tab content switcher */}
        {!healthLoading && !health.configured ? (
          <SetupGuide />
        ) : !healthLoading && health.configured && !health.ok ? (
          <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 'var(--text-2xl)' }}>⚠️</span>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>Connection Failed</div>
            <div style={{ color: 'var(--ps-red)', fontSize: 'var(--text-md)', maxWidth: 460, fontFamily: 'var(--font-mono)' }}>
              {health.error || 'Check that your MAILCOW_URL is online and the API key is correct.'}
            </div>
            <button onClick={fetchHealth} style={{ all: 'unset', cursor: 'pointer', background: 'var(--accent)', color: 'white', padding: '8px 16px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-md)', fontWeight: 600, marginTop: 12 }}>
              Try Reconnecting
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            
            {/* Tabs */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)', padding: '0 8px' }}>
              {['domains', 'mailboxes', 'aliases', 'queue'].map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setShowAddForm(false); }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '12px 16px',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-label)',
                    textTransform: 'var(--label-case)',
                    letterSpacing: 'var(--label-tracking)',
                    color: activeTab === tab ? 'var(--accent)' : 'var(--ink-soft)',
                    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    fontWeight: activeTab === tab ? 600 : 400,
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {tab}
                  {tab === 'queue' && queue.length > 0 && (
                    <span style={{ marginLeft: 6, background: 'var(--ps-red)', color: 'white', fontSize: 'var(--text-xs)', padding: '1px 5px', borderRadius: 'var(--radius-lg)', fontWeight: 700 }}>
                      {queue.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Dashboard Panels */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, position: 'relative' }}>
              {error && (
                <div style={{ padding: '8px 12px', background: 'oklch(0.95 0.05 15)', border: '1px solid var(--ps-red)', borderRadius: 'var(--radius-lg)', color: 'var(--ps-red)', fontSize: 'var(--text-sm)', marginBottom: 12 }}>
                  Error: {error}
                </div>
              )}

              {/* SEARCH BAR / ADD BUTTON SECTION (not for queue tab) */}
              {activeTab !== 'queue' && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <input
                    type="text"
                    placeholder={`Search ${activeTab}...`}
                    value={mailcow.searchQuery}
                    onChange={(e) => mailcow.setSearchQuery(e.target.value)}
                    style={{
                      flex: 1, padding: '6px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)',
                      background: 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--text-md)', outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    style={{
                      all: 'unset', cursor: 'pointer', background: showAddForm ? 'var(--surface-2)' : 'var(--accent-soft)',
                      color: showAddForm ? 'var(--ink)' : 'var(--accent-ink)', border: showAddForm ? '1px solid var(--hairline)' : '1px solid transparent',
                      padding: '6px 14px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    {showAddForm ? 'Cancel' : (
                      <>
                        <Icon.Plus size={12} stroke={2.4} />
                        {activeTab === 'domains' ? 'Add Domain' : activeTab === 'mailboxes' ? 'New Mailbox' : 'New Alias'}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* LISTS DISPLAY */}
              {loading ? (
                <div style={{ padding: 36, textAlign: 'center', fontSize: 'var(--text-md)', color: 'var(--ink-faint)', fontFamily: 'var(--font-label)', textTransform: 'var(--label-case)' }}>
                  Querying Mailcow Server...
                </div>
              ) : (
                <>
                  {activeTab === 'domains' && <DomainsTab mailcow={mailcow} />}
                  {activeTab === 'mailboxes' && <MailboxesTab mailcow={mailcow} />}
                  {activeTab === 'aliases' && <AliasesTab mailcow={mailcow} />}
                  {activeTab === 'queue' && <QueueTab mailcow={mailcow} />}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
