// Starter board: Notes Workspace. An Obsidian-like vault overlapping a
// Finder-like Downloads browser, plus a small library desk and team chat.
// Visual layout preset inspired by a notes-app + file-browser desktop — not
// a full Obsidian or Finder clone.

import { defaultId, finishBoard, leaf, split, starterAgent, teamChatWindow } from './shared.js';

export const NOTES_WORKSPACE_TEMPLATE_ID = 'notes-workspace';

const NOTE_TITLE = 'Brown butter nectarine tart';
const NOTE_TEXT = [
  '- Brown the butter until nutty and fragrant',
  '- Toss sliced nectarines with sugar and a pinch of salt',
  '- Blind-bake a flaky tart shell until pale gold',
  '- Fold nectarines into the browned butter custard',
  '- Bake until the center just sets, then cool before slicing',
].join('\n');
const FINDER_FILE = {
  id: 'nectarine',
  name: `${NOTE_TITLE}.md`,
  modified: 'Today at 09:55',
  size: '4 KB',
};

export const NOTES_WORKSPACE_AGENTS = Object.freeze([
  starterAgent({
    key: 'notesLibrarian',
    name: 'Notes Librarian',
    role: 'Keeps the vault tidy and finds related notes',
    description: 'Suggests titles, tags and follow-up notes, and drafts short summaries into the library doc.',
    glyph: 'N',
    hue: 210,
    tools: ['web_search'],
    prompt: 'You are the Notes Librarian. Help the person organize notes in the vault: suggest clear titles, short summaries and related links. When asked to write, add text to a document window with canvas_append_window. Prefer short, plain sentences. Do not invent files that are not on the board.',
    starters: [
      'Summarize the open recipe note in three bullets',
      'Suggest tags for the files in this Downloads folder',
      'Draft a related note title for brown butter desserts',
    ],
  }),
]);

const LIBRARY_DOC = [
  '# Library desk',
  '',
  'Scratch notes that sit beside the vault. Ask the Notes Librarian to summarize or extend what is open in Notes (F2).',
  '',
  '## Open now',
  '',
  `- ${NOTE_TITLE}.md in Downloads`,
  '',
].join('\n');

export function buildNotesWorkspaceBoard({ agents, makeId = defaultId }) {
  const tag = makeId();
  const wid = (role) => `notes-${role}-${tag}`;
  const ids = {
    finder: wid('finder'),
    vault: wid('vault'),
    library: wid('library'),
    librarianChat: wid('librarian-chat'),
    teamChat: wid('team-chat'),
  };

  const windows = [
    {
      id: ids.finder,
      kind: 'finderFiles',
      title: 'Downloads',
      folderName: 'Downloads',
      selectedNav: 'downloads',
      selectedFileId: FINDER_FILE.id,
      files: [FINDER_FILE],
      templateRole: 'downloads',
    },
    {
      id: ids.vault,
      kind: 'vaultNotes',
      title: 'Vault notes',
      // The recipe is the vault's example note (vaultNotes/data.js), copied in
      // so it can be edited and is not listed twice. Its words go in `text`,
      // where a vault's first note keeps them (vaultNotes/vault.js).
      notes: [{ id: 'note-1', title: NOTE_TITLE, fromExample: 'example-tart' }],
      text: NOTE_TEXT,
      templateRole: 'vault',
    },
    {
      id: ids.library,
      kind: 'doc',
      title: 'Library desk',
      fileName: 'library-desk.md',
      text: LIBRARY_DOC,
      templateRole: 'library',
    },
    {
      id: ids.librarianChat,
      kind: 'chat',
      title: 'Notes Librarian',
      agentId: agents.notesLibrarian,
    },
    teamChatWindow(ids.teamChat, {
      from: agents.notesLibrarian,
      text: 'Notes Workspace is ready. F1 is Downloads, F2 is the vault. I can summarize or tag what you open.',
    }),
  ];

  // Downloads sits slightly behind and left of the vault so the board opens
  // looking like the overlapping desktop in the reference screenshots.
  const groups = [
    { key: 'downloads', label: 'Downloads', hotkey: '1', x: 0, y: 90, w: 900, h: 620, root: leaf(ids.finder) },
    { key: 'notes', label: 'Notes', hotkey: '2', x: 150, y: 20, w: 1000, h: 720, root: leaf(ids.vault) },
    { key: 'library', label: 'Library', hotkey: '3', x: 1220, y: 20, w: 860, h: 720, root: split('vertical', 0.52, leaf(ids.library), leaf(ids.librarianChat)) },
    { key: 'team', label: 'Team Chat', hotkey: '4', x: 1220, y: 800, w: 860, h: 480, root: leaf(ids.teamChat) },
  ];

  return finishBoard({
    templateId: NOTES_WORKSPACE_TEMPLATE_ID,
    name: 'Notes Workspace',
    prefix: 'notes',
    tag,
    windows,
    groups,
    windowIds: ids,
  });
}

export const NOTES_WORKSPACE_TEMPLATE = Object.freeze({
  id: NOTES_WORKSPACE_TEMPLATE_ID,
  name: 'Notes Workspace',
  description: 'Obsidian-style vault notes overlapping a Finder-style Downloads browser, with a library desk and a notes librarian.',
  groups: ['Downloads', 'Notes', 'Library', 'Team Chat'],
  groupContents: {
    Downloads: 'Finder-style Downloads list with sidebar and zebra rows',
    Notes: 'Vault notes with a recipe note open',
    Library: 'Library desk document, Notes Librarian chat',
    'Team Chat': 'Team chat',
  },
  agents: NOTES_WORKSPACE_AGENTS.map((agent) => agent.name),
  modules: ['Vault notes', 'Finder', 'Document'],
});
