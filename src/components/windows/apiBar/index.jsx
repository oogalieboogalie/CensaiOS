/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// API Bar: one front door for censaiOS's APIs. A doorman takes one note
// shaped the same way every time ({ api_bar: { branch, action, paginate } }),
// passes it to the API behind that branch and carries the answer back,
// signed. Keys open only the branches you pick. The routes live in
// server/routes/apiBar.js.
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { apiBarApi } from '../../../lib/apiBar/apiBarApi.js';
import { NotePanel } from './NotePanel.jsx';
import { KeysPanel } from './KeysPanel.jsx';
import { LogPanel } from './LogPanel.jsx';
import { YorName } from '../../yorware/YorSecurity.jsx';

const TABS = [
  { id: 'note', label: 'Send a note' },
  { id: 'keys', label: 'Keys' },
  { id: 'log', label: 'Who knocked' },
];

export function ApiBarWindow({ win = {} }) {
  const [tab, setTab] = React.useState('note');
  const [menu, setMenu] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let live = true;
    apiBarApi.menu()
      .then((data) => { if (live) setMenu(data.branches || []); })
      .catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, []);

  return (
    <>
      <WindowTitle icon={<Icon.Plug size={12} />} label={win.title || 'API Bar'} subtitle="one door, one doorman">
        <YorName id="narsil" />
      </WindowTitle>
      <div className="hb-ab">
        <nav className="hb-ab-tabs" role="tablist" aria-label="API Bar">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {error && <div role="alert" className="hb-ab-alert">{error}</div>}
        {tab === 'note' && <NotePanel menu={menu} />}
        {tab === 'keys' && <KeysPanel menu={menu} />}
        {tab === 'log' && <LogPanel />}
      </div>
    </>
  );
}

export default ApiBarWindow;
