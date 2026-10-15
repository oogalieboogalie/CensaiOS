/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { loadRealEstateModules } from '../server/templates/realEstate/modules.js';
import { OutboxWindow } from '../src/components/OutboxWindow.jsx';
import { TemplateDialog } from '../src/components/templates/TemplateDialog.jsx';
import { ListingWriterWindow } from '../src/components/ListingWriterWindow.jsx';

// Run a module's markup and script against a stand-in Module SDK.
function runModule(mod, initial = {}) {
  const storage = { ...initial };
  const listeners = [];
  const tools = {};
  const sdk = {
    tools: { handle: (name, fn) => { tools[name] = fn; } },
    storage: {
      get: (key, fallback) => (key in storage ? JSON.parse(JSON.stringify(storage[key])) : fallback),
      set: jest.fn((key, value) => { storage[key] = value; return Promise.resolve(); }),
      onChange: (fn) => listeners.push(fn),
    },
    toast: jest.fn(),
    agent: { ask: jest.fn(async () => 'The comps support a range near the midpoint.') },
    presence: { list: () => [], onChange: () => {} },
    theme: { get: () => '', onChange: () => {} },
    resize: jest.fn(),
  };
  const scripts = [];
  document.body.innerHTML = mod.source.replace(/<script>([\s\S]*?)<\/script>/gi, (_, code) => { scripts.push(code); return ''; });
  const errors = [];
  for (const code of scripts) {
    try { new Function('censai', code)(sdk); } catch (error) { errors.push(error); }
  }
  return { sdk, storage, errors, tools, emit: (key, value) => listeners.forEach(fn => fn(key, value)) };
}

describe('template modules run', () => {
  let modules;
  beforeAll(async () => { modules = await loadRealEstateModules(); });

  test('deal pipeline seeds sample deals, shows deadlines and moves a deal', () => {
    const { errors, sdk, storage } = runModule(modules['deal-pipeline']);
    expect(errors).toEqual([]);
    expect(document.body.textContent).toMatch(/Rivera/);
    expect(document.body.textContent).toMatch(/Inspection period ends/);
    const offerButton = [...document.querySelectorAll('[data-stage]')].find(b => b.dataset.stage === 'Closed');
    fireEvent.click(offerButton);
    expect(sdk.storage.set).toHaveBeenCalledWith('deals', expect.any(Array));
    expect(storage.deals.find(d => d.id === 'alder').stage).toBe('Closed');
  });

  test('agents can drive the pipeline, the showings and the sign-in sheet through their tools', () => {
    const pipeline = runModule(modules['deal-pipeline']);
    expect(pipeline.tools.add_deal({ client: 'Patel', address: '5 Elm St', price: 300000 })).toEqual({ client: 'Patel', address: '5 Elm St', stage: 'Lead' });
    expect(pipeline.tools.move_deal({ deal: 'patel', stage: 'Offer' }).stage).toBe('Offer');
    expect(pipeline.storage.deals.find(d => d.client === 'Patel').stage).toBe('Offer');
    expect(() => pipeline.tools.move_deal({ deal: 'nobody', stage: 'Offer' })).toThrow(/No deal matches/);
    expect(pipeline.tools.list_deals().find(d => d.client === 'Rivera').nextDeadline).toBeTruthy();

    const schedule = runModule(modules['showing-schedule']);
    expect(schedule.tools.add_showing({ address: '5 Elm St', client: 'Patel', day: '2099-01-02', time: '09:30' }).status).toBe('requested');
    expect(schedule.tools.set_showing_status({ address: '5 elm', status: 'confirmed' }).status).toBe('confirmed');
    expect(schedule.tools.list_showings().some(s => s.address === '5 Elm St' && s.status === 'confirmed')).toBe(true);
    expect(() => schedule.tools.add_showing({ address: 'x', day: 'tomorrow', time: '9' })).toThrow(/YYYY-MM-DD/);

    const signIn = runModule(modules['open-house-sign-in'], { visitors: [{ name: 'Ada', agent: 'no', timeline: '0-3 months', at: new Date().toISOString() }] });
    expect(signIn.tools.list_visitors()).toEqual([expect.objectContaining({ name: 'Ada', followUpFirst: true, hasAgent: false })]);
  });

  test('showing schedule, open house and commission render without errors', () => {
    for (const id of ['showing-schedule', 'open-house-sign-in', 'commission-calculator']) {
      const { errors } = runModule(modules[id], id === 'open-house-sign-in' ? { property: '14 Alder Way' } : {});
      expect(errors).toEqual([]);
    }
  });

  test('commission calculator works the splits in order', () => {
    runModule(modules['commission-calculator'], { inputs: { price: '500000', rate: '6', side: 'list', listShare: '50', broker: '20', fees: '500', team: '10', referral: '0' } });
    // 500k * 6% = 30,000; list side 15,000; brokerage 20% = 3,000; fees 500; team 10% of 11,500 = 1,150; net 10,350.
    expect(document.getElementById('net').textContent.replace(/[^0-9]/g, '')).toBe('10350');
  });

  test('CMA sheet prices from pasted comps and asks the analyst for a summary', async () => {
    const { errors, sdk, storage } = runModule(modules['cma-sheet'], { comps: [] });
    expect(errors).toEqual([]);
    document.getElementById('paste').value = 'address\tprice\tsqft\n1 Elm St\t400000\t2000\t3\t2\t2026-09-01\n2 Oak St,"500,000",2000,3,2,2026-08-01';
    fireEvent.click(document.getElementById('add'));
    expect(storage.comps.map(c => c.price)).toEqual([400000, 500000]);
    expect(document.getElementById('range').textContent).toMatch(/\$/);
    fireEvent.click(document.getElementById('summary'));
    await waitFor(() => expect(storage.notes).toMatch(/midpoint/));
    expect(sdk.agent.ask.mock.calls[0][0]).toMatch(/Market Analyst/);
  });
});

