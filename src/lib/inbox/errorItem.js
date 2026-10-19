// An error report as an Inbox item. Shared by the server (reports from
// server/inbox/sources.js) and the board (errors caught in this browser).

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/**
 * An error report from any source (server/inbox/sources.js). Expected shape:
 * { id, title, detail?, count, lastHour, firstSeen, lastSeen, users?, source, fixing? }
 */
export function errorItem(report) {
  if (report.note) return noteItem(report);
  if (report.todo) return todoItem(report);
  if (report.invite) return inviteItem(report);
  // lastHour can be null when a source only knows a total and the last time.
  const hour = Number.isFinite(report.lastHour) ? report.lastHour : null;
  const escalating = hour != null && (hour >= 10 || (report.count >= 3 && hour / report.count > 0.5));
  return {
    id: `error:${report.source || 'board'}:${report.id}`,
    kind: 'error',
    reportId: report.id,
    source: report.source || 'board',
    repo: report.repo || 'this board',
    at: report.lastSeen,
    title: report.title,
    summary: report.detail || '',
    state: report.fixing ? 'error_fixing' : escalating ? 'error_escalating' : 'error',
    group: report.fixing ? 'working' : 'needs',
    tone: 'danger',
    subtitle: escalating ? `Escalating · ${fmt(report.count)} events` : `${fmt(report.count)} event${report.count === 1 ? '' : 's'}`,
    stats: [
      hour == null
        ? { label: 'Last seen', value: new Date(report.lastSeen).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
        : { label: 'Last hour', value: fmt(hour), tone: hour ? 'danger' : 'neutral' },
      { label: 'Total', value: fmt(report.count) },
      { label: 'People hit', value: report.users != null ? fmt(report.users) : '—' },
    ],
    fixable: Boolean(report.fixable),
    actions: report.fixable ? ['fix_error', 'acknowledge'] : ['acknowledge'],
  };
}

/** A note an agent posted on its own (diagram 17): read it, nothing to fix. */
function noteItem(report) {
  return {
    id: `note:${report.source || 'speak-up'}:${report.id}`,
    kind: 'note',
    reportId: report.id,
    source: report.source || 'speak-up',
    repo: report.repo || 'this board',
    by: report.agent || '',
    url: report.url || null,
    at: report.lastSeen,
    title: report.title,
    summary: report.detail || '',
    state: 'agent_note',
    group: 'needs',
    tone: 'accent',
    subtitle: report.detail || '',
    stats: [{ label: 'Posted', value: new Date(report.lastSeen).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }],
    fixable: false,
    actions: ['acknowledge'],
  };
}

/** A to-do someone assigned to you ("Me" in a To-do window's Assign menu). */
function todoItem(report) {
  return {
    id: `todo:${report.source || 'my-todos'}:${report.id}`,
    kind: 'todo',
    reportId: report.id,
    source: report.source || 'my-todos',
    repo: report.repo || 'this board',
    boardId: report.boardId || null,
    windowId: report.windowId || null,
    listTitle: report.listTitle || null,
    itemId: report.itemId ?? null,
    at: report.lastSeen,
    title: report.title,
    text: report.title,
    summary: report.detail || '',
    state: 'todo_for_you',
    group: 'needs',
    tone: 'accent',
    subtitle: report.detail || '',
    stats: [{ label: 'List', value: report.listTitle || '—' }, { label: 'Board', value: report.repo || 'this board' }],
    fixable: false,
    actions: ['mark_done', 'open', 'acknowledge'],
  };
}

/** Someone invited you to a board ("Invite to this board"). */
function inviteItem(report) {
  return {
    id: `invite:${report.source || 'board-invites'}:${report.id}`,
    kind: 'invite',
    reportId: report.id,
    inviteId: report.id,
    source: report.source || 'board-invites',
    repo: report.repo || 'a board',
    by: report.by || '',
    boardId: report.boardId || null,
    at: report.lastSeen,
    title: report.title,
    summary: report.detail || '',
    state: 'invite_for_you',
    group: 'needs',
    tone: 'accent',
    subtitle: report.detail || '',
    stats: [{ label: 'Board', value: report.repo || 'a board' }, { label: 'From', value: report.by || '—' }],
    fixable: false,
    actions: ['acknowledge'],
  };
}
