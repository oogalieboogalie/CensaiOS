import { describe, expect, it } from '@jest/globals';
import {
  blueprintCode, describeBlueprintId, isBlueprintId, makeBlueprintId, parseBlueprintId, shelfNumber,
} from '../src/lib/blueprints/blueprintIds.js';
import {
  blueprintSearchWords, DEFAULT_BLUEPRINT_PHRASES, matchBlueprintPhrase, normalizePhrases,
} from '../src/lib/blueprints/blueprintPhrases.js';
import { blueprintCodeView, rankBlueprints } from '../src/lib/blueprints/blueprintSearch.js';
import { buildBlueprintsPrompt } from '../server/blueprints/prompt.js';
import { lookupBlueprintsForMessage, saveBlueprint } from '../server/blueprints/store.js';

describe('blueprint IDs (diagram 08)', () => {
  it('reads Alma\'s example: Finance shelf, 4th one, code, year', () => {
    expect(parseBlueprintId('14h7*skyFs^2026')).toEqual({ shelf: 1, shelfName: 'Finance', number: 4, code: 'h7*skyFs', year: 2026 });
    expect(describeBlueprintId('14h7*skyFs^2026')).toBe('Finance shelf, the 4th one, code h7*skyFs, made in 2026');
  });

  it('makes IDs that read back, past the 9th on a shelf too', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = makeBlueprintId({ shelf: 'Real Estate', number: 12, year: 2026 });
      expect(parseBlueprintId(id)).toMatchObject({ shelf: 2, number: 12, year: 2026 });
    }
    expect(blueprintCode(() => 0)).toMatch(/^[a-z][A-Za-z0-9*]{7}$/);
    expect(isBlueprintId('not an id')).toBe(false);
    expect(shelfNumber('insurance')).toBe(5);
    expect(shelfNumber('???')).toBe(3);
  });
});

describe('"Do we have" phrases', () => {
  it('keeps every phrase from the drawing', () => {
    expect(DEFAULT_BLUEPRINT_PHRASES).toHaveLength(16);
    expect(DEFAULT_BLUEPRINT_PHRASES[0]).toBe('Do we have*');
  });

  it('catches the longest phrase and leaves what to look for', () => {
    expect(matchBlueprintPhrase('Do we have any budget blueprints?')).toEqual({ phrase: 'Do we have any*', rest: 'budget blueprints' });
    expect(matchBlueprintPhrase('Atlas, what do we know about insurance?')).toMatchObject({ phrase: 'What do we know about', rest: 'insurance' });
    expect(matchBlueprintPhrase('Write me a poem about budgets')).toBeNull();
    expect(matchBlueprintPhrase('I wonder why do we have rain')).toBeNull();
  });

  it('drops filler words and plurals', () => {
    expect(blueprintSearchWords('any budget blueprints for 2026?')).toEqual(['budget', '2026']);
    expect(blueprintSearchWords('rental properties')).toEqual(['rental', 'propert']);
  });

  it('cleans a board\'s own list', () => {
    expect(normalizePhrases([' Do we have* ', 'do we have', '', 'Got any'])).toEqual(['Do we have*', 'Got any']);
  });
});

const SHELF = [
  { id: '14h7*skyFs^2026', title: 'Alma Finance Blueprint for Budgeting', shelf: 1, shelfName: 'Finance', type: 'Budget', purpose: 'Personal Financing', body: 'Savings first' },
  { id: '21kQ2mPr*x^2026', title: 'Open house checklist', shelf: 2, shelfName: 'Real Estate', type: 'Checklist', purpose: 'Showings', body: '' },
];

describe('searching the shelf', () => {
  it('ranks by the words, exact ID wins', () => {
    expect(rankBlueprints(SHELF, ['budget']).map((b) => b.title)).toEqual(['Alma Finance Blueprint for Budgeting']);
    expect(rankBlueprints(SHELF, ['21kq2mpr*x^2026'])[0].title).toBe('Open house checklist');
    expect(rankBlueprints(SHELF, ['real'])[0].shelf).toBe(2);
    expect(rankBlueprints(SHELF, [])).toHaveLength(2);
  });

  it('draws the drawing\'s code view', () => {
    expect(blueprintCodeView(SHELF[0])).toBe('blueprint:\n  ID: "14h7*skyFs^2026",\n  type: "Budget",\n  purpose: "Personal Financing"');
  });

  it('hands matches to the agent, nothing when none', () => {
    const prompt = buildBlueprintsPrompt({ phrase: 'Do we have any*', matches: [SHELF[0]] });
    expect(prompt).toContain('ID 14h7*skyFs^2026');
    expect(prompt).toContain('"Do we have any ..."');
    expect(buildBlueprintsPrompt({ phrase: 'Do we have*', matches: [] })).toBe('');
    expect(buildBlueprintsPrompt(null)).toBe('');
  });
});

// A tiny stand-in for the two tables, enough for the store's queries.
function fakeDb(rows = []) {
  return {
    rows,
    async query(sql, params) {
      if (sql.includes('FROM workspace_blueprint_phrases')) return { rows: [] };
      if (sql.startsWith('SELECT id FROM workspace_blueprints')) return { rows: rows.filter((r) => r.category === params[1]) };
      if (sql.startsWith('INSERT INTO workspace_blueprints')) {
        const [workspace_id, id, title, category, type, purpose, body, author_kind, author_id] = params;
        const row = { workspace_id, id, title, category, type, purpose, body, author_kind, author_id, created_at: 'now', updated_at: 'now' };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT * FROM workspace_blueprints')) return { rows: rows.filter((r) => r.workspace_id === params[0]) };
      throw new Error(`unexpected query ${sql}`);
    },
  };
}

describe('the shelf store', () => {
  it('numbers each new blueprint on its shelf', async () => {
    const db = fakeDb([{ workspace_id: 'w', id: '14h7*skyFs^2026', category: 1 }]);
    const saved = await saveBlueprint(db, 'w', { title: 'Second budget', shelf: 'Finance', type: 'Budget' }, { kind: 'agent', id: 'atlas' });
    expect(parseBlueprintId(saved.id)).toMatchObject({ shelf: 1, number: 5, year: new Date().getFullYear() });
    expect(saved).toMatchObject({ shelfName: 'Finance', authorKind: 'agent', authorId: 'atlas' });
    await expect(saveBlueprint(db, 'w', { title: '  ' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('looks on the shelf only for "Do we have" questions', async () => {
    const db = fakeDb(SHELF.map((b) => ({ ...b, workspace_id: 'w', category: b.shelf })));
    const found = await lookupBlueprintsForMessage(db, 'w', 'Do we have any budget blueprints?');
    expect(found.matches.map((b) => b.title)).toEqual(['Alma Finance Blueprint for Budgeting']);
    expect(await lookupBlueprintsForMessage(db, 'w', 'Write a budget')).toBeNull();
    expect(await lookupBlueprintsForMessage(db, 'w', 'Do you know?')).toBeNull();
    expect(await lookupBlueprintsForMessage(db, null, 'Do we have any?')).toBeNull();
  });
});
