/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Terminals and CLIs: each coding CLI on this computer, how it is signed in
// and to which account (owner only), what its runs reported, and the
// terminal windows open on this board.
import React from 'react';
import { useWorkspaceStore } from '../../../lib/store.js';
import { cliVia, terminalRows } from '../../../lib/aiResources/boardUse.js';
import { money, tokens, when } from '../../../lib/aiResources/format.js';

function accountText(cli) {
  if (cli.account) return cli.account;
  if (cli.accountHidden) return 'account shown to the computer\'s owner only';
  if (cli.accountWithToken) return 'signed in, account not shown (it is kept only with the sign-in, which censaiOS never opens)';
  return cli.signedInVia === 'cli-login' ? 'account name not shown by this CLI' : null;
}

export function CliPanel({ data }) {
  const wins = useWorkspaceStore((s) => s.wins);
  const terms = terminalRows(wins, data);
  return (
    <div className="hb-air-panel">
      <section className="hb-air-section">
        <h3 className="hb-air-label">Coding CLIs on this computer</h3>
        <table className="hb-air-table">
          <thead><tr><th>CLI</th><th>Signed in with</th><th>Account</th><th>Runs</th><th>It reported</th></tr></thead>
          <tbody>
            {(data.clis || []).map((cli) => (
              <tr key={cli.id} data-off={!cli.installed ? 'true' : undefined}>
                <td><strong>{cli.label}</strong>{!cli.installed && <span className="hb-air-quiet"> (not installed)</span>}{cli.running > 0 && <span className="hb-air-tag">running</span>}</td>
                <td>{cli.signedIn ? cliVia(cli.signedInVia) : 'not signed in'}</td>
                <td>{accountText(cli) || '—'}</td>
                <td>{cli.spend.runs}{cli.spend.lastAt ? <span className="hb-air-quiet"> · last {when(cli.spend.lastAt)}</span> : null}</td>
                <td>{cli.spend.costUsd > 0 ? money(cli.spend.costUsd) : cli.spend.tokensIn ? `${tokens(cli.spend.tokensIn)} in` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hb-air-note">
          &quot;It reported&quot; is the CLI&apos;s own count from Agent Console runs. On a monthly plan (Claude Pro or Max, SuperGrok)
          that number is what the work would cost on an API key, not a bill. Sign-in tokens are never read or shown.
        </p>
      </section>
      <section className="hb-air-section">
        <h3 className="hb-air-label">Terminal windows on this board</h3>
        {!terms.length && <p className="hb-air-quiet">No terminal windows open on this board.</p>}
        <ul className="hb-air-list">
          {terms.map((t) => (
            <li key={t.windowId} className="hb-air-item">
              <span className="hb-air-item-main"><strong>{t.title}</strong>
                <span className="hb-air-quiet">{t.plain ? 'Plain terminal: whatever you sign in to inside it' : `${t.cli} · ${t.via}${t.account ? ` · ${t.account}` : ''}`}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
