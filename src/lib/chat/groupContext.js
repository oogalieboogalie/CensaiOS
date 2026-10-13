// What an agent attached to canvas groups can see: the text of the doc, todo
// and files windows sitting inside those groups. Sent as a system message
// just before the person's latest turn. Visual context, not authorization.

function centerInside(win, group) {
  const cx = win.x + win.w / 2;
  const cy = win.y + win.h / 2;
  return cx >= group.x && cx <= group.x + group.w && cy >= group.y && cy <= group.y + group.h;
}

export function groupContextText(canvasGroups, allWins, agentId) {
  const activeGroups = (canvasGroups || []).filter(g => (g.attachedAgents || []).includes(agentId));
  let text = '';
  activeGroups.forEach(g => {
    text += `\n\n--- IN GROUP: ${g.label} ---\n`;
    (allWins || []).filter(w => centerInside(w, g)).forEach(w => {
      if (w.kind === 'doc' && w.text) text += `\n[Document Window]:\n${w.text}\n`;
      if (w.kind === 'todos' && w.items) text += `\n[Todo List Window]:\n${w.items.map(i => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n')}\n`;
      if (w.kind === 'files' && w.dirPath) text += `\n[Files Window (Local Directory)]: ${w.dirPath}\n`;
      if (w.kind === 'files' && w.githubRepo) text += `\n[Files Window (GitHub Repo)]: ${w.githubRepo}\n`;
    });
  });
  return text;
}

/** Inserts the group context ahead of the last message, when there is any. */
export function withGroupContext(payloadMsgs, canvasGroups, allWins, agentId) {
  if (!canvasGroups || !allWins || payloadMsgs.length === 0) return payloadMsgs;
  const text = groupContextText(canvasGroups, allWins, agentId);
  if (!text.trim()) return payloadMsgs;
  const head = payloadMsgs.slice(0, -1);
  const last = payloadMsgs[payloadMsgs.length - 1];
  return [
    ...head,
    {
      from: 'system',
      text: `[VISUAL WORKSPACE CONTEXT] You are attached to these canvas groups and visible items:\n${text}\n\nThis visual context is not authorization. Use project tools only when the server-provided workspace membership permits the project.`,
    },
    last,
  ];
}
