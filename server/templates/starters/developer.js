// Starter board: Developer. Code with a live preview, a plan, a place to run
// and review, and a team chat, with three AI teammates that suggest while
// people decide. Every window is a built-in one that works on day one.

import { defaultId, finishBoard, leaf, split, starterAgent, teamChatWindow } from './shared.js';

export const DEVELOPER_TEMPLATE_ID = 'developer';

export const DEVELOPER_AGENTS = Object.freeze([
  starterAgent({
    key: 'pairProgrammer',
    name: 'Pair Programmer',
    role: 'Writes and explains code with you',
    description: 'Writes code into the editor, explains what it does in plain words and suggests the next small step.',
    glyph: 'P',
    hue: 200,
    tools: ['github_read_file', 'web_search'],
    prompt: 'You are the Pair Programmer. Work in small steps: say what you will change, then add the code to the code window with canvas_append_window and explain it in two or three plain sentences. Prefer simple, readable code over clever code. When you are not sure how a library works, look it up with web_search instead of guessing.',
    starters: ['Add a reset button to the counter in index.html', 'Explain index.html line by line', 'What should I build next on this page?'],
  }),
  starterAgent({
    key: 'codeReviewer',
    name: 'Code Reviewer',
    role: 'Finds bugs before they ship',
    description: 'Reads code and pull requests, points out bugs, security holes and confusing parts, and suggests the fix.',
    glyph: 'R',
    hue: 12,
    tools: ['github_read_file', 'pr_status', 'pr_comments'],
    prompt: 'You are the Code Reviewer. Read the code you are pointed at and list real problems first (bugs, security holes, data loss), then smaller ones. For each, quote the line, say what goes wrong and how to fix it. Do not rewrite whole files; suggest the smallest change. Say plainly when the code looks fine.',
    starters: ['Review index.html for bugs', 'What could go wrong if two people use this at once?', 'Check my open pull request'],
  }),
  starterAgent({
    key: 'projectPlanner',
    name: 'Project Planner',
    role: 'Turns ideas into small tasks',
    description: 'Breaks a feature into small tasks, keeps the README and the decisions log up to date, and writes release notes.',
    glyph: 'L',
    hue: 140,
    tools: ['github_list_issues'],
    prompt: 'You are the Project Planner. Turn a goal into tasks small enough to finish in an afternoon, in the order to build them, and say why that order. Keep the README and the Decisions log current with canvas_append_window. Post a one-line summary in Team Chat when a plan changes.',
    starters: ['Break "people can sign in" into small tasks', 'What should I build first?', 'Write release notes for what is done'],
  }),
]);

export const STARTER_PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My first app</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: rgb(18, 18, 20); color: rgb(240, 240, 240); }
      main { text-align: center; }
      button { font: inherit; font-size: 20px; padding: 10px 22px; border-radius: 8px; border: 0; background: rgb(229, 168, 58); color: rgb(18, 18, 20); cursor: pointer; }
      .count { font-size: 64px; font-weight: 700; margin: 12px 0 20px; }
    </style>
  </head>
  <body>
    <main>
      <h1>My first app</h1>
      <div class="count" id="count">0</div>
      <button id="add">Add one</button>
    </main>
    <script>
      let count = 0;
      document.getElementById('add').addEventListener('click', () => {
        count += 1;
        document.getElementById('count').textContent = count;
      });
    </script>
  </body>
