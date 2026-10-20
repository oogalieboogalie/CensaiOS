/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LeadHoundWindow } from '../src/components/LeadHoundWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import { leadToMarkdown } from '../src/components/leadhound/exportLead.js';

const HUNT = {
  ok: true,
  brief: { business: 'AI receptionists', market: 'dental practices' },
  idealProfile: 'Busy 2–6 chair practices',
  usage: { searches: 3, extracts: 1, llmCalls: 3 },
  warnings: [],
  candidates: [
    { company: 'Bright Smiles Dental', url: 'https://brightsmiles.example', host: 'brightsmiles.example', fitScore: 92 },
    { company: 'Hill Country Dental', url: 'https://hillcountry.example', host: 'hillcountry.example', fitScore: 40 },
  ],
  leads: [{
    company: 'Bright Smiles Dental', url: 'https://brightsmiles.example', host: 'brightsmiles.example', fitScore: 92,
    why_fit: 'Front desk is overwhelmed.', angle: 'Missed after-hours calls', decision_maker: 'Practice manager',
    contacts: { emails: ['hello@brightsmiles.example'], phones: [] },
    sequence: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, channel: 'email', subject: `Touch ${i + 1}`, body: `Body ${i + 1}` })),
    iceBreaker: { title: '3 missed-call fixes', format: '1-page audit', opening_line: 'Noticed your phones.', deliverable: 'Fix 1: answer after hours.', cta: '15 minutes?' },
  }],
};

function mockFetch({ configured = true } = {}) {
  global.fetch = jest.fn(async (url, opts = {}) => {
    if (url.startsWith('/api/leadhound/status')) return { ok: true, json: async () => ({ tavily: { configured, source: configured ? 'byok' : null } }) };
    if (url.startsWith('/api/leadhound/run')) return { ok: true, json: async () => HUNT };
    if (url.startsWith('/api/leadhound/save')) return { ok: true, json: async () => ({ ok: true, id: 1, deduped: false }) };
    if (url === '/api/keys' && opts.method === 'POST') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: false, json: async () => ({ error: 'unexpected' }) };
  });
}

