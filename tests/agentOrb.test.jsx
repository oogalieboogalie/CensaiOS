/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { brandFor } from '../src/lib/brands/index.js';
import { agentForTab, oneSentence } from '../src/components/terminal/agentTab.js';
import { TerminalTabBar } from '../src/components/terminal/TerminalTabBar.jsx';

afterEach(cleanup);

test('names the tool that is actually in the tab', () => {
  const prompted = agentForTab(
    { launchCli: 'grok', agentRun: { prompt: 'Fix the header spacing. Then stop.' } },
    { id: 'main' },
  );
  expect(prompted.name).toBe('OpenCode');
  expect(prompted.status).toBe('busy');
  expect(prompted.detail).toBe('Fix the header spacing.');
  expect(prompted.mark.key).toBe('opencode');
  expect(prompted.you).toBe(false);

  const grok = agentForTab({ launchCli: 'grok' }, { id: 'main' });
  expect(grok.name).toBe('Grok');
  expect(grok.status).toBe('idle');
  expect(grok.detail).toBe('Idle');
  expect(grok.mark.key).toBe('xai');
  expect(grok.mark.path.length).toBeGreaterThan(20);

  const claude = agentForTab({ launchCli: 'claudecode' }, { id: 'main' });
  expect(claude.mark.path).toBe(brandFor('claude').path);

  const side = agentForTab({ launchCli: 'grok' }, { id: 'other' });
  expect(side.name).toBe('You');
  expect(side.you).toBe(true);
  expect(side.mark).toBeNull();
  expect(side.detail).toBe('No agent');

  const parked = agentForTab({}, { id: 'side', cli: 'opencode', live: false });
  expect(parked.live).toBe(false);
  expect(parked.status).toBeNull();
  expect(parked.name).toBe('OpenCode');
  expect(parked.detail).toBe('Not started');

  expect(oneSentence('one two three four', 8)).toBe('one two...');
});

test('workbench draws one round button per tab, with a real mark', () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const tabs = [
    { id: 'main' },
    { id: 'other', cli: 'codex' },
    { id: 'parked', cli: 'opencode', live: false },
  ];
  render(
    <TerminalTabBar
      win={{ terminalView: 'workbench', launchCli: 'grok' }}
      tabs={tabs}
      activeId="main"
      onSelect={onSelect}
      onClose={onClose}
      onAdd={() => {}}
      theme={{}}
    />,
  );

  const grok = screen.getByRole('tab', { name: /Grok/ });
  const codex = screen.getByRole('tab', { name: /Codex/ });
  const parked = screen.getByRole('tab', { name: /Not started/ });
  expect(grok.getAttribute('aria-selected')).toBe('true');
  expect(grok.querySelector('[data-brand-monogram]')).toBeNull();
  expect(grok.querySelector('path')).toBeTruthy();
  expect(grok.querySelector('text')).toBeNull();
  expect(grok.querySelector('[data-status="idle"]')).toBeTruthy();
  expect(codex.querySelector('text')).toBeNull();
  expect(codex.querySelector('path')).toBeTruthy();
  expect(parked.getAttribute('data-live')).toBe('false');
  expect(parked.querySelector('[data-status]')).toBeNull();

  fireEvent.click(codex);
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith('other');
  fireEvent(codex, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
  expect(onClose).toHaveBeenCalledWith('other');

  fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Tab', ctrlKey: true });
  expect(onSelect).toHaveBeenNthCalledWith(2, 'other');
});

test('a plain terminal keeps the old tab strip, including a single shell', () => {
  const { container, rerender } = render(
    <TerminalTabBar
      win={{ launchCli: 'grok' }}
      tabs={[{ id: 'main' }, { id: 'other' }]}
      activeId="main"
      onSelect={() => {}}
      onClose={() => {}}
      onAdd={() => {}}
      theme={{}}
    />,
  );
  expect(container.querySelector('.terminal-tab')).toBeTruthy();
  expect(container.querySelector('.hb-orb')).toBeNull();

  rerender(
    <TerminalTabBar
      win={{}}
      tabs={[{ id: 'main' }]}
      activeId="main"
      onSelect={() => {}}
      onClose={() => {}}
      onAdd={() => {}}
      theme={{}}
    />,
  );
  expect(container.querySelector('[role="tab"]')).toBeNull();

  rerender(
    <TerminalTabBar
      win={{ terminalView: 'workbench' }}
      tabs={[{ id: 'main' }]}
      activeId="main"
      onSelect={() => {}}
      onClose={() => {}}
      onAdd={() => {}}
      theme={{}}
    />,
  );
  const you = screen.getByRole('tab', { name: /You/ });
  expect(you.querySelector('[data-mark="you"]')).toBeTruthy();
  expect(you.querySelector('[data-brand-monogram]')).toBeNull();
  expect(you.querySelector('[data-status="idle"]')).toBeTruthy();
});
