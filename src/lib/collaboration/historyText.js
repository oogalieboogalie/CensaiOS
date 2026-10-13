// Plain-words summary of one board history entry (see server/collab/boardHistory.js).

function list(titles) {
  const unique = [...new Set(titles)];
  if (unique.length <= 2) return unique.join(' and ');
  return `${unique.slice(0, 2).join(', ')} and ${unique.length - 2} more`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function describeHistoryEntry(entry) {
  if (entry?.restoredTo) return 'rolled the board back to an earlier point';
  const change = entry?.change || {};
  const parts = [];
  if (change.added?.length) parts.push(`added ${list(change.added)}`);
  if (change.removed?.length) parts.push(`closed ${list(change.removed)}`);
  if (change.edited) parts.push(`edited ${plural(change.edited, 'window', 'windows')}`);
  if (change.moved) parts.push(`moved ${plural(change.moved, 'window', 'windows')}`);
  if (change.inkAdded) parts.push(`drew ${plural(change.inkAdded, 'stroke', 'strokes')}`);
  if (change.inkRemoved) parts.push(`erased ${plural(change.inkRemoved, 'stroke', 'strokes')}`);
  if (change.groups) parts.push('changed groups');
  if (change.links) parts.push('changed links');
  if (!parts.length) return entry?.who?.kind === 'system' && entry?.who?.name !== 'censaiOS' ? 'started the board' : 'small changes';
  return parts.join(', ');
}

export function historyTimeLabel(iso, now = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameDay = new Date(now).toDateString() === at.toDateString();
  return sameDay ? time : `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
