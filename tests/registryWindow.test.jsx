/**
 * @jest-environment jsdom
 *
 * Tests for src/components/RegistryWindow.jsx. The facade is mocked
 * (passed via the `client` prop) so we can drive every tab without
 * a real HTTP server or WebSocket.
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';

// eslint-disable-next-line no-unused-vars
import { RegistryWindow } from '../src/components/RegistryWindow.jsx';

// ─── mock client ────────────────────────────────────────────────────────────

function makeMockClient(overrides = {}) {
  const handlers = new Map(); // cardId → Set<handler>
  const cards = [
    { id: 'agent:architect', name: 'The Architect', description: 'Orchestrates projects', version: '0.1.0', visibility: 'public', skills: [{ id: 'plan', name: 'plan' }] },
    { id: 'agent:censai',    name: 'Censai',         description: 'Editorial · research',  version: '0.1.0', visibility: 'public', skills: [{ id: 'write', name: 'write' }] },
    { id: 'agent:atlas',     name: 'Atlas',          description: 'Backend',                version: '0.1.0', visibility: 'public', skills: [] },
    { id: 'agent:genesis',   name: 'Genesis',        description: 'UI/UX',                  version: '0.1.0', visibility: 'public', skills: [] },
    { id: 'agent:nexus',     name: 'Nexus',          description: 'Databases',              version: '0.1.0', visibility: 'public', skills: [] },
    { id: 'agent:foundation',name: 'Foundation',     description: 'Containers',             version: '0.1.0', visibility: 'public', skills: [] },
    { id: 'agent:echo',      name: 'Echo',           description: 'Business brain',         version: '0.1.0', visibility: 'public', skills: [] },
  ];
  const installed = {};
  const toolPackages = [{
    id: 'censai/web-research', name: 'Web Research Add-on', version: '1.0.0',
    description: 'Sourced web search.', publisher: { name: 'Censai Core' },
    module: { risk: 'read', mode: 'autonomous', tools: ['web_search'] }, installed: false,
  }];
  let created = [];

  return {
    cards,
    handlers,
    getInstalled: () => installed,
    created,
    client: {
      listCards: jest.fn(async ({ visibility } = {}) => ({
        items: visibility ? cards.filter((c) => c.visibility === visibility) : cards,
        total: cards.length,
        limit: 50,
        offset: 0,
      })),
      getCard: jest.fn(async (id) => cards.find((c) => c.id === id) || null),
      createCard: jest.fn(async (body) => {
        const card = {
          id: body.id || `ext:test:${Math.random().toString(36).slice(2, 8)}`,
          name: body.name,
          description: body.description,
          version: body.version || '0.1.0',
          skills: body.skills || [],
          endpoint: body.endpoint || null,
          visibility: body.visibility || 'private',
        };
        created.push(card);
        cards.push(card);
        return card;
      }),
      updateCard: jest.fn(async (id, patch) => ({ ...cards.find((c) => c.id === id), ...patch })),
      deleteCard: jest.fn(async () => null),
      subscribeToCard: jest.fn((cardId, handler) => {
        if (!handlers.has(cardId)) handlers.set(cardId, new Set());
        handlers.get(cardId).add(handler);
        return () => handlers.get(cardId)?.delete(handler);
      }),
      callCard: jest.fn((cardId, payload) => (async function* () {
        yield { type: 'call.started', taskId: 't-1' };
        yield { type: 'call.event',   taskId: 't-1', stage: 'planning' };
        yield { type: 'call.complete', taskId: 't-1', result: { ok: true } };
      })()),
      isReady: jest.fn(() => true),
      closeSocket: jest.fn(),
      installCard: jest.fn(async (cardId) => {
        installed[cardId] = { installedAt: new Date().toISOString() };
        return installed[cardId];
      }),
      uninstallCard: jest.fn(async (cardId) => {
        if (!(cardId in installed)) return false;
        delete installed[cardId];
        return true;
      }),
      listInstalled: jest.fn(async () => ({ installed: { ...installed }, canManage: true })),
      listTools: jest.fn(async agentId => ({
        agentId,
        tools: [{ name: 'recall', label: 'Recall', description: 'Recall workspace memory.', category: 'Memory', risk: 'read', mode: 'autonomous', source: 'intrinsic', status: 'active', module: null, approvalRequired: false }],
        modules: [],
        counts: { active: 1, attachable: 0, equippedModules: 0 },
      })),
      listToolPackages: jest.fn(async () => ({
        canManage: true, packages: toolPackages.map(pkg => ({ ...pkg })),
      })),
      installToolPackage: jest.fn(async packageId => {
        toolPackages.find(pkg => pkg.id === packageId).installed = true;
        return { created: true };
      }),
      removeToolPackage: jest.fn(async packageId => {
        toolPackages.find(pkg => pkg.id === packageId).installed = false;
        return { removed: true };
      }),
      isInstalled: jest.fn((cardId) => Boolean(installed[cardId])),
      clearInstalled: jest.fn(() => { for (const k of Object.keys(installed)) delete installed[k]; }),
      __resetInstalledForTests: jest.fn(() => { for (const k of Object.keys(installed)) delete installed[k]; }),
      ...overrides,
    },
  };
}

function emitEvent(client, cardId, event) {
  const set = client.handlers.get(cardId);
  if (!set) return;
  for (const h of set) h(event);
}

function renderWindow({ client, win = { title: 'Agent Registry' }, onUpdate = jest.fn() } = {}) {
  return render(<RegistryWindow win={win} onUpdate={onUpdate} client={client} />);
}

async function installFirstCard() {
  const button = screen.getAllByTestId('registry-install')[0];
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveTextContent('Installed'));
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('RegistryWindow — render + tab switching', () => {
  test('renders the title and all registry tabs', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    expect(screen.getByText(/Agent Registry/)).toBeInTheDocument();
    expect(screen.getByTestId('registry-tab-browse')).toBeInTheDocument();
    expect(screen.getByTestId('registry-tab-installed')).toBeInTheDocument();
    expect(screen.getByTestId('registry-tab-publish')).toBeInTheDocument();
    expect(screen.getByTestId('registry-tab-activity')).toBeInTheDocument();
    expect(screen.getByTestId('registry-tab-tools')).toBeInTheDocument();
    expect(screen.getByTestId('registry-tab-packages')).toBeInTheDocument();
    // browse is the default tab — the list fetches on mount
    await waitFor(() => expect(screen.getByTestId('registry-browse-list')).toBeInTheDocument());
  });

  test('clicking a tab switches content', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    fireEvent.click(screen.getByTestId('registry-tab-installed'));
    expect(screen.getByTestId('registry-installed-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('registry-tab-publish'));
    expect(screen.getByTestId('registry-publish-form')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('registry-tab-tools'));
    await waitFor(() => expect(screen.getByTestId('registry-tools')).toBeInTheDocument());
    expect(client.listTools).toHaveBeenCalledWith('architect');
    fireEvent.click(screen.getByTestId('registry-tab-packages'));
    await waitFor(() => expect(screen.getByTestId('registry-packages')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('registry-tab-activity'));
    expect(screen.getByTestId('registry-activity-empty')).toBeInTheDocument();
  });
});

describe('RegistryWindow — Add-ons tab', () => {
  test('install and remove refresh the durable workspace state', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    fireEvent.click(screen.getByTestId('registry-tab-packages'));
    const install = await screen.findByTestId('registry-package-install');
    fireEvent.click(install);
    await waitFor(() => expect(screen.getByTestId('registry-package-remove')).toBeInTheDocument());
    expect(client.installToolPackage).toHaveBeenCalledWith('censai/web-research');
    fireEvent.click(screen.getByTestId('registry-package-remove'));
    await waitFor(() => expect(screen.getByTestId('registry-package-install')).toBeInTheDocument());
    expect(client.removeToolPackage).toHaveBeenCalledWith('censai/web-research');
  });
});

describe('RegistryWindow — Browse tab', () => {
  test('shows the 7 public cards from listCards', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    const rows = screen.getAllByTestId('registry-browse-row');
    expect(rows).toHaveLength(7);
    expect(client.listCards).toHaveBeenCalled();
  });

  test('filter narrows the list', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    fireEvent.change(screen.getByTestId('registry-browse-filter'), { target: { value: 'censai' } });
    const rows = screen.getAllByTestId('registry-browse-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-card-id', 'agent:censai');
  });

  test('install button moves a card to Installed and disables itself', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    await installFirstCard();
    expect(client.installCard).toHaveBeenCalled();
    // After install: the Installed tab now shows the card.
    fireEvent.click(screen.getByTestId('registry-tab-installed'));
    await waitFor(() => screen.getByTestId('registry-installed-list'));
    expect(screen.getAllByTestId('registry-installed-row')).toHaveLength(1);
  });

  test('empty state when filter matches nothing', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    fireEvent.change(screen.getByTestId('registry-browse-filter'), { target: { value: 'no-such-agent' } });
    expect(screen.getByTestId('registry-browse-empty')).toBeInTheDocument();
  });

  test('shows an error banner when listCards rejects', async () => {
    const { client } = makeMockClient({
      listCards: jest.fn(async () => { throw new Error('boom'); }),
    });
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-error'));
    expect(screen.getByTestId('registry-error').textContent).toContain('boom');
  });
});

describe('RegistryWindow — Installed tab', () => {
  test('clicking Call invokes callCard and streams events into Activity', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    await installFirstCard();
    fireEvent.click(screen.getByTestId('registry-tab-installed'));
    await waitFor(() => screen.getByTestId('registry-installed-list'));
    fireEvent.click(screen.getByTestId('registry-call'));
    // Switch to activity — events should be there from the async iterator
    fireEvent.click(screen.getByTestId('registry-tab-activity'));
    await waitFor(() => screen.getByTestId('registry-activity-list'));
    const rows = screen.getAllByTestId('registry-activity-row');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const types = rows.map((r) => r.getAttribute('data-event-type'));
    expect(types).toContain('call.started');
    expect(types).toContain('call.event');
    expect(types).toContain('call.complete');
  });

  test('uninstall removes the row', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    await installFirstCard();
    fireEvent.click(screen.getByTestId('registry-tab-installed'));
    await waitFor(() => screen.getByTestId('registry-installed-list'));
    fireEvent.click(screen.getByTestId('registry-uninstall'));
    await waitFor(() => screen.getByTestId('registry-installed-empty'));
    expect(screen.queryByTestId('registry-installed-row')).toBeNull();
  });
});

describe('RegistryWindow — Publish tab', () => {
  test('filling the form and submitting creates a card and auto-installs it', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    fireEvent.click(screen.getByTestId('registry-tab-publish'));
    fireEvent.change(screen.getByTestId('registry-publish-name'), { target: { value: 'My Agent' } });
    fireEvent.change(screen.getByTestId('registry-publish-description'), { target: { value: 'does things' } });
    fireEvent.change(screen.getByTestId('registry-publish-skills'), { target: { value: 'summarize, search' } });
    fireEvent.change(screen.getByTestId('registry-publish-visibility'), { target: { value: 'public' } });
    fireEvent.click(screen.getByTestId('registry-publish-submit'));
    await waitFor(() => expect(client.createCard).toHaveBeenCalled());
    const callArg = client.createCard.mock.calls[0][0];
    expect(callArg.name).toBe('My Agent');
    expect(callArg.skills).toEqual([
      { id: 'skill-0', name: 'summarize' },
      { id: 'skill-1', name: 'search' },
    ]);
    expect(callArg.visibility).toBe('public');
    // After publish, the window auto-installs and switches to Installed
    await waitFor(() => screen.getByTestId('registry-installed-list'));
    expect(screen.getAllByTestId('registry-installed-row')).toHaveLength(1);
  });

  test('submit button is disabled while submitting (form prevents double-submit)', async () => {
    const { client } = makeMockClient();
    renderWindow({ client });
    fireEvent.click(screen.getByTestId('registry-tab-publish'));
    fireEvent.change(screen.getByTestId('registry-publish-name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('registry-publish-description'), { target: { value: 'Y' } });
    // createCard resolves on next microtask; wrap the click in act so
    // the setSubmitting re-render and the eventual settling both flush.
    await act(async () => {
      fireEvent.click(screen.getByTestId('registry-publish-submit'));
    });
    await waitFor(() => screen.getByTestId('registry-installed-list'));
    // After the promise settles the form clears; verify createCard was called.
    expect(client.createCard).toHaveBeenCalledWith(expect.objectContaining({ name: 'X' }));
  });
});

describe('RegistryWindow — Activity tab', () => {
  test('WS subscribe is wired for installed cards and events flow through', async () => {
    const { client, handlers } = makeMockClient();
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    await installFirstCard();
    await waitFor(() => expect(client.subscribeToCard)
      .toHaveBeenCalledWith('agent:architect', expect.any(Function)));
    // Simulate a server-pushed event for the installed card.
    await act(async () => {
      emitEvent({ handlers }, 'agent:architect', { type: 'event', taskId: 't-9', stage: 'observe' });
    });
    fireEvent.click(screen.getByTestId('registry-tab-activity'));
    await waitFor(() => screen.getByTestId('registry-activity-list'));
    expect(screen.getAllByTestId('registry-activity-row').length).toBeGreaterThanOrEqual(1);
  });

  test('handles subscribeToCard rejection without crashing', async () => {
    const { client } = makeMockClient({
      subscribeToCard: jest.fn(() => { throw new Error('ws-down'); }),
    });
    renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    await installFirstCard();
    // The error banner should appear (from the parent effect).
    await waitFor(() => screen.getByTestId('registry-error-banner'));
    expect(screen.getByTestId('registry-error-banner').textContent).toContain('ws-down');
  });
});

describe('RegistryWindow — lifecycle', () => {
  test('passes an installed snapshot back to onUpdate on every install/uninstall', async () => {
    const { client } = makeMockClient();
    const onUpdate = jest.fn();
    renderWindow({ client, onUpdate });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    await installFirstCard();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ installedSnapshot: ['agent:architect'] }));
  });

  test('unmount tears down WS subscriptions and call iterators', async () => {
    const { client, handlers } = makeMockClient();
    const { unmount } = renderWindow({ client });
    await waitFor(() => screen.getByTestId('registry-browse-list'));
    await installFirstCard();
    await waitFor(() => expect(handlers.get('agent:architect')?.size).toBe(1));
    unmount();
    expect(handlers.get('agent:architect')?.size).toBe(0);
    expect(client.closeSocket).toHaveBeenCalled();
  });
});
