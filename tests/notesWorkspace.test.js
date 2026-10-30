import { jest } from '@jest/globals';
import { applyBoardTemplate, BOARD_TEMPLATES } from '../server/templates/index.js';
import {
  buildNotesWorkspaceBoard,
  NOTES_WORKSPACE_AGENTS,
  NOTES_WORKSPACE_TEMPLATE,
} from '../server/templates/starters/notesWorkspace.js';
import { findTemplateWindow } from '../server/realEstate/boardWrites.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WORK_COVERS } from '../src/components/covers/coversWork.jsx';
import { noteStats } from '../src/components/windows/vaultNotes/data.js';
import { examplesLeft, openNote, readNotes } from '../src/components/windows/vaultNotes/vault.js';

const KINDS = new Set(WINDOW_MANIFESTS.map((m) => m.kind));
const idsFor = (agents) => Object.fromEntries(agents.map((agent) => [agent.key, `${agent.key}-1`]));

describe('notes-workspace board', () => {
  test('opens the Finder behind Notes, with Library and Team Chat on F3/F4', () => {
    const board = buildNotesWorkspaceBoard({ agents: idsFor(NOTES_WORKSPACE_AGENTS), makeId: () => 't1' });
    expect(board.templateId).toBe('notes-workspace');
    expect(board.groups.map((g) => g.label)).toEqual(['Finder', 'Notes', 'Library', 'Team Chat']);
    expect(Object.keys(board.hotkeys)).toEqual(['1', '2', '3', '4']);

    const finder = board.groups.find((g) => g.label === 'Finder');
    const notes = board.groups.find((g) => g.label === 'Notes');
    expect(notes.x).toBeGreaterThan(finder.x);
    expect(notes.y).toBeLessThan(finder.y);

    expect(board.windows.find((w) => w.kind === 'finderFiles')).toBeTruthy();
    expect(board.windows.find((w) => w.kind === 'vaultNotes')).toBeTruthy();
    for (const win of board.windows) expect(KINDS.has(win.kind)).toBe(true);
    expect(findTemplateWindow(board.windows, 'teamChat').kind).toBe('groupChat');
  });

  test('its Finder lists the open project\'s files: no made-up Downloads folder', () => {
    const board = buildNotesWorkspaceBoard({ agents: idsFor(NOTES_WORKSPACE_AGENTS), makeId: () => 't1' });
    const finder = board.windows.find((w) => w.kind === 'finderFiles');
    expect(finder.files).toBeUndefined();
    expect(finder.project).toBeUndefined();
    expect(JSON.stringify({ board, template: NOTES_WORKSPACE_TEMPLATE, agents: NOTES_WORKSPACE_AGENTS })).not.toMatch(/Downloads|Today at|officepc/);
  });

  test('its vault opens on the recipe as an editable note, with no made-up computer path', () => {
    const board = buildNotesWorkspaceBoard({ agents: idsFor(NOTES_WORKSPACE_AGENTS), makeId: () => 't1' });
    const vault = board.windows.find((w) => w.kind === 'vaultNotes');
    const notes = readNotes(vault);
    expect(openNote(notes)).toMatchObject({ title: 'Brown butter nectarine tart', text: expect.stringContaining('nectarines') });
    expect(examplesLeft(notes)).toEqual([]);
    expect(JSON.stringify(vault)).not.toMatch(/alma|Users|Desktop/);
  });

  test('its librarian only has tools that exist and cannot send or deploy', () => {
    for (const agent of NOTES_WORKSPACE_AGENTS) {
      for (const tool of agent.tools) expect(TOOL_DEFINITIONS.some((d) => d.function.name === tool)).toBe(true);
      expect(agent.tools.some((t) => /send|mail|merge|submit|write_file|delete/.test(t))).toBe(false);
      expect(agent.starters.length).toBeGreaterThan(0);
    }
  });

  test('is listed under Ready-made boards with a cover', () => {
    const meta = BOARD_TEMPLATES.find((t) => t.id === NOTES_WORKSPACE_TEMPLATE.id);
    expect(meta.name).toBe('Notes Workspace');
    const item = buildAddSections({}).find((s) => s.id === 'boards').items.find((i) => i.action.id === 'notes-workspace');
    expect(item).toBeTruthy();
    expect(WORK_COVERS[item.cover]).toBeTruthy();
  });

  test('creates its librarian and returns the board', async () => {
    const createAgent = jest.fn(async (_parentId, input) => ({ id: `${input.name}-sub`, name: input.name }));
    const board = await applyBoardTemplate('notes-workspace', {
      scope: { userId: 1, workspaceId: 'ws' },
      createAgent,
    });
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(board.agents.map((a) => a.name)).toEqual(['Notes Librarian']);
    expect(board.windows.find((w) => w.kind === 'chat').agentId).toMatch(/-sub$/);
  });
});

describe('vault note helpers', () => {
  test('count words and characters for the status bar', () => {
    expect(noteStats('one two three four')).toEqual({ words: 4, characters: 18 });
    expect(noteStats('')).toEqual({ words: 0, characters: 0 });
  });
});
