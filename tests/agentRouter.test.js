import { describe, expect, it } from '@jest/globals';
import { readIntent, readRequest, slotWord, splitRequest } from '../src/lib/agentRouter/readRequest.js';
import { buildRoutePlan, busAddress, pickAgent, pickTemplate, routedMessage, sharedPlan } from '../src/lib/agentRouter/routePlan.js';

const AGENTS = [
  { id: 'censai', name: 'Censai' },
  { id: 'office', name: 'Office Manager', description: 'Plans the week, turns notes into tidy documents (quotes, policies, thank-you notes).' },
  { id: 'builder', name: 'App Builder', role: 'Developer', description: 'Builds small apps and tools.' },
  { id: 'sales', name: 'Sales Helper', description: 'Researches a prospect, then drafts a short personal first email.' },
];
const DIAGRAM = 'can we make some documents for work and create a microapp for invoices?';

describe('reading a request (diagram 03)', () => {
  it('cuts Alma\'s example into the two jobs from the drawing', () => {
    expect(splitRequest(DIAGRAM)).toEqual(['can we make some documents for work', 'create a microapp for invoices']);
    const [docs, app] = readRequest(DIAGRAM);
    expect(docs.tags).toEqual(['create', 'docs', 'work', 'work={{$recall_work_memory}}']);
    expect(app.tags).toEqual(['create', 'microapp', 'invoices', 'invoices={{$recall_invoices_memory}}']);
  });

  it('keeps "x and y" together when the second half is not its own job', () => {
    expect(splitRequest('write notes and letters for the move')).toEqual(['write notes and letters for the move']);
    expect(splitRequest('find leads in Ames and then email them')).toHaveLength(2);
  });

  it('keeps the same kind of thing in one job, and means "make" for a new one', () => {
    expect(readRequest('find leads in Ames and prospects in Ankeny')).toHaveLength(1);
    const [, sheet] = readRequest('find leads in Ames and a budget sheet for March');
    expect(sheet.action).toBe('create');
    expect(sheet.thing).toBe('sheet');
  });

  it('makes a safe memory slot name', () => {
    expect(slotWord('Dale City!')).toBe('dale_city');
    expect(slotWord('')).toBe('general');
    expect(readIntent('make a report').memorySlot).toBe('{{$recall_docs_memory}}');
  });

  it('caps a huge request', () => {
    expect(splitRequest('make a doc, '.repeat(500)).length).toBeLessThanOrEqual(8);
  });
});

describe('routing (diagram 03)', () => {
  it('gives each board the same line every time, and different boards different lines', () => {
    expect(busAddress('board-1')).toMatch(/^v1\/bus\/chat\/agent[0-9a-z]{6}$/);
    expect(busAddress('board-1')).toBe(busAddress('board-1'));
    expect(busAddress('board-1')).not.toBe(busAddress('board-2'));
  });

  it('sends docs to the office agent and the micro-app to the builder', () => {
    const [docs, app] = readRequest(DIAGRAM);
    expect(pickAgent(docs, AGENTS).id).toBe('office');
    expect(pickAgent(app, AGENTS).id).toBe('builder');
  });

  it('falls back to Censai when nobody fits', () => {
    const pick = pickAgent(readIntent('make a budget sheet'), AGENTS);
    expect(pick).toMatchObject({ id: 'censai', fallback: true });
  });

  it('uses a blueprint from the shelf when one fits, else the starter recipe', () => {
    const app = readRequest(DIAGRAM)[1];
    const shelf = [{ id: '14h7*skyFs^2026', title: 'Invoice Blueprint for Small Business', purpose: 'Bill customers' }];
    expect(pickTemplate(app, shelf)).toMatchObject({ source: 'blueprint', id: '14h7*skyFs^2026' });
    expect(pickTemplate(app, [])).toMatchObject({ source: 'starter', id: 'starter:microapp' });
    expect(pickTemplate(readRequest(DIAGRAM)[0], shelf).source).toBe('starter');
  });

  it('builds the plan with the agent\'s own notes and a message ready to send', () => {
    const plan = buildRoutePlan(DIAGRAM, {
      agents: AGENTS,
      workspaceId: 'board-1',
      memoryFor: (agentId) => (agentId === 'office' ? ['work hours are 9 to 5'] : []),
    });
    expect(plan.line).toBe(busAddress('board-1'));
    expect(plan.agentsOnLine).toBe(4);
    expect(plan.parts.map((part) => part.agent.id)).toEqual(['office', 'builder']);
    expect(plan.parts[0].memory.notes).toEqual(['work hours are 9 to 5']);
    expect(plan.parts[0].message).toContain('[create] [docs] [work]');
    expect(plan.parts[0].message).toContain('Notes you have on it: work hours are 9 to 5');
    expect(routedMessage(plan.parts[1])).toContain('Template: Starter micro-app');
  });

  it('routes nothing for an empty request', () => {
    expect(buildRoutePlan('   ').parts).toEqual([]);
  });
});

describe('the board copy of a routed plan', () => {
  it('keeps the parts but leaves out the reader\'s own agent notes', () => {
    const plan = buildRoutePlan('made-up: write a tip calculator', {
      agents: [{ id: 'nexus', name: 'Nexus', role: 'builds apps and code' }],
      workspaceId: 'ws1',
      memoryFor: () => ['Made-up private note'],
    });
    expect(plan.parts[0].message).toContain('Made-up private note');
    const shared = sharedPlan(plan, 'made-up-stamp');
    expect(shared.stamp).toBe('made-up-stamp');
    expect(shared.parts).toHaveLength(plan.parts.length);
    expect(JSON.stringify(shared)).not.toContain('Made-up private note');
    expect(shared.parts[0].agent.id).toBe(plan.parts[0].agent.id);
  });

  it('is nothing when nothing was routed', () => {
    expect(sharedPlan(null, 'x')).toBeNull();
  });
});

describe('a request that is one endless word', () => {
  it('routes without turning the word into a page-wide tag', () => {
    const [intent] = readRequest('x'.repeat(20000));
    expect(intent.tags.every((tag) => tag.length <= 60)).toBe(true);
    expect(intent.text.length).toBeLessThanOrEqual(2000);
  });
});