describe('LeadHoundWindow', () => {
  // Render and let the key-status check settle inside act.
  const renderSettled = async (ui) => {
    let out;
    await act(async () => { out = render(ui); });
    return out;
  };

  test('asks for a Tavily key when none is configured and saves it to the vault', async () => {
    mockFetch({ configured: false });
    render(<LeadHoundWindow win={{}} onUpdate={jest.fn()} />);
    const input = await screen.findByLabelText('Tavily API key');
    fireEvent.change(input, { target: { value: 'tvly-abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/keys', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(global.fetch.mock.calls.find(([u]) => u === '/api/keys')[1].body);
    expect(body).toEqual({ provider: 'tavily', apiKey: 'tvly-abc' });
  });

  test('runs a hunt from the brief and shows the sequence, ice breaker and save action', async () => {
    mockFetch();
    const onUpdate = jest.fn();
    render(<LeadHoundWindow win={{}} onUpdate={onUpdate} />);

    const find = screen.getByRole('button', { name: 'Find leads' });
    expect(find.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/AI receptionists/), { target: { value: 'AI receptionists' } });
    fireEvent.change(screen.getByPlaceholderText(/Independent dental/), { target: { value: 'dental practices' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find leads' }));

    expect(await screen.findByText('Busy 2–6 chair practices')).toBeInTheDocument();
    expect(screen.getAllByText('Front desk is overwhelmed.')).toHaveLength(2);
    const runCall = global.fetch.mock.calls.find(([u]) => u.startsWith('/api/leadhound/run'));
    expect(JSON.parse(runCall[1].body)).toMatchObject({ business: 'AI receptionists', market: 'dental practices', maxLeads: 3 });
    expect(onUpdate).toHaveBeenCalledWith({ leadHound: expect.objectContaining({ result: HUNT }) });

    for (let d = 1; d <= 7; d += 1) expect(screen.getByText(`Day ${d}`)).toBeInTheDocument();
    expect(screen.getByText('hello@brightsmiles.example', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Also found (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ice breaker' }));
    expect(screen.getByDisplayValue('3 missed-call fixes')).toBeInTheDocument();
    expect(screen.getByText('Fix 1: answer after hours.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save to Lead Queue' }));
    expect(await screen.findByText('Saved to your Lead Queue with its drafts.')).toBeInTheDocument();
  });

  test('shows what each step found while the hunt streams in', async () => {
    const lines = [
      { type: 'step', step: 'plan' },
      { type: 'step', step: 'search', queries: ['dentists Austin', 'dental office hiring'] },
      { type: 'step', step: 'score', found: 9 },
    ];
    let release;
    const gate = new Promise((r) => { release = r; });
    const enc = new TextEncoder();
    global.fetch = jest.fn(async (url) => {
      if (url.startsWith('/api/leadhound/status')) return { ok: true, json: async () => ({ tavily: { configured: true } }) };
      const chunks = [enc.encode(lines.map((l) => JSON.stringify(l)).join('\n') + '\n')];
      return {
        ok: true,
        headers: { get: () => 'application/x-ndjson' },
        body: {
          getReader: () => ({
            read: async () => {
              if (chunks.length) return { value: chunks.shift(), done: false };
              await gate;
              if (!chunks.done) {
                chunks.done = true;
                return { value: enc.encode(`${JSON.stringify({ type: 'result', ...HUNT })}\n`), done: false };
              }
              return { value: undefined, done: true };
            },
          }),
        },
      };
    });
    render(<LeadHoundWindow win={{}} onUpdate={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/AI receptionists/), { target: { value: 'AI receptionists' } });
    fireEvent.change(screen.getByPlaceholderText(/Independent dental/), { target: { value: 'dental practices' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find leads' }));

    expect(await screen.findByText('dental office hiring')).toBeInTheDocument();
    expect(screen.getByText(/9 sites came back/)).toBeInTheDocument();
    expect(screen.getByText('Hunting for dental practices')).toBeInTheDocument();
    const runCall = global.fetch.mock.calls.find(([u]) => u.startsWith('/api/leadhound/run'));
    expect(runCall[1].headers.Accept).toBe('application/x-ndjson');

    release();
    expect(await screen.findByText('Busy 2–6 chair practices')).toBeInTheDocument();
  });

  test('drafts are editable and the edits save to window state', async () => {
    mockFetch();
    const onUpdate = jest.fn();
    await renderSettled(<LeadHoundWindow win={{ leadHound: { brief: HUNT.brief, result: HUNT } }} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('Day 3 message'), { target: { value: 'Rewritten day three' } });
    expect(screen.getByLabelText('Day 3 message').value).toBe('Rewritten day three');
    const saved = onUpdate.mock.calls.at(-1)[0].leadHound.result;
    expect(saved.leads[0].sequence[2].body).toBe('Rewritten day three');
    expect(saved.leads[0].sequence[1].body).toBe('Body 2');

    fireEvent.click(screen.getByRole('button', { name: 'Ice breaker' }));
    fireEvent.change(screen.getByLabelText('Ask'), { target: { value: '10 minutes Friday?' } });
    expect(onUpdate.mock.calls.at(-1)[0].leadHound.result.leads[0].iceBreaker.cta).toBe('10 minutes Friday?');
  });

  test('a teammate\'s hunt arriving through window state replaces the view', async () => {
    mockFetch();
    const { rerender } = await renderSettled(<LeadHoundWindow win={{}} onUpdate={jest.fn()} />);
    expect(screen.getByText('Who should you be talking to?')).toBeInTheDocument();
    rerender(<LeadHoundWindow win={{ leadHound: { brief: HUNT.brief, result: HUNT } }} onUpdate={jest.fn()} />);
    expect(await screen.findByText('Busy 2–6 chair practices')).toBeInTheDocument();
  });

  test('opens the outreach as a Document window next to LeadHound', async () => {
    mockFetch();
    const spawnAt = jest.fn();
    const original = useWorkspaceStore.getState().spawnAt;
    useWorkspaceStore.setState({ spawnAt });
    try {
      await renderSettled(<LeadHoundWindow win={{ x: 100, y: 50, width: 820, leadHound: { brief: HUNT.brief, result: HUNT } }} onUpdate={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open as doc' }));
      expect(spawnAt).toHaveBeenCalledWith('doc', {
        title: 'Bright Smiles Dental outreach',
        fileName: 'bright-smiles-dental-outreach.md',
        text: leadToMarkdown(HUNT.leads[0], HUNT.brief),
      }, { x: 944, y: 50 }, { w: 640, h: 560 });
      const md = spawnAt.mock.calls[0][1].text;
      expect(md).toContain('### Day 7 · Email: Touch 7');
      expect(md).toContain('## Ice breaker: 3 missed-call fixes (1-page audit)');
      expect(md).toContain('**Ask:** 15 minutes?');
    } finally {
      cleanup();
      useWorkspaceStore.setState({ spawnAt: original });
    }
  });

  test('restores the last hunt from window state', async () => {
    mockFetch();
    render(<LeadHoundWindow win={{ leadHound: { brief: HUNT.brief, result: HUNT } }} onUpdate={jest.fn()} />);
    expect(screen.getByText('Busy 2–6 chair practices')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New hunt' }));
    expect(await screen.findByDisplayValue('dental practices')).toBeInTheDocument();
  });
  test('a rejected key brings the key field back with a plain message', async () => {
    mockFetch();
    const base = global.fetch;
    global.fetch = jest.fn(async (url, opts) => (url.startsWith('/api/leadhound/run')
      ? { ok: false, json: async () => ({ error: 'Tavily did not accept that API key. Paste a fresh key from app.tavily.com and try again.', code: 'TAVILY_KEY_INVALID' }) }
      : base(url, opts)));
    await renderSettled(<LeadHoundWindow win={{ leadHound: { brief: { business: 'AI receptionists', market: 'dental practices' } } }} onUpdate={jest.fn()} />);
    expect(screen.queryByLabelText('Tavily API key')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Find leads' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not accept that API key');
    expect(screen.getByLabelText('Tavily API key')).toBeInTheDocument();
    expect(screen.getByText(/replaces the one in your key vault/)).toBeInTheDocument();
  });

  test('a saved key can be changed from the brief', async () => {
    mockFetch();
    await renderSettled(<LeadHoundWindow win={{}} onUpdate={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Tavily key' }));
    expect(screen.getByLabelText('Tavily API key')).toBeInTheDocument();
  });

  test('shows the hunt when another agent asked LeadHound for leads', async () => {
    mockFetch();
    await renderSettled(<LeadHoundWindow win={{ leadHound: { brief: { business: 'POS', market: 'coffee roasters' }, result: null, hunting: true, huntingSince: Date.now() } }} onUpdate={jest.fn()} />);
    expect(screen.getByText('Hunting for coffee roasters')).toBeInTheDocument();
    expect(screen.getByText(/Another agent on the board asked/)).toBeInTheDocument();
  });
});
