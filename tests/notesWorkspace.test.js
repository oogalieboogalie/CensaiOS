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

const KINDS = new Set(WINDOW_MANIFESTS.map((m) => m.kind));
const idsFor = (agents) => Object.fromEntries(agents.map((agent) => [agent.key, `${agent.key}-1`]));

describe('notes-workspace board', () => {
  test('opens Downloads behind Notes, with Library and Team Chat on F3/F4', () => {
    const board = buildNotesWorkspaceBoard({ agents: idsFor(NOTES_WORKSPACE_AGENTS), makeId: () => 't1' });
    expect(board.templateId).toBe('notes-workspace');
    expect(board.groups.map((g) => g.label)).toEqual(['Downloads', 'Notes', 'Library', 'Team Chat']);
    expect(Object.keys(board.hotkeys)).toEqual(['1', '2', '3', '4']);

    const downloads = board.groups.find((g) => g.label === 'Downloads');
    const notes = board.groups.find((g) => g.label === 'Notes');
    expect(notes.x).toBeGreaterThan(downloads.x);
    expect(notes.y).toBeLessThan(downloads.y);

    expect(board.windows.find((w) => w.kind === 'finderFiles')).toBeTruthy();
    expect(board.windows.find((w) => w.kind === 'vaultNotes')).toBeTruthy();
    for (const win of board.windows) expect(KINDS.has(win.kind)).toBe(true);
    expect(findTemplateWindow(board.windows, 'teamChat').kind).toBe('groupChat');
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
    expect(noteStats('one two three four')).toEqual({ words: 4, characters: 18, backlinks: 0 });
    expect(noteStats('')).toEqual({ words: 0, characters: 0, backlinks: 0 });
  });
});
