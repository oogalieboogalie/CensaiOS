/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// AI resources: one place for everything AI a person has. Which keys and
// accounts they hold per provider (masked), which agent, chat window and
// terminal uses which key or sign-in, what censaiOS spent through each
// (an estimate unless the provider said) and what is left of the amount
// they typed in. Server side: server/routes/aiResources.js.
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { aiResourcesApi } from '../../../lib/aiResources/aiResourcesApi.js';
import { money } from '../../../lib/aiResources/format.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { KeysPanel } from './KeysPanel.jsx';
import { UsePanel } from './UsePanel.jsx';
import { CliPanel } from './CliPanel.jsx';

const TABS = [
  { id: 'keys', label: 'Keys and money' },
  { id: 'use', label: 'Who uses what' },
  { id: 'cli', label: 'Terminals and CLIs' },
];

export function AiResourcesWindow({ win = {}, initialData = null }) {
  const [tab, setTab] = React.useState('keys');
  const [data, setData] = React.useState(initialData);
  const [error, setError] = React.useState('');

  const load = React.useCallback(() => aiResourcesApi.load()
    .then((next) => { setData(next); setError(''); })
    .catch((err) => {
      setError(err.message);
      logToApp('warn', 'AI resources could not load', { detail: `status ${err.status || 'none'}` });
    }), []);
  React.useEffect(() => { if (!initialData) load(); }, [initialData, load]);

  const keys = data?.keys || [];
  const spent = keys.reduce((sum, k) => sum + (k.spentUsd || 0), 0);
  const subtitle = data ? `${keys.length} ${keys.length === 1 ? 'key' : 'keys'} · about ${money(spent)} spent in censaiOS` : 'loading';

  return (
    <>
      <WindowTitle icon={<Icon.Activity size={12} />} label={win.title || 'AI resources'} subtitle={subtitle} />
      <div className="hb-air">
        <nav className="hb-air-tabs" role="tablist" aria-label="AI resources">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
          <button type="button" className="hb-air-refresh" onClick={load} aria-label="Refresh"><Icon.Refresh size={12} /> Refresh</button>
        </nav>
        {error && <div role="alert" className="hb-air-alert">{error}</div>}
        {data && tab === 'keys' && <KeysPanel data={data} onChanged={load} />}
        {data && tab === 'use' && <UsePanel data={data} />}
        {data && tab === 'cli' && <CliPanel data={data} />}
      </div>
    </>
  );
}

export default AiResourcesWindow;
