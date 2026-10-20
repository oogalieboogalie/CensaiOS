import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatRows, terminalRows, routeLabel } from '../src/lib/aiResources/boardUse.js';
import { money, tokens, usedShare } from '../src/lib/aiResources/format.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { KeysPanel } from '../src/components/windows/aiResources/KeysPanel.jsx';
import { UsePanel } from '../src/components/windows/aiResources/UsePanel.jsx';
import { CliPanel } from '../src/components/windows/aiResources/CliPanel.jsx';
import { WINDOW_MANIFEST_BY_KIND } from '../src/lib/windowManifest.js';

const DATA = {
  since: '2026-10-20T00:00:00Z',
  owner: true,
  keys: [{
    keyId: 'anthropic:abc', provider: 'anthropic', providerLabel: 'Anthropic (Claude)', masked: '••••1234', source: 'vault', mine: true,
    calls: 3, tokensIn: 12000, tokensOut: 3000, unpriced: 0, spentUsd: 0.75, budgetUsd: 20, leftUsd: 19.25, providerReading: null,
    canAskProvider: false, lastAt: '2026-10-20T01:00:00Z',
    users: [{ kind: 'window', ref: 'w1', agentName: 'Atlas', who: 'Pat Example', calls: 3, unpriced: 0, costUsd: 0.75, model: 'claude-opus-5-5' }],
  }],
  agents: [{ id: 'atlas', name: 'Atlas', provider: 'anthropic', model: 'claude-opus-5-5', route: 'vault', keyId: 'anthropic:abc' }],
  clis: [{ id: 'claudecode', label: 'Claude Code', installed: true, signedIn: true, signedInVia: 'cli-login', account: 'pat@example.com', running: 0, spend: { runs: 2, costUsd: 1.5, tokensIn: 0, lastAt: 0 } }],
  sharing: { available: true, canManage: true, sharedWith: [] },
};
const WINS = [
  { id: 'w1', kind: 'chat', agentId: 'atlas', title: 'Atlas chat' },
  { id: 't1', kind: 'terminal', launchCli: 'claudecode' },
  { id: 't2', kind: 'terminal' },
];

describe('AI resources on the board', () => {
  test('a chat window shows its agent, the key that pays and what it spent', () => {
    const [row] = chatRows(WINS, DATA);
    expect(row).toMatchObject({ title: 'Atlas chat', route: 'vault', masked: '••••1234', calls: 3, costUsd: 0.75 });
    expect(routeLabel('missing')).toMatch(/add one in Settings/);
  });

  test('terminals say which CLI and sign-in they run on', () => {
    const rows = terminalRows(WINS, DATA);
    expect(rows[0]).toMatchObject({ cli: 'Claude Code', via: 'its own sign-in', account: 'pat@example.com' });
    expect(rows[1].plain).toBe(true);
  });

  test('numbers read in plain words', () => {
    expect(money(0.004)).toBe('<$0.01');
    expect(money(12.5)).toBe('$12.50');
    expect(tokens(12300)).toBe('12.3k');
    expect(usedShare({ budgetUsd: 20, leftUsd: 15 })).toBeCloseTo(0.25);
    expect(usedShare({ budgetUsd: null })).toBeNull();
  });

  test('the panels draw the key masked, the estimate note, the chat and the CLI account', () => {
    useWorkspaceStore.setState({ wins: WINS });
    const keys = renderToStaticMarkup(<KeysPanel data={DATA} onChanged={() => {}} />);
    expect(keys).toContain('••••1234');
    expect(keys).toContain('About $19.25 left');
    expect(keys).toContain('Atlas chat');
    expect(keys).toMatch(/list prices/);
    expect(renderToStaticMarkup(<UsePanel data={DATA} />)).toContain('your key ••••1234');
    expect(renderToStaticMarkup(<CliPanel data={DATA} />)).toContain('pat@example.com');
  });

  test('the window is registered once, sized by the manifest', () => {
    expect(WINDOW_MANIFEST_BY_KIND.aiResources).toMatchObject({ componentName: 'AiResourcesWindow', defaultSize: { w: 920, h: 660 } });
  });
});
