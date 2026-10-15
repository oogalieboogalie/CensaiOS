// Starter boards: the shared pieces every ready-made board uses. A starter
// is a pure builder like the Real Estate Team board: given its agents' ids,
// it returns windows, groups (bound to F1 to F4) and layout trees the client
// fits into each group with the canvas's own layout code.

import { randomUUID } from 'node:crypto';

export const leaf = (windowId) => ({ type: 'leaf', windowId });
export const split = (axis, ratio, first, second) => ({ type: 'split', axis, ratio, first, second });

// What every starter agent knows about the board it lives on.
export const STARTER_RULES = [
  'You work inside censaiOS, a shared canvas board the whole team sees live.',
  'To put work on the board, find a document or code window with canvas_list_writable_windows and add to it with canvas_append_window; it adds text and never deletes anything.',
  'post_team_chat posts one short note in the board\'s Team Chat window.',
  'You draft and suggest; people decide. Never claim you published, sent, merged or deployed anything.',
  'Write in plain, specific language a newcomer understands. No emojis.',
].join(' ');

// The tools every starter agent has: write onto the board, post in Team
// Chat, and remember what the team told it.
export const BOARD_TOOLS = Object.freeze(['canvas_list_writable_windows', 'canvas_append_window', 'post_team_chat', 'remember', 'recall']);

export function starterAgent({ key, name, role, description, glyph, hue, tools = [], prompt, starters }) {
  return {
    key, name, role, description, glyph, hue,
    tools: [...new Set([...tools, ...BOARD_TOOLS])],
    prompt: `${STARTER_RULES} ${prompt}`,
    starters,
  };
}

export const defaultId = () => randomUUID().slice(0, 8);

/** The Team Chat every starter opens with: a group chat agents can post in. */
export function teamChatWindow(id, { from, text }) {
  return { id, kind: 'groupChat', title: 'Team Chat', templateRole: 'teamChat', members: ['censai'], msgs: [{ from, text }] };
}

/**
 * Finish a board: give every window its group, and list the F-key bindings.
 * Groups are { key, label, hotkey, x, y, w, h, root }.
 */
export function finishBoard({ templateId, name, prefix, tag, windows, groups, windowIds }) {
  const placed = groups.map(({ key, ...group }) => ({ id: `${prefix}-group-${key}-${tag}`, ...group }));
  const groupOf = {};
  const walk = (node, groupId) => {
    if (!node) return;
    if (node.type === 'leaf') groupOf[node.windowId] = groupId;
    else { walk(node.first, groupId); walk(node.second, groupId); }
  };
  placed.forEach(group => walk(group.root, group.id));
  // The Team Chat lists this board's agents, so post_team_chat lands here even
  // when another starter's Team Chat is on the same board.
  const teamAgents = [...new Set(windows.flatMap(win => [win.agentId, ...(win.kind === 'groupChat' ? win.members || [] : [])]).filter(id => id && id !== 'censai'))];
  return {
    templateId,
    name,
    windows: windows.map(win => ({
      ...win,
      ...(win.templateRole === 'teamChat' ? { teamAgents } : {}),
      groupId: groupOf[win.id] || null,
    })),
    groups: placed,
    hotkeys: Object.fromEntries(placed.map(group => [group.hotkey, group.id])),
    windowIds,
  };
}