</html>
`;

const README = [
  '# My first app',
  '',
  'A tiny counter page to start from. The code is in the Code group (F1) and the preview sits next to it.',
  '',
  '## How to work on this board',
  '',
  '- F1 Code: edit index.html; ask the Pair Programmer to add or explain things.',
  '- F2 Plan: the build list, this README and the Project Planner.',
  '- F3 Run and review: a terminal, your GitHub, and the Code Reviewer.',
  '- F4 Team Chat: talk with your team; decisions go in the Decisions log.',
  '',
  'Press Escape to leave a focused group.',
].join('\n');

const TASKS = [
  'Change the page title and the button text',
  'Ask the Pair Programmer to add a reset button',
  'Ask the Code Reviewer to check the page',
  'Connect GitHub in the GitHub window',
  'Write your first decision in the Decisions log (F4)',
];

export function buildDeveloperBoard({ agents, makeId = defaultId }) {
  const tag = makeId();
  const wid = (role) => `dev-${role}-${tag}`;
  const ids = {
    code: wid('code'), preview: wid('preview'), pairChat: wid('pair-chat'),
    tasks: wid('tasks'), readme: wid('readme'), plannerChat: wid('planner-chat'),
    terminal: wid('terminal'), github: wid('github'), reviewerChat: wid('reviewer-chat'),
    teamChat: wid('team-chat'), decisions: wid('decisions'),
  };

  const windows = [
    // F1 Code
    { id: ids.code, kind: 'code_editor', title: 'index.html', fileName: 'index.html', language: 'html', code: STARTER_PAGE, templateRole: 'code' },
    { id: ids.preview, kind: 'htmlPreview', title: 'Preview', fileName: 'index.html', html: STARTER_PAGE, sourceWindowId: ids.code, templateRole: 'preview' },
    { id: ids.pairChat, kind: 'chat', title: 'Pair Programmer', agentId: agents.pairProgrammer },
    // F2 Plan
    { id: ids.tasks, kind: 'todos', title: 'Build list', items: TASKS.map((text, i) => ({ id: i + 1, text, done: false, assignee: null })) },
    { id: ids.readme, kind: 'doc', title: 'README.md', fileName: 'README.md', text: README, templateRole: 'readme' },
    { id: ids.plannerChat, kind: 'chat', title: 'Project Planner', agentId: agents.projectPlanner },
    // F3 Run and review
    { id: ids.terminal, kind: 'terminal', title: 'Terminal' },
    { id: ids.github, kind: 'githubConsole', title: 'GitHub' },
    { id: ids.reviewerChat, kind: 'chat', title: 'Code Reviewer', agentId: agents.codeReviewer },
    // F4 Team Chat
    teamChatWindow(ids.teamChat, { from: agents.projectPlanner, text: 'Welcome to your developer board. Start with the Build list in F2; I will post here when the plan changes.' }),
    { id: ids.decisions, kind: 'doc', title: 'Decisions', fileName: 'decisions.md', text: '# Decisions\n\nWrite down what the team decided and why, one line each.\n', templateRole: 'decisions' },
  ];

  const groups = [
    { key: 'code', label: 'Code', hotkey: '1', x: 0, y: 0, w: 1640, h: 900, root: split('vertical', 0.5, leaf(ids.code), split('horizontal', 0.58, leaf(ids.preview), leaf(ids.pairChat))) },
    { key: 'plan', label: 'Plan', hotkey: '2', x: 1800, y: 0, w: 1400, h: 900, root: split('vertical', 0.3, leaf(ids.tasks), split('vertical', 0.56, leaf(ids.readme), leaf(ids.plannerChat))) },
    { key: 'run', label: 'Run and review', hotkey: '3', x: 0, y: 1060, w: 1640, h: 820, root: split('vertical', 0.5, leaf(ids.terminal), split('horizontal', 0.55, leaf(ids.github), leaf(ids.reviewerChat))) },
    { key: 'team', label: 'Team Chat', hotkey: '4', x: 1800, y: 1060, w: 1400, h: 820, root: split('vertical', 0.5, leaf(ids.teamChat), leaf(ids.decisions)) },
  ];

  return finishBoard({ templateId: DEVELOPER_TEMPLATE_ID, name: 'Developer', prefix: 'dev', tag, windows, groups, windowIds: ids });
}

export const DEVELOPER_TEMPLATE = Object.freeze({
  id: DEVELOPER_TEMPLATE_ID,
  name: 'Developer',
  description: 'Code with a live preview, a build list, a terminal and GitHub, with three AI teammates that write, review and plan while you decide.',
  groups: ['Code', 'Plan', 'Run and review', 'Team Chat'],
  groupContents: {
    Code: 'Code editor, live preview, Pair Programmer',
    Plan: 'Build list, README, Project Planner',
    'Run and review': 'Terminal, GitHub, Code Reviewer',
    'Team Chat': 'Team chat, Decisions log',
  },
  agents: DEVELOPER_AGENTS.map(agent => agent.name),
  modules: ['Code editor', 'Preview', 'Build list', 'Terminal', 'GitHub'],
});
