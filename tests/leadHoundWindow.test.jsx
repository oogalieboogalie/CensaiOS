/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LeadHoundWindow } from '../src/components/LeadHoundWindow.jsx';

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

    expect(await screen.findByText('Front desk is overwhelmed.')).toBeInTheDocument();
    const runCall = global.fetch.mock.calls.find(([u]) => u.startsWith('/api/leadhound/run'));
    expect(JSON.parse(runCall[1].body)).toMatchObject({ business: 'AI receptionists', market: 'dental practices', maxLeads: 3 });
    expect(onUpdate).toHaveBeenCalledWith({ leadHound: expect.objectContaining({ result: HUNT }) });

    for (let d = 1; d <= 7; d += 1) expect(screen.getByText(`Day ${d}`)).toBeInTheDocument();
    expect(screen.getByText('hello@brightsmiles.example', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Also found (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ice breaker' }));
    expect(screen.getByText('3 missed-call fixes')).toBeInTheDocument();
    expect(screen.getByText('Fix 1: answer after hours.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save to Lead Queue' }));
    expect(await screen.findByText('Saved to your Lead Queue.')).toBeInTheDocument();
  });

  test('restores the last hunt from window state', async () => {
    mockFetch();
    render(<LeadHoundWindow win={{ leadHound: { brief: HUNT.brief, result: HUNT } }} onUpdate={jest.fn()} />);
    expect(screen.getByText('Busy 2–6 chair practices')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New hunt' }));
    expect(await screen.findByDisplayValue('dental practices')).toBeInTheDocument();
  });
});
