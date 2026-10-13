const ROLE_PRIORITY = {
  idea: 10,
  todos: 12,
  files: 20,
  doc: 35,
  code_editor: 36,
  htmlPreview: 38,
  browser: 40,
  workflow: 45,
  chat: 70,
  groupChat: 72,
  terminal: 90,
};

const leaf = (windowId) => ({ type: 'leaf', windowId });
const split = (axis, ratio, first, second) => ({ type: 'split', axis, ratio, first, second });

function stableWindows(windows) {
  return [...windows].sort((a, b) => {
    const roleDelta = (ROLE_PRIORITY[a.kind] ?? 50) - (ROLE_PRIORITY[b.kind] ?? 50);
    if (roleDelta) return roleDelta;
    return String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
  });
}

function stack(windows, axis = 'horizontal') {
  if (!windows.length) return null;
  if (windows.length === 1) return leaf(windows[0].id);
  const midpoint = Math.ceil(windows.length / 2);
  return split(
    axis,
    midpoint / windows.length,
    stack(windows.slice(0, midpoint), axis),
    stack(windows.slice(midpoint), axis),
  );
}

function combine(first, second, axis, ratio) {
  if (!first) return second;
  if (!second) return first;
  return split(axis, ratio, first, second);
}

export function orderWindowsByRole(windows = []) {
  return stableWindows(windows);
}

export function buildSemanticWorkspaceLayout(windows = []) {
  const ordered = stableWindows(windows);
  if (!ordered.length) return null;

  const ideas = ordered.filter((win) => ['idea', 'todos'].includes(win.kind));
  const files = ordered.filter((win) => win.kind === 'files');
  const chats = ordered.filter((win) => ['chat', 'groupChat'].includes(win.kind));
  const terminals = ordered.filter((win) => win.kind === 'terminal');
  const assigned = new Set([...ideas, ...files, ...chats, ...terminals].map((win) => win.id));
  const main = ordered.filter((win) => !assigned.has(win.id));

  const left = combine(stack(ideas), stack(files), 'horizontal', 0.36);
  const center = stack(main, main.length > 3 ? 'vertical' : 'horizontal');
  const right = stack(chats);
  const centerRight = combine(center, right, 'vertical', center ? 0.72 : 0.5);
  const top = combine(left, centerRight, 'vertical', left ? 0.25 : 0.72);
  const bottom = stack(terminals, 'vertical');

  return combine(top, bottom, 'horizontal', top ? 0.72 : 0.5);
}

export const SEMANTIC_PRESET = {
  id: 'SEMANTIC_WORKSPACE',
  label: 'Role-aware workspace',
  description: 'Ideas/files left, work center, chat right, terminals below',
  preview: 'semantic',
};
