import { checkFairHousing, fairHousingSegments } from '../src/lib/realEstate/fairHousing.js';
import { dueDeadlines, describeDeadline } from '../server/realEstate/deadlines.js';
import { draftsByStatus, patchDraft, sendLink } from '../src/lib/realEstate/outbox.js';

describe('fair-housing check', () => {
  test('flags phrases that describe who should live there, with a reason and a rewrite', () => {
    const result = checkFairHousing('Perfect for a young couple, walking distance to the church. Adults only.');
    expect(result.ok).toBe(false);
    const terms = result.flags.map(f => f.term.toLowerCase());
    expect(terms).toEqual(['perfect for a young couple', 'walking distance to the church', 'adults only']);
    expect(result.flags.map(f => f.severity)).toEqual(['risk', 'review', 'risk']);
    expect(result.flags.every(f => f.reason && f.suggestion && f.category)).toBe(true);
  });

  test('names a house of worship as a review item, not a hard fail', () => {
    const result = checkFairHousing('Steps from the synagogue and the farmers market.');
    expect(result.ok).toBe(true);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toMatchObject({ severity: 'review', category: 'Religion' });
  });

  test('passes plain property copy and suggests "primary" over "master"', () => {
    expect(checkFairHousing('Three bedrooms, a fenced yard and a new roof.')).toEqual({ ok: true, flags: [] });
    const master = checkFairHousing('Spacious master suite with a walk-in closet.');
    expect(master.ok).toBe(true);
    expect(master.flags[0].suggestion).toMatch(/primary/);
  });

  test('catches disability, national origin and source-of-income exclusions', () => {
    const text = 'No wheelchairs. English-speaking tenants. No Section 8.';
    const result = checkFairHousing(text);
    expect(result.flags.map(f => f.category)).toEqual(['Disability', 'National origin', 'Source of income']);
    expect(result.ok).toBe(false);
  });

  test('segments rebuild the original text with the flagged runs marked', () => {
    const text = 'Great for families! Near parks.';
    const segments = fairHousingSegments(text);
    expect(segments.map(s => s.text).join('')).toBe(text);
    expect(segments.filter(s => s.flag).map(s => s.text)).toEqual(['Great for families']);
  });
});

describe('deal deadlines', () => {
  const deals = [
    { client: 'Rivera', address: '14 Alder Way', stage: 'Under contract', checklist: [
      { label: 'Earnest money due', due: '2026-10-01', done: true },
      { label: 'Inspection period ends', due: '2026-10-09', done: false },
      { label: 'Appraisal due', due: '2026-10-20', done: false },
    ] },
    { client: 'Okafor', address: '902 Harbor St', stage: 'Under contract', checklist: [{ label: 'Closing', due: '2026-10-05', done: false }] },
    { client: 'Done', address: '1 Main', stage: 'Closed', checklist: [{ label: 'Closing', due: '2026-10-06', done: false }] },
  ];

  test('lists open deadlines inside the window, overdue first, skipping closed deals', () => {
    const due = dueDeadlines(deals, { today: new Date(2026, 9, 7), daysAhead: 7 });
    expect(due.map(d => `${d.deal}:${d.deadline}:${d.days}`)).toEqual(['Okafor:Closing:-2', 'Rivera:Inspection period ends:2']);
    expect(describeDeadline(due[0])).toBe('Okafor (902 Harbor St): Closing 2 days overdue (2026-10-05)');
    expect(describeDeadline(due[1])).toMatch(/due in 2 days/);
  });
});

describe('outbox helpers', () => {
  test('approving opens the person\'s own mail or messages app', () => {
    expect(sendLink({ channel: 'email', address: 'dana@example.com', subject: 'Hi there', body: 'Line 1\nLine 2' }))
      .toBe('mailto:dana@example.com?subject=Hi%20there&body=Line%201%0ALine%202');
    expect(sendLink({ channel: 'text', address: '(555) 010-2000', body: 'See you at 4' })).toBe('sms:5550102000?&body=See%20you%20at%204');
  });

  test('groups drafts by status, newest first, and patches one draft', () => {
    const drafts = [
      { id: 'a', createdAt: '2026-10-01' },
      { id: 'b', status: 'approved', createdAt: '2026-10-02' },
      { id: 'c', status: 'pending', createdAt: '2026-10-03' },
    ];
    const sections = draftsByStatus(drafts);
    expect(sections.pending.map(d => d.id)).toEqual(['c', 'a']);
    expect(sections.approved.map(d => d.id)).toEqual(['b']);
    expect(patchDraft(drafts, 'a', { status: 'discarded' })[0].status).toBe('discarded');
  });
});
