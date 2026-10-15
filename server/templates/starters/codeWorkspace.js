// Starter board: Code Workspace, laid out like VS Code. F1 is the editor
// view people know (files on the left, code in the middle, terminal under
// it, the AI assistant on the right); the other keys hold the preview,
// source control and notes.

import { defaultId, finishBoard, leaf, split, starterAgent, teamChatWindow } from './shared.js';
import { STARTER_PAGE } from './developer.js';

export const CODE_WORKSPACE_TEMPLATE_ID = 'code-workspace';

export const CODE_WORKSPACE_AGENTS = Object.freeze([
  starterAgent({
    key: 'codingAssistant',
    name: 'Coding Assistant',
    role: 'Your AI pair in the side panel',
    description: 'Answers questions about the open code, writes the next piece into the editor and explains errors from the terminal.',
    glyph: 'A',
    hue: 210,
    tools: ['github_read_file', 'web_search'],
    prompt: 'You are the Coding Assistant in the side panel of a VS Code style workspace. Answer short questions in a few lines. When asked to write code, add it to the code window with canvas_append_window and say where it went. When someone pastes an error from the terminal, explain the cause in one sentence, then the fix.',
    starters: ['Explain what index.html does', 'Add a dark mode switch to the page', 'I got an error in the terminal, here it is:'],
  }),
  starterAgent({
    key: 'reviewer',
    name: 'Review Assistant',
    role: 'Reviews changes before they go to GitHub',
    description: 'Reads code and pull requests and lists real problems first, with the smallest fix for each.',
    glyph: 'R',
    hue: 12,
    tools: ['github_read_file', 'pr_status', 'pr_comments'],
    prompt: 'You are the Review Assistant. List real problems first (bugs, security holes, data loss), then smaller ones. Quote the line, say what goes wrong and suggest the smallest fix. Say plainly when the code looks fine.',
    starters: ['Review index.html', 'Check my open pull request', 'Is there anything unsafe in this code?'],
  }),
]);

const TODO = ['Open a project folder in Files', 'Change the page and watch Preview (F2)', 'Ask the Coding Assistant to add a feature', 'Ask the Review Assistant before you push (F3)'];

export function buildCodeWorkspaceBoard({ agents, makeId = defaultId }) {
  const tag = makeId();
  const wid = (role) => `cw-${role}-${tag}`;
  const ids = {
    files: wid('files'), code: wid('code'), terminal: wid('terminal'), assistant: wid('assistant'),
    preview: wid('preview'), browser: wid('browser'),
    github: wid('github'), reviewerChat: wid('reviewer-chat'),
    todo: wid('todo'), teamChat: wid('team-chat'),
  };

  const windows = [
    // F1 Editor: explorer | (code over terminal) | assistant
    { id: ids.files, kind: 'files', title: 'Explorer' },
    { id: ids.code, kind: 'code_editor', title: 'index.html', fileName: 'index.html', language: 'html', code: STARTER_PAGE, templateRole: 'code' },
    { id: ids.terminal, kind: 'terminal', title: 'Terminal' },
    { id: ids.assistant, kind: 'chat', title: 'Coding Assistant', agentId: agents.codingAssistant },
    // F2 Preview
    { id: ids.preview, kind: 'htmlPreview', title: 'Preview', fileName: 'index.html', html: STARTER_PAGE, sourceWindowId: ids.code },
    { id: ids.browser, kind: 'browser', title: 'Browser' },
    // F3 Source control
    { id: ids.github, kind: 'githubConsole', title: 'Source control' },
    { id: ids.reviewerChat, kind: 'chat', title: 'Review Assistant', agentId: agents.reviewer },
    // F4 Notes
    { id: ids.todo, kind: 'todos', title: 'To do', items: TODO.map((text, i) => ({ id: i + 1, text, done: false, assignee: null })) },
    teamChatWindow(ids.teamChat, { from: agents.codingAssistant, text: 'Your workspace is ready. F1 is the editor, F2 the preview, F3 source control, F4 notes. Ask me anything in the side panel.' }),
  ];

  const groups = [
    {
      key: 'editor', label: 'Editor', hotkey: '1', x: 0, y: 0, w: 1800, h: 1000,
      root: split('vertical', 0.16, leaf(ids.files), split('vertical', 0.74, split('horizontal', 0.68, leaf(ids.code), leaf(ids.terminal)), leaf(ids.assistant))),
    },
    { key: 'preview', label: 'Preview', hotkey: '2', x: 1960, y: 0, w: 1480, h: 1000, root: split('vertical', 0.5, leaf(ids.preview), leaf(ids.browser)) },
    { key: 'source', label: 'Source control', hotkey: '3', x: 0, y: 1160, w: 1400, h: 800, root: split('vertical', 0.55, leaf(ids.github), leaf(ids.reviewerChat)) },
    { key: 'notes', label: 'Notes', hotkey: '4', x: 1560, y: 1160, w: 1200, h: 800, root: split('vertical', 0.45, leaf(ids.todo), leaf(ids.teamChat)) },
  ];

  return finishBoard({ templateId: CODE_WORKSPACE_TEMPLATE_ID, name: 'Code Workspace', prefix: 'cw', tag, windows, groups, windowIds: ids });
}

export const CODE_WORKSPACE_TEMPLATE = Object.freeze({
  id: CODE_WORKSPACE_TEMPLATE_ID,
  name: 'Code Workspace',
  description: 'Laid out like VS Code: files on the left, code in the middle, terminal underneath and an AI assistant on the right, plus preview and source control.',
  groups: ['Editor', 'Preview', 'Source control', 'Notes'],
  groupContents: {
    Editor: 'Files, code editor, terminal, Coding Assistant',
    Preview: 'Live preview, browser',
    'Source control': 'GitHub, Review Assistant',
    Notes: 'To-do list, team chat',
  },
  agents: CODE_WORKSPACE_AGENTS.map(agent => agent.name),
  modules: ['Files', 'Code editor', 'Terminal', 'Preview', 'Browser', 'GitHub'],
});
