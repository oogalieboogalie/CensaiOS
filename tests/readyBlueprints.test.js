import { READY_BLUEPRINTS, UI_TEAM_BLUEPRINT, missingReadyBlueprints, readyBlueprintDraft } from '../src/lib/blueprints/readyBlueprints.js';
import { BLUEPRINT_SHELVES } from '../src/lib/blueprints/blueprintIds.js';

describe('ready-made blueprints', () => {
  test('each one fits the blueprint limits and sits on a real shelf', () => {
    const shelves = new Set(BLUEPRINT_SHELVES.map((s) => s.number));
    for (const b of READY_BLUEPRINTS) {
      expect(b.title.length).toBeLessThanOrEqual(140);
      expect(b.type.length).toBeLessThanOrEqual(60);
      expect(b.purpose.length).toBeLessThanOrEqual(140);
      expect(b.body.length).toBeLessThanOrEqual(6000);
      expect(shelves.has(b.shelf)).toBe(true);
    }
  });

  test('the UI team recipe names its eight parts and its tools', () => {
    for (const word of ['Depth', 'First look', 'Feel', 'Readable', 'Type', 'Spacing', 'Corners', 'Works', 'npm run ui-team', 'depth.css']) {
      expect(UI_TEAM_BLUEPRINT.body).toContain(word);
    }
  });

  test('offers only the ones the board does not have, by name', () => {
    expect(missingReadyBlueprints([])).toEqual(READY_BLUEPRINTS);
    expect(missingReadyBlueprints([{ title: ` ${UI_TEAM_BLUEPRINT.title.toUpperCase()} ` }])).toEqual([]);
  });

  test('the saved draft leaves out the key', () => {
    const draft = readyBlueprintDraft(UI_TEAM_BLUEPRINT);
    expect(draft).not.toHaveProperty('key');
    expect(draft.title).toBe(UI_TEAM_BLUEPRINT.title);
  });
});