describe('Outbox', () => {
  const DRAFT = { id: 'd1', status: 'pending', channel: 'email', to: 'Dana', address: 'dana@example.com', subject: 'Thanks', body: 'Hi Dana, thanks for visiting.', agentName: 'Follow-up Assistant' };

  test('approving marks the draft approved and opens it in the person\'s mail app', () => {
    const onUpdate = jest.fn();
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    render(<OutboxWindow win={{ drafts: [DRAFT] }} onUpdate={onUpdate} />);
    expect(screen.getByText(/Nothing reaches a client until someone here approves it/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }));
    expect(onUpdate.mock.calls[0][0].drafts[0]).toMatchObject({ status: 'approved', approvedAt: expect.any(String) });
    expect(open.mock.calls[0][0]).toMatch(/^mailto:dana@example\.com\?subject=Thanks/);
    open.mockRestore();
  });

  test('a draft with a fair-housing problem can\'t be approved until it is rewritten', () => {
    const onUpdate = jest.fn();
    render(<OutboxWindow win={{ drafts: [{ ...DRAFT, body: 'This one is perfect for a young couple.' }] }} onUpdate={onUpdate} />);
    expect(screen.getByRole('button', { name: 'Approve and send' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'This one has a big backyard.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate.mock.calls[0][0].drafts[0]).toMatchObject({ body: 'This one has a big backyard.', status: 'pending' });
  });
});

describe('Template dialog', () => {
  const TEMPLATE = { id: 'real-estate-team', name: 'Real Estate Team', description: 'Listings and deals.', groups: ['Listings', 'Active Deals', 'Marketing', 'Team Chat'], agents: ['Listing Writer'], modules: ['Deal pipeline'] };

  test('shows the groups on F1 to F4 and creates the board on the chosen model', async () => {
    const apply = jest.fn(async () => ({}));
    const onClose = jest.fn();
    render(<TemplateDialog open onClose={onClose} apply={apply} loadTemplates={async () => [TEMPLATE]} />);
    await screen.findByText('Real Estate Team');
    expect(screen.getByText('F4')).toBeTruthy();
    fireEvent.click(screen.getByText('Your own Ollama server'));
    fireEvent.change(screen.getByLabelText('Ollama model'), { target: { value: 'qwen2.5' } });
    fireEvent.click(screen.getByTestId('template-create'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apply).toHaveBeenCalledWith('real-estate-team', { models: 'ollama', ollamaModel: 'qwen2.5' });
  });
});

describe('Listing Writer window', () => {
  test('writes the listing, keeps the agent\'s original and highlights fair-housing words', async () => {
    const onUpdate = jest.fn();
    const request = jest.fn(async () => ({
      listing: { address: '14 Alder Way' },
      draft: { description: 'Great for families.', social: 'Just listed', emailSubject: 'New', emailBody: 'Come see it' },
      check: { ok: true, flags: { description: [], social: [], email: [] } },
      docText: '# 14 Alder Way',
    }));
    const win = { id: 'lw', agentId: 'lw-1', listing: { address: '14 Alder Way', features: 'Adults only building' } };
    const { rerender } = render(<ListingWriterWindow win={win} onUpdate={onUpdate} request={request} />);
    expect(screen.getByText(/Excludes families with children/)).toBeTruthy(); // live check on the form
    fireEvent.click(screen.getByTestId('listing-write'));
    await waitFor(() => expect(request).toHaveBeenCalled());
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ agentDraft: expect.any(Object) })));
    const saved = onUpdate.mock.calls.find(([patch]) => patch.agentDraft)[0];
    rerender(<ListingWriterWindow win={{ ...win, ...saved }} onUpdate={onUpdate} request={request} />);
    expect(screen.getByTestId('listing-original').textContent).toMatch(/1 fair-housing flag/);
    expect(document.querySelector('mark.re-mark.risk').textContent).toBe('Great for families');
  });
});
