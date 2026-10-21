// Share-link selection for the import panel. The same id rule as the server
// (12-34 in the link, 12:34 in the file). No names or keys are logged here.

export function nodeIdFromLink(url) {
  try {
    const node = new URL(String(url || '')).searchParams.get('node-id');
    return node ? node.replace(/-/g, ':') : null;
  } catch {
    return null;
  }
}

/** Ids to select, the page to show, and a reason when the link's frame is missing. */
export function selectionForLink(frames, url) {
  const nodeId = nodeIdFromLink(url);
  if (!nodeId) return { ids: [], error: '', page: '' };
  const frame = (frames || []).find((item) => item.id === nodeId);
  if (!frame) return { ids: [], error: 'That frame is not in this file.', page: '' };
  return { ids: [frame.id], error: '', page: frame.page || '' };
}
