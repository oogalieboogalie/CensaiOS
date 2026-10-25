/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import fs from 'node:fs';

// Saved leads keep LeadHound's drafts, and the same company saved twice
// (even with no email or phone) is one line in the Lead Queue.

const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query }, createDbPool: () => ({ query }) }));

const { saveLead, normalizeLeadInput } = await import('../server/salesLeads/store.js');
const { cleanSequence, cleanIceBreaker, siteKey, SITE_KEY_SQL } = await import('../server/salesLeads/outreach.js');
const { __test__ } = await import('../server/salesLeads/schema.js');
const { SavedOutreach } = await import('../src/components/leads/SavedOutreach.jsx');

const scope = { workspaceId: 'ws-1', userId: 7 };
const sequence = [3, 1, 2, 9, 1].map((day) => ({ day, channel: 'EMAIL', subject: `Day ${day}`, body: `Hi Jordan ${day}` }));
const ice = { title: 'Free roof checklist', format: 'PDF', deliverable: 'Ten checks', cta: 'Want it?', extra: 'x' };

beforeEach(() => query.mockReset());

describe('drafts saved with a lead', () => {
  test('the sequence keeps days 1 to 7 once each, in order; the ice breaker keeps its parts', () => {
    expect(cleanSequence(sequence).map((d) => d.day)).toEqual([1, 2, 3]);
    expect(cleanSequence(sequence)[0]).toEqual({ day: 1, channel: 'email', subject: 'Day 1', body: 'Hi Jordan 1' });
    expect(cleanSequence('nope')).toEqual([]);
    expect(cleanIceBreaker(ice)).toEqual({ title: 'Free roof checklist', format: 'PDF', opening_line: '', deliverable: 'Ten checks', cta: 'Want it?' });
    expect(cleanIceBreaker({ cta: 'only' })).toBeNull();
    expect(normalizeLeadInput({ name: 'Pat Roofing', outreach_sequence: sequence, ice_breaker: ice }).outreach_sequence).toHaveLength(3);
  });

  test('a new lead is saved with its drafts', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] });
    await saveLead({ name: 'Pat Roofing', website: 'https://www.patroofing.example/services', outreach_sequence: sequence, ice_breaker: ice }, scope);
    const [lookupSql, lookup] = query.mock.calls[0];
    expect(lookupSql).toContain(SITE_KEY_SQL);
    expect(lookup).toEqual(['ws-1', null, null, 'patroofing.example', 'Pat Roofing']);
    const [insertSql, insert] = query.mock.calls[1];
    expect(insertSql).toContain('outreach_sequence, ice_breaker');
    expect(JSON.parse(insert[17])).toHaveLength(3);
    expect(JSON.parse(insert[18]).title).toBe('Free roof checklist');
  });

  test('saving the same site again updates the one line and keeps drafts it was not given', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] }).mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] });
    const res = await saveLead({ name: 'Pat Roofing', website: 'patroofing.example/' }, scope);
    expect(res).toEqual({ id: 'lead-1', deduped: true });
    const [updateSql, update] = query.mock.calls[1];
    expect(updateSql).toMatch(/CASE WHEN jsonb_array_length\(\$11::jsonb\) > 0 THEN \$11::jsonb ELSE outreach_sequence END/);
    expect(updateSql).toContain('ice_breaker = COALESCE($12::jsonb, ice_breaker)');
    expect(updateSql).toContain('email = COALESCE(email, $5)');
    expect(update[10]).toBe('[]');
    expect(update[11]).toBeNull();
  });

  test('two people on one brokerage site stay apart unless names agree or neither has contacts', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'x' }] });
    await saveLead({ name: 'Mo Smith', website: 'https://kw.example/agents/mo', phone: '555-0101' }, scope);
    expect(query.mock.calls[0][0]).toMatch(/lower\(name\) = lower\(\$5\) OR \(email IS NULL AND phone IS NULL AND \$2 IS NULL AND \$3 IS NULL\)/);
  });

  test('the website key is the host without www; the database uses the same rule', () => {
    expect(siteKey('HTTPS://WWW.PatRoofing.example:443/a?b#c')).toBe('patroofing.example');
    expect(siteKey('patroofing.example/about')).toBe('patroofing.example');
    expect(siteKey('')).toBeNull();
    expect(SITE_KEY_SQL).toContain("(?:www\\.)?");
  });

  test('the drafts columns are added to databases that already exist', () => {
    const sql = fs.readFileSync(__test__.DRAFTS_SQL_PATH, 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS outreach_sequence JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS ice_breaker JSONB/);
  });
});

describe('Lead Queue shows saved drafts', () => {
  test('folded until opened, then every day and the ice breaker with copy buttons', () => {
    const lead = { id: 'l1', outreach_sequence: cleanSequence(sequence), ice_breaker: cleanIceBreaker(ice) };
    const { container } = render(<SavedOutreach lead={lead} />);
    const toggle = screen.getByRole('button', { name: /Saved drafts: 3-day sequence \+ ice breaker/ });
    expect(container.querySelector('[data-saved-day]')).toBeNull();
    fireEvent.click(toggle);
    expect([...container.querySelectorAll('[data-saved-day]')].map((d) => d.getAttribute('data-saved-day'))).toEqual(['1', '2', '3']);
    expect(screen.getByText('Free roof checklist')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '⧉ Copy' })).toHaveLength(4);
  });

  test('a lead without drafts shows nothing extra', () => {
    const { container } = render(<SavedOutreach lead={{ id: 'l2', outreach_sequence: [], ice_breaker: null }} />);
    expect(container.innerHTML).toBe('');
  });
});
